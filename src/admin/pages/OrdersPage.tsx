import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { orderStatusLabel, type OrderItemRow, type OrderRow } from '../lib/types'
import { orderTotal } from '../lib/whatsapp'

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
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  const statusFilter = searchParams.get('status') ?? 'all'
  const attentionFilter = searchParams.get('filter') === 'attention'

  useEffect(() => { void load() }, [])
  useAutoRefresh(load)

  async function load() {
    setLoading(true)
    const [orderRows, itemRows] = await Promise.all([
      supabase.from('orders').select('*').order('captured_at', { ascending: false }),
      supabase.from('order_items').select('*'),
    ])
    setOrders(orderRows.data ?? [])
    setItems(itemRows.data ?? [])
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

  return (
    <section>
      <div className="sa-page-head">
        <h1 className="sa-page-title">הזמנות</h1>
        <Link className="sa-primary" to="/admin/orders/new">+ הזמנה חדשה</Link>
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
      {(loading && !ready) ? <p className="sa-loading">טוען…</p> : filtered.length === 0 ? (
        <p className="sa-hint">אין הזמנות מתאימות לתצוגה.</p>
      ) : (
        <ul className="sa-order-list">
          {filtered.map((order) => {
            const orderItems = itemsByOrder.get(order.id) ?? []
            return (
              <li key={order.id}>
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
