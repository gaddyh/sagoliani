import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveArtworkUrl, uploadArtworkFiles } from '../lib/storage'
import type { ArtworkRow } from '../lib/types'

interface ArtworkView extends ArtworkRow { resolvedPreview: string | null }

export default function ArtworksPage() {
  const [artworks, setArtworks] = useState<ArtworkView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('artworks').select('*').order('name')
    const rows: ArtworkView[] = []
    for (const artwork of data ?? []) {
      rows.push({ ...artwork, resolvedPreview: await resolveArtworkUrl(artwork.preview_path) })
    }
    setArtworks(rows)
    setLoading(false)
  }

  return (
    <section>
      <div className="sa-page-head">
        <h1 className="sa-page-title">ספריית היצירות</h1>
        <button type="button" className="sa-primary" onClick={() => setShowAdd((open) => !open)}>
          {showAdd ? 'סגירת הטופס' : '+ הוספת יצירה'}
        </button>
      </div>
      <p className="sa-hint">הקבצים המקוריים נשמרים באופן פרטי ואינם חשופים לאתר. מוצגת תצוגה מקדימה בלבד.</p>

      {error && <p className="sa-error" role="alert">{error}</p>}
      {notice && <p className="sa-notice" role="status">{notice}</p>}

      {showAdd && (
        <AddArtworkForm
          onDone={async (message) => { await load(); setNotice(message); setShowAdd(false) }}
          onError={setError}
        />
      )}

      {loading ? <p className="sa-loading">טוען…</p> : (
        <ul className="sa-artwork-grid">
          {artworks.map((artwork) => (
            <li key={artwork.id} className={`sa-artwork-card ${artwork.is_active ? '' : 'sa-card-muted'}`}>
              {editing === artwork.id ? (
                <EditArtworkForm
                  artwork={artwork}
                  onCancel={() => setEditing(null)}
                  onDone={async (message) => { await load(); setNotice(message); setEditing(null) }}
                  onError={setError}
                />
              ) : (
                <>
                  {artwork.resolvedPreview
                    ? <img className="sa-artwork-preview" src={artwork.resolvedPreview} alt={artwork.name} loading="lazy" />
                    : <div className="sa-artwork-preview sa-artwork-empty">אין תצוגה מקדימה</div>}
                  <div className="sa-artwork-info">
                    <strong>{artwork.name}</strong>
                    <span className="sa-hint">{artwork.artist ?? ''}</span>
                    <div className="sa-artwork-chips">
                      {!artwork.is_active && <span className="sa-chip">לא פעיל</span>}
                      {!artwork.show_in_gallery && <span className="sa-chip">לא בגלריה</span>}
                      {artwork.original_path && <span className="sa-chip sa-chip-artwork">קובץ מקורי שמור</span>}
                    </div>
                    {artwork.notes && <span className="sa-unit-notes">{artwork.notes}</span>}
                  </div>
                  <button type="button" className="sa-mini" onClick={() => setEditing(artwork.id)}>עריכה</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddArtworkForm({ onDone, onError }: { onDone: (message: string) => void; onError: (message: string) => void }) {
  const [name, setName] = useState('')
  const [artist, setArtist] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (busy || !name.trim()) { onError('יש למלא שם ליצירה.'); return }
    if (!file) { onError('יש לבחור קובץ תמונה.'); return }
    setBusy(true)
    try {
      const id = crypto.randomUUID()
      const { originalPath, previewPath } = await uploadArtworkFiles(file, id)
      const { error: insertError } = await supabase.from('artworks').insert({
        id, name: name.trim(), artist: artist.trim() || null,
        preview_path: previewPath, original_path: originalPath,
        is_active: true, show_in_gallery: false,
      })
      if (insertError) throw new Error(insertError.message)
      onDone(`היצירה ״${name.trim()}״ נשמרה.`)
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : 'השמירה נכשלה.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sa-card sa-card-wide">
      <h2 className="sa-card-title">יצירה חדשה</h2>
      <div className="sa-form-grid">
        <label>שם היצירה <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="למשל: שלל שרב" /></label>
        <label>אמנית (רשות)
          <select value={artist} onChange={(event) => setArtist(event.target.value)}>
            <option value="">—</option>
            <option value="עירית סגול">עירית סגול</option>
            <option value="אפרת ליאני">אפרת ליאני</option>
          </select>
        </label>
      </div>
      <label>קובץ מקורי (PNG / JPG / WebP) <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <p className="sa-hint">הקובץ המקורי נשמר באופן פרטי; תצוגה מקדימה נוצרת אוטומטית לשימוש הסטודיו.</p>
      <button type="button" className="sa-primary" disabled={busy} onClick={submit}>{busy ? 'שומרים…' : 'שמירת היצירה'}</button>
    </div>
  )
}

function EditArtworkForm({ artwork, onCancel, onDone, onError }: {
  artwork: ArtworkView
  onCancel: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [name, setName] = useState(artwork.name)
  const [description, setDescription] = useState(artwork.description ?? '')
  const [notes, setNotes] = useState(artwork.notes ?? '')
  const [sourceUrl, setSourceUrl] = useState(artwork.source_url ?? '')
  const [showInGallery, setShowInGallery] = useState(artwork.show_in_gallery)
  const [isActive, setIsActive] = useState(artwork.is_active)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy || !name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('artworks').update({
      name: name.trim(), description: description.trim() || null, notes: notes.trim() || null,
      show_in_gallery: showInGallery, is_active: isActive,
      source_url: sourceUrl.trim() || null,
    }).eq('id', artwork.id)
    if (error) onError(error.message)
    else onDone('היצירה עודכנה.')
    setBusy(false)
  }

  return (
    <div className="sa-form">
      <label>שם <input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>תיאור <input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label>קישור לקובץ מקורי (Google Drive / כל כתובת) <input type="url" dir="ltr" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://drive.google.com/..." /></label>
      <label>הערות פנימיות <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <label className="sa-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> יצירה פעילה</label>
      <label className="sa-check"><input type="checkbox" checked={showInGallery} onChange={(event) => setShowInGallery(event.target.checked)} /> תוצג בגלריית האתר (כשהקטלוג ינוהל מהמערכת)</label>
      <div className="sa-wa-actions">
        <button type="button" className="sa-primary" disabled={busy || !name.trim()} onClick={save}>שמירה</button>
        <button type="button" className="sa-secondary" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  )
}
