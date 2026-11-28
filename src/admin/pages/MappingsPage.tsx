import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchCatalog, type Catalog } from '../lib/catalog'
import { materialLabel, type Material } from '../lib/types'
import { uploadPrintFile } from '../lib/storage'

interface MappingVersion {
  id: string
  product_id: string
  size_label: string | null
  material: string | null
  artwork_id: string
  print_width_cm: number | null
  print_height_cm: number | null
  rotation_deg: number
  placement: string | null
  instructions: string | null
  notes: string | null
  print_file_path: string | null
  version: number
  created_at: string
}

interface PendingCombo {
  product_id: string
  size_label: string
  material: Material
  artwork_id: string
  orders: string[]
}

interface EditorState {
  productId: string
  sizeLabel: string | null
  material: Material | null
  artworkId: string
  width: string
  height: string
  rotation: string
  placement: string
  instructions: string
  notes: string
  printFile: File | null
  printFilePath: string | null
}

export default function MappingsPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [mappings, setMappings] = useState<MappingVersion[]>([])
  const [pending, setPending] = useState<PendingCombo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const [catalogData, mappingRows, pendingRows] = await Promise.all([
      fetchCatalog(),
      supabase.from('artwork_mapping_versions').select('*').is('superseded_at', null).order('created_at', { ascending: false }),
      supabase.from('order_item_allocations')
        .select('order_items(product_id, size_label, material, artwork_id, orders(number))')
        .eq('print_status', 'pending_mapping')
        .is('released_at', null),
    ])
    setCatalog(catalogData)
    setMappings(mappingRows.data ?? [])
    const combos = new Map<string, PendingCombo>()
    for (const row of pendingRows.data ?? []) {
      const item = row.order_items as unknown as {
        product_id: string; size_label: string; material: Material; artwork_id: string | null
        orders: { number: string } | null
      }
      if (!item?.artwork_id) continue
      const key = `${item.product_id}|${item.size_label}|${item.material}|${item.artwork_id}`
      const existing = combos.get(key)
      const orderNumber = item.orders?.number
      if (existing) {
        if (orderNumber && !existing.orders.includes(orderNumber)) existing.orders.push(orderNumber)
      } else {
        combos.set(key, {
          product_id: item.product_id, size_label: item.size_label, material: item.material,
          artwork_id: item.artwork_id, orders: orderNumber ? [orderNumber] : [],
        })
      }
    }
    setPending([...combos.values()])
    setLoading(false)
  }

  function openEditor(init: Partial<EditorState>) {
    if (!catalog) return
    const productId = init.productId ?? catalog.products[0]?.id ?? ''
    const sizeLabel = init.sizeLabel !== undefined ? init.sizeLabel : (catalog.sizes.find((size) => size.product_id === productId)?.label ?? null)
    const area = catalog.sizes.find((size) => size.product_id === productId && size.label === sizeLabel)
    setEditor({
      productId,
      sizeLabel,
      material: init.material ?? null,
      artworkId: init.artworkId ?? catalog.artworks[0]?.id ?? '',
      width: init.width ?? (area?.print_width_cm ? String(area.print_width_cm) : ''),
      height: init.height ?? (area?.print_height_cm ? String(area.print_height_cm) : ''),
      rotation: init.rotation ?? '0',
      placement: init.placement ?? '',
      instructions: init.instructions ?? '',
      notes: init.notes ?? '',
      printFile: null,
      printFilePath: init.printFilePath ?? null,
    })
  }

  async function saveMapping() {
    if (!editor || busy) return
    if (!editor.artworkId) { setError('יש לבחור ציור.'); return }
    if (!editor.width || !editor.height) { setError('יש למלא רוחב וגובה הדפסה.'); return }
    setBusy(true)
    setError('')
    try {
      let printFilePath = editor.printFilePath
      if (editor.printFile) {
        printFilePath = await uploadPrintFile(
          editor.printFile, editor.productId, editor.artworkId)
      }
      const { error: rpcError } = await supabase.rpc('save_mapping_version', {
        p_product_id: editor.productId,
        p_size_label: editor.sizeLabel || null,
        p_material: editor.material,
        p_artwork_id: editor.artworkId,
        p_print_width_cm: Number(editor.width) || null,
        p_print_height_cm: Number(editor.height) || null,
        p_rotation_deg: Number(editor.rotation) || 0,
        p_placement: editor.placement.trim() || null,
        p_instructions: editor.instructions.trim() || null,
        p_notes: editor.notes.trim() || null,
        p_print_file_path: printFilePath,
      })
      if (rpcError) throw new Error(rpcError.message)
      setEditor(null)
      await load()
      setNotice('ההכנה נשמרה והפריטים הממתינים עודכנו.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'השמירה נכשלה.')
    } finally {
      setBusy(false)
    }
  }

  const productName = (id: string) => catalog?.products.find((product) => product.id === id)?.name ?? id
  const artworkName = (id: string) => catalog?.artworks.find((artwork) => artwork.id === id)?.name ?? id

  if (loading && !catalog) return <p className="sa-loading">טוען…</p>

  return (
    <section>
      <div className="sa-page-head">
        <h1 className="sa-page-title">שילובי הכנה</h1>
        <button type="button" className="sa-primary" onClick={() => openEditor({})}>+ הכנה חדשה</button>
      </div>

      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      {pending.length > 0 && (
        <div className="sa-card sa-card-wide">
          <h2 className="sa-card-title">שילובים הממתינים להכנה ({pending.length})</h2>
          <p className="sa-hint">בקשות שאושרו וממתינות למיפוי מידות הדפסה — כל הכנה שתישמר תשחרר את ההמתנה לכל ההזמנות הרלוונטיות.</p>
          <ul className="sa-item-rows">
            {pending.map((combo) => (
              <li key={`${combo.product_id}${combo.size_label}${combo.material}${combo.artwork_id}`} className="sa-item-row">
                <span className="sa-combo-text">
                  <strong>{productName(combo.product_id)}</strong>
                  {combo.size_label} · {materialLabel[combo.material]} · ציור {artworkName(combo.artwork_id)}
                </span>
                {combo.orders.length > 0 && <span className="sa-chip">הזמנות: {combo.orders.join(', ')}</span>}
                <button type="button" className="sa-mini" onClick={() => openEditor({
                  productId: combo.product_id,
                  sizeLabel: combo.size_label,
                  material: combo.material,
                  artworkId: combo.artwork_id,
                })}>הכנה</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editor && (
        <div className="sa-card sa-card-wide">
          <h2 className="sa-card-title">הכנת שילוב</h2>
          <div className="sa-form-grid">
            <label>מוצר
              <select value={editor.productId} onChange={(event) => openEditor({ ...editor, productId: event.target.value, sizeLabel: undefined, width: '', height: '' })}>
                {catalog?.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label>מידה
              <select value={editor.sizeLabel ?? ''} onChange={(event) => {
                const next = event.target.value || null
                const area = catalog?.sizes.find((size) => size.product_id === editor.productId && size.label === next)
                setEditor({ ...editor, sizeLabel: next, width: area?.print_width_cm ? String(area.print_width_cm) : editor.width, height: area?.print_height_cm ? String(area.print_height_cm) : editor.height })
              }}>
                {catalog?.sizes.filter((size) => size.product_id === editor.productId).map((size) => (
                  <option key={size.label} value={size.label}>{size.label}</option>
                ))}
              </select>
            </label>
            <label>חומר
              <select value={editor.material ?? ''} onChange={(event) => setEditor({ ...editor, material: (event.target.value || null) as Material | null })}>
                <option value="">שני החומרים</option>
                <option value="smooth">{materialLabel.smooth}</option>
                <option value="speckled">{materialLabel.speckled}</option>
              </select>
            </label>
            <label>ציור
              <select value={editor.artworkId} onChange={(event) => setEditor({ ...editor, artworkId: event.target.value })}>
                {catalog?.artworks.map((artwork) => <option key={artwork.id} value={artwork.id}>{artwork.name}</option>)}
              </select>
            </label>
          </div>
          <div className="sa-form-grid">
            <label>רוחב הציור בהדפסה (ס״מ) <input type="number" step="0.1" min="0.1" value={editor.width} onChange={(event) => setEditor({ ...editor, width: event.target.value })} placeholder="למשל 12" /></label>
            <label>גובה הציור בהדפסה (ס״מ) <input type="number" step="0.1" min="0.1" value={editor.height} onChange={(event) => setEditor({ ...editor, height: event.target.value })} placeholder="למשל 8" /></label>
            <label>סיבוב (מעלות) <input type="number" step="1" value={editor.rotation} onChange={(event) => setEditor({ ...editor, rotation: event.target.value })} /></label>
          </div>
          <p className="sa-hint">גודל הציור המודפס שמתאים לכלי זה — מוצע אוטומטית לפי הכלי, וניתן לכוונן לכל ציור. (אלה אינן מידות הכלי עצמו.)</p>
          <label>מיקום על הכלי <input value={editor.placement} onChange={(event) => setEditor({ ...editor, placement: event.target.value })} placeholder="למשל: מרכז הדופן החיצונית" /></label>
          <label>הוראות הכנה <textarea rows={2} value={editor.instructions} onChange={(event) => setEditor({ ...editor, instructions: event.target.value })} placeholder="הוראות להדפסה וליישום" /></label>
          <label>הערות <input value={editor.notes} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} /></label>
          <label>קובץ מוכן להדפסה (PNG/PDF)
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              setEditor({ ...editor, printFile: file, printFilePath: file ? null : editor.printFilePath })
            }} />
          </label>
          {editor.printFilePath && !editor.printFile && <p className="sa-hint">קובץ קיים: {editor.printFilePath}</p>}
          <div className="sa-wa-actions">
            <button type="button" className="sa-primary" disabled={busy} onClick={saveMapping}>{busy ? 'שומרים…' : 'שמירת ההכנה'}</button>
            <button type="button" className="sa-secondary" onClick={() => setEditor(null)}>ביטול</button>
          </div>
        </div>
      )}

      <div className="sa-card sa-card-wide">
        <h2 className="sa-card-title">הכנות קיימות ({mappings.length})</h2>
        {mappings.length === 0 ? <p className="sa-hint">עדיין לא נשמרו הכנות. הכנות שיישמרו ישמשו אוטומטית לכל הזמנה עתידית של אותו שילוב.</p> : (
          <ul className="sa-item-rows">
            {mappings.map((mapping) => (
              <li key={mapping.id} className="sa-item-row">
                <span className="sa-combo-text">
                  <strong>{productName(mapping.product_id)}</strong>
                  {mapping.size_label ?? 'כל מידה'} · {mapping.material ? materialLabel[mapping.material as Material] : 'שני החומרים'} · ציור {artworkName(mapping.artwork_id)}
                </span>
                <span className="sa-chip">ציור בהדפסה {mapping.print_width_cm}×{mapping.print_height_cm} ס״מ{Number(mapping.rotation_deg) ? ` · ${mapping.rotation_deg}°` : ''}</span>
                <span className={`sa-chip ${mapping.print_file_path ? 'sa-chip-print-printed' : 'sa-chip-print-pending_mapping'}`}>
                  {mapping.print_file_path ? 'קובץ הדפסה צורף' : 'חסר קובץ הדפסה'}
                </span>
                <span className="sa-hint">גרסה {mapping.version} · {new Date(mapping.created_at).toLocaleDateString('he-IL')}</span>
                <button type="button" className="sa-mini" onClick={() => openEditor({
                  productId: mapping.product_id,
                  sizeLabel: mapping.size_label,
                  material: (mapping.material ?? null) as Material | null,
                  artworkId: mapping.artwork_id,
                  width: mapping.print_width_cm ? String(mapping.print_width_cm) : '',
                  height: mapping.print_height_cm ? String(mapping.print_height_cm) : '',
                  rotation: String(mapping.rotation_deg ?? 0),
                  placement: mapping.placement ?? '',
                  instructions: mapping.instructions ?? '',
                  notes: mapping.notes ?? '',
                  printFilePath: mapping.print_file_path,
                })}>עריכה (גרסה חדשה)</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
