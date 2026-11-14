import { useEffect, useRef, useState, type FormEvent } from 'react'
import { artworks, presets, vessels, type PresetId } from '../data/catalog'
import { releaseAssets, renderCombination } from '../renderer/composite'
import { createRegionMask, draftArtwork, draftVessel, listDrafts, processDraft, removeDraft, saveDraft, type DraftAsset, type Region } from './assets'

export default function Admin() {
  const [kind, setKind] = useState<DraftAsset['kind']>('artwork')
  const [drafts, setDrafts] = useState<DraftAsset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testId, setTestId] = useState('turquoise')
  const [preset, setPreset] = useState<PresetId>('center')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [renderError, setRenderError] = useState('')
  const [editingRegion, setEditingRegion] = useState<Region | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const selected = drafts.find((draft) => draft.id === selectedId)

  useEffect(() => { listDrafts().then(setDrafts).catch((error: Error) => setMessage(error.message)) }, [])
  useEffect(() => { setEditingRegion(selected?.region ? { ...selected.region } : null) }, [selectedId])

  useEffect(() => {
    if (!selected || !canvasRef.current) return
    const image = URL.createObjectURL(selected.image)
    const mask = selected.mask ? URL.createObjectURL(selected.mask) : null
    let current = true
    const vessel = selected.kind === 'vessel' && mask ? draftVessel(selected, image, mask) : vessels.find((item) => item.id === testId)!
    const artwork = selected.kind === 'artwork' ? draftArtwork(selected, image) : artworks[0]
    renderCombination(canvasRef.current, { vessel, artwork, preset }, () => current)
      .then(() => { if (current) setRenderError('') })
      .catch(() => { if (current) setRenderError('לא הצלחנו ליצור הדמיה מהקבצים האלה.') })
    return () => { current = false; releaseAssets(image, ...(mask ? [mask] : [])); URL.revokeObjectURL(image); if (mask) URL.revokeObjectURL(mask) }
  }, [selected, testId, preset])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('image')
    const mask = data.get('mask')
    if (!(file instanceof File) || !file.size) { setMessage('יש לבחור תמונה להעלאה.'); return }
    setBusy(true)
    setMessage('')
    try {
      const draft = await processDraft(kind, String(data.get('name') ?? ''), String(data.get('detail') ?? ''), file, mask instanceof File && mask.size ? mask : undefined, data.get('material') === 'dark' ? 'dark' : 'light')
      await saveDraft(draft)
      setDrafts((previous) => [draft, ...previous])
      setSelectedId(draft.id)
      form.reset()
      setMessage('הטיוטה נשמרה בדפדפן. בדקו את ההדמיה לפני שימוש נוסף.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'עיבוד התמונה נכשל.') }
    finally { setBusy(false) }
  }

  async function saveRegion() {
    if (!selected || !editingRegion) return
    setBusy(true)
    try {
      const draft = { ...selected, region: editingRegion, mask: await createRegionMask(editingRegion), note: 'אזור הקישוט הותאם ידנית, אך הוא עדיין מסכת ניסיון ללא כיול פיזי או אישור איכות.' }
      await saveDraft(draft)
      setDrafts((previous) => previous.map((item) => item.id === draft.id ? draft : item))
      setMessage('אזור הקישוט עודכן ונשמר בטיוטה. בדקו את ההדמיה מחדש.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'שמירת האזור נכשלה.') }
    finally { setBusy(false) }
  }

  async function discard() {
    if (!selected || !window.confirm(`למחוק את הטיוטה ״${selected.name}״ מהדפדפן הזה?`)) return
    try {
      await removeDraft(selected.id)
      setDrafts((previous) => previous.filter((draft) => draft.id !== selected.id))
      setSelectedId(null)
      setMessage('הטיוטה נמחקה.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'מחיקת הטיוטה נכשלה.') }
  }

  return (
    <div className="site-shell admin-shell">
      <header className="site-header"><div className="header-inner"><div className="brand"><span className="brand-name" dir="ltr">ART IN CLAY</span><span className="brand-rule" /><span className="brand-caption">סביבת הכנת נכסים</span></div><a className="admin-back" href="/">חזרה לסטודיו ←</a></div></header>
      <main className="page-content admin-page">
        <p className="small-label" dir="ltr">ASSET WORKSPACE / 01</p>
        <h1>מכינים מקום <em>ליצירה.</em></h1>
        <p className="intro-copy">העלאת צילום כלי או איור, הכנת נגזרות שקופות ומסכת ניסיון, ובדיקת הדמיה לפני שימוש נוסף.</p>
        <div className="admin-notice" role="note"><strong>סביבת פיתוח מקומית בלבד.</strong> הקבצים נשמרים בטיוטות בדפדפן הזה, אינם עולים לשרת ואינם מופיעים בקטלוג. אין כאן אימות משתמשים, פרסום או אישור איכות לייצור.</div>
        <div className="admin-layout">
          <section className="admin-card" aria-labelledby="upload-title">
            <span className="step-number">01</span><h2 id="upload-title">נכס חדש</h2>
            <div className="admin-tabs" role="group" aria-label="סוג הנכס">
              <button type="button" aria-pressed={kind === 'artwork'} className={kind === 'artwork' ? 'active' : ''} onClick={() => { setKind('artwork'); setMessage('') }}>איור</button>
              <button type="button" aria-pressed={kind === 'vessel'} className={kind === 'vessel' ? 'active' : ''} onClick={() => { setKind('vessel'); setMessage('') }}>כלי קרמיקה</button>
            </div>
            <form onSubmit={upload} className="admin-form" key={kind}>
              <label>שם <input name="name" required maxLength={80} placeholder={kind === 'artwork' ? 'למשל פרחי בר' : 'למשל קערת שמנת'} /></label>
              <label>תיאור קצר <input name="detail" maxLength={160} placeholder="צבע, גימור או אופי היצירה" /></label>
              {kind === 'vessel' && <label>גוון הגלזורה <select name="material"><option value="light">בהיר</option><option value="dark">כהה — דורש בדיקת איכות</option></select></label>}
              <label>{kind === 'vessel' ? 'צילום כלי ריק · כל יחס תמונה' : 'איור שקוף או צילום על נייר בהיר'} <input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" required /></label>
              {kind === 'vessel' && <label>מסכת אזור קישוט · רשות, לבן על שחור ובממדי הצילום <input name="mask" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" /></label>}
              <p className="admin-hint">PNG, JPEG, WebP, GIF או BMP עד 10MB לקובץ. צילומים מותאמים ל־3:4 בלי מתיחה. לאיור ללא שקיפות ננסה להסיר רקע בהיר ואחיד; לכלי ללא מסכה נכין אזור ניסיון שאפשר לכוונן. לא כל רקע או כלי ניתן לעיבוד אמין אוטומטית.</p>
              <button type="submit" className="admin-primary" disabled={busy}>{busy ? 'מעבדים ושומרים…' : 'עיבוד ושמירה כטיוטה'}</button>
              {message && <p role="status" className="admin-message">{message}</p>}
            </form>
          </section>
          <section className="admin-card" aria-labelledby="drafts-title">
            <span className="step-number">02</span><h2 id="drafts-title">טיוטות לבדיקה</h2>
            {drafts.length === 0 ? <p className="admin-empty">עדיין אין טיוטות בדפדפן הזה. העלו נכס כדי לראות אותו בהדמיה.</p> : <div className="admin-drafts">{[...drafts].sort((a, b) => b.createdAt - a.createdAt).map((draft) => <button type="button" className={selectedId === draft.id ? 'admin-draft selected' : 'admin-draft'} key={draft.id} onClick={() => setSelectedId(draft.id)} aria-pressed={selectedId === draft.id}><strong>{draft.name}</strong><small>{draft.kind === 'vessel' ? 'כלי + מסכה' : 'איור שקוף'} · טיוטה מקומית</small></button>)}</div>}
            {selected && <div className="admin-review">
              <h3>בדיקת הדמיה: {selected.name}</h3>
              <p>מיקומים אלה הם ערכי ניסיון בלבד; אין פרסום או כיול מידות פיזיות.</p>
              {selected.note && <p className="admin-warning" role="note">{selected.note}</p>}
              {selected.kind === 'artwork' && <label>כלי להשוואה <select value={testId} onChange={(event) => setTestId(event.target.value)}>{vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>}
              <label>מיקום לבדיקה <select value={preset} onChange={(event) => setPreset(event.target.value as PresetId)}>{presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {editingRegion && <div className="admin-region-controls"><strong>אזור קישוט משוער — התאימו לכלי בתמונה</strong>{([['x', 'מרכז אופקי'], ['y', 'מרכז אנכי'], ['rx', 'רוחב'], ['ry', 'גובה']] as const).map(([field, label]) => <label key={field}>{label}<input type="range" min={field === 'x' || field === 'y' ? .1 : .05} max={field === 'x' || field === 'y' ? .9 : .4} step=".01" value={editingRegion[field]} onChange={(event) => setEditingRegion((previous) => previous ? { ...previous, [field]: Number(event.target.value) } : null)} /></label>)}<button type="button" className="admin-primary" disabled={busy} onClick={saveRegion}>שמירת אזור קישוט</button></div>}
              <div className="admin-canvas-wrap"><canvas ref={canvasRef} role="img" aria-label={`הדמיית ניסיון של ${selected.name}`} />{editingRegion && <span className="admin-region-overlay" aria-hidden="true" style={{ left: `${(editingRegion.x - editingRegion.rx) * 100}%`, top: `${(editingRegion.y - editingRegion.ry) * 100}%`, width: `${editingRegion.rx * 200}%`, height: `${editingRegion.ry * 200}%` }} />}</div>
              {renderError && <p role="alert">{renderError}</p>}
              <button type="button" className="admin-delete" onClick={discard}>מחיקת טיוטה</button>
            </div>}
          </section>
        </div>
      </main>
    </div>
  )
}
