import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchCatalog, stageName, type Catalog } from '../lib/catalog'
import {
  deliveryTypeLabel, lifecycleLabel, materialLabel, orderStatusLabel, paymentStatusLabel,
  qualityLabel, printStatusLabel, type AllocationRow, type OrderEventRow, type OrderItemRow, type OrderRow,
} from '../lib/types'
import { confirmationMessage, orderTotal, paymentReminderMessage, readyMessage, waLink } from '../lib/whatsapp'

interface MappingVersionRow {
  product_id: string
  size_label: string | null
  material: string | null
  artwork_id: string
  print_width_cm: number | null
  print_height_cm: number | null
  version: number
}

// Aggregated print list for one order: artworks grouped with the print size
// that fits each vessel (prefers the current mapping version, falls back to
// the dimensions snapshotted on the item at capture).
function buildPrintList(order: OrderRow, items: OrderItemRow[], mappings: MappingVersionRow[], catalog: Catalog | null): string {
  const resolveDims = (item: OrderItemRow): { width: number | null; height: number | null } => {
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
    const dims = resolveDims({ ...item, artwork_id: artworkId })
    const key = `${artwork}|${dims.width ?? '?'}|${dims.height ?? '?'}`
    const current = lines.get(key)
    if (current) current.quantity += item.quantity
    else lines.set(key, { artwork, quantity: item.quantity, width: dims.width, height: dims.height })
  }

  const body = [...lines.values()].map((line) =>
    line.width && line.height
      ? `${line.artwork}: צריכה מהציור הזה ${line.quantity} יחי'. גובה ${line.height} ורוחה ${line.width} ס"מ.`
      : `${line.artwork}: צריכה מהציור הזה ${line.quantity} יחי'. (חסרות מידות הדפסה לכלי זה.)`)

  return [
    `רשימת הדפסות · ${order.number} · ${order.customer_name}`,
    ...body,
    ...(unchosen.length ? ['', `⚠ פריטים ללא ציור שנבחר: ${unchosen.join(', ')}`] : []),
  ].join('\n')
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [items, setItems] = useState<OrderItemRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [events, setEvents] = useState<OrderEventRow[]>([])
  const [mappings, setMappings] = useState<MappingVersionRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [artworkChoices, setArtworkChoices] = useState<Record<string, string>>({})
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [showPrintList, setShowPrintList] = useState(false)
  const [copied, setCopied] = useState(false)
  const [edit, setEdit] = useState({ expected: '', payment: '', discount: '', internal: '' })

  const load = useCallback(async () => {
    if (!id) return
    const [orderResult, itemResult, eventResult, mappingResult, catalogData] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('order_items').select('*').eq('order_id', id).order('created_at'),
      supabase.from('order_events').select('*').eq('order_id', id).order('at'),
      supabase.from('artwork_mapping_versions').select('product_id, size_label, material, artwork_id, print_width_cm, print_height_cm, version').is('superseded_at', null),
      fetchCatalog(),
    ])
    setOrder(orderResult.data)
    setItems(itemResult.data ?? [])
    setEvents(eventResult.data ?? [])
    setMappings(mappingResult.data ?? [])
    setCatalog(catalogData)
    if (itemResult.data?.length) {
      const { data: allocationRows } = await supabase
        .from('order_item_allocations')
        .select('*, ceramic_units(*)')
        .in('order_item_id', itemResult.data.map((item) => item.id))
        .order('allocated_at')
      setAllocations(allocationRows ?? [])
    } else {
      setAllocations([])
    }
    const current = orderResult.data as OrderRow | null
    if (current) {
      setEdit({
        expected: current.expected_delivery_date ?? '',
        payment: current.payment_status,
        discount: String(current.discount_ils ?? 0),
        internal: current.internal_notes ?? '',
      })
    }
  }, [id])

  useEffect(() => { void load() }, [load])

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
      setConfirming(false)
      setShowCancel(false)
    }
    setBusy(false)
  }

  if (!order || !catalog) return <p className="sa-loading">טוען…</p>

  const total = orderTotal(order, items)
  const allocationsFor = (itemId: string) => allocations.filter((allocation) => allocation.order_item_id === itemId)
  // Items needing an explicit artwork pick: no artwork and no registered
  // vessel default (every vessel normally ships with one).
  const itemsNeedingArtwork = items.filter((item) => {
    if (item.artwork_id) return false
    const variantDefault = item.variant_id ? catalog?.variants.find((variant) => variant.id === item.variant_id)?.artwork_id : null
    return !variantDefault
  })

  return (
    <section>
      <div className="sa-page-head">
        <div>
          <h1 className="sa-page-title">הזמנה {order.number}</h1>
          <p className="sa-subtitle">
            <span className={`sa-chip sa-chip-${order.status}`}>{orderStatusLabel[order.status]}</span>
            {order.needs_attention && <span className="sa-chip sa-chip-attention">דורש תשומת לב</span>}
            <span className="sa-chip">{paymentStatusLabel[order.payment_status]}</span>
            <span className="sa-source">מקור: {sourceLabel(order.source)}</span>
          </p>
        </div>
        <Link to="/admin/orders" className="sa-back">← כל ההזמנות</Link>
      </div>

      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      <div className="sa-card">
        <h2 className="sa-card-title">{order.customer_name} <a className="sa-phone" dir="ltr" href={`tel:${order.customer_phone ?? ''}`}>{order.customer_phone}</a></h2>
        <p className="sa-hint">
          {deliveryTypeLabel[order.delivery_type]}
          {order.delivery_type === 'delivery' && order.city ? ` — ${order.city}, ${order.street}` : ''}
          {order.expected_delivery_date ? ` · מסירה צפויה ${new Date(order.expected_delivery_date).toLocaleDateString('he-IL')}` : ''}
        </p>
        {order.customer_notes && <p className="sa-notes"><strong>הערות לקוח:</strong> {order.customer_notes}</p>}
        {order.internal_notes && <p className="sa-notes"><strong>הערות פנימיות:</strong> {order.internal_notes}</p>}
        <p className="sa-total">סה״כ: <strong>{total} ₪</strong>{Number(order.discount_ils) > 0 ? ` (אחרי הנחה ${order.discount_ils} ₪)` : ''}</p>
        <div className="sa-wa-actions">
          <button type="button" className="sa-secondary" onClick={() => { setShowPrintList((open) => !open); setCopied(false) }}>🖨 רשימת הדפסות להזמנה</button>
          <a className="sa-secondary" target="_blank" rel="noopener noreferrer" href={waLink(order.customer_phone, confirmationMessage(order, items))}>וואטסאפ: אישור הזמנה</a>
          <a className="sa-secondary" target="_blank" rel="noopener noreferrer" href={waLink(order.customer_phone, readyMessage(order, items))}>וואטסאפ: מוכן למסירה</a>
          <a className="sa-secondary" target="_blank" rel="noopener noreferrer" href={waLink(order.customer_phone, paymentReminderMessage(order))}>וואטסאפ: תזכורת תשלום</a>
        </div>
        {showPrintList && (
          <div className="sa-print-list">
            <textarea readOnly rows={Math.max(3, buildPrintList(order, items, mappings, catalog).split('\n').length)} value={buildPrintList(order, items, mappings, catalog)} aria-label="רשימת הדפסות" />
            <div className="sa-wa-actions">
              <button
                type="button"
                className="sa-primary"
                onClick={async () => {
                  await navigator.clipboard.writeText(buildPrintList(order, items, mappings, catalog))
                  setCopied(true)
                }}
              >{copied ? '✔ הועתק ללוח' : 'העתקה ללוח'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Status actions */}
      <div className="sa-card">
        {(order.status === 'request' || order.status === 'awaiting_confirmation') && (
          confirming ? (
            <div className="sa-confirm-panel">
              <h3>אישור ההזמנה</h3>
              {itemsNeedingArtwork.length > 0 && (
                <>
                  <p className="sa-hint">בפריטים הבאים לא נבחר ציור — בחרו ציור לפני האישור:</p>
                  <ul className="sa-item-rows">
                    {itemsNeedingArtwork.map((item) => (
                      <li key={item.id} className="sa-item-row">
                        <span>{item.product_name_snapshot} · {materialLabel[item.material]}</span>
                        <select
                          aria-label="בחירת ציור"
                          value={artworkChoices[item.id] ?? ''}
                          onChange={(event) => setArtworkChoices((current) => ({ ...current, [item.id]: event.target.value }))}
                        >
                          <option value="">— בחרו ציור —</option>
                          {catalog.artworks.map((artwork) => <option key={artwork.id} value={artwork.id}>{artwork.name}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="sa-wa-actions">
                <button
                  type="button"
                  className="sa-primary"
                  disabled={busy || itemsNeedingArtwork.some((item) => !artworkChoices[item.id])}
                  onClick={() => run(() => supabase.rpc('confirm_order', {
                    p_order_id: order.id,
                    p_artwork_overrides: itemsNeedingArtwork.some((item) => artworkChoices[item.id])
                      ? artworkChoices
                      : null,
                  }), 'ההזמנה אושרה והמלאי הוקצה.')}
                >אישור סופי</button>
                <button type="button" className="sa-secondary" onClick={() => setConfirming(false)}>ביטול</button>
              </div>
            </div>
          ) : (
            <div className="sa-wa-actions">
              <button type="button" className="sa-primary" onClick={() => setConfirming(true)}>אישור הזמנה</button>
              {order.status === 'request' && (
                <button
                  type="button"
                  className="sa-secondary"
                  onClick={() => run(() => supabase.rpc('set_order_status', { p_order_id: order.id, p_status: 'awaiting_confirmation' }), 'סומן כממתין לאישור הלקוח.')}
                >ממתין לאישור הלקוח</button>
              )}
            </div>
          )
        )}
        {order.status === 'ready' && (
          <div className="sa-wa-actions">
            <button
              type="button"
              className="sa-primary"
              disabled={busy}
              onClick={() => run(() => supabase.rpc('complete_order', { p_order_id: order.id }), 'ההזמנה הושלמה ונמסרה.')}
            >סימון כהושלם ונמסר</button>
          </div>
        )}
        {!['completed', 'cancelled'].includes(order.status) && !confirming && (
          <div className="sa-wa-actions">
            <button type="button" className="sa-danger" onClick={() => setShowCancel(true)}>ביטול ההזמנה</button>
          </div>
        )}
        {showCancel && (
          <div className="sa-confirm-panel">
            <label>סיבת הביטול <input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="למשל: הלקוח חזר בו" /></label>
            <div className="sa-wa-actions">
              <button
                type="button"
                className="sa-danger"
                disabled={busy}
                onClick={() => run(() => supabase.rpc('cancel_order', { p_order_id: order.id, p_reason: cancelReason.trim() || null }), 'ההזמנה בוטלה והמלאי שוחרר.')}
              >אישור ביטול</button>
              <button type="button" className="sa-secondary" onClick={() => setShowCancel(false)}>חזרה</button>
            </div>
          </div>
        )}
      </div>

      {/* Items and their physical units */}
      <div className="sa-card">
        <h2 className="sa-card-title">פריטים</h2>
        {items.length === 0 && <p className="sa-hint">אין פריטים בהזמנה.</p>}
        <ul className="sa-detail-items">
          {items.map((item) => {
            const itemAllocations = allocationsFor(item.id)
            const artwork = catalog.artworks.find((entry) => entry.id === item.artwork_id)
            return (
              <li key={item.id} className="sa-detail-item">
                <div className="sa-detail-item-head">
                  <strong>{item.product_name_snapshot}</strong>
                  <span>{item.size_label} · {materialLabel[item.material]}</span>
                  {item.artwork_id
                    ? <span className="sa-chip sa-chip-artwork">{artwork?.name ?? item.artwork_name_snapshot}</span>
                    : <select
                        className="sa-inline-select"
                        aria-label="בחירת ציור"
                        value={item.artwork_id ?? ''}
                        onChange={(event) => run(() => supabase.rpc('update_order_item_artwork', { p_order_item_id: item.id, p_artwork_id: event.target.value || null }), 'הציור עודכן.')}
                      >
                        <option value="">בחירת ציור…</option>
                        {catalog.artworks.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>}
                  <span>{item.quantity} × {item.unit_price_ils} ₪</span>
                </div>
                {order.status !== 'request' && order.status !== 'awaiting_confirmation' && (
                  itemAllocations.length ? (
                    <ul className="sa-units">
                      {itemAllocations.map((allocation) => {
                        const unit = allocation.ceramic_units
                        return (
                          <li key={allocation.id} className={`sa-unit ${allocation.released_at ? 'sa-unit-released' : ''} ${unit?.lifecycle === 'scrapped' ? 'sa-unit-scrapped' : ''}`}>
                            <span className="sa-unit-stage">{unit ? stageName(catalog, unit.stage_id) : '—'}</span>
                            {unit && <span className={`sa-chip sa-chip-quality-${unit.quality}`}>{qualityLabel[unit.quality]}</span>}
                            {unit && unit.lifecycle !== 'active' && <span className="sa-chip">{lifecycleLabel[unit.lifecycle]}</span>}
                            {allocation.print_status && <span className={`sa-chip sa-chip-print-${allocation.print_status}`}>{printStatusLabel[allocation.print_status]}</span>}
                            {allocation.released_at
                              ? <span className="sa-hint">שוחרר ({allocation.release_reason})</span>
                              : <span className="sa-unit-actions">
                                  {allocation.print_status === 'ready_to_print' && (
                                    <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('mark_printed', { p_allocation_ids: [allocation.id] }), 'סומן כמודפס.')}>הדפסה בוצעה</button>
                                  )}
                                  {allocation.print_status === 'print_failed' && (
                                    <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('mark_printed', { p_allocation_ids: [allocation.id] }), 'סומן כמודפס.')}>הדפסה חוזרת בוצעה</button>
                                  )}
                                  {unit && unit.lifecycle === 'active' && unit.stage_id < 8 && (
                                    <button
                                      type="button"
                                      className="sa-mini"
                                      disabled={busy || unit.stage_id === 5}
                                      title={unit.stage_id === 5 ? 'יש ליישם ציור לפני המשך' : undefined}
                                      onClick={() => run(() => supabase.rpc('advance_units_stage', { p_unit_ids: [unit.id], p_result: 'completed' }), 'השלב הושלם.')}
                                    >השלמת שלב</button>
                                  )}
                                  {unit && unit.stage_id === 5 && unit.lifecycle === 'active' && (
                                    <button
                                      type="button"
                                      className="sa-mini"
                                      disabled={busy || !item.artwork_id}
                                      title={item.artwork_id ? undefined : 'בחרו ציור לפריט קודם'}
                                      onClick={() => run(() => supabase.rpc('apply_artwork', { p_unit_id: unit.id }), 'הציור יושם.')}
                                    >יישום ציור</button>
                                  )}
                                  {unit && unit.lifecycle === 'active' && (
                                    <button type="button" className="sa-mini sa-mini-danger" disabled={busy} onClick={() => run(() => supabase.rpc('reject_unit', { p_unit_id: unit.id, p_notes: 'נפסל מהזמנה' }), 'הפריט סומן כפסול.')}>פסילה</button>
                                  )}
                                  {unit && unit.lifecycle === 'scrapped' && allocation.released_at === null && (
                                    <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('replace_unit', { p_unit_id: unit.id }), 'הוקצתה יחידה חלופית.')}>הקצאת חלופה</button>
                                  )}
                                </span>}
                          </li>
                        )
                      })}
                    </ul>
                  ) : <p className="sa-hint">טרם הוקצו יחידות (ההקצאה מתבצעת באישור ההזמנה).</p>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Editable details */}
      <div className="sa-card">
        <h2 className="sa-card-title">עדכון פרטים</h2>
        <div className="sa-form-grid">
          <label>מועד מסירה צפוי <input type="date" value={edit.expected} onChange={(event) => setEdit({ ...edit, expected: event.target.value })} /></label>
          <label>סטטוס תשלום
            <select value={edit.payment} onChange={(event) => setEdit({ ...edit, payment: event.target.value })}>
              {(['unpaid', 'deposit', 'paid', 'refunded'] as const).map((option) => (
                <option key={option} value={option}>{paymentStatusLabel[option]}</option>
              ))}
            </select>
          </label>
          <label>הנחה (₪) <input type="number" min={0} step="1" value={edit.discount} onChange={(event) => setEdit({ ...edit, discount: event.target.value })} dir="ltr" /></label>
        </div>
        <label>הערות פנימיות <textarea rows={3} value={edit.internal} onChange={(event) => setEdit({ ...edit, internal: event.target.value })} /></label>
        <button
          type="button"
          className="sa-secondary"
          disabled={busy}
          onClick={() => run(() => supabase.rpc('update_order_details', {
            p_order_id: order.id,
            p_patch: {
              expected_delivery_date: edit.expected || null,
              payment_status: edit.payment,
              discount_ils: Number(edit.discount) || 0,
              internal_notes: edit.internal,
            },
          }), 'הפרטים עודכנו.')}
        >שמירת פרטים</button>
      </div>

      {/* Timeline */}
      <div className="sa-card">
        <h2 className="sa-card-title">היסטוריה</h2>
        <ol className="sa-timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span className="sa-timeline-date">{new Date(event.at).toLocaleString('he-IL')}</span>
              <span className="sa-timeline-type">{eventLabel(event)}</span>
              {event.notes && <span className="sa-timeline-notes">{event.notes}</span>}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    website: 'האתר', whatsapp: 'וואטסאפ', manual: 'הזנה ידנית', excel: 'ייבוא מקובץ',
  }
  return labels[source] ?? source
}

function eventLabel(event: OrderEventRow): string {
  const labels: Record<string, string> = {
    captured: 'בקשה התקבלה', created: 'ההזמנה נוצרה', confirmed: 'ההזמנה אושרה',
    cancelled: 'ההזמנה בוטלה', status: 'עדכון סטטוס', completed: 'ההזמנה הושלמה',
  }
  const label = labels[event.type] ?? event.type
  return event.from_status && event.to_status ? `${label} (${orderStatusLabel[event.from_status as keyof typeof orderStatusLabel] ?? event.from_status} → ${orderStatusLabel[event.to_status as keyof typeof orderStatusLabel] ?? event.to_status})` : label
}
