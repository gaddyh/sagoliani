-- ============================================================================
-- Sagoliani Studio Admin — initial schema, RLS, grants and business RPCs.
-- Applied with `supabase db reset` locally; apply via dashboard/CLI in cloud.
--
-- Security model (v3):
--   * anon may EXECUTE exactly one function: submit_order_request.
--   * No direct table writes for anon at all; authenticated artists may
--     SELECT everything and directly write only artworks/customers.
--     All stateful tables (orders, order_items, allocations, units, batches,
--     events, mapping versions) are written exclusively through SECURITY
--     DEFINER RPCs that enforce business invariants.
--   * All SECURITY DEFINER functions pin search_path to public,pg_temp.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Artist identity linked to Supabase Auth. Rows are created by seeding/admin
-- scripts only; artists never write here.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Catalog (seeded from src/data/*.ts; read-only for artists in the MVP)
-- ============================================================================

create table public.ceramic_products (
  id text primary key,
  name text not null,
  description text,
  category text,
  uses text,
  min_desired_inventory int not null default 0 check (min_desired_inventory >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.product_sizes (
  product_id text not null references public.ceramic_products(id) on delete cascade,
  label text not null,
  price_ils numeric(10,2) not null check (price_ils >= 0),
  -- Default decoration area (cm) for artwork prints on this vessel size.
  -- Used to prefill artwork-product mappings; can be refined per artwork.
  print_width_cm numeric(6,2) check (print_width_cm is null or print_width_cm > 0),
  print_height_cm numeric(6,2) check (print_height_cm is null or print_height_cm > 0),
  primary key (product_id, label)
);

create table public.artworks (
  id text primary key,
  name text not null,
  artist text,
  description text,
  preview_path text,
  original_path text,
  is_active boolean not null default true,
  show_in_gallery boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_variants (
  id text primary key,
  product_id text not null references public.ceramic_products(id) on delete cascade,
  material text not null check (material in ('smooth','speckled')),
  artwork_id text references public.artworks(id),
  display_name text not null,
  images jsonb not null default '[]'::jsonb,
  image_artwork_names jsonb,
  is_published boolean not null default true
);

-- ============================================================================
-- Production stages (seeded below; referenced by RPCs as constants)
-- stage_id semantics: the NEXT stage the unit is waiting for. A unit at
-- stage 8 is finished. Generic (artwork-less) units rest at stage 5.
-- ============================================================================

create table public.production_stages (
  id int primary key,
  name_he text not null,
  kind text not null check (kind in ('prep','kiln','glaze','artwork','qc','ready')),
  requires_kiln boolean not null default false,
  sort_order int not null
);

insert into public.production_stages (id, name_he, kind, requires_kiln, sort_order) values
  (1, 'הכנת חומר', 'prep', false, 1),
  (2, 'שריפה ראשונה', 'kiln', true, 2),
  (3, 'זיגוג', 'glaze', false, 3),
  (4, 'שריפה שנייה', 'kiln', true, 4),
  (5, 'יישום ציור', 'artwork', false, 5),
  (6, 'שריפה שלישית', 'kiln', true, 6),
  (7, 'בקרת איכות', 'qc', false, 7),
  (8, 'מוכן למסירה', 'ready', false, 8)
on conflict (id) do nothing;

-- ============================================================================
-- Artwork <-> product mappings, versioned. RPC-written only.
-- ============================================================================

create table public.artwork_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.ceramic_products(id),
  size_label text,                       -- null = applies to all sizes
  material text check (material in ('smooth','speckled')),  -- null = both
  artwork_id text not null references public.artworks(id),
  print_width_cm numeric(6,2) check (print_width_cm is null or print_width_cm > 0),
  print_height_cm numeric(6,2) check (print_height_cm is null or print_height_cm > 0),
  rotation_deg numeric(6,2) not null default 0,
  placement text,
  instructions text,
  notes text,
  print_file_path text,
  preview_path text,
  version int not null default 1,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);

-- At most one current mapping version per combination.
create unique index artwork_mapping_versions_current_idx
  on public.artwork_mapping_versions (
    product_id, coalesce(size_label, ''), coalesce(material, ''), artwork_id
  ) where superseded_at is null;
create index artwork_mapping_versions_artwork_idx on public.artwork_mapping_versions (artwork_id);

-- ============================================================================
-- Physical ceramic units — four independent dimensions:
--   production position (stage_id), artwork specificity (applied_artwork_id),
--   quality, lifecycle. Allocation lives only in order_item_allocations.
-- ============================================================================

create table public.ceramic_units (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.ceramic_products(id),
  size_label text not null,
  material text not null check (material in ('smooth','speckled')),
  stage_id int not null default 1 references public.production_stages(id),
  applied_artwork_id text references public.artworks(id),      -- null = generic unit
  applied_mapping_version_id uuid references public.artwork_mapping_versions(id),
  quality text not null default 'pending' check (quality in ('pending','passed','attention')),
  lifecycle text not null default 'active' check (lifecycle in ('active','delivered','scrapped')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint ceramic_units_size_fk foreign key (product_id, size_label)
    references public.product_sizes (product_id, label),
  constraint ceramic_units_generic_not_past_application
    check (applied_artwork_id is not null or stage_id <= 5)
);

create index ceramic_units_pool_idx
  on public.ceramic_units (product_id, size_label, material, stage_id)
  where lifecycle = 'active';
create index ceramic_units_artwork_idx on public.ceramic_units (applied_artwork_id);

-- ============================================================================
-- Customers & orders
-- ============================================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Non-partial unique index: Postgres treats NULLs as distinct, so multiple
-- customers without a phone are still allowed, and ON CONFLICT (phone) works.
create unique index customers_phone_idx on public.customers (phone);

create sequence public.order_number_seq start with 1042 increment by 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  idempotency_key uuid unique,
  idempotency_payload_hash text,
  source text not null check (source in ('website','whatsapp','manual','excel')),
  status text not null default 'request'
    check (status in ('request','awaiting_confirmation','confirmed','in_production','ready','completed','cancelled')),
  needs_attention boolean not null default false,
  customer_id uuid references public.customers(id),
  customer_name text not null,
  customer_phone text,
  delivery_type text not null default 'binyamina'
    check (delivery_type in ('binyamina','sde-nehemia','delivery')),
  city text,
  street text,
  expected_delivery_date date,
  discount_ils numeric(10,2) not null default 0 check (discount_ils >= 0),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','deposit','paid','refunded')),
  customer_notes text,
  internal_notes text,
  captured_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);
create index orders_status_idx on public.orders (status, captured_at desc);
create index orders_phone_idx on public.orders (customer_phone, captured_at);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.ceramic_products(id),
  variant_id text references public.catalog_variants(id),
  size_label text not null,
  material text not null check (material in ('smooth','speckled')),
  artwork_id text references public.artworks(id),  -- null = assorted, chosen at confirmation
  product_name_snapshot text not null,
  artwork_name_snapshot text,
  unit_price_ils numeric(10,2) not null,
  quantity int not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  constraint order_items_size_fk foreign key (product_id, size_label)
    references public.product_sizes (product_id, label)
);
create index order_items_order_idx on public.order_items (order_id);

-- Allocation is the source of truth for unit ownership and print progress.
create table public.order_item_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  ceramic_unit_id uuid not null references public.ceramic_units(id),
  print_status text check (print_status in
    ('not_needed','pending_mapping','ready_to_print','printed','print_failed')),
  printed_mapping_version_id uuid references public.artwork_mapping_versions(id),
  printed_at timestamptz,
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text
);
-- A physical unit can never be actively allocated to two order items.
create unique index order_item_allocations_active_unit_idx
  on public.order_item_allocations (ceramic_unit_id) where released_at is null;
create index order_item_allocations_item_idx on public.order_item_allocations (order_item_id);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  actor uuid references public.profiles(id),
  notes text,
  at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, at);

-- ============================================================================
-- Kiln batches
-- ============================================================================

create table public.kiln_batches (
  id uuid primary key default gen_random_uuid(),
  stage_id int not null references public.production_stages(id),
  status text not null default 'planned' check (status in ('planned','firing','completed','cancelled')),
  planned_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.kiln_batch_items (
  batch_id uuid not null references public.kiln_batches(id) on delete cascade,
  unit_id uuid not null references public.ceramic_units(id),
  result text not null default 'pending' check (result in ('pending','ok','rejected','rework')),
  active boolean not null default true,
  primary key (batch_id, unit_id)
);
-- A unit can never sit in two active batches.
create unique index kiln_batch_items_active_unit_idx
  on public.kiln_batch_items (unit_id) where active;

-- ============================================================================
-- Production events (append-only unit history)
-- ============================================================================

create table public.production_events (
  id uuid primary key default gen_random_uuid(),
  ceramic_unit_id uuid not null references public.ceramic_units(id) on delete cascade,
  stage_id int references public.production_stages(id),
  result text not null check (result in
    ('created','allocated','released','completed','failed','rework','rejected','artwork_applied','delivered')),
  artist_id uuid references public.profiles(id),
  kiln_batch_id uuid references public.kiln_batches(id),
  mapping_snapshot jsonb,
  notes text,
  occurred_at timestamptz not null default now()
);
create index production_events_unit_idx on public.production_events (ceramic_unit_id, occurred_at);
create index production_events_batch_idx on public.production_events (kiln_batch_id);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger artworks_touch before update on public.artworks
  for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.ceramic_products enable row level security;
alter table public.product_sizes enable row level security;
alter table public.artworks enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.production_stages enable row level security;
alter table public.artwork_mapping_versions enable row level security;
alter table public.ceramic_units enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_allocations enable row level security;
alter table public.order_events enable row level security;
alter table public.kiln_batches enable row level security;
alter table public.kiln_batch_items enable row level security;
alter table public.production_events enable row level security;

-- Identity check used by every policy below.
create or replace function public.is_artist() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid()) $$;

-- Read access: artists only (anon reads nothing).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_artist());

drop policy if exists ceramic_products_read on public.ceramic_products;
create policy ceramic_products_read on public.ceramic_products for select to authenticated
  using (public.is_artist());
drop policy if exists product_sizes_read on public.product_sizes;
create policy product_sizes_read on public.product_sizes for select to authenticated
  using (public.is_artist());
drop policy if exists artworks_read on public.artworks;
create policy artworks_read on public.artworks for select to authenticated
  using (public.is_artist());
drop policy if exists catalog_variants_read on public.catalog_variants;
create policy catalog_variants_read on public.catalog_variants for select to authenticated
  using (public.is_artist());
drop policy if exists production_stages_read on public.production_stages;
create policy production_stages_read on public.production_stages for select to authenticated
  using (public.is_artist());
drop policy if exists mapping_versions_read on public.artwork_mapping_versions;
create policy mapping_versions_read on public.artwork_mapping_versions for select to authenticated
  using (public.is_artist());
drop policy if exists ceramic_units_read on public.ceramic_units;
create policy ceramic_units_read on public.ceramic_units for select to authenticated
  using (public.is_artist());
drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using (public.is_artist());
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
  using (public.is_artist());
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items for select to authenticated
  using (public.is_artist());
drop policy if exists allocations_read on public.order_item_allocations;
create policy allocations_read on public.order_item_allocations for select to authenticated
  using (public.is_artist());
drop policy if exists order_events_read on public.order_events;
create policy order_events_read on public.order_events for select to authenticated
  using (public.is_artist());
drop policy if exists kiln_batches_read on public.kiln_batches;
create policy kiln_batches_read on public.kiln_batches for select to authenticated
  using (public.is_artist());
drop policy if exists kiln_batch_items_read on public.kiln_batch_items;
create policy kiln_batch_items_read on public.kiln_batch_items for select to authenticated
  using (public.is_artist());
drop policy if exists production_events_read on public.production_events;
create policy production_events_read on public.production_events for select to authenticated
  using (public.is_artist());

-- Direct writes: only artworks and customers (safe, no invariants).
drop policy if exists artworks_write on public.artworks;
create policy artworks_write on public.artworks for insert to authenticated
  with check (public.is_artist());
drop policy if exists artworks_update on public.artworks;
create policy artworks_update on public.artworks for update to authenticated
  using (public.is_artist());
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for insert to authenticated
  with check (public.is_artist());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (public.is_artist());

-- ============================================================================
-- GRANTS — explicit and minimal.
-- Tables: anon gets nothing. authenticated gets SELECT everywhere plus
-- INSERT/UPDATE only on artworks/customers. Everything else is RPC-only.
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.artworks to authenticated;
grant insert, update on public.customers to authenticated;

-- ============================================================================
-- STORAGE — two private buckets, artists only.
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('artworks', 'artworks', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values
  ('print-files', 'print-files', false)
on conflict (id) do nothing;

drop policy if exists studio_buckets_select on storage.objects;
create policy studio_buckets_select on storage.objects for select to authenticated
  using (bucket_id in ('artworks','print-files') and public.is_artist());
drop policy if exists studio_buckets_insert on storage.objects;
create policy studio_buckets_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('artworks','print-files') and public.is_artist());
drop policy if exists studio_buckets_update on storage.objects;
create policy studio_buckets_update on storage.objects for update to authenticated
  using (bucket_id in ('artworks','print-files') and public.is_artist())
  with check (bucket_id in ('artworks','print-files') and public.is_artist());
drop policy if exists studio_buckets_delete on storage.objects;
create policy studio_buckets_delete on storage.objects for delete to authenticated
  using (bucket_id in ('artworks','print-files') and public.is_artist());

-- ============================================================================
-- INTERNAL HELPERS (not exposed to any API role)
-- ============================================================================

-- Deterministic mapping resolution: exact size+material > size wildcard >
-- material wildcard > both wildcard; current (non-superseded) versions only.
create or replace function public.resolve_mapping_version(
  p_product_id text, p_size_label text, p_material text, p_artwork_id text
) returns public.artwork_mapping_versions
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.* from public.artwork_mapping_versions v
  where v.superseded_at is null
    and v.product_id = p_product_id
    and v.artwork_id = p_artwork_id
    and (v.size_label is null or v.size_label = p_size_label)
    and (v.material is null or v.material = p_material)
  order by
    (case when v.size_label is not null then 0 else 1 end) +
    (case when v.material is not null then 0 else 1 end),
    v.version desc
  limit 1
$$;

-- Normalize and validate an order payload shared by public capture and
-- artist-created orders. Returns canonical items with server-side prices;
-- raises on any invalid input. Never trusts client prices.
create or replace function public.normalize_order_items(p_items jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_variant public.catalog_variants;
  v_product public.ceramic_products;
  v_price numeric;
  v_artwork public.artworks;
  v_artwork_id text;
  v_quantity int;
  v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'פורמט הפריטים אינו תקין.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 15 then
    raise exception 'ההזמנה חייבת לכלול בין 1 ל־15 פריטים.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_variant from public.catalog_variants
      where id = v_item->>'variant_id' and is_published;
    if not found then
      raise exception 'הפריט "%" אינו קיים בקטלוג.', coalesce(v_item->>'variant_id', '');
    end if;

    select * into v_product from public.ceramic_products where id = v_variant.product_id;
    if not found or not v_product.is_active then
      raise exception 'המוצר "%" אינו זמין להזמנה.', v_product.name;
    end if;

    select price_ils into v_price from public.product_sizes
      where product_id = v_variant.product_id and label = v_item->>'size_label';
    if v_price is null then
      raise exception 'המידה "%" אינה קיימת עבור %.', v_item->>'size_label', v_product.name;
    end if;

    v_quantity := coalesce((v_item->>'quantity')::int, 0);
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'הכמות עבור % חייבת להיות בין 1 ל־99.', v_product.name;
    end if;

    v_artwork_id := v_item->>'artwork_id';
    if v_artwork_id is not null and v_artwork_id <> '' then
      select * into v_artwork from public.artworks
        where id = v_artwork_id and is_active and show_in_gallery;
      if not found then
        raise exception 'הציור "%" אינו זמין להזמנה.', v_artwork_id;
      end if;
      v_artwork_id := v_artwork.id;
    else
      v_artwork_id := null;
    end if;

    v_out := v_out || jsonb_build_object(
      'variant_id', v_variant.id,
      'product_id', v_variant.product_id,
      'product_name', v_product.name,
      'material', v_variant.material,
      'size_label', v_item->>'size_label',
      'artwork_id', v_artwork_id,
      'artwork_name', case when v_artwork_id is not null then v_artwork.name
                           else coalesce(v_variant.display_name, v_variant.display_name) end,
      'unit_price_ils', v_price,
      'quantity', v_quantity
    );
  end loop;

  return v_out;
end $$;

-- Normalize an Israeli mobile phone number; raises when invalid.
create or replace function public.normalize_phone(p_phone text)
returns text
language plpgsql immutable security definer set search_path = public, pg_temp
as $$
declare v text;
begin
  v := regexp_replace(coalesce(p_phone, ''), '[- ]', '', 'g');
  v := regexp_replace(v, '^\+972', '0');
  if v !~ '^05[0-9]{8}$' then
    raise exception 'מספר הטלפון אינו תקין.';
  end if;
  return v;
end $$;

-- Generate the next order number.
create or replace function public.next_order_number() returns text
language sql security definer set search_path = public, pg_temp
as $$ select 'R-' || nextval('public.order_number_seq')::text $$;

-- Strict order readiness: EVERY item's full quantity must be covered by
-- active allocations on stage-8, QC-passed, active units.
create or replace function public.order_is_ready(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.order_items i
    where i.order_id = p_order_id
      and (
        select count(*)
        from public.order_item_allocations a
        join public.ceramic_units u on u.id = a.ceramic_unit_id
        where a.order_item_id = i.id
          and a.released_at is null
          and u.stage_id = 8
          and u.quality = 'passed'
          and u.lifecycle = 'active'
      ) < i.quantity
  )
$$;

-- Recompute order status and attention flag after any mutation that can
-- affect allocated units. Called from within state-transition RPCs.
create or replace function public.refresh_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_ready boolean;
  v_attention boolean;
begin
  select status into v_status from public.orders where id = p_order_id;
  if v_status in ('completed','cancelled') then
    -- still refresh the attention flag so history pages stay truthful
    update public.orders set needs_attention = exists (
      select 1 from public.order_items i
      join public.order_item_allocations a on a.order_item_id = i.id
      join public.ceramic_units u on u.id = a.ceramic_unit_id
      where i.order_id = p_order_id and a.released_at is null
        and (u.quality = 'attention' or u.lifecycle = 'scrapped')
    ) where id = p_order_id;
    return;
  end if;

  v_ready := public.order_is_ready(p_order_id);
  if v_ready then
    update public.orders set status = 'ready' where id = p_order_id and status <> 'ready';
  else
    update public.orders set status = 'in_production'
      where id = p_order_id and status = 'ready';
  end if;

  select exists (
    select 1 from public.order_items i
    join public.order_item_allocations a on a.order_item_id = i.id
    join public.ceramic_units u on u.id = a.ceramic_unit_id
    where i.order_id = p_order_id and a.released_at is null
      and (u.quality = 'attention' or u.lifecycle = 'scrapped')
  ) into v_attention;
  update public.orders set needs_attention = v_attention where id = p_order_id;
end $$;

-- Allocation worker shared by confirm_order and replace_unit.
-- Reserves up to p_quantity units for one order item using the priority:
--   1) finished artwork-specific stock (stage 8, QC passed, same artwork)
--   2) generic stock, most advanced stage first, FIFO within a stage
--   3) new units for any shortfall
-- Partially finished artwork-specific units are excluded (they belong to
-- prior work and are handled manually by the artists).
create or replace function public.allocate_for_item(
  p_order_item_id uuid,
  p_artwork_id text,
  p_quantity int,
  p_actor uuid
) returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_item public.order_items;
  v_allocated int := 0;
  v_remaining int := p_quantity;
  v_unit record;
  v_mapping public.artwork_mapping_versions;
  v_new_unit_id uuid;
  v_print_status text;
begin
  select * into v_item from public.order_items where id = p_order_item_id;
  v_mapping := public.resolve_mapping_version(
    v_item.product_id, v_item.size_label, v_item.material, p_artwork_id);
  -- Postgres composite quirk: IS NULL on a row type is true when ANY field is
  -- null, so the found-check must use the primary key.
  if p_artwork_id is not null and v_mapping.id is not null then
    v_print_status := 'ready_to_print';
  else
    v_print_status := 'pending_mapping';
  end if;

  -- Tier 1: finished artwork-specific stock
  if p_artwork_id is not null and v_remaining > 0 then
    for v_unit in
      select u.id, u.stage_id
      from public.ceramic_units u
      where u.product_id = v_item.product_id
        and u.size_label = v_item.size_label
        and u.material = v_item.material
        and u.applied_artwork_id = p_artwork_id
        and u.stage_id = 8
        and u.quality = 'passed'
        and u.lifecycle = 'active'
        and not exists (
          select 1 from public.order_item_allocations a
          where a.ceramic_unit_id = u.id and a.released_at is null
        )
      order by u.created_at asc
      for update of u skip locked
      limit v_remaining
    loop
      insert into public.order_item_allocations (order_item_id, ceramic_unit_id, print_status)
        values (p_order_item_id, v_unit.id, 'not_needed');
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
        values (v_unit.id, v_unit.stage_id, 'allocated', p_actor, 'הוקצה להזמנה ממלאי מוגמר');
      v_allocated := v_allocated + 1;
    end loop;
    v_remaining := p_quantity - v_allocated;
  end if;

  -- Tiers 2+3: generic stock, most advanced stage first, FIFO within stage
  if v_remaining > 0 then
    for v_unit in
      select u.id, u.stage_id
      from public.ceramic_units u
      where u.product_id = v_item.product_id
        and u.size_label = v_item.size_label
        and u.material = v_item.material
        and u.applied_artwork_id is null
        and u.stage_id <= 5
        and u.quality <> 'attention'
        and u.lifecycle = 'active'
        and not exists (
          select 1 from public.order_item_allocations a
          where a.ceramic_unit_id = u.id and a.released_at is null
        )
      order by u.stage_id desc, u.created_at asc
      for update of u skip locked
      limit v_remaining
    loop
      insert into public.order_item_allocations (order_item_id, ceramic_unit_id, print_status)
        values (p_order_item_id, v_unit.id, v_print_status);
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
        values (v_unit.id, v_unit.stage_id, 'allocated', p_actor, 'הוקצה להזמנה');
      v_allocated := v_allocated + 1;
    end loop;
    v_remaining := p_quantity - v_allocated;
  end if;

  -- Tier 4: create new units for the shortfall
  while v_remaining > 0 loop
    insert into public.ceramic_units
      (product_id, size_label, material, stage_id, created_by, notes)
    values (v_item.product_id, v_item.size_label, v_item.material, 1, p_actor, 'נוצר עבור הזמנה')
    returning id into v_new_unit_id;
    insert into public.order_item_allocations (order_item_id, ceramic_unit_id, print_status)
      values (p_order_item_id, v_new_unit_id, v_print_status);
    insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
      values (v_new_unit_id, 1, 'created', p_actor, 'נוצר עבור הזמנה');
    v_allocated := v_allocated + 1;
    v_remaining := v_remaining - 1;
  end loop;

  return v_allocated;
end $$;
