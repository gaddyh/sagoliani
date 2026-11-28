import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { fetchCatalog, stageName, type Catalog } from '../lib/catalog'
import { materialLabel, type Material } from '../lib/types'

interface WaitingUnit {
  id: string
  product_id: string
  size_label: string
  material: Material
  stage_id: number
  notes: string | null
  import_ref: string | null
  allocated_order: string | null
}

interface BatchItemRow {
  unit_id: string
  result: string
  ceramic_units?: { product_id: string; size_label: string; material: Material } | null
}

interface BatchRow {
  id: string
  stage_id: number
  status: 'planned' | 'firing' | 'completed' | 'cancelled'
  planned_date: string | null
  started_at: string | null
  completed_at: string | null
  notes: string | null
  kiln_batch_items?: BatchItemRow[]
}

const FIRING_STAGES = [2, 4, 6]

export default function KilnPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [waiting, setWaiting] = useState<WaitingUnit[]>([])
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Map<number, Set<string>>>(new Map())
  const [completing, setCompleting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, 'ok' | 'rejected' | 'rework'>>({})

  useEffect(() => { void load() }, [])
  useAutoRefresh(load)

  async function load() {
    setLoading(true)
    const [catalogData, unitRows, batchRows, allocationRows] = await Promise.all([
      fetchCatalog(),
      supabase.from('ceramic_units')
        .select('id, product_id, size_label, material, stage_id, notes, import_ref, ceramic_products(name)')
        .in('stage_id', FIRING_STAGES)
        .eq('lifecycle', 'active')
        .neq('quality', 'attention')
        .order('created_at'),
      supabase.from('kiln_batches')
        .select('*, kiln_batch_items(*, ceramic_units(product_id, size_label, material))')
        .order('created_at', { ascending: false }),
      supabase.from('order_item_allocations')
        .select('ceramic_unit_id, order_items(orders(number))')
        .is('released_at', null),
    ])
    setCatalog(catalogData)
    const activeBatchUnits = new Set(
      (batchRows.data ?? []).filter((batch) => batch.status === 'planned' || batch.status === 'firing')
        .flatMap((batch: BatchRow) => (batch.kiln_batch_items ?? []).map((item: BatchItemRow) => item.unit_id)))
    const allocationByUnit = new Map<string, string>()
    for (const row of allocationRows.data ?? []) {
      const order = (row.order_items as unknown as { orders: { number: string } | null })?.orders
      if (order) allocationByUnit.set(row.ceramic_unit_id, order.number)
    }
    setWaiting((unitRows.data ?? []).filter((unit) => !activeBatchUnits.has(unit.id)).map((unit) => ({
      ...unit,
      allocated_order: allocationByUnit.get(unit.id) ?? null,
    })))
    setBatches(batchRows.data ?? [])
    setLoading(false)
    setReady(true)
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
      setCompleting(null)
      setResults({})
    }
    setBusy(false)
  }

  function toggleWaiting(stage: number, unitId: string) {
    setSelected((current) => {
      const next = new Map(current)
      const stageSet = new Set(next.get(stage) ?? defaultWaiting(stage))
      if (stageSet.has(unitId)) stageSet.delete(unitId)
      else stageSet.add(unitId)
      next.set(stage, stageSet)
      return next
    })
  }

  const waitingFor = (stage: number) => waiting.filter((unit) => unit.stage_id === stage)
  const defaultWaiting = (stage: number) => new Set(waitingFor(stage).map((unit) => unit.id))
  const selectedFor = (stage: number) => selected.get(stage) ?? defaultWaiting(stage)

  const productName = (productId: string) => catalog?.products.find((product) => product.id === productId)?.name ?? productId

  if (loading && !ready) return <p className="sa-loading">טוען…</p>

  const activeBatches = batches.filter((batch) => batch.status === 'planned' || batch.status === 'firing')
  const pastBatches = batches.filter((batch) => batch.status === 'completed').slice(0, 10)

  return (
    <section>
      <h1 className="sa-page-title">תנורים</h1>
      <p className="sa-hint">בחרו כלים שממתינים לשריפה, פתחו אצווה, ובסיום השריפה סמנו את התוצאה לכל פריט — התקינים מתקדמים אוטומטית לשלב הבא.</p>

      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      {FIRING_STAGES.map((stage) => {
        const units = waitingFor(stage)
        const chosen = selectedFor(stage)
        return (
          <div key={stage} className="sa-card sa-card-wide">
            <div className="sa-print-head">
              <h2 className="sa-card-title" style={{ margin: 0 }}>{catalog ? stageName(catalog, stage) : `שלב ${stage}`}</h2>
              <span className="sa-chip">{units.length} כלים ממתינים</span>
            </div>
            {units.length === 0 ? <p className="sa-hint">אין כלים שממתינים לשריפה זו.</p> : (
              <>
                <ul className="sa-unit-list">
                  {units.map((unit) => (
                    <li key={unit.id} className="sa-unit-row">
                      <input
                        type="checkbox"
                        className="sa-order-check"
                        checked={chosen.has(unit.id)}
                        onChange={() => toggleWaiting(stage, unit.id)}
                        aria-label={`בחירת ${productName(unit.product_id)}`}
                      />
                      <div className="sa-unit-info">
                        <strong>{productName(unit.product_id)}</strong>
                        <span>{unit.size_label} · {materialLabel[unit.material]}</span>
                      </div>
                      <div className="sa-unit-meta">
                        {unit.allocated_order && <span className="sa-chip sa-chip-allocated">{unit.allocated_order}</span>}
                        {unit.import_ref && <span className="sa-chip">מלאי קיים</span>}
                        {unit.notes && <span className="sa-unit-notes" title={unit.notes}>{unit.notes}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="sa-wa-actions">
                  <button
                    type="button"
                    className="sa-primary"
                    disabled={busy || chosen.size === 0}
                    onClick={() => run(() => supabase.rpc('create_kiln_batch', {
                      p_stage_id: stage,
                      p_unit_ids: [...chosen],
                      p_notes: null,
                    }), `נפתחה אצווה עם ${chosen.size} כלים.`)}
                  >יצירת אצווה ({chosen.size} כלים)</button>
                  <button type="button" className="sa-secondary" onClick={() => setSelected((current) => {
                    const next = new Map(current)
                    next.set(stage, defaultWaiting(stage))
                    return next
                  })}>בחירת הכול</button>
                </div>
              </>
            )}
          </div>
        )
      })}

      {activeBatches.length > 0 && (
        <div className="sa-card sa-card-wide">
          <h2 className="sa-card-title">אצוות פעילות</h2>
          <ul className="sa-item-rows">
            {activeBatches.map((batch) => (
              <li key={batch.id} className="sa-item-row">
                <span className="sa-combo-text">
                  <strong>{catalog ? stageName(catalog, batch.stage_id) : batch.stage_id}</strong>
                  {(batch.kiln_batch_items ?? []).length} כלים
                  {batch.started_at ? ` · בשריפה מ־${new Date(batch.started_at).toLocaleString('he-IL')}` : ' · מתוכננת'}
                </span>
                <span className="sa-unit-actions">
                  {batch.status === 'planned' && (
                    <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('start_kiln_batch', { p_batch_id: batch.id }), 'השריפה החלה.')}>התחלת שריפה</button>
                  )}
                  {batch.status === 'firing' && (
                    <button type="button" className="sa-mini" disabled={busy} onClick={() => { setCompleting(completing === batch.id ? null : batch.id); setResults({}) }}>
                      {completing === batch.id ? 'ביטול' : 'השלמת השריפה'}
                    </button>
                  )}
                  <button type="button" className="sa-mini sa-mini-danger" disabled={busy} onClick={() => run(() => supabase.rpc('cancel_kiln_batch', { p_batch_id: batch.id }), 'האצווה בוטלה.')}>ביטול האצווה</button>
                </span>
                {completing === batch.id && (
                  <div className="sa-batch-results">
                    <p className="sa-hint">סמנו תוצאה לכל כלי — ברירת המחדל "תקין" (מתקדם לשלב הבא). פסול מסמן את ההזמנה כדורשת תשומת לב; תיקון מחזיר שלב אחד אחורה.</p>
                    <ul className="sa-unit-list">
                      {(batch.kiln_batch_items ?? []).map((item) => {
                        const unit = item.ceramic_units
                        return (
                          <li key={item.unit_id} className="sa-unit-row">
                            <div className="sa-unit-info">
                              <strong>{unit ? productName(unit.product_id) : item.unit_id}</strong>
                              <span>{unit ? `${unit.size_label} · ${materialLabel[unit.material]}` : ''}</span>
                            </div>
                            <span className="sa-unit-actions">
                              {(['ok', 'rework', 'rejected'] as const).map((option) => (
                                <label key={option} className="sa-check">
                                  <input
                                    type="radio"
                                    name={`result-${batch.id}-${item.unit_id}`}
                                    checked={(results[item.unit_id] ?? 'ok') === option}
                                    onChange={() => setResults((current) => ({ ...current, [item.unit_id]: option }))}
                                  />
                                  {option === 'ok' ? 'תקין' : option === 'rework' ? 'תיקון' : 'פסול'}
                                </label>
                              ))}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    <button
                      type="button"
                      className="sa-primary"
                      disabled={busy}
                      onClick={() => {
                        const payload: Record<string, string> = {}
                        for (const item of batch.kiln_batch_items ?? []) {
                          const result = results[item.unit_id] ?? 'ok'
                          if (result !== 'ok') payload[item.unit_id] = result
                        }
                        void run(() => supabase.rpc('complete_kiln_batch', { p_batch_id: batch.id, p_results: payload }), 'האצווה הושלמה והפריטים עודכנו.')
                      }}
                    >אישור תוצאות השריפה</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pastBatches.length > 0 && (
        <div className="sa-card sa-card-wide">
          <h2 className="sa-card-title">שריפות אחרונות</h2>
          <ul className="sa-item-rows">
            {pastBatches.map((batch) => {
              const items = batch.kiln_batch_items ?? []
              const counts = { ok: 0, rejected: 0, rework: 0 }
              for (const item of items) counts[item.result as keyof typeof counts] = (counts[item.result as keyof typeof counts] ?? 0) + 1
              return (
                <li key={batch.id} className="sa-item-row">
                  <span className="sa-combo-text">
                    <strong>{catalog ? stageName(catalog, batch.stage_id) : batch.stage_id}</strong>
                    {items.length} כלים
                    {batch.completed_at ? ` · ${new Date(batch.completed_at).toLocaleDateString('he-IL')}` : ''}
                  </span>
                  <span className="sa-chip sa-chip-print-printed">תקינים: {counts.ok}</span>
                  {counts.rework > 0 && <span className="sa-chip sa-chip-print-ready_to_print">תיקון: {counts.rework}</span>}
                  {counts.rejected > 0 && <span className="sa-chip sa-chip-print-pending_mapping">פסול: {counts.rejected}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
