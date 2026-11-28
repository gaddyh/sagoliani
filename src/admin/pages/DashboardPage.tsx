import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { orderStatusLabel, type OrderRow } from '../lib/types'

interface UnitSummary { stage_id: number; waiting: number }

export default function DashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [units, setUnits] = useState<UnitSummary[]>([])
  const [prints, setPrints] = useState({ pending_mapping: 0, ready_to_print: 0, print_failed: 0 })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { void load() }, [])
  useAutoRefresh(load)

  async function load() {
    setLoading(true)
    const [orderRows, unitRows, allocRows] = await Promise.all([
      supabase.from('orders').select('*').order('captured_at', { ascending: false }),
      supabase.from('ceramic_units').select('stage_id, quality, lifecycle'),
      supabase.from('order_item_allocations').select('print_status, released_at').is('released_at', null),
    ])
    setOrders(orderRows.data ?? [])
    const waiting = new Map<number, number>()
    for (const unit of unitRows.data ?? []) {
      if (unit.lifecycle !== 'active' || unit.quality === 'attention') continue
      waiting.set(unit.stage_id, (waiting.get(unit.stage_id) ?? 0) + 1)
    }
    setUnits([...waiting.entries()].map(([stage_id, count]) => ({ stage_id, waiting: count })))
    const counts = { pending_mapping: 0, ready_to_print: 0, print_failed: 0 }
    for (const allocation of allocRows.data ?? []) {
      if (allocation.print_status && allocation.print_status in counts) {
        counts[allocation.print_status as keyof typeof counts] += 1
      }
    }
    setPrints(counts)
    setLoading(false)
    setLoaded(true)
  }

  const count = (statuses: string[]) => orders.filter((order) => statuses.includes(order.status)).length
  const requests = count(['request', 'awaiting_confirmation'])
  const inProduction = count(['confirmed', 'in_production'])
  const ready = count(['ready'])
  const attention = orders.filter((order) => order.needs_attention && !['completed', 'cancelled'].includes(order.status)).length
  const now = Date.now()
  const deadlines = orders.filter((order) =>
    order.expected_delivery_date
    && !['completed', 'cancelled'].includes(order.status)
    && new Date(order.expected_delivery_date).getTime() - now < 7 * 24 * 3600 * 1000,
  )

  if (loading && !loaded) return <p className="sa-loading">טוען…</p>

  return (
    <section>
      <h1 className="sa-page-title">מה אני צריכה לעשות עכשיו?</h1>
      <div className="sa-card-grid">
        <Link to="/admin/orders?status=request" className={`sa-card sa-card-action ${requests ? 'sa-card-hot' : ''}`}>
          <span className="sa-card-count">{requests}</span>
          <span className="sa-card-label">בקשות חדשות לאישור</span>
          <span className="sa-card-hint">לאישור, בירור או ביטול</span>
        </Link>
        <Link to="/admin/orders?status=in_production" className={`sa-card sa-card-action ${inProduction ? '' : 'sa-card-muted'}`}>
          <span className="sa-card-count">{inProduction}</span>
          <span className="sa-card-label">הזמנות בעבודה</span>
          <span className="sa-card-hint">מאושרות ובייצור</span>
        </Link>
        <Link to="/admin/orders?status=ready" className={`sa-card sa-card-action ${ready ? 'sa-card-hot' : ''}`}>
          <span className="sa-card-count">{ready}</span>
          <span className="sa-card-label">מוכן למסירה</span>
          <span className="sa-card-hint">לתיאום עם הלקוח</span>
        </Link>
        <Link to="/admin/orders?filter=attention" className={`sa-card sa-card-action ${attention ? 'sa-card-alert' : 'sa-card-muted'}`}>
          <span className="sa-card-count">{attention}</span>
          <span className="sa-card-label">דורש תשומת לב</span>
          <span className="sa-card-hint">פריטים שנפסלו או נתקעו</span>
        </Link>
        <Link to="/admin/mappings" className={`sa-card sa-card-action ${prints.pending_mapping ? 'sa-card-hot' : 'sa-card-muted'}`}>
          <span className="sa-card-count">{prints.pending_mapping}</span>
          <span className="sa-card-label">שילובי ציור להכנה</span>
          <span className="sa-card-hint">חסר מיפוי מידות להדפסה</span>
        </Link>
        <Link to="/admin/print" className={`sa-card sa-card-action ${prints.ready_to_print ? 'sa-card-hot' : 'sa-card-muted'}`}>
          <span className="sa-card-count">{prints.ready_to_print}</span>
          <span className="sa-card-label">מוכן להדפסה</span>
          <span className="sa-card-hint">קבצים מוכנים להדפסה</span>
        </Link>
        {units.filter((unit) => [2, 4, 6].includes(unit.stage_id) && unit.waiting > 0).map((unit) => (
          <Link key={unit.stage_id} to={`/admin/inventory?stage=${unit.stage_id}`} className="sa-card sa-card-action">
            <span className="sa-card-count">{unit.waiting}</span>
            <span className="sa-card-label">{stageLabelOf(unit.stage_id)}</span>
            <span className="sa-card-hint">כלים שממתינים לתנור</span>
          </Link>
        ))}
      </div>

      {deadlines.length > 0 && (
        <div className="sa-card sa-card-wide">
          <h2 className="sa-card-title">מועדי מסירה בקרוב</h2>
          <ul className="sa-deadlines">
            {deadlines.map((order) => (
              <li key={order.id}>
                <Link to={`/admin/orders/${order.id}`}>{order.number} · {order.customer_name}</Link>
                <span>{new Date(order.expected_delivery_date!).toLocaleDateString('he-IL')} · {orderStatusLabel[order.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sa-card sa-card-wide">
        <h2 className="sa-card-title">הזמנות אחרונות</h2>
        {orders.length === 0 ? <p className="sa-hint">עדיין אין הזמנות במערכת. בקשות מהאתר יופיעו כאן אוטומטית.</p> : (
          <ul className="sa-recent-orders">
            {orders.slice(0, 6).map((order) => (
              <li key={order.id}>
                <Link to={`/admin/orders/${order.id}`} className="sa-order-link">
                  <strong>{order.number}</strong>
                  <span>{order.customer_name}</span>
                  <span className={`sa-chip sa-chip-${order.status}`}>{orderStatusLabel[order.status]}</span>
                  {order.needs_attention && <span className="sa-chip sa-chip-attention">!</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function stageLabelOf(stageId: number): string {
  const labels: Record<number, string> = {
    1: 'הכנת חומר', 2: 'ממתינים לשריפה ראשונה', 3: 'זיגוג', 4: 'ממתינים לשריפה שנייה',
    5: 'ממתינים ליישום ציור', 6: 'ממתינים לשריפה שלישית', 7: 'בקרת איכות', 8: 'מוכן למסירה',
  }
  return labels[stageId] ?? `שלב ${stageId}`
}
