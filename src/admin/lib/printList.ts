import { supabase } from './supabase'
import type { Catalog } from './catalog'
import type { OrderItemRow } from './types'

export interface MappingVersionRow {
  product_id: string
  size_label: string | null
  material: string | null
  artwork_id: string
  print_width_cm: number | null
  print_height_cm: number | null
  version: number
}

// Print dimensions for an item: the current mapping version wins, then the
// dimensions snapshotted on the item at capture, then the vessel defaults.
function resolvePrintDims(item: OrderItemRow, mappings: MappingVersionRow[], catalog: Catalog | null): { width: number | null; height: number | null } {
  const candidates = mappings.filter((mapping) =>
    mapping.product_id === item.product_id
    && mapping.artwork_id === item.artwork_id
    && (mapping.size_label === null || mapping.size_label === item.size_label)
    && (mapping.material === null || mapping.material === item.material))
  candidates.sort((a, b) =>
    ((a.size_label ? 0 : 1) + (a.material ? 0 : 1)) - ((b.size_label ? 0 : 1) + (b.material ? 0 : 1))
    || b.version - a.version)
  const best = candidates[0]
  if (best?.print_width_cm && best?.print_height_cm) return { width: Number(best.print_width_cm), height: Number(best.print_height_cm) }
  if (item.print_width_cm && item.print_height_cm) return { width: Number(item.print_width_cm), height: Number(item.print_height_cm) }
  const fallback = catalog?.sizes.find((size) => size.product_id === item.product_id && size.label === item.size_label)
  return { width: fallback?.print_width_cm ?? null, height: fallback?.print_height_cm ?? null }
}

// Aggregated print list for one or many orders: artworks grouped with the
// print size that fits each vessel, quantities summed across items.
function buildPrintList(header: string, items: OrderItemRow[], mappings: MappingVersionRow[], catalog: Catalog | null): string {
  const lines = new Map<string, { artwork: string; quantity: number; width: number | null; height: number | null }>()
  const unchosen: string[] = []
  for (const item of items) {
    // No explicit artwork -> the vessel's registered default (every vessel
    // ships with one); only flag when even the default is missing.
    let artworkId = item.artwork_id
    if (!artworkId && item.variant_id) {
      artworkId = catalog?.variants.find((variant) => variant.id === item.variant_id)?.artwork_id ?? null
    }
    if (!artworkId) {
      if (!unchosen.includes(item.product_name_snapshot)) unchosen.push(item.product_name_snapshot)
      continue
    }
    const artwork = catalog?.artworks.find((entry) => entry.id === artworkId)?.name ?? item.artwork_name_snapshot ?? artworkId
    const dims = resolvePrintDims({ ...item, artwork_id: artworkId }, mappings, catalog)
    const key = `${artwork}|${dims.width ?? '?'}|${dims.height ?? '?'}`
    const current = lines.get(key)
    if (current) current.quantity += item.quantity
    else lines.set(key, { artwork, quantity: item.quantity, width: dims.width, height: dims.height })
  }

  const body = [...lines.values()].map((line) =>
    line.width && line.height
      ? `${line.artwork}: צריכה מהציור הזה ${line.quantity} יחי'. גובה ${line.height} ורוחב ${line.width} ס"מ.`
      : `${line.artwork}: צריכה מהציור הזה ${line.quantity} יחי'. (חסרות מידות הדפסה לכלי זה.)`)

  return [
    header,
    ...body,
    ...(unchosen.length ? ['', `⚠ פריטים ללא ציור שנבחר: ${unchosen.join(', ')}`] : []),
  ].join('\n')
}

export function orderPrintList(order: { id: string; number: string; customer_name: string }, items: OrderItemRow[], mappings: MappingVersionRow[], catalog: Catalog | null): string {
  return buildPrintList(
    `רשימת הדפסות · ${order.number} · ${order.customer_name}`,
    items.filter((item) => item.order_id === order.id),
    mappings, catalog)
}

export function multiOrderPrintList(orders: { id: string; number: string }[], items: OrderItemRow[], mappings: MappingVersionRow[], catalog: Catalog | null): string {
  const ids = new Set(orders.map((order) => order.id))
  return buildPrintList(
    `רשימת הדפסות מצטברת · ${orders.length} הזמנות · ${orders.map((order) => order.number).join(', ')}`,
    items.filter((item) => ids.has(item.order_id)),
    mappings, catalog)
}

export async function fetchCurrentMappings(): Promise<MappingVersionRow[]> {
  const { data } = await supabase
    .from('artwork_mapping_versions')
    .select('product_id, size_label, material, artwork_id, print_width_cm, print_height_cm, version')
    .is('superseded_at', null)
  return data ?? []
}
