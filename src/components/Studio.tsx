import { useEffect, useMemo, useRef, useState } from 'react'
import { artworks, presets, vessels, type ArtworkId, type Placement, type PresetId, type VesselId } from '../data/catalog'
import { configurationKey, preloadAssets, renderCombination } from '../renderer/composite'

type Collection = 'original' | 'external'

const originalVessels = vessels.filter((item) => !item.external)
const externalVessels = vessels.filter((item) => item.external)
const originalArtworks = artworks.filter((item) => !item.external)
const externalArtworks = artworks.filter((item) => item.external)
const MIN_SIZE = 60
const MAX_SIZE = 150
const MAX_ROTATION = 90

function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
  const number = Number(value)
  return value !== null && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function rotationLabel(degrees: number): string {
  if (!degrees) return 'ישר'
  return `\u2066${Math.abs(degrees)}°\u2069 ${degrees < 0 ? 'שמאלה' : 'ימינה'}`
}

function parsePlacementParam(value: string | null): Placement | null {
  if (!value) return null
  const [x, y] = value.split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, width: 0 }
}

export default function Studio() {
  const [collection, setCollection] = useState<Collection>(() => new URLSearchParams(location.search).get('collection') === 'external' ? 'external' : 'original')
  const [vesselId, setVesselId] = useState<VesselId>(() => vessels.find((item) => item.id === new URLSearchParams(location.search).get('vessel'))?.id ?? 'turquoise')
  const [artworkId, setArtworkId] = useState<ArtworkId>(() => artworks.find((item) => item.id === new URLSearchParams(location.search).get('artwork'))?.id ?? 'meadow')
  const [presetId, setPresetId] = useState<PresetId>(() => presets.find((item) => item.id === new URLSearchParams(location.search).get('preset'))?.id ?? 'center')
  const [customPos, setCustomPos] = useState<Placement | null>(() => {
    const parsed = parsePlacementParam(new URLSearchParams(location.search).get('pos'))
    return parsed ? { ...parsed, width: 0 } : null
  })
  const [size, setSize] = useState(() => parseNumber(new URLSearchParams(location.search).get('size'), 100, MIN_SIZE, MAX_SIZE))
  const [rotation, setRotation] = useState(() => Math.round(parseNumber(new URLSearchParams(location.search).get('rot'), 0, -MAX_ROTATION, MAX_ROTATION)))
  const [empty, setEmpty] = useState(false)
  const [renderState, setRenderState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [dragging, setDragging] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origin: Placement } | null>(null)
  const vessel = vessels.find((item) => item.id === vesselId)!
  const artwork = artworks.find((item) => item.id === artworkId)!
  const preset = presets.find((item) => item.id === presetId)!
  const activeVessels = collection === 'original' ? originalVessels : externalVessels
  const activeArtworks = collection === 'original' ? originalArtworks : externalArtworks
  const basePlacement = vessel.placements[presetId]
  const customPlacement = useMemo<Placement | null>(() => customPos ? { ...customPos, width: basePlacement.width } : null, [customPos, basePlacement])
  const isCustom = customPos !== null
  const isAdjusted = size !== 100 || rotation !== 0

  useEffect(() => {
    if (!activeVessels.some((item) => item.id === vesselId)) setVesselId(activeVessels[0].id)
    if (!activeArtworks.some((item) => item.id === artworkId)) setArtworkId(activeArtworks[0].id)
  }, [collection])

  useEffect(() => { preloadAssets(vessels, artworks) }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('collection', collection)
    url.searchParams.set('vessel', vesselId)
    url.searchParams.set('artwork', artworkId)
    url.searchParams.set('preset', presetId)
    if (customPos) url.searchParams.set('pos', `${customPos.x.toFixed(4)},${customPos.y.toFixed(4)}`)
    else url.searchParams.delete('pos')
    if (size !== 100) url.searchParams.set('size', String(size))
    else url.searchParams.delete('size')
    if (rotation) url.searchParams.set('rot', String(rotation))
    else url.searchParams.delete('rot')
    window.history.replaceState(null, '', url)
  }, [collection, vesselId, artworkId, presetId, customPos, size, rotation])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let current = true
    setRenderState('loading')
    renderCombination(canvas, { vessel, artwork, preset: presetId, empty, placement: customPlacement, size: size / 100, rotation }, () => current)
      .then(() => { if (current) setRenderState('ready') })
      .catch(() => { if (current) setRenderState('error') })
    return () => { current = false }
  }, [vessel, artwork, presetId, empty, customPlacement, size, rotation])

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (empty) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const origin = customPlacement ?? basePlacement
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin }
    setDragging(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX - dragRef.current.startX) / rect.width
    const dy = (event.clientY - dragRef.current.startY) / rect.height
    setCustomPos({
      x: Math.min(Math.max(dragRef.current.origin.x + dx, 0), 1),
      y: Math.min(Math.max(dragRef.current.origin.y + dy, 0), 1),
      width: 0,
    })
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    setDragging(false)
  }


  function downloadImage() {
    const canvas = canvasRef.current
    if (!canvas || renderState !== 'ready') return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeVessel = vessel.name.replace(/[^\p{L}\p{N}]+/gu, '_')
      const safeArtwork = artwork.name.replace(/[^\p{L}\p{N}]+/gu, '_')
      link.href = url
      link.download = `art-in-clay_${safeVessel}_${safeArtwork}.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return (
    <>
        <div className="studio-layout">
          <section className="preview-panel" aria-label="הדמיית הכלי והאיור">
            <div className="preview-topline">
              <span><i className="status-dot" /> מבט אל היצירה</span>
              <span className="preview-counter">01 / 02</span>
            </div>
            <div className="preview-stage">
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`הדמיה: ${vessel.name} ${empty ? 'ללא איור' : `עם איור ${artwork.name}`}`}
                className={empty ? '' : 'draggable'}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {renderState === 'loading' && <div className="preview-loading" role="status">מכינים את ההדמיה…</div>}
              {renderState === 'error' && <div className="preview-loading" role="alert">לא ניתן לטעון את התמונה. נסו לרענן את הדף.</div>}
              <span className="preview-watermark">הדמיה ניסיונית</span>
              {!empty && (dragging ? <span className="drag-hint">מזיזים…</span> : <span className="drag-hint subtle">גררו את האיור על הכלי</span>)}
            </div>
            <div className="preview-bottom">
              <div className="preview-caption">
                <span className="caption-kicker">YOUR CREATION /</span>
                <strong>{vessel.name}</strong>
                <span>{empty ? 'הכלי ללא איור' : `בשילוב ${artwork.name}`}</span>
              </div>
              <div className="compare-controls" role="group" aria-label="השוואת הכלי הריק לתוצאה">
                <button type="button" className={empty ? 'compare-button active' : 'compare-button'} aria-pressed={empty} onClick={() => setEmpty(true)}>לפני</button>
                <button type="button" className={!empty ? 'compare-button active' : 'compare-button'} aria-pressed={!empty} onClick={() => setEmpty(false)}>אחרי</button>
                <button type="button" className="download-button" onClick={downloadImage} disabled={renderState !== 'ready'} aria-label="הורדת ההדמיה כקובץ PNG">הורד PNG ↓</button>
              </div>
            </div>
            <p className="preview-disclaimer">זו הדמיית מחקר על בסיס צילום, לא צילום של מוצר מוגמר. הצבע והאיור עשויים להיראות אחרת על הכלי האמיתי.</p>
          </section>

          <section className="selection-panel" aria-label="בחירת הכלי והאיור">
            <div className="selection-heading">
              <span className="small-label">A LITTLE CREATIVE MOMENT</span>
              <h2>בואו ניצור יחד.</h2>
              <p>שלושה צעדים קטנים, והמקום לדמיין כבר שלכם.</p>
            </div>

            <div className="collection-toggle" role="group" aria-label="בחירת אוסף נכסים">
              <button type="button" className={collection === 'original' ? 'collection-chip active' : 'collection-chip'} aria-pressed={collection === 'original'} onClick={() => setCollection('original')}>יצירות ART IN CLAY</button>
              <button type="button" className={collection === 'external' ? 'collection-chip active' : 'collection-chip'} aria-pressed={collection === 'external'} onClick={() => setCollection('external')}>נכסי בדיקה חיצוניים</button>
            </div>
            {collection === 'external' && <p className="collection-note" role="note">הכלים והאיורים באוסף זה אינם יצירות ART IN CLAY. הם נכסי בדיקה חיצוניים ברישיון פתוח, להערכת טכניקת ההדמיה בלבד. מקורות ורישיונות מפורטים בפירוט למטה.</p>}

            <div className="selection-section">
              <div className="section-heading"><span className="step-number">01</span><div><h3>בוחרים כלי</h3><p>{collection === 'external' ? 'כלים חיצוניים לבדיקת טכניקה' : 'לכל קערה אופי משלה'}</p></div></div>
              <div className="option-grid vessel-grid">
                {activeVessels.map((item) => (
                  <button key={item.id} type="button" className={`option-card vessel-option ${vesselId === item.id ? 'selected' : ''}`} aria-pressed={vesselId === item.id} onClick={() => setVesselId(item.id)}>
                    <span className="option-image vessel-image"><img src={item.image} alt="" /></span>
                    <span className="option-text"><strong>{item.name}</strong><small>{item.detail}</small></span>
                    <span className="option-indicator" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="selection-section">
              <div className="section-heading"><span className="step-number">02</span><div><h3>מוצאים איור</h3><p>{collection === 'external' ? 'צבעי מים CC0 לבדיקה' : 'צבעי מים מקוריים, בהשראת הטבע'}</p></div></div>
              <div className="option-grid artwork-grid">
                {activeArtworks.map((item) => (
                  <button key={item.id} type="button" className={`option-card artwork-option ${artworkId === item.id ? 'selected' : ''}`} aria-pressed={artworkId === item.id} onClick={() => setArtworkId(item.id)}>
                    <span className="option-image artwork-image"><img src={item.image} alt="" /></span>
                    <span className="option-text"><strong>{item.name}</strong><small>{item.detail}</small></span>
                    <span className="option-indicator" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="selection-section placement-section">
              <div className="section-heading"><span className="step-number">03</span><div><h3>גודל וסיבוב</h3><p>גוררים את האיור על הכלי כדי להזיז אותו, ומכוונים כאן גודל וסיבוב</p></div></div>
              {isCustom && <div className="custom-placement-note" role="note"><strong>מיקום חופשי</strong><span>גררתם את האיור. המיקום נשמר בכתובת ונחסם בגבול אזור הקישוט.</span><button type="button" className="reset-custom" onClick={() => setCustomPos(null)}>חזרה למרכז ↺</button></div>}
              <div className="adjust-controls" role="group" aria-label="גודל וסיבוב האיור">
                <div className="adjust-row">
                  <label htmlFor="artwork-size">גודל</label>
                  <input id="artwork-size" type="range" dir="ltr" min={MIN_SIZE} max={MAX_SIZE} step={5} value={size} aria-valuetext={`${size}%`} onChange={(event) => setSize(Number(event.target.value))} />
                  <output htmlFor="artwork-size">{size}%</output>
                </div>
                <div className="adjust-row">
                  <label htmlFor="artwork-rotation">סיבוב</label>
                  <div className="rotation-input" dir="ltr">
                    <button type="button" className="rotate-button" aria-label="סיבוב שמאלה ב־15 מעלות" disabled={rotation <= -MAX_ROTATION} onClick={() => setRotation((value) => Math.max(-MAX_ROTATION, value - 15))}>↺</button>
                    <input id="artwork-rotation" type="range" dir="ltr" min={-MAX_ROTATION} max={MAX_ROTATION} step={1} value={rotation} aria-valuetext={rotationLabel(rotation)} onChange={(event) => setRotation(Number(event.target.value))} />
                    <button type="button" className="rotate-button" aria-label="סיבוב ימינה ב־15 מעלות" disabled={rotation >= MAX_ROTATION} onClick={() => setRotation((value) => Math.min(MAX_ROTATION, value + 15))}>↻</button>
                  </div>
                  <output htmlFor="artwork-rotation">{rotationLabel(rotation)}</output>
                </div>
                {isAdjusted && <button type="button" className="reset-custom" onClick={() => { setSize(100); setRotation(0) }}>איפוס גודל וסיבוב ↺</button>}
              </div>
            </div>

            <div className="summary-card">
              <span className="small-label">THE COMBINATION</span>
              <div className="summary-row"><span>הבחירה שלכם</span><strong>{vessel.name} + {artwork.name}</strong></div>
              <div className="summary-row"><span>מיקום</span><strong>{isCustom ? 'מיקום חופשי' : preset.name}</strong></div>
              {isAdjusted && <div className="summary-row"><span>גודל וסיבוב</span><strong>{size}% · {rotationLabel(rotation)}</strong></div>}
              <p>{vessel.material === 'dark' ? 'שימו לב: על הגלזורה הכהה הגוונים העדינים כמעט אינם נראים. אין בכך הבטחה לתוצאה פיזית זהה.' : 'כל כלי נוצר ביד, ולכן המרקם והגוונים במציאות ישתנו מעט מההדמיה.'}</p>
              {(vessel.external || artwork.external) && <p className="summary-external" role="note">השילוב הנוכחי כולל נכסי בדיקה חיצוניים שאינם יצירות ART IN CLAY. ראו פירוט מקורות ורישיונות בתחתית העמוד.</p>}
              <div className="summary-footer"><span>POC בלבד · ללא הזמנה</span><button type="button" onClick={() => { setCollection('original'); setVesselId('turquoise'); setArtworkId('meadow'); setPresetId('center'); setCustomPos(null); setSize(100); setRotation(0); setEmpty(false) }}>מתחילים מחדש ↗</button></div>
            </div>
          </section>
        </div>
        <div className="bottom-note"><span>·</span><p>ניסוי אמיתי על צילום קרמיקה ואיורי צבעי מים מקוריים. מפתח השחזור: <code dir="ltr">{configurationKey({ vessel, artwork, preset: presetId, placement: customPlacement, size: size / 100, rotation })}</code></p></div>
    </>
  )
}
