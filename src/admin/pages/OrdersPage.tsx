import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { fetchCatalog, type Catalog } from '../lib/catalog'
import { fetchCurrentMappings, multiOrderPrintList, type MappingVersionRow } from '../lib/printList'
import { orderStatusLabel, type OrderItemRow, type OrderRow } from '../lib/types'
import { orderTotal } from '../lib/whatsapp'
import { downloadCsv } from '../lib/csv'

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'הכול' },
  { key: 'request', label: 'בקשות חדשות' },
  { key: 'awaiting_confirmation', label: 'ממתין ללקוח' },
  { key: 'in_production', label: 'בעבודה' },
  { key: 'ready', label: 'מוכן למסירה' },
  { key: 'completed', label: 'הושלמו' },
  { key: 'cancelled', label: 'בוטלו' },
]

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [items, setItems] = useState<OrderItemRow[]>([])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [mappings, setMappings] = useState<MappingVersionRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAggregate, setShowAggregate] = useState(false)
  const [copied, setCopied] = useState(false)

  const statusFilter = searchParams.get('status') ?? 'all'
  const attentionFilter = searchParams.get('filter') === 'attention'

  useEffect(() => { void load() }, [])
  useAutoRefresh(load)

  async function load() {
    setLoading(true)
    const [orderRows, itemRows, catalogData, mappingRows] = await Promise.all([
      supabase.from('orders').select('*').order('captured_at', { ascending: false }),
      supabase.from('order_items').select('*'),
      fetchCatalog(),
      fetchCurrentMappings(),
    ])
    setOrders(orderRows.data ?? [])
    setItems(itemRows.data ?? [])
    setCatalog(catalogData)
    setMappings(mappingRows)
    setLoading(false)
    setReady(true)
  }

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItemRow[]>()
    for (const item of items) {
      const list = map.get(item.order_id) ?? []
      list.push(item)
      map.set(item.order_id, list)
    }
    return map
  }, [items])

  const filtered = orders.filter((order) => {
    if (attentionFilter) return order.needs_attention && !['completed', 'cancelled'].includes(order.status)
    if (statusFilter === 'all') return true
    if (statusFilter === 'in_production') return ['confirmed', 'in_production'].includes(order.status)
    return order.status === statusFilter
  }).filter((order) => {
    if (!query.trim()) return true
    const needle = query.trim()
    return order.number.includes(needle)
      || order.customer_name.includes(needle)
      || (order.customer_phone ?? '').includes(needle)
  })

  const selectedOrders = orders.filter((order) => selected.has(order.id))
  const aggregateText = selectedOrders.length && catalog
    ? multiOrderPrintList(selectedOrders, items, mappings, catalog)
    : ''
  const allFilteredSelected = filtered.length > 0 && filtered.every((order) => selected.has(order.id))

  function exportCsv() {
    const rows: unknown[][] = [[
      'מספר הזמנה', 'תאריך', 'שם לקוח', 'טלפון', 'סטטוס', 'תשלום', 'אספקה', 'סה״כ פריטים', 'סה״כ בש״ח', 'פריטים',
    ]]
    for (const order of filtered) {
      const orderItems = itemsByOrder.get(order.id) ?? []
      rows.push([
        order.number,
        new Date(order.captured_at).toLocaleDateString('he-IL'),
        order.customer_name,
        order.customer_phone ?? '',
        orderStatusLabel[order.status],
        order.payment_status,
        order.delivery_type === 'delivery' ? `משלוח (${order.city ?? ''})` : 'איסוע עצמי',
        orderItems.reduce((sum, item) => sum + item.quantity, 0),
        orderTotal(order, orderItems),
        orderItems.map((item) => `${item.product_name_snapshot}${item.size_label ? ` (${item.size_label})` : ''}${item.artwork_name_snapshot ? ` ציור ${item.artwork_name_snapshot}` : ''} x${item.quantity}`).join(' ; '),
      ])
    }
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  function toggle(orderId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
    setShowAggregate(false)
    setCopied(false)
  }

  return (
    <section>
      <div className="sa-page-head">
        <h1 className="sa-page-title">הזמנות</h1>
        <div className="sa-wa-actions">
          <button type="button" className="sa-secondary" onClick={exportCsv} disabled={filtered.length === 0}>⇓ ייצוא CSV</button>
          <Link className="sa-primary" to="/admin/orders/new">+ הזמנה חדשה</Link>
        </div>
      </div>
      <div className="sa-tabs" role="tablist">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={!attentionFilter && statusFilter === tab.key}
            className={!attentionFilter && statusFilter === tab.key ? 'active' : ''}
            onClick={() => setSearchParams(tab.key === 'all' ? {} : { status: tab.key })}
          >{tab.label}</button>
        ))}
      </div>
      <input
        className="sa-search"
        type="search"
        placeholder="חיפוש לפי מספר הזמנה, שם או טלפון…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {selected.size > 0 && (
        <div className="sa-select-bar" role="toolbar" aria-label="פעולות על ההזמנות הנבחרות">
          <span className="sa-select-count">נבחרו {selected.size} הזמנות</span>
          <button type="button" className="sa-primary" onClick={() => { setShowAggregate(true); setCopied(false) }}>
            🖨 רשימת הדפסות מצטברת
          </button>
          <button type="button" className="sa-secondary" onClick={() => {
            setSelected(new Set(filtered.map((order) => order.id)))
            setShowAggregate(false)
          }}>{allFilteredSelected ? 'בחירת הכול (נבחר)' : 'בחירת הכול המוצגות'}</button>
          <button type="button" className="sa-secondary" onClick={() => { setSelected(new Set()); setShowAggregate(false) }}>ניקוי בחירה</button>
        </div>
      )}

      {showAggregate && aggregateText && (
        <div className="sa-card sa-card-wide sa-print-list">
          <h2 className="sa-card-title">רשימת הדפסות מצטברת לנבחרות</h2>
          <textarea readOnly rows={Math.max(3, aggregateText.split('\n').length)} value={aggregateText} aria-label="רשימת הדפסות מצטברת" />
          <div className="sa-wa-actions">
            <button
              type="button"
              className="sa-primary"
              onClick={async () => {
                await navigator.clipboard.writeText(aggregateText)
                setCopied(true)
              }}
            >{copied ? '✔ הועתק ללוח' : 'העתקה ללוח'}</button>
            <button type="button" className="sa-secondary" onClick={() => setShowAggregate(false)}>סגירה</button>
          </div>
        </div>
      )}

      {(loading && !ready) ? <p className="sa-loading">טוען…</p> : filtered.length === 0 ? (
        <p className="sa-hint">אין הזמנות מתאימות לתצוגה.</p>
      ) : (
        <div className="sa-select-bar" style={{ marginBottom: 10 }}>
          <input
            type="checkbox"
            className="sa-order-check"
            checked={allFilteredSelected}
            onChange={() => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((order) => order.id)))}
            aria-label="בחירת כל ההזמנות המוצגות"
          />
          <span className="sa-select-count">{allFilteredSelected ? 'כולן נבחרו' : 'בחירת כל ההזמנות המוצגות'}</span>
          {selected.size > 0 && (
            <button type="button" className="sa-secondary" onClick={() => setSelected(new Set())}>ניקוי בחירה</button>
          )}
        </div>
      )}
      {(loading && !ready) ? null : filtered.length === 0 ? null : (
        <ul className="sa-order-list">
          {filtered.map((order) => {
            const orderItems = itemsByOrder.get(order.id) ?? []
            return (
              <li key={order.id} className="sa-order-li">
                <input
                  type="checkbox"
                  className="sa-order-check"
                  checked={selected.has(order.id)}
                  onChange={() => toggle(order.id)}
                  aria-label={`בחירת הזמנה ${order.number}`}
                />
                <Link to={`/admin/orders/${order.id}`} className="sa-order-row">
                  <span className="sa-order-number">{order.number}</span>
                  <span className="sa-order-customer">
                    <strong>{order.customer_name}</strong>
                    <span dir="ltr">{order.customer_phone}</span>
                  </span>
                  <span className="sa-order-items">{orderItems.map((item) => `${item.product_name_snapshot} × ${item.quantity}`).join(' · ')}</span>
                  <span className="sa-order-meta">
                    <span className={`sa-chip sa-chip-${order.status}`}>{orderStatusLabel[order.status]}</span>
                    {order.needs_attention && <span className="sa-chip sa-chip-attention">דורש תשומת לב</span>}
                    <span className="sa-order-total">{orderTotal(order, orderItems)} ₪</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
