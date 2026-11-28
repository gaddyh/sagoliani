import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchCatalog, type Catalog } from '../lib/catalog'
import { materialLabel, printStatusLabel, type Material, type PrintStatus } from '../lib/types'
import { resolvePrintFileUrl } from '../lib/storage'

interface PrintAllocation {
  id: string
  orderId: string
  orderNumber: string
  productId: string
  productName: string
  sizeLabel: string
  material: Material
  artworkId: string
  artworkName: string
  quantity: number
  printStatus: PrintStatus
}

interface MappingInfo { printWidthCm: number | null; printHeightCm: number | null; printFilePath: string | null; rotation: number }

interface PrintGroup {
  key: string
  productId: string
  productName: string
  sizeLabel: string
  material: Material
  artworkId: string
  artworkName: string
  allocations: PrintAllocation[]
  mapping: MappingInfo | null
}

export default function PrintQueuePage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [groups, setGroups] = useState<PrintGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const [catalogData, allocationRows, mappingRows] = await Promise.all([
      fetchCatalog(),
      supabase.from('order_item_allocations')
        .select('id, print_status, order_items(product_id, product_name_snapshot, size_label, material, artwork_id, artwork_name_snapshot, quantity, orders(id, number))')
        .in('print_status', ['ready_to_print', 'print_failed'])
        .is('released_at', null),
      supabase.from('artwork_mapping_versions')
        .select('product_id, size_label, material, artwork_id, print_width_cm, print_height_cm, rotation_deg, print_file_path, version')
        .is('superseded_at', null),
    ])
    setCatalog(catalogData)

    const mappings = mappingRows.data ?? []
    const resolve = (productId: string, sizeLabel: string, material: string, artworkId: string): MappingInfo | null => {
      const candidates = mappings.filter((mapping) =>
        mapping.product_id === productId
        && mapping.artwork_id === artworkId
        && (mapping.size_label === null || mapping.size_label === sizeLabel)
        && (mapping.material === null || mapping.material === material))
      candidates.sort((a, b) =>
        ((a.size_label ? 0 : 1) + (a.material ? 0 : 1)) - ((b.size_label ? 0 : 1) + (b.material ? 0 : 1))
        || b.version - a.version)
      const best = candidates[0]
      return best ? {
        printWidthCm: best.print_width_cm, printHeightCm: best.print_height_cm,
        printFilePath: best.print_file_path, rotation: Number(best.rotation_deg ?? 0),
      } : null
    }

    const grouped = new Map<string, PrintGroup>()
    const artworkName = (artworkId: string, snapshot: string | null) =>
      catalogData.artworks.find((artwork) => artwork.id === artworkId)?.name ?? snapshot ?? artworkId
    for (const row of allocationRows.data ?? []) {
      const item = row.order_items as unknown as {
        product_id: string; product_name_snapshot: string; size_label: string; material: Material
        artwork_id: string | null; artwork_name_snapshot: string | null; quantity: number
        orders: { id: string; number: string } | null
      }
      if (!item?.orders || !item.artwork_id) continue
      const allocation: PrintAllocation = {
        id: row.id,
        orderId: item.orders.id, orderNumber: item.orders.number,
        productId: item.product_id, productName: item.product_name_snapshot,
        sizeLabel: item.size_label, material: item.material,
        artworkId: item.artwork_id, artworkName: artworkName(item.artwork_id, item.artwork_name_snapshot),
        quantity: item.quantity, printStatus: row.print_status as PrintStatus,
      }
      const key = `${item.product_id}|${item.size_label}|${item.material}|${item.artwork_id}`
      const group = grouped.get(key)
      if (group) group.allocations.push(allocation)
      else grouped.set(key, {
        key, productId: item.product_id, productName: item.product_name_snapshot,
        sizeLabel: item.size_label, material: item.material,
        artworkId: item.artwork_id, artworkName: artworkName(item.artwork_id, item.artwork_name_snapshot),
        allocations: [allocation],
        mapping: resolve(item.product_id, item.size_label, item.material, item.artwork_id),
      })
    }
    setGroups([...grouped.values()])
    setLoading(false)
  }

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, successNotice: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    const { error: actionError } = await action()
    if (actionError) setError(actionError.message)
    else {
      await load()
      setNotice(successNotice)
    }
    setBusy(false)
  }

  async function download(path: string) {
    const url = await resolvePrintFileUrl(path)
    if (url) window.open(url, '_blank', 'noopener')
    else setError('לא ניתן לפתוח את הקובץ.')
  }

  if (loading && !catalog) return <p className="sa-loading">טוען…</p>

  return (
    <section>
      <h1 className="sa-page-title">תור הדפסות</h1>
      <p className="sa-hint">הכנות שהושלמו וממתינות להדפסה פיזית. סימון כמודפס מקדם את הפריט ליישום הציור.</p>
      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      {groups.length === 0 && !loading ? <p className="sa-hint">אין הדפסות ממתינות כרגע.</p> : (
        <ul className="sa-print-groups">
          {groups.map((group) => (
            <li key={group.key} className="sa-card">
              <div className="sa-print-head">
                <span className="sa-combo-text">
                  <strong>{group.productName}</strong>
                  {group.sizeLabel} · {materialLabel[group.material]} · ציור {group.artworkName}
                </span>
                {group.mapping ? (
                  <span className="sa-chip">{group.mapping.printWidthCm}×{group.mapping.printHeightCm} ס״מ{group.mapping.rotation ? ` · ${group.mapping.rotation}°` : ''}</span>
                ) : <span className="sa-chip sa-chip-print-pending_mapping">חסרה הכנה</span>}
              </div>
              <ul className="sa-print-allocations">
                {group.allocations.map((allocation) => (
                  <li key={allocation.id}>
                    <Link to={`/admin/orders/${allocation.orderId}`}>{allocation.orderNumber}</Link>
                    <span className="sa-hint">כמות בשורה: {allocation.quantity}</span>
                    <span className={`sa-chip sa-chip-print-${allocation.printStatus}`}>{printStatusLabel[allocation.printStatus]}</span>
                  </li>
                ))}
              </ul>
              <div className="sa-wa-actions">
                {group.mapping?.printFilePath && (
                  <button type="button" className="sa-secondary" disabled={busy} onClick={() => download(group.mapping!.printFilePath!)}>⬇ הורדת קובץ ההדפסה</button>
                )}
                <button
                  type="button"
                  className="sa-primary"
                  disabled={busy || !group.mapping}
                  title={group.mapping ? undefined : 'השלימו קודם את הכנת השילוב'}
                  onClick={() => run(() => supabase.rpc('mark_printed', {
                    p_allocation_ids: group.allocations.filter((allocation) => allocation.printStatus !== 'printed').map((allocation) => allocation.id),
                  }), 'כל ההדפסות של השילוב סומנו כבוצעו.')}
                >סימון כל ההדפסות כבוצעו</button>
                <button
                  type="button"
                  className="sa-mini sa-mini-danger"
                  disabled={busy}
                  onClick={() => run(() => supabase.rpc('mark_print_failed', {
                    p_allocation_ids: group.allocations.map((allocation) => allocation.id),
                  }), 'ההדפסות סומנו ככשל.')}
                >סימון כשל</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
