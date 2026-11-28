-- ============================================================================
-- Default artwork fallback: every vessel in the collection ships with a
-- default artwork (the photographed combination). When an order item carries
-- no explicit artwork, the variant's registered default is used, so captured
-- requests are production-ready without a manual artwork pick.
-- ============================================================================

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
  v_explicit_artwork boolean;
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

    -- Explicit artwork wins; otherwise the vessel's registered default.
    v_explicit_artwork := nullif(v_item->>'artwork_id', '') is not null;
    v_artwork_id := nullif(v_item->>'artwork_id', '');
    if v_artwork_id is null then
      v_artwork_id := v_variant.artwork_id;
    end if;
    if v_artwork_id is not null then
      select * into v_artwork from public.artworks
        where id = v_artwork_id and is_active;
      if not found then
        if v_explicit_artwork then
          raise exception 'הציור "%" אינו זמין להזמנה.', v_artwork_id;
        end if;
        -- A stale registered default degrades gracefully to no artwork.
        v_artwork_id := null;
      else
        v_artwork_id := v_artwork.id;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'variant_id', v_variant.id,
      'product_id', v_variant.product_id,
      'product_name', v_product.name,
      'material', v_variant.material,
      'size_label', v_item->>'size_label',
      'artwork_id', v_artwork_id,
      'artwork_name', coalesce(
        (select name from public.artworks where id = v_artwork_id),
        v_variant.display_name),
      'unit_price_ils', v_price,
      'quantity', v_quantity,
      'print_width_cm', v_print_width,
      'print_height_cm', v_print_height
    );
  end loop;

  return v_out;
end $$;

revoke execute on function public.normalize_order_items(jsonb) from public, authenticated;

-- confirm_order also applies the vessel default for items captured before
-- defaults were linked (their artwork_id is null).
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
    v_artwork_id := nullif(coalesce(p_artwork_overrides ->> (v_item.id::text), ''), '');
    if v_artwork_id is null then v_artwork_id := v_item.artwork_id; end if;
    -- Fall back to the vessel's registered default artwork.
    if v_artwork_id is null then
      select artwork_id into v_artwork_id from public.catalog_variants where id = v_item.variant_id;
    end if;
    if v_artwork_id is not null
       and not exists (select 1 from public.artworks where id = v_artwork_id and is_active) then
      raise exception 'הציור "%" אינו קיים.', v_artwork_id;
    end if;
    if v_artwork_id is distinct from v_item.artwork_id then
      update public.order_items
        set artwork_id = v_artwork_id,
            artwork_name_snapshot = (select name from public.artworks where id = v_artwork_id)
        where id = v_item.id;
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

revoke execute on function public.confirm_order(uuid, jsonb) from public;
grant execute on function public.confirm_order(uuid, jsonb) to authenticated;
