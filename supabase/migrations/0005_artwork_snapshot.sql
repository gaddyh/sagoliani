-- ============================================================================
-- Keep artwork_name_snapshot in sync when the concrete artwork of an order
-- item is chosen or changed at confirmation. The snapshot is the historical
-- record of what the customer ordered; after the artist picks the concrete
-- artwork, it should reflect that choice too.
-- ============================================================================

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

  update public.order_items
    set artwork_id = nullif(p_artwork_id, ''),
        artwork_name_snapshot = case when nullif(p_artwork_id, '') is null then null
                                     else (select name from public.artworks where id = p_artwork_id) end
    where id = p_order_item_id;

  v_mapping := public.resolve_mapping_version(
    v_item.product_id, v_item.size_label, v_item.material, nullif(p_artwork_id, ''));
  update public.order_item_allocations a
    set print_status = case when v_mapping.id is null then 'pending_mapping' else 'ready_to_print' end
  from public.ceramic_units u
  where a.order_item_id = p_order_item_id
    and a.released_at is null
    and a.print_status in ('pending_mapping', 'ready_to_print')
    and u.id = a.ceramic_unit_id
    and u.applied_artwork_id is null;
end $$;

revoke execute on function public.confirm_order(uuid, jsonb) from public;
grant execute on function public.confirm_order(uuid, jsonb) to authenticated;
revoke execute on function public.update_order_item_artwork(uuid, text) from public;
grant execute on function public.update_order_item_artwork(uuid, text) to authenticated;
