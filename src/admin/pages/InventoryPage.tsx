import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { fetchCatalog, stageName, type Catalog } from '../lib/catalog'
import {
  lifecycleLabel, materialLabel, qualityLabel, type Material, type UnitLifecycle, type UnitRow,
} from '../lib/types'

interface AllocationBadge { orderId: string; orderNumber: string }

export default function InventoryPage() {
  const [searchParams] = useSearchParams()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [allocations, setAllocations] = useState<Map<string, AllocationBadge>>(new Map())
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [filterProduct, setFilterProduct] = useState('')
  const [filterStage, setFilterStage] = useState(searchParams.get('stage') ?? '')
  const [filterLifecycle, setFilterLifecycle] = useState<UnitLifecycle>('active')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { void load() }, [])
  useAutoRefresh(load)

  async function load() {
    setLoading(true)
    const [catalogData, unitRows, allocationRows] = await Promise.all([
      fetchCatalog(),
      supabase.from('ceramic_units').select('*').order('created_at', { ascending: false }),
      supabase.from('order_item_allocations')
        .select('ceramic_unit_id, order_items(orders(id, number))')
        .is('released_at', null),
    ])
    setCatalog(catalogData)
    setUnits(unitRows.data ?? [])
    const map = new Map<string, AllocationBadge>()
    for (const row of allocationRows.data ?? []) {
      const order = (row.order_items as unknown as { orders: { id: string; number: string } | null })?.orders
      if (order) map.set(row.ceramic_unit_id, { orderId: order.id, orderNumber: order.number })
    }
    setAllocations(map)
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
      setNotice(successNotice)
      await load()
    }
    setBusy(false)
  }

  const filtered = useMemo(() => units.filter((unit) =>
    (!filterProduct || unit.product_id === filterProduct)
    && (!filterStage || String(unit.stage_id) === filterStage)
    && unit.lifecycle === filterLifecycle,
  ), [units, filterProduct, filterStage, filterLifecycle])

  const stageCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const unit of units) {
      if (unit.lifecycle !== 'active' || unit.quality === 'attention') continue
      counts.set(unit.stage_id, (counts.get(unit.stage_id) ?? 0) + 1)
    }
    return counts
  }, [units])

  if (loading && !catalog) return <p className="sa-loading">טוען…</p>

  return (
    <section>
      <div className="sa-page-head">
        <h1 className="sa-page-title">מלאי קרמיקה</h1>
        <button type="button" className="sa-primary" onClick={() => setShowCreate((open) => !open)}>
          {showCreate ? 'סגירת הטופס' : '+ הוספת יחידות'}
        </button>
      </div>

      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      <div className="sa-card-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((stage) => (
          <button
            type="button"
            key={stage}
            className={`sa-card sa-card-action ${filterStage === String(stage) ? 'sa-card-hot' : stageCounts.get(stage) ? '' : 'sa-card-muted'}`}
            onClick={() => setFilterStage(filterStage === String(stage) ? '' : String(stage))}
          >
            <span className="sa-card-count">{stageCounts.get(stage) ?? 0}</span>
            <span className="sa-card-label">{catalog ? stageName(catalog, stage) : stage}</span>
          </button>
        ))}
      </div>

      {showCreate && catalog && <BulkCreateForm catalog={catalog} onDone={async (message) => { await load(); setNotice(message) }} onError={setError} />}

      <div className="sa-card sa-card-wide">
        <div className="sa-filters">
          <select aria-label="מוצר" value={filterProduct} onChange={(event) => setFilterProduct(event.target.value)}>
            <option value="">כל המוצרים</option>
            {catalog?.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <select aria-label="שלב" value={filterStage} onChange={(event) => setFilterStage(event.target.value)}>
            <option value="">כל השלבים</option>
            {catalog?.stages.map((stage) => <option key={stage.id} value={String(stage.id)}>{stage.name_he}</option>)}
          </select>
          <div className="sa-tabs" role="group" aria-label="מצב יחידה">
            {(['active', 'scrapped', 'delivered'] as UnitLifecycle[]).map((option) => (
              <button key={option} type="button" className={filterLifecycle === option ? 'active' : ''} onClick={() => setFilterLifecycle(option)}>
                {lifecycleLabel[option]}
              </button>
            ))}
          </div>
        </div>

        {(loading && !ready) ? <p className="sa-loading">טוען…</p> : filtered.length === 0 ? <p className="sa-hint">אין יחידות מתאימות.</p> : (
          <ul className="sa-unit-list">
            {filtered.map((unit) => {
              const product = catalog?.products.find((entry) => entry.id === unit.product_id)
              const allocation = allocations.get(unit.id)
              return (
                <li key={unit.id} className={`sa-unit-row ${unit.lifecycle === 'scrapped' ? 'sa-unit-scrapped' : ''}`}>
                  <img
                    className="sa-unit-thumb"
                    src={product ? productThumb(catalog!, unit.product_id) : ''}
                    alt=""
                    loading="lazy"
                  />
                  <div className="sa-unit-info">
                    <strong>{product?.name ?? unit.product_id}</strong>
                    <span>{unit.size_label} · {materialLabel[unit.material]}</span>
                    <span className="sa-unit-stage">{catalog ? stageName(catalog, unit.stage_id) : unit.stage_id}</span>
                  </div>
                  <div className="sa-unit-meta">
                    <span className={`sa-chip sa-chip-quality-${unit.quality}`}>{qualityLabel[unit.quality]}</span>
                    {unit.lifecycle !== 'active' && <span className="sa-chip">{lifecycleLabel[unit.lifecycle]}</span>}
                    {allocation && <Link className="sa-chip sa-chip-allocated" to={`/admin/orders/${allocation.orderId}`}>מוקצה ל{allocation.orderNumber}</Link>}
                    {unit.notes && <span className="sa-unit-notes" title={unit.notes}>{unit.notes}</span>}
                  </div>
                  {unit.lifecycle === 'active' && (
                    <span className="sa-unit-actions">
                      {unit.stage_id < 8 && unit.stage_id !== 5 && (
                        <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('advance_units_stage', { p_unit_ids: [unit.id], p_result: 'completed' }), 'השלב הושלם.')}>השלמת שלב</button>
                      )}
                      {unit.stage_id === 5 && <span className="sa-chip">ממתין ליישום ציור</span>}
                      {unit.quality === 'attention' && (
                        <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('advance_units_stage', { p_unit_ids: [unit.id], p_result: 'completed' }), 'סומן כתקין — המשך התהליך.')}>טופל — המשך</button>
                      )}
                      {unit.stage_id > 1 && unit.stage_id < 8 && (
                        <button type="button" className="sa-mini" disabled={busy} onClick={() => run(() => supabase.rpc('advance_units_stage', { p_unit_ids: [unit.id], p_result: 'rework' }), 'הוחזר שלב אחורה לתיקון.')}>החזרה לתיקון</button>
                      )}
                      <button type="button" className="sa-mini sa-mini-danger" disabled={busy} onClick={() => run(() => supabase.rpc('reject_unit', { p_unit_id: unit.id, p_notes: null }), 'היחידה סומנה כפסולה.')}>פסילה</button>
                      <button type="button" className="sa-mini" disabled={busy} onClick={() => {
                        const next = window.prompt('הערות על היחידה:', unit.notes ?? '') ?? unit.notes
                        if (next !== unit.notes) void run(() => supabase.rpc('set_unit_notes', { p_unit_id: unit.id, p_notes: next }), 'ההערות עודכנו.')
                      }}>הערות</button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function productThumb(catalog: Catalog, productId: string): string {
  const variant = catalog.variants.find((entry) => entry.product_id === productId)
  return variant?.images?.[0] ?? '/assets/hero.webp'
}

function BulkCreateForm({ catalog, onDone, onError }: {
  catalog: Catalog
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [productId, setProductId] = useState(catalog.products[0]?.id ?? '')
  const [sizeLabel, setSizeLabel] = useState(catalog.sizes.find((size) => size.product_id === catalog.products[0]?.id)?.label ?? '')
  const [material, setMaterial] = useState<Material>('smooth')
  const [quantity, setQuantity] = useState(5)
  const [stage, setStage] = useState(1)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const sizes = catalog.sizes.filter((size) => size.product_id === productId)

  useEffect(() => {
    const nextSizes = catalog.sizes.filter((size) => size.product_id === productId)
    if (!nextSizes.some((size) => size.label === sizeLabel)) setSizeLabel(nextSizes[0]?.label ?? '')
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (busy || !productId || !sizeLabel) return
    setBusy(true)
    const { error } = await supabase.rpc('create_units', {
      p_product_id: productId, p_size_label: sizeLabel, p_material: material,
      p_quantity: quantity, p_stage_id: stage, p_notes: notes.trim() || null,
    })
    if (error) onError(error.message)
    else {
      onDone(`${quantity} יחידות נוספו למלאי.`)
      setQuantity(5)
      setNotes('')
    }
    setBusy(false)
  }

  return (
    <div className="sa-card sa-card-wide">
      <h2 className="sa-card-title">הוספת יחידות זהות למלאי</h2>
      <div className="sa-form-grid">
        <label>מוצר
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            {catalog.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        {sizes.length > 1 && (
          <label>מידה
            <select value={sizeLabel} onChange={(event) => setSizeLabel(event.target.value)}>
              {sizes.map((size) => <option key={size.label} value={size.label}>{size.label}</option>)}
            </select>
          </label>
        )}
        <label>חומר
          <select value={material} onChange={(event) => setMaterial(event.target.value as Material)}>
            <option value="smooth">{materialLabel.smooth}</option>
            <option value="speckled">{materialLabel.speckled}</option>
          </select>
        </label>
        <label>כמות
          <input className="sa-qty" type="number" min={1} max={50} value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} />
        </label>
        <label>שלב התחלתי
          <select value={stage} onChange={(event) => setStage(Number(event.target.value))}>
            {catalog.stages.filter((entry) => entry.id <= 5).map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name_he}</option>
            ))}
          </select>
        </label>
      </div>
      <label>הערות (רשות) <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="למשל: נוצרו היום בסטודיו" /></label>
      <button type="button" className="sa-primary" disabled={busy || !sizeLabel} onClick={submit}>
        {busy ? 'מוסיף…' : `הוספת ${quantity} יחידות`}
      </button>
    </div>
  )
}
