-- ============================================================================
-- Snapshot the artwork print dimensions on order items.
--
-- The storefront message and the studio print list both need the artwork
-- print size that fits each vessel. product_sizes holds the artists'
-- vessel-to-artwork mapping (the defaults); every captured order item now
-- stores the dimensions that applied at capture time, and the admin print
-- list prefers the current mapping version when one exists.
-- ============================================================================

alter table public.order_items
  add column if not exists print_width_cm numeric(6,2),
  add column if not exists print_height_cm numeric(6,2);

-- normalize_order_items now carries the vessel's default print dimensions.
create or replace function public.normalize_order_items(p_items jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_variant public.catalog_variants;
  v_product public.ceramic_products;
  v_price numeric;
  v_print_width numeric;
  v_print_height numeric;
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

    select price_ils, print_width_cm, print_height_cm
      into v_price, v_print_width, v_print_height
      from public.product_sizes
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
      'quantity', v_quantity,
      'print_width_cm', v_print_width,
      'print_height_cm', v_print_height
    );
  end loop;

  return v_out;
end $$;

-- submit_order_request stores the snapshot on each item.
create or replace function public.submit_order_request(p_payload jsonb, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_phone text;
  v_delivery text;
  v_city text;
  v_street text;
  v_notes text;
  v_items jsonb;
  v_customer_id uuid;
  v_number text;
  v_order_id uuid;
  v_hash text;
  v_canonical jsonb;
  v_existing record;
  v_item jsonb;
begin
  v_name := left(btrim(coalesce(p_payload ->> 'name', '')), 80);
  if v_name = '' then raise exception 'יש למלא שם.'; end if;

  v_phone := public.normalize_phone(p_payload ->> 'phone');

  v_delivery := coalesce(p_payload ->> 'delivery_type', 'binyamina');
  if v_delivery not in ('binyamina', 'sde-nehemia', 'delivery') then
    raise exception 'שיטת אספקה לא תקינה.';
  end if;
  if v_delivery = 'delivery' then
    v_city := left(btrim(coalesce(p_payload ->> 'city', '')), 80);
    v_street := left(btrim(coalesce(p_payload ->> 'street', '')), 120);
    if v_city = '' or v_street = '' then
      raise exception 'יש למלא עיר ורחוב למשלוח.';
    end if;
  else
    v_city := null;
    v_street := null;
  end if;

  v_notes := left(coalesce(p_payload ->> 'notes', ''), 1000);
  v_items := public.normalize_order_items(p_payload -> 'items');

  -- Canonical form for idempotency hashing (jsonb normalizes key order).
  -- md5 (pg_catalog) is an equality token only — not a security boundary —
  -- and is always visible under the pinned search_path.
  v_canonical := jsonb_build_object(
    'name', v_name, 'phone', v_phone, 'delivery_type', v_delivery,
    'city', v_city, 'street', v_street, 'notes', v_notes, 'items', v_items);
  v_hash := md5(v_canonical::text);

  -- Idempotency FIRST: replays are never blocked by rate limits.
  if p_key is not null then
    select id, number, idempotency_payload_hash into v_existing
      from public.orders where idempotency_key = p_key;
    if found then
      if v_existing.idempotency_payload_hash is distinct from v_hash then
        raise exception 'בקשה זו נשלחה כבר עם תוכן אחר. נסו לרענן את העמוד ולשלוח שוב.';
      end if;
      return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.number, 'replayed', true);
    end if;
  end if;

  -- Per-phone rate limiting, concurrency-safe. No global limit: an abusive
  -- phone can never deny service to other customers.
  perform pg_advisory_xact_lock(hashtext('order-request:' || v_phone));
  if p_key is not null then
    -- A concurrent submission with the same key may have committed while we
    -- waited for the lock; re-check before counting this as a new request.
    select id, number, idempotency_payload_hash into v_existing
      from public.orders where idempotency_key = p_key;
    if found then
      if v_existing.idempotency_payload_hash is distinct from v_hash then
        raise exception 'בקשה זו נשלחה כבר עם תוכן אחר. נסו לרענן את העמוד ולשלוח שוב.';
      end if;
      return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.number, 'replayed', true);
    end if;
  end if;
  if (select count(*) from public.orders
        where customer_phone = v_phone
          and captured_at > now() - interval '1 hour') >= 3 then
    raise exception 'נשלחו כמה בקשות מהמספר הזה בשעה האחרונה. נסו שוב בעוד מעט או פנו אלינו ישירות בוואטסאפ.';
  end if;
  if (select count(*) from public.orders
        where customer_phone = v_phone
          and captured_at > now() - interval '24 hours') >= 10 then
    raise exception 'הגעתם למגבלת הבקשות ליום. נסו שוב מחר או פנו אלינו ישירות בוואטסאפ.';
  end if;

  -- Customer: anonymous submissions never overwrite existing records.
  insert into public.customers (name, phone) values (v_name, v_phone)
    on conflict (phone) do nothing;
  select id into v_customer_id from public.customers where phone = v_phone;

  v_number := public.next_order_number();
  begin
    insert into public.orders (
      number, idempotency_key, idempotency_payload_hash, source, status,
      customer_id, customer_name, customer_phone,
      delivery_type, city, street, customer_notes)
    values (
      v_number, p_key, v_hash, 'website', 'request',
      v_customer_id, v_name, v_phone,
      v_delivery, v_city, v_street, nullif(v_notes, ''))
    returning id into v_order_id;
  exception when unique_violation then
    -- A concurrent submission with the same key won the race.
    select id, number, idempotency_payload_hash into v_existing
      from public.orders where idempotency_key = p_key;
    if not found or v_existing.idempotency_payload_hash is distinct from v_hash then
      raise exception 'אירעה שגיאה בשמירת הבקשה. נסו שוב.';
    end if;
    return jsonb_build_object('order_id', v_existing.id, 'number', v_existing.number, 'replayed', true);
  end;

  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.order_items (
      order_id, product_id, variant_id, size_label, material, artwork_id,
      product_name_snapshot, artwork_name_snapshot, unit_price_ils, quantity,
      print_width_cm, print_height_cm)
    values (
      v_order_id, v_item ->> 'product_id', v_item ->> 'variant_id', v_item ->> 'size_label',
      v_item ->> 'material', nullif(v_item ->> 'artwork_id', ''),
      v_item ->> 'product_name', v_item ->> 'artwork_name',
      (v_item ->> 'unit_price_ils')::numeric, (v_item ->> 'quantity')::int,
      (v_item ->> 'print_width_cm')::numeric, (v_item ->> 'print_height_cm')::numeric);
  end loop;

  insert into public.order_events (order_id, type, to_status, notes)
    values (v_order_id, 'captured', 'request', 'בקשה שנשלחה מהאתר');

  return jsonb_build_object('order_id', v_order_id, 'number', v_number, 'replayed', false);
end $$;

-- create_order stores the same snapshot for manually entered orders.
create or replace function public.create_order(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
  v_phone text;
  v_delivery text;
  v_city text;
  v_street text;
  v_notes text;
  v_internal text;
  v_expected date;
  v_source text;
  v_number text;
  v_items jsonb;
  v_customer_id uuid;
  v_order_id uuid;
  v_item jsonb;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;

  v_name := left(btrim(coalesce(p_payload ->> 'name', '')), 80);
  if v_name = '' then raise exception 'יש למלא שם לקוח.'; end if;

  begin
    v_phone := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
    if v_phone is not null then v_phone := public.normalize_phone(v_phone); end if;
  exception when others then
    raise exception 'מספר הטלפון אינו תקין.';
  end;

  v_source := coalesce(p_payload ->> 'source', 'manual');
  if v_source not in ('whatsapp', 'manual', 'excel') then
    raise exception 'מקור הזמנה לא תקין.';
  end if;

  v_delivery := coalesce(p_payload ->> 'delivery_type', 'binyamina');
  if v_delivery not in ('binyamina', 'sde-nehemia', 'delivery') then
    raise exception 'שיטת אספקה לא תקינה.';
  end if;
  v_city := nullif(btrim(coalesce(p_payload ->> 'city', '')), '');
  v_street := nullif(btrim(coalesce(p_payload ->> 'street', '')), '');
  if v_delivery = 'delivery' and (v_city is null or v_street is null) then
    raise exception 'יש למלא עיר ורחוב למשלוח.';
  end if;
  v_notes := left(coalesce(p_payload ->> 'customer_notes', ''), 1000);
  v_internal := left(coalesce(p_payload ->> 'internal_notes', ''), 2000);
  v_expected := nullif(p_payload ->> 'expected_delivery_date', '')::date;
  v_items := public.normalize_order_items(p_payload -> 'items');

  -- Artists may correct an existing customer record.
  if v_phone is not null then
    insert into public.customers (name, phone) values (v_name, v_phone)
      on conflict (phone) do update set name = excluded.name, updated_at = now();
    select id into v_customer_id from public.customers where phone = v_phone;
  else
    insert into public.customers (name) values (v_name) returning id into v_customer_id;
  end if;

  v_number := nullif(btrim(coalesce(p_payload ->> 'number', '')), '');
  if v_number is not null then
    if exists (select 1 from public.orders where number = v_number) then
      raise exception 'קיימת כבר הזמנה עם המספר %.', v_number;
    end if;
  else
    v_number := public.next_order_number();
  end if;

  insert into public.orders (
    number, source, status, customer_id, customer_name, customer_phone,
    delivery_type, city, street, expected_delivery_date, customer_notes, internal_notes)
  values (
    v_number, v_source, 'request', v_customer_id, v_name, v_phone,
    v_delivery, v_city, v_street, v_expected, nullif(v_notes, ''), nullif(v_internal, ''))
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(v_items) loop
    insert into public.order_items (
      order_id, product_id, variant_id, size_label, material, artwork_id,
      product_name_snapshot, artwork_name_snapshot, unit_price_ils, quantity,
      print_width_cm, print_height_cm)
    values (
      v_order_id, v_item ->> 'product_id', v_item ->> 'variant_id', v_item ->> 'size_label',
      v_item ->> 'material', nullif(v_item ->> 'artwork_id', ''),
      v_item ->> 'product_name', v_item ->> 'artwork_name',
      (v_item ->> 'unit_price_ils')::numeric, (v_item ->> 'quantity')::int,
      (v_item ->> 'print_width_cm')::numeric, (v_item ->> 'print_height_cm')::numeric);
  end loop;

  insert into public.order_events (order_id, type, to_status, actor, notes)
    values (v_order_id, 'created', 'request', v_actor, 'נוסף ידנית בסטודיו');

  return jsonb_build_object('order_id', v_order_id, 'number', v_number);
end $$;

revoke execute on function public.submit_order_request(jsonb, uuid) from public;
grant execute on function public.submit_order_request(jsonb, uuid) to anon, authenticated;
revoke execute on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;
