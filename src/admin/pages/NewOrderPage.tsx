import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchCatalog, sizesOf, type Catalog } from '../lib/catalog'
import { parseWhatsAppOrder } from '../lib/parse'
import { deliveryTypeLabel, materialLabel, type DeliveryType } from '../lib/types'

interface DraftItem {
  variant_id: string
  size_label: string
  quantity: number
  artwork_id: string
}

export default function NewOrderPage() {
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [paste, setPaste] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const [duplicate, setDuplicate] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [number, setNumber] = useState('')
  const [delivery, setDelivery] = useState<DeliveryType>('binyamina')
  const [city, setCity] = useState('')
  const [street, setStreet] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void fetchCatalog().then(setCatalog) }, [])

  const variantsById = useMemo(() => new Map((catalog?.variants ?? []).map((variant) => [variant.id, variant])), [catalog])

  function resolveSizeLabel(variantId: string, sizeLabel: string | null): string {
    if (!catalog) return ''
    const variant = variantsById.get(variantId)
    if (!variant) return ''
    const sizes = sizesOf(catalog, variant.product_id)
    if (sizeLabel && sizes.some((size) => size.label === sizeLabel)) return sizeLabel
    return sizes[0]?.label ?? ''
  }

  async function applyPaste() {
    const parsed = parseWhatsAppOrder(paste)
    setProblems(parsed.problems)
    setDuplicate(null)
    setName(parsed.name)
    setPhone(parsed.phone)
    setDelivery(parsed.deliveryType)
    setCity(parsed.city)
    setStreet(parsed.street)
    setCustomerNotes(parsed.notes)
    setNumber(parsed.number ?? '')
    const resolved: DraftItem[] = []
    for (const item of parsed.items) {
      const variant = variantsById.get(item.variantId)
      if (!variant) { setProblems((current) => [...current, `פריט לא מוכר בקטלוג: ${item.variantId}`]); continue }
      resolved.push({
        variant_id: item.variantId,
        size_label: resolveSizeLabel(item.variantId, item.sizeLabel),
        quantity: item.quantity,
        artwork_id: item.customArtworkId ?? '',
      })
    }
    setItems(resolved)
    if (parsed.number) {
      const { data } = await supabase.from('orders').select('id, number').eq('number', parsed.number).maybeSingle()
      if (data) setDuplicate(data.number)
    }
  }

  function addEmptyItem() {
    const variant = catalog?.variants[0]
    if (!variant) return
    setItems((current) => [...current, {
      variant_id: variant.id,
      size_label: resolveSizeLabel(variant.id, null),
      quantity: 1,
      artwork_id: '',
    }])
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!name.trim()) { setError('יש למלא שם לקוח.'); return }
    if (!items.length) { setError('יש להוסיף לפחות פריט אחד.'); return }
    setBusy(true)
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      ...(number.trim() ? { number: number.trim() } : {}),
      source: 'whatsapp',
      delivery_type: delivery,
      ...(delivery === 'delivery' ? { city: city.trim(), street: street.trim() } : {}),
      ...(customerNotes.trim() ? { customer_notes: customerNotes.trim() } : {}),
      ...(internalNotes.trim() ? { internal_notes: internalNotes.trim() } : {}),
      ...(expectedDate ? { expected_delivery_date: expectedDate } : {}),
      items: items.map((item) => ({
        variant_id: item.variant_id,
        size_label: item.size_label,
        quantity: item.quantity,
        ...(item.artwork_id ? { artwork_id: item.artwork_id } : {}),
      })),
    }
    const { data, error: rpcError } = await supabase.rpc('create_order', { p_payload: payload })
    if (rpcError) {
      setError(rpcError.message)
      setBusy(false)
      return
    }
    const result = data as { order_id: string }
    navigate(`/admin/orders/${result.order_id}`)
  }

  if (!catalog) return <p className="sa-loading">טוען…</p>

  return (
    <section>
      <h1 className="sa-page-title">הזמנה חדשה</h1>

      <div className="sa-card">
        <h2 className="sa-card-title">הדבקת הודעת וואטסאפ</h2>
        <p className="sa-hint">הדביקו את ההודעה שהתקבלה מהלקוח — הפרטים ימולאו אוטומטית בטופס.</p>
        <textarea
          className="sa-paste"
          rows={6}
          dir="rtl"
          placeholder={'שלום, אשמח לבדוק הזמנה מ-ART IN CLAY.\nשם: …\nטלפון: …'}
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
        />
        <button type="button" className="sa-secondary" onClick={applyPaste} disabled={!paste.trim()}>פענוח ההודעה</button>
        {duplicate && <p className="sa-error" role="alert">קיימת כבר הזמנה {duplicate} עם אותו מספר — בדקו אם מדובר בכפילות לפני שמירה.</p>}
        {problems.length > 0 && (
          <div className="sa-warn" role="note">
            <strong>שורות שלא זוהו:</strong>
            <ul>{problems.map((problem, index) => <li key={index}>{problem}</li>)}</ul>
          </div>
        )}
      </div>

      <form className="sa-card sa-form" onSubmit={submit}>
        <div className="sa-form-grid">
          <label>שם <input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>טלפון <input value={phone} onChange={(event) => setPhone(event.target.value)} dir="ltr" /></label>
          <label>מספר הזמנה מקורי (רשות) <input value={number} onChange={(event) => setNumber(event.target.value)} dir="ltr" /></label>
          <label>מועד מסירה צפוי <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label>
        </div>
        <label>אופן קבלה
          <select value={delivery} onChange={(event) => setDelivery(event.target.value as DeliveryType)}>
            {(Object.keys(deliveryTypeLabel) as DeliveryType[]).map((option) => (
              <option key={option} value={option}>{deliveryTypeLabel[option]}</option>
            ))}
          </select>
        </label>
        {delivery === 'delivery' && <div className="sa-form-grid">
          <label>עיר <input value={city} onChange={(event) => setCity(event.target.value)} /></label>
          <label>רחוב <input value={street} onChange={(event) => setStreet(event.target.value)} /></label>
        </div>}
        <label>הערות לקוח <textarea rows={3} value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} /></label>
        <label>הערות פנימיות <textarea rows={2} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></label>

        <h2 className="sa-card-title">פריטים</h2>
        {items.length === 0 && <p className="sa-hint">לא נוספו פריטים.</p>}
        <ul className="sa-item-rows">
          {items.map((item, index) => {
            const variant = variantsById.get(item.variant_id)
            const sizes = variant ? sizesOf(catalog, variant.product_id) : []
            return (
              <li key={index} className="sa-item-row">
                <select
                  aria-label="שילוב כלי"
                  value={item.variant_id}
                  onChange={(event) => updateItem(index, { variant_id: event.target.value, size_label: resolveSizeLabel(event.target.value, null) })}
                >
                  {catalog.variants.map((option) => {
                    const product = catalog.products.find((entry) => entry.id === option.product_id)
                    return <option key={option.id} value={option.id}>
                      {product?.name} · {materialLabel[option.material]} · {option.display_name}
                    </option>
                  })}
                </select>
                {sizes.length > 1 && (
                  <select aria-label="מידה" value={item.size_label} onChange={(event) => updateItem(index, { size_label: event.target.value })}>
                    {sizes.map((size) => <option key={size.label} value={size.label}>{size.label} · {size.price_ils} ₪</option>)}
                  </select>
                )}
                <input
                  className="sa-qty"
                  type="number" min={1} max={99} aria-label="כמות"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: Number(event.target.value) || 1 })}
                />
                <select
                  aria-label="ציור"
                  value={item.artwork_id}
                  onChange={(event) => updateItem(index, { artwork_id: event.target.value })}
                >
                  <option value="">כמו בתמונה / לבחירה באישור</option>
                  {catalog.artworks.map((artwork) => <option key={artwork.id} value={artwork.id}>{artwork.name}</option>)}
                </select>
                <button type="button" className="sa-remove" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>הסרה</button>
              </li>
            )
          })}
        </ul>
        <button type="button" className="sa-secondary" onClick={addEmptyItem}>+ הוספת פריט</button>

        {error && <p className="sa-error" role="alert">{error}</p>}
        <button type="submit" className="sa-primary" disabled={busy}>{busy ? 'שומרים…' : 'שמירת ההזמנה'}</button>
      </form>
    </section>
  )
}
