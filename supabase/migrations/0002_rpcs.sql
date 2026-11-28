-- ============================================================================
-- Sagoliani Studio Admin — business RPCs (v3 security hardening).
--   * anon may EXECUTE exactly one function: submit_order_request.
--   * Artist RPCs verify public.is_artist() explicitly.
--   * All functions are SECURITY DEFINER with pinned search_path.
--   * Idempotent capture: key checked BEFORE rate limits; payload hash
--     guards against key reuse with different content; concurrent same-key
--     submissions converge via the unique index + catch-and-replay.
--   * Anonymous submissions never overwrite existing customer records.
--   * Rate limiting is per-phone only (no global lockout) and serialized
--     with pg_advisory_xact_lock so concurrent requests cannot slip past.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PUBLIC: submit an order request from the storefront.
-- Returns { order_id, number, replayed }.
-- ----------------------------------------------------------------------------
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
      product_name_snapshot, artwork_name_snapshot, unit_price_ils, quantity)
    values (
      v_order_id, v_item ->> 'product_id', v_item ->> 'variant_id', v_item ->> 'size_label',
      v_item ->> 'material', nullif(v_item ->> 'artwork_id', ''),
      v_item ->> 'product_name', v_item ->> 'artwork_name',
      (v_item ->> 'unit_price_ils')::numeric, (v_item ->> 'quantity')::int);
  end loop;

  insert into public.order_events (order_id, type, to_status, notes)
    values (v_order_id, 'captured', 'request', 'בקשה שנשלחה מהאתר');

  return jsonb_build_object('order_id', v_order_id, 'number', v_number, 'replayed', false);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: create an order manually (WhatsApp message, phone call, migration).
-- ----------------------------------------------------------------------------
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
      product_name_snapshot, artwork_name_snapshot, unit_price_ils, quantity)
    values (
      v_order_id, v_item ->> 'product_id', v_item ->> 'variant_id', v_item ->> 'size_label',
      v_item ->> 'material', nullif(v_item ->> 'artwork_id', ''),
      v_item ->> 'product_name', v_item ->> 'artwork_name',
      (v_item ->> 'unit_price_ils')::numeric, (v_item ->> 'quantity')::int);
  end loop;

  insert into public.order_events (order_id, type, to_status, actor, notes)
    values (v_order_id, 'created', 'request', v_actor, 'נוסף ידנית בסטודיו');

  return jsonb_build_object('order_id', v_order_id, 'number', v_number);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: confirm a request — allocates stock and starts production.
-- p_artwork_overrides: optional { "order_item_id": "artwork_id" } for
-- assorted items whose concrete artwork is chosen at confirmation.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_order(p_order_id uuid, p_artwork_overrides jsonb default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
  v_item record;
  v_artwork_id text;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ההזמנה לא נמצאה.'; end if;
  if v_order.status not in ('request', 'awaiting_confirmation') then
    raise exception 'לא ניתן לאשר הזמנה במצב %.', v_order.status;
  end if;

  for v_item in select * from public.order_items where order_id = p_order_id for update loop
    v_artwork_id := nullif(coalesce(p_artwork_overrides ->> v_item.id, ''), '');
    if v_artwork_id is null then v_artwork_id := v_item.artwork_id; end if;
    if v_artwork_id is not null
       and not exists (select 1 from public.artworks where id = v_artwork_id and is_active) then
      raise exception 'הציור "%" אינו קיים.', v_artwork_id;
    end if;
    if v_artwork_id is distinct from v_item.artwork_id then
      update public.order_items set artwork_id = v_artwork_id where id = v_item.id;
    end if;
    perform public.allocate_for_item(v_item.id, v_artwork_id, v_item.quantity, v_actor);
  end loop;

  update public.orders
    set status = case when public.order_is_ready(p_order_id) then 'ready' else 'in_production' end,
        confirmed_at = now()
    where id = p_order_id;

  insert into public.order_events (order_id, type, from_status, to_status, actor, notes)
    values (p_order_id, 'confirmed', v_order.status,
            (select status from public.orders where id = p_order_id), v_actor, null);

  perform public.refresh_order(p_order_id);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: cancel an order; releases eligible reserved inventory.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ההזמנה לא נמצאה.'; end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'הזמנה % אינה ניתנת לביטול.', v_order.status;
  end if;

  with released as (
    update public.order_item_allocations a
      set released_at = now(), release_reason = 'order_cancelled'
    from public.order_items i
    where a.order_item_id = i.id and i.order_id = p_order_id and a.released_at is null
    returning a.ceramic_unit_id
  )
  insert into public.production_events (ceramic_unit_id, result, artist_id, notes)
    select ceramic_unit_id, 'released', v_actor, coalesce(nullif(p_reason, ''), 'ההזמנה בוטלה')
    from released;

  update public.orders
    set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(p_reason, '')
    where id = p_order_id;

  insert into public.order_events (order_id, type, from_status, to_status, actor, notes)
    values (p_order_id, 'cancelled', v_order.status, 'cancelled', v_actor, p_reason);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: manual status transitions (review, void).
-- ----------------------------------------------------------------------------
create or replace function public.set_order_status(p_order_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ההזמנה לא נמצאה.'; end if;

  if v_order.status = 'request' and p_status = 'awaiting_confirmation' then
    update public.orders set status = 'awaiting_confirmation' where id = p_order_id;
  elsif v_order.status in ('request', 'awaiting_confirmation') and p_status = 'cancelled' then
    perform public.cancel_order(p_order_id, coalesce(p_reason, 'בקשה שבוטלה'));
    return;
  else
    raise exception 'מעבר לא חוקי מ־% אל %.', v_order.status, p_status;
  end if;

  insert into public.order_events (order_id, type, from_status, to_status, actor, notes)
    values (p_order_id, 'status', v_order.status, p_status, v_actor, p_reason);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: update order details (whitelisted safe fields only).
-- ----------------------------------------------------------------------------
create or replace function public.update_order_details(p_order_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'ההזמנה לא נמצאה.';
  end if;

  if p_patch ? 'internal_notes' then
    update public.orders set internal_notes = nullif(p_patch ->> 'internal_notes', '')
      where id = p_order_id;
  end if;
  if p_patch ? 'customer_notes' then
    update public.orders set customer_notes = nullif(p_patch ->> 'customer_notes', '')
      where id = p_order_id;
  end if;
  if p_patch ? 'expected_delivery_date' then
    update public.orders set expected_delivery_date = nullif(p_patch ->> 'expected_delivery_date', '')::date
      where id = p_order_id;
  end if;
  if p_patch ? 'discount_ils' then
    update public.orders set discount_ils = coalesce((p_patch ->> 'discount_ils')::numeric, 0)
      where id = p_order_id;
    if (p_patch ->> 'discount_ils')::numeric < 0 then
      raise exception 'הנחה לא יכולה להיות שלילית.';
    end if;
  end if;
  if p_patch ? 'payment_status' then
    if p_patch ->> 'payment_status' not in ('unpaid', 'deposit', 'paid', 'refunded') then
      raise exception 'סטטוס תשלום לא תקין.';
    end if;
    update public.orders set payment_status = p_patch ->> 'payment_status' where id = p_order_id;
  end if;
  if p_patch ? 'delivery_type' then
    if p_patch ->> 'delivery_type' not in ('binyamina', 'sde-nehemia', 'delivery') then
      raise exception 'שיטת אספקה לא תקינה.';
    end if;
    update public.orders set delivery_type = p_patch ->> 'delivery_type' where id = p_order_id;
  end if;
  if p_patch ? 'city' then
    update public.orders set city = nullif(p_patch ->> 'city', '') where id = p_order_id;
  end if;
  if p_patch ? 'street' then
    update public.orders set street = nullif(p_patch ->> 'street', '') where id = p_order_id;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: choose/replace the concrete artwork of an order item (assorted).
-- ----------------------------------------------------------------------------
create or replace function public.update_order_item_artwork(p_order_item_id uuid, p_artwork_id text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_item public.order_items;
  v_mapping public.artwork_mapping_versions;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception 'הפריט לא נמצא.'; end if;

  if p_artwork_id is not null
     and not exists (select 1 from public.artworks where id = p_artwork_id and is_active) then
    raise exception 'הציור אינו קיים.';
  end if;

  update public.order_items set artwork_id = nullif(p_artwork_id, '') where id = p_order_item_id;

  v_mapping := public.resolve_mapping_version(
    v_item.product_id, v_item.size_label, v_item.material, nullif(p_artwork_id, ''));
  update public.order_item_allocations a
    set print_status = case when v_mapping is null then 'pending_mapping' else 'ready_to_print' end
  from public.ceramic_units u
  where a.order_item_id = p_order_item_id
    and a.released_at is null
    and a.print_status in ('pending_mapping', 'ready_to_print')
    and u.id = a.ceramic_unit_id
    and u.applied_artwork_id is null;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: mark an order delivered and completed.
-- ----------------------------------------------------------------------------
create or replace function public.complete_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ההזמנה לא נמצאה.'; end if;
  if v_order.status <> 'ready' then raise exception 'ניתן להשלים רק הזמנה שמוכנה למסירה.'; end if;

  with delivered as (
    update public.ceramic_units u
      set lifecycle = 'delivered'
    from public.order_item_allocations a
    join public.order_items i on i.id = a.order_item_id
    where i.order_id = p_order_id and a.released_at is null and u.id = a.ceramic_unit_id
    returning u.id
  )
  insert into public.production_events (ceramic_unit_id, result, artist_id, notes)
    select id, 'delivered', v_actor, 'נמסר ללקוח' from delivered;

  update public.orders set status = 'completed', completed_at = now() where id = p_order_id;
  insert into public.order_events (order_id, type, from_status, to_status, actor, notes)
    values (p_order_id, 'completed', 'ready', 'completed', v_actor, null);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: bulk-create generic physical units.
-- ----------------------------------------------------------------------------
create or replace function public.create_units(
  p_product_id text, p_size_label text, p_material text, p_quantity int,
  p_stage_id int default 1, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if p_quantity < 1 or p_quantity > 50 then
    raise exception 'ניתן ליצור בין 1 ל־50 יחידות בכל פעולה.';
  end if;
  if p_material not in ('smooth', 'speckled') then raise exception 'חומר לא תקין.'; end if;
  if not exists (select 1 from public.ceramic_products where id = p_product_id and is_active) then
    raise exception 'המוצר אינו קיים או אינו פעיל.';
  end if;
  if not exists (select 1 from public.product_sizes
                 where product_id = p_product_id and label = p_size_label) then
    raise exception 'המידה "%" אינה קיימת למוצר זה.', p_size_label;
  end if;
  if p_stage_id < 1 or p_stage_id > 5 then
    raise exception 'יחידות גנריות נוצרות עד שלב יישום הציור בלבד (1–5).';
  end if;

  for i in 1..p_quantity loop
    insert into public.ceramic_units
      (product_id, size_label, material, stage_id, created_by, notes)
    values (p_product_id, p_size_label, p_material, p_stage_id, v_actor, nullif(p_notes, ''))
    returning id into v_id;
    v_ids := v_ids || v_id;
    insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
      values (v_id, p_stage_id, 'created', v_actor, 'נוצר במלאי');
  end loop;

  return jsonb_build_object('unit_ids', to_jsonb(v_ids));
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: complete (or rework) a production stage for specific units,
-- outside a kiln batch.
-- ----------------------------------------------------------------------------
create or replace function public.advance_units_stage(
  p_unit_ids uuid[], p_result text, p_notes text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.ceramic_units;
  v_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if p_result not in ('completed', 'rework') then raise exception 'תוצאה לא תקינה.'; end if;

  foreach v_id in array p_unit_ids loop
    select * into v_unit from public.ceramic_units where id = v_id for update;
    if not found then raise exception 'הפריט % לא נמצא.', v_id; end if;
    if v_unit.lifecycle <> 'active' then raise exception 'הפריט % אינו פעיל.', v_id; end if;
    if v_unit.stage_id >= 8 then raise exception 'הפריט % כבר הושלם.', v_id; end if;
    if exists (select 1 from public.kiln_batch_items kbi
               where kbi.unit_id = v_id and kbi.active) then
      raise exception 'הפריט % נמצא בתהליך שריפה פעיל.', v_id;
    end if;
    if p_result = 'completed' then
      if v_unit.stage_id = 5 and v_unit.applied_artwork_id is null then
        raise exception 'יש ליישם ציור על הפריט % לפני המשך התהליך.', v_id;
      end if;
      if v_unit.stage_id = 7 then
        update public.ceramic_units set stage_id = 8, quality = 'passed' where id = v_id;
      else
        update public.ceramic_units set stage_id = v_unit.stage_id + 1 where id = v_id;
      end if;
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
        values (v_id, v_unit.stage_id + 1, 'completed', v_actor, nullif(p_notes, ''));
    else
      update public.ceramic_units
        set stage_id = greatest(v_unit.stage_id - 1, 1), quality = 'pending'
        where id = v_id;
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
        values (v_id, greatest(v_unit.stage_id - 1, 1), 'rework', v_actor, nullif(p_notes, ''));
    end if;

    perform public.refresh_order_for_unit(v_id);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: scrap a damaged unit outside a batch.
-- ----------------------------------------------------------------------------
create or replace function public.reject_unit(p_unit_id uuid, p_notes text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.ceramic_units;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_unit from public.ceramic_units where id = p_unit_id for update;
  if not found then raise exception 'הפריט לא נמצא.'; end if;
  if v_unit.lifecycle = 'scrapped' then raise exception 'הפריט כבר סומן כפסול.'; end if;
  if exists (select 1 from public.kiln_batch_items kbi
             where kbi.unit_id = p_unit_id and kbi.active) then
    raise exception 'הפריט נמצא בתהליך שריפה פעיל.';
  end if;

  update public.ceramic_units
    set lifecycle = 'scrapped', quality = 'attention' where id = p_unit_id;
  insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, notes)
    values (p_unit_id, v_unit.stage_id, 'rejected', v_actor, nullif(p_notes, ''));

  perform public.refresh_order_for_unit(p_unit_id);
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: record artwork application on a unit (pins the mapping version).
-- ----------------------------------------------------------------------------
create or replace function public.apply_artwork(p_unit_id uuid, p_artwork_id text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.ceramic_units;
  v_artwork_id text;
  v_mapping public.artwork_mapping_versions;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_unit from public.ceramic_units where id = p_unit_id for update;
  if not found then raise exception 'הפריט לא נמצא.'; end if;
  if v_unit.lifecycle <> 'active' then raise exception 'הפריט אינו פעיל.'; end if;
  if v_unit.stage_id <> 5 then
    raise exception 'ניתן ליישם ציור רק בשלב יישום הציור (לאחר השריפה השנייה).';
  end if;
  if exists (select 1 from public.kiln_batch_items kbi
             where kbi.unit_id = p_unit_id and kbi.active) then
    raise exception 'הפריט נמצא בתהליך שריפה פעיל.';
  end if;

  v_artwork_id := nullif(p_artwork_id, '');
  if v_artwork_id is null then
    select i.artwork_id into v_artwork_id
    from public.order_items i
    join public.order_item_allocations a on a.order_item_id = i.id
    where a.ceramic_unit_id = p_unit_id and a.released_at is null
    limit 1;
  end if;
  if v_artwork_id is null then raise exception 'חסר ציור ליישום על הפריט.'; end if;
  if not exists (select 1 from public.artworks where id = v_artwork_id and is_active) then
    raise exception 'הציור אינו קיים.';
  end if;

  v_mapping := public.resolve_mapping_version(
    v_unit.product_id, v_unit.size_label, v_unit.material, v_artwork_id);

  update public.ceramic_units
    set applied_artwork_id = v_artwork_id,
        applied_mapping_version_id = coalesce(v_mapping.id, v_unit.applied_mapping_version_id),
        stage_id = 6
    where id = p_unit_id;

  insert into public.production_events
    (ceramic_unit_id, stage_id, result, artist_id, mapping_snapshot, notes)
  values (p_unit_id, 6, 'artwork_applied', v_actor,
    case when v_mapping is null then null else jsonb_build_object(
      'mapping_version_id', v_mapping.id, 'version', v_mapping.version,
      'print_width_cm', v_mapping.print_width_cm, 'print_height_cm', v_mapping.print_height_cm,
      'rotation_deg', v_mapping.rotation_deg, 'placement', v_mapping.placement,
      'instructions', v_mapping.instructions, 'print_file_path', v_mapping.print_file_path
    ) end,
    'יושם הציור ' || (select name from public.artworks where id = v_artwork_id));

  perform public.refresh_order_for_unit(p_unit_id);
  return v_mapping.id;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: mark prints as done (pins the mapping version at print time)
-- or as failed (damaged print).
-- ----------------------------------------------------------------------------
create or replace function public.mark_printed(p_allocation_ids uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_alloc record;
  v_mapping public.artwork_mapping_versions;
  v_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;

  foreach v_id in array p_allocation_ids loop
    select a.id, a.order_item_id, a.print_status, i.product_id, i.size_label, i.material, i.artwork_id
      into v_alloc
    from public.order_item_allocations a
    join public.order_items i on i.id = a.order_item_id
    where a.id = v_id for update;
    if not found then raise exception 'ההקצאה % לא נמצאה.', v_id; end if;
    if v_alloc.print_status not in ('ready_to_print', 'print_failed') then
      raise exception 'הדפסה % אינה בהמתנה להדפסה.', v_id;
    end if;
    if v_alloc.artwork_id is null then raise exception 'חסר ציור להדפסה — בחרו ציור לפריט.'; end if;

    v_mapping := public.resolve_mapping_version(
      v_alloc.product_id, v_alloc.size_label, v_alloc.material, v_alloc.artwork_id);
    if v_mapping is null then
      raise exception 'אין הכנת הדפסה תואמת לשילוב זה — השלימו את הכנת המיפוי.';
    end if;

    update public.order_item_allocations
      set print_status = 'printed', printed_mapping_version_id = v_mapping.id, printed_at = now()
      where id = v_id;
  end loop;
end $$;

create or replace function public.mark_print_failed(p_allocation_ids uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  update public.order_item_allocations
    set print_status = 'print_failed'
    where id = any (p_allocation_ids)
      and released_at is null
      and print_status in ('ready_to_print', 'printed');
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: replace a damaged/scrapped unit for its order item.
-- ----------------------------------------------------------------------------
create or replace function public.replace_unit(p_unit_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_alloc record;
  v_new_unit uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;

  select a.id as allocation_id, a.order_item_id, i.order_id, i.artwork_id, i.quantity
    into v_alloc
  from public.order_item_allocations a
  join public.order_items i on i.id = a.order_item_id
  where a.ceramic_unit_id = p_unit_id and a.released_at is null
  limit 1;
  if not found then raise exception 'הפריט אינו מוקצה להזמנה — אין מה להחליף.'; end if;

  update public.order_item_allocations
    set released_at = now(), release_reason = 'replaced'
    where id = v_alloc.allocation_id;
  insert into public.production_events (ceramic_unit_id, result, artist_id, notes)
    values (p_unit_id, 'released', v_actor, 'הוחלף בעקבות פסילה/נזק');

  perform public.allocate_for_item(v_alloc.order_item_id, v_alloc.artwork_id, 1, v_actor);
  select a.ceramic_unit_id into v_new_unit
    from public.order_item_allocations a
    where a.order_item_id = v_alloc.order_item_id and a.released_at is null
    order by a.allocated_at desc limit 1;

  perform public.refresh_order(v_alloc.order_id);
  return v_new_unit;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: kiln batches.
-- ----------------------------------------------------------------------------
create or replace function public.create_kiln_batch(
  p_stage_id int, p_unit_ids uuid[], p_planned_date date default null, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_batch_id uuid;
  v_unit public.ceramic_units;
  v_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if not exists (select 1 from public.production_stages
                 where id = p_stage_id and requires_kiln) then
    raise exception 'שלב זה אינו שלב שריפה.';
  end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then
    raise exception 'יש לבחור לפחות פריט אחד לשריפה.';
  end if;

  foreach v_id in array p_unit_ids loop
    select * into v_unit from public.ceramic_units where id = v_id;
    if not found then raise exception 'הפריט % לא נמצא.', v_id; end if;
    if v_unit.lifecycle <> 'active' then raise exception 'הפריט % אינו פעיל.', v_id; end if;
    if v_unit.quality = 'attention' then raise exception 'הפריט % ממתין לטיפול.', v_id; end if;
    if v_unit.stage_id <> p_stage_id then
      raise exception 'הפריט % אינו ממתין לשלב שריפה זה (שלב נוכחי: %).', v_id, v_unit.stage_id;
    end if;
    if exists (select 1 from public.kiln_batch_items kbi
               where kbi.unit_id = v_id and kbi.active) then
      raise exception 'הפריט % כבר נמצא בתהליך שריפה פעיל.', v_id;
    end if;
  end loop;

  insert into public.kiln_batches (stage_id, planned_date, notes, created_by)
    values (p_stage_id, p_planned_date, nullif(p_notes, ''), v_actor)
    returning id into v_batch_id;

  insert into public.kiln_batch_items (batch_id, unit_id)
    select v_batch_id, unnest(p_unit_ids);

  return v_batch_id;
end $$;

create or replace function public.start_kiln_batch(p_batch_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  update public.kiln_batches
    set status = 'firing', started_at = now()
    where id = p_batch_id and status = 'planned';
  if not found then raise exception 'האצווה אינה בהמתנה להתחלה.'; end if;
end $$;

-- Idempotent: completing an already-completed batch is a safe no-op.
create or replace function public.complete_kiln_batch(p_batch_id uuid, p_results jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_batch public.kiln_batches;
  v_item record;
  v_result text;
  v_affected_orders uuid[];
  v_ok int := 0;
  v_rejected int := 0;
  v_rework int := 0;
  v_order_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  select * into v_batch from public.kiln_batches where id = p_batch_id for update;
  if not found then raise exception 'האצווה לא נמצאה.'; end if;
  if v_batch.status = 'completed' then
    return jsonb_build_object('already_completed', true);
  end if;
  if v_batch.status <> 'firing' then raise exception 'יש להתחיל את השריפה לפני השלמה.'; end if;

  for v_item in select kbi.*, (select stage_id from public.ceramic_units u where u.id = kbi.unit_id) as unit_stage
                from public.kiln_batch_items kbi where kbi.batch_id = p_batch_id
                for update of kbi loop
    v_result := coalesce(p_results ->> v_item.unit_id, 'ok');
    if v_result not in ('ok', 'rejected', 'rework') then
      raise exception 'תוצאה לא תקינה עבור הפריט %.', v_item.unit_id;
    end if;
    if v_item.unit_stage is null then raise exception 'הפריט % לא נמצא.', v_item.unit_id; end if;
    if v_item.unit_stage <> v_batch.stage_id then
      raise exception 'הפריט % כבר אינו בשלב השריפה — נסו ליצור אצווה חדשה.', v_item.unit_id;
    end if;

    if v_result = 'ok' then
      update public.ceramic_units set stage_id = v_batch.stage_id + 1
        where id = v_item.unit_id and stage_id = v_batch.stage_id;
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, kiln_batch_id)
        values (v_item.unit_id, v_batch.stage_id + 1, 'completed', v_actor, p_batch_id);
      v_ok := v_ok + 1;
    elsif v_result = 'rejected' then
      update public.ceramic_units set lifecycle = 'scrapped', quality = 'attention'
        where id = v_item.unit_id;
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, kiln_batch_id, notes)
        values (v_item.unit_id, v_batch.stage_id, 'rejected', v_actor, p_batch_id, 'נפסל בשריפה');
      v_rejected := v_rejected + 1;
    else
      update public.ceramic_units
        set stage_id = greatest(v_batch.stage_id - 1, 1), quality = 'pending'
        where id = v_item.unit_id;
      insert into public.production_events (ceramic_unit_id, stage_id, result, artist_id, kiln_batch_id, notes)
        values (v_item.unit_id, greatest(v_batch.stage_id - 1, 1), 'rework', v_actor, p_batch_id, 'תיקון לאחר שריפה');
      v_rework := v_rework + 1;
    end if;

    update public.kiln_batch_items
      set result = v_result, active = false
      where batch_id = p_batch_id and unit_id = v_item.unit_id;
  end loop;

  update public.kiln_batches
    set status = 'completed', completed_at = now()
    where id = p_batch_id;

  -- Refresh every order whose units were affected.
  select array_agg(distinct i.order_id) into v_affected_orders
  from public.order_item_allocations a
  join public.order_items i on i.id = a.order_item_id
  join public.kiln_batch_items kbi on kbi.unit_id = a.ceramic_unit_id
  where kbi.batch_id = p_batch_id;
  if v_affected_orders is not null then
    foreach v_order_id in array v_affected_orders loop
      perform public.refresh_order(v_order_id);
    end loop;
  end if;

  return jsonb_build_object('ok', v_ok, 'rejected', v_rejected, 'rework', v_rework);
end $$;

create or replace function public.cancel_kiln_batch(p_batch_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  update public.kiln_batches
    set status = 'cancelled'
    where id = p_batch_id and status in ('planned', 'firing');
  if not found then raise exception 'האצווה אינה ניתנת לביטול.'; end if;
  update public.kiln_batch_items set active = false
    where batch_id = p_batch_id and active;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: publish a new mapping version (never mutates history).
-- ----------------------------------------------------------------------------
create or replace function public.save_mapping_version(
  p_product_id text, p_size_label text, p_material text, p_artwork_id text,
  p_print_width_cm numeric default null, p_print_height_cm numeric default null,
  p_rotation_deg numeric default 0, p_placement text default null,
  p_instructions text default null, p_notes text default null,
  p_print_file_path text default null, p_preview_path text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.artwork_mapping_versions;
  v_version int;
  v_id uuid;
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if not exists (select 1 from public.ceramic_products where id = p_product_id and is_active) then
    raise exception 'המוצר אינו קיים או אינו פעיל.';
  end if;
  if not exists (select 1 from public.artworks where id = p_artwork_id and is_active) then
    raise exception 'הציור אינו קיים.';
  end if;
  if p_material is not null and p_material not in ('smooth', 'speckled') then
    raise exception 'חומר לא תקין.';
  end if;
  if p_size_label is not null and not exists (
    select 1 from public.product_sizes
    where product_id = p_product_id and label = p_size_label) then
    raise exception 'המידה "%" אינה קיימת למוצר זה.', p_size_label;
  end if;

  select * into v_current
    from public.artwork_mapping_versions
    where product_id = p_product_id
      and artwork_id = p_artwork_id
      and size_label is not distinct from p_size_label
      and material is not distinct from p_material
      and superseded_at is null
    for update;

  if found then
    update public.artwork_mapping_versions set superseded_at = now() where id = v_current.id;
    v_version := v_current.version + 1;
  else
    v_version := 1;
  end if;

  insert into public.artwork_mapping_versions (
    product_id, size_label, material, artwork_id,
    print_width_cm, print_height_cm, rotation_deg, placement, instructions, notes,
    print_file_path, preview_path, version, created_by)
  values (
    p_product_id, p_size_label, p_material, p_artwork_id,
    p_print_width_cm, p_print_height_cm, p_rotation_deg, p_placement, p_instructions, p_notes,
    p_print_file_path, p_preview_path, v_version, v_actor)
  returning id into v_id;

  -- Unblock order items whose combination now has a preparation.
  update public.order_item_allocations a
    set print_status = 'ready_to_print'
  from public.order_items i
  where a.order_item_id = i.id
    and a.released_at is null
    and a.print_status = 'pending_mapping'
    and i.artwork_id is not null
    and public.resolve_mapping_version(i.product_id, i.size_label, i.material, i.artwork_id) is not null;

  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- ARTIST: unit notes (the only direct unit field touch).
-- ----------------------------------------------------------------------------
create or replace function public.set_unit_notes(p_unit_id uuid, p_notes text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  update public.ceramic_units set notes = nullif(p_notes, '') where id = p_unit_id;
end $$;

-- ----------------------------------------------------------------------------
-- INTERNAL: refresh the order(s) tied to a unit after a mutation.
-- (Helper called from other RPCs; not exposed to API roles.)
-- ----------------------------------------------------------------------------
create or replace function public.refresh_order_for_unit(p_unit_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
begin
  select i.order_id into v_order_id
  from public.order_item_allocations a
  join public.order_items i on i.id = a.order_item_id
  where a.ceramic_unit_id = p_unit_id and a.released_at is null
  limit 1;
  if v_order_id is not null then
    perform public.refresh_order(v_order_id);
  end if;
end $$;

-- ============================================================================
-- FUNCTION PRIVILEGES — the security boundary.
-- Postgres grants EXECUTE to PUBLIC by default; revoke everything, then
-- grant exactly what each role needs.
-- ============================================================================

-- Public capture: the ONLY function anon may execute.
revoke execute on function public.submit_order_request(jsonb, uuid) from public;
grant execute on function public.submit_order_request(jsonb, uuid) to anon, authenticated;

-- Artist RPCs.
revoke execute on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;
revoke execute on function public.confirm_order(uuid, jsonb) from public;
grant execute on function public.confirm_order(uuid, jsonb) to authenticated;
revoke execute on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;
revoke execute on function public.set_order_status(uuid, text, text) from public;
grant execute on function public.set_order_status(uuid, text, text) to authenticated;
revoke execute on function public.update_order_details(uuid, jsonb) from public;
grant execute on function public.update_order_details(uuid, jsonb) to authenticated;
revoke execute on function public.update_order_item_artwork(uuid, text) from public;
grant execute on function public.update_order_item_artwork(uuid, text) to authenticated;
revoke execute on function public.complete_order(uuid) from public;
grant execute on function public.complete_order(uuid) to authenticated;
revoke execute on function public.create_units(text, text, text, int, int, text) from public;
grant execute on function public.create_units(text, text, text, int, int, text) to authenticated;
revoke execute on function public.advance_units_stage(uuid[], text, text) from public;
grant execute on function public.advance_units_stage(uuid[], text, text) to authenticated;
revoke execute on function public.reject_unit(uuid, text) from public;
grant execute on function public.reject_unit(uuid, text) to authenticated;
revoke execute on function public.apply_artwork(uuid, text) from public;
grant execute on function public.apply_artwork(uuid, text) to authenticated;
revoke execute on function public.mark_printed(uuid[]) from public;
grant execute on function public.mark_printed(uuid[]) to authenticated;
revoke execute on function public.mark_print_failed(uuid[]) from public;
grant execute on function public.mark_print_failed(uuid[]) to authenticated;
revoke execute on function public.replace_unit(uuid) from public;
grant execute on function public.replace_unit(uuid) to authenticated;
revoke execute on function public.create_kiln_batch(int, uuid[], date, text) from public;
grant execute on function public.create_kiln_batch(int, uuid[], date, text) to authenticated;
revoke execute on function public.start_kiln_batch(uuid) from public;
grant execute on function public.start_kiln_batch(uuid) to authenticated;
revoke execute on function public.complete_kiln_batch(uuid, jsonb) from public;
grant execute on function public.complete_kiln_batch(uuid, jsonb) to authenticated;
revoke execute on function public.cancel_kiln_batch(uuid) from public;
grant execute on function public.cancel_kiln_batch(uuid) to authenticated;
revoke execute on function public.save_mapping_version(text, text, text, text, numeric, numeric, numeric, text, text, text, text, text) from public;
grant execute on function public.save_mapping_version(text, text, text, text, numeric, numeric, numeric, text, text, text, text, text) to authenticated;
revoke execute on function public.set_unit_notes(uuid, text) from public;
grant execute on function public.set_unit_notes(uuid, text) to authenticated;

-- Internal helpers: no API role may call them directly.
revoke execute on function public.is_artist() from public;
grant execute on function public.is_artist() to authenticated;
revoke execute on function public.resolve_mapping_version(text, text, text, text) from public, authenticated;
revoke execute on function public.normalize_order_items(jsonb) from public, authenticated;
revoke execute on function public.normalize_phone(text) from public, authenticated;
revoke execute on function public.next_order_number() from public, authenticated;
revoke execute on function public.order_is_ready(uuid) from public, authenticated;
revoke execute on function public.refresh_order(uuid) from public, authenticated;
revoke execute on function public.refresh_order_for_unit(uuid) from public, authenticated;
revoke execute on function public.allocate_for_item(uuid, text, int, uuid) from public, authenticated;
