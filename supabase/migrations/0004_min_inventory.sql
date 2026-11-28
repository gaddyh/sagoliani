-- ============================================================================
-- Artist RPC: set the minimum desired inventory for a product (used for the
-- low-inventory dashboard signal). Catalog visibility itself stays read-only.
-- ============================================================================

create or replace function public.set_product_min_inventory(p_product_id text, p_minimum int)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_artist() then raise exception 'אין הרשאה.'; end if;
  if p_minimum is null or p_minimum < 0 or p_minimum > 500 then
    raise exception 'מלאי מינימלי חייב להיות בין 0 ל־500.';
  end if;
  if not exists (select 1 from public.ceramic_products where id = p_product_id) then
    raise exception 'המוצר לא נמצא.';
  end if;
  update public.ceramic_products set min_desired_inventory = p_minimum where id = p_product_id;
end $$;

revoke execute on function public.set_product_min_inventory(text, int) from public;
grant execute on function public.set_product_min_inventory(text, int) to authenticated;
