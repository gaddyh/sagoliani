import { useEffect, useMemo, useRef, useState } from 'react'
import { artworks, presets, vessels, type ArtworkId, type Placement, type PresetId, type VesselId } from '../data/catalog'
import { configurationKey, preloadAssets, renderCombination } from '../renderer/composite'

type Collection = 'original' | 'external'

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

type Tab = 'vessel' | 'artwork' | 'adjust' | 'summary'
const TABS: { id: Tab; label: string }[] = [
  { id: 'vessel', label: 'כלי' },
  { id: 'artwork', label: 'איור' },
  { id: 'adjust', label: 'גודל וסיבוב' },
  { id: 'summary', label: 'סיכום' },
]
const HOLD_MS = 450
const DRAG_THRESHOLD = 6

function parsePlacementParam(value: string | null): Placement | null {
  if (!value) return null
  const [x, y] = value.split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, width: 0 }
}

export default function Studio() {
  const [collection, setCollection] = useState<Collection>(() => new URLSearchParams(location.search).get('collection') === 'external' ? 'external' : 'original')
  const [vesselId, setVesselId] = useState<VesselId>(() => vessels.find((item) => item.id === new URLSearchParams(location.search).get('vessel'))?.id ?? vessels[0].id)
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
  const [holding, setHolding] = useState(false)
  const [tab, setTab] = useState<Tab>('vessel')
  const holdTimer = useRef<number | null>(null)
  const showEmpty = empty || holding
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origin: Placement; moved: boolean } | null>(null)
  const vessel = vessels.find((item) => item.id === vesselId)!
  const artwork = artworks.find((item) => item.id === artworkId)!
  const preset = presets.find((item) => item.id === presetId)!
  const activeArtworks = collection === 'original' ? originalArtworks : externalArtworks
  const basePlacement = vessel.placements[presetId]
  const customPlacement = useMemo<Placement | null>(() => customPos ? { ...customPos, width: basePlacement.width } : null, [customPos, basePlacement])
  const isCustom = customPos !== null
  const isAdjusted = size !== 100 || rotation !== 0

  useEffect(() => {
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
    renderCombination(canvas, { vessel, artwork, preset: presetId, empty: showEmpty, placement: customPlacement, size: size / 100, rotation }, () => current)
      .then(() => { if (current) setRenderState('ready') })
      .catch(() => { if (current) setRenderState('error') })
    return () => { current = false }
  }, [vessel, artwork, presetId, showEmpty, customPlacement, size, rotation])

  useEffect(() => () => { if (holdTimer.current) window.clearTimeout(holdTimer.current) }, [])

  const latest = useRef({ position: { x: basePlacement.x, y: basePlacement.y }, size, rotation })
  latest.current = { position: customPos ?? { x: basePlacement.x, y: basePlacement.y }, size, rotation }
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef<{ distance: number; angle: number; midX: number; midY: number; size: number; rotation: number; origin: { x: number; y: number } } | null>(null)

  const clampSize = (value: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value)))
  const clampRotation = (value: number) => Math.min(MAX_ROTATION, Math.max(-MAX_ROTATION, Math.round(value)))
  const clampUnit = (value: number) => Math.min(Math.max(value, 0), 1)

  // Trackpad pinch arrives as ctrl + wheel in Chrome, Edge and Safari; plain scrolling is left to the page.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || empty) return
      event.preventDefault()
      setSize((value) => clampSize(value * Math.exp(-event.deltaY * .01)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [empty])

  function twoFingers() {
    const [a, b] = [...pointers.current.values()]
    return { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: Math.atan2(b.y - a.y, b.x - a.x), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 }
  }

  function startDrag(x: number, y: number, moved: boolean) {
    dragRef.current = { startX: x, startY: y, origin: { ...latest.current.position, width: 0 }, moved }
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (empty || pointers.current.size >= 2) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      startDrag(event.clientX, event.clientY, false)
      holdTimer.current = window.setTimeout(() => { if (dragRef.current && !dragRef.current.moved) setHolding(true) }, HOLD_MS)
      return
    }
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    setHolding(false)
    dragRef.current = null
    gestureRef.current = { ...twoFingers(), size: latest.current.size, rotation: latest.current.rotation, origin: latest.current.position }
    setDragging(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const rect = event.currentTarget.getBoundingClientRect()
    const gesture = gestureRef.current
    if (gesture && pointers.current.size === 2) {
      const now = twoFingers()
      const turn = ((now.angle - gesture.angle) * 180 / Math.PI + 540) % 360 - 180
      setSize(clampSize(gesture.size * now.distance / gesture.distance))
      setRotation(clampRotation(gesture.rotation + turn))
      setCustomPos({ x: clampUnit(gesture.origin.x + (now.midX - gesture.midX) / rect.width), y: clampUnit(gesture.origin.y + (now.midY - gesture.midY) / rect.height), width: 0 })
      return
    }
    const drag = dragRef.current
    if (!drag || holding) return
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.moved = true
      if (holdTimer.current) window.clearTimeout(holdTimer.current)
      setDragging(true)
    }
    setCustomPos({
      x: clampUnit(drag.origin.x + (event.clientX - drag.startX) / rect.width),
      y: clampUnit(drag.origin.y + (event.clientY - drag.startY) / rect.height),
      width: 0,
    })
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    pointers.current.delete(event.pointerId)
    if (gestureRef.current) {
      gestureRef.current = null
      const remaining = [...pointers.current.values()][0]
      // The finger that stays down keeps dragging from where the pinch left the artwork.
      if (remaining) { startDrag(remaining.x, remaining.y, true); return }
    }
    if (pointers.current.size) return
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    dragRef.current = null
    setDragging(false)
    setHolding(false)
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

  const collectionToggle = (
    <div className="collection-toggle" role="group" aria-label="בחירת אוסף נכסים">
      <button type="button" className={collection === 'original' ? 'collection-chip active' : 'collection-chip'} aria-pressed={collection === 'original'} onClick={() => setCollection('original')}>יצירות ART IN CLAY</button>
      <button type="button" className={collection === 'external' ? 'collection-chip active' : 'collection-chip'} aria-pressed={collection === 'external'} onClick={() => setCollection('external')}>נכסי בדיקה חיצוניים</button>
    </div>
  )
  const collectionNote = collection === 'external' && <p className="collection-note" role="note">אוסף בדיקה: כלים וציורים חיצוניים, לא יצירות ART IN CLAY. מקורות ורישיונות בתחתית העמוד.</p>

  return (
    <div className="editor" id="studio-editor">
      <section className="editor-stage" aria-label="הדמיית הכלי והאיור">
        <div className="stage-frame">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`הדמיה: ${vessel.name} ${showEmpty ? 'ללא איור' : `עם איור ${artwork.name}`}`}
            className={empty ? '' : 'draggable'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(event) => event.preventDefault()}
          />
          {renderState === 'loading' && <div className="preview-loading" role="status">מכינים את ההדמיה…</div>}
          {renderState === 'error' && <div className="preview-loading" role="alert">לא ניתן לטעון את התמונה. נסו לרענן את הדף.</div>}
          <span className="preview-watermark">הדמיה ניסיונית</span>
          {holding && <span className="hold-badge" role="status">הכלי ללא איור</span>}
          {!showEmpty && <span className={dragging ? 'drag-hint' : 'drag-hint subtle'}>{dragging ? 'מזיזים…' : <><span className="hint-touch">גררו להזזה · שתי אצבעות לגודל וסיבוב · לחיצה ארוכה להשוואה</span><span className="hint-mouse">גררו להזזה · צביטה במשטח המגע לגודל · לחיצה ארוכה להשוואה</span></>}</span>}
          <div className="stage-actions">
            <div className="compare-controls" role="group" aria-label="השוואת הכלי הריק לתוצאה">
              <button type="button" className={empty ? 'compare-button active' : 'compare-button'} aria-pressed={empty} onClick={() => setEmpty(true)}>לפני</button>
              <button type="button" className={!empty ? 'compare-button active' : 'compare-button'} aria-pressed={!empty} onClick={() => setEmpty(false)}>אחרי</button>
            </div>
            <button type="button" className="download-button" onClick={downloadImage} disabled={renderState !== 'ready'} aria-label="הורדת ההדמיה כקובץ PNG">הורד PNG ↓</button>
          </div>
        </div>
      </section>

      <section className="editor-panel" aria-label="בחירת הכלי והאיור">
        <div className="editor-caption">
          <strong>{vessel.name}</strong>
          <span>{showEmpty ? 'הכלי ללא איור' : `בשילוב ${artwork.name}`}{isCustom || isAdjusted ? ` · ${isCustom ? 'מיקום חופשי' : preset.name}${isAdjusted ? ` · ${size}% · ${rotationLabel(rotation)}` : ''}` : ''}</span>
        </div>
        <div className="editor-body" role="tabpanel" id={`studio-panel-${tab}`} aria-labelledby={`studio-tab-${tab}`}>
          {tab === 'vessel' && <>
            {collectionToggle}
            {collectionNote}
            <div className="option-strip vessel-strip">
              {vessels.map((item) => (
                <button key={item.id} type="button" className={`option-card vessel-option ${vesselId === item.id ? 'selected' : ''}`} aria-pressed={vesselId === item.id} onClick={() => setVesselId(item.id)}>
                  <span className="option-image vessel-image"><img src={item.image} alt="" /></span>
                  <span className="option-text"><strong>{item.name}</strong><small>{item.detail}</small></span>
                  <span className="option-indicator" aria-hidden="true" />
                </button>
              ))}
            </div>
          </>}
          {tab === 'artwork' && <>
            {collectionToggle}
            {collectionNote}
            <div className="option-strip artwork-strip">
              {activeArtworks.map((item) => (
                <button key={item.id} type="button" className={`option-card artwork-option ${artworkId === item.id ? 'selected' : ''}`} aria-pressed={artworkId === item.id} onClick={() => setArtworkId(item.id)}>
                  <span className="option-image artwork-image"><img src={item.image} alt="" /></span>
                  <span className="option-text"><strong>{item.name}</strong><small>{item.detail}</small></span>
                  <span className="option-indicator" aria-hidden="true" />
                </button>
              ))}
            </div>
          </>}
          {tab === 'adjust' && <>
            <p className="editor-hint">גררו את האיור על הכלי כדי להזיז אותו. בטלפון אפשר גם לצבוט ולסובב בשתי אצבעות; כאן מכוונים במדויק.</p>
            {isCustom && <div className="custom-placement-note" role="note"><strong>מיקום חופשי</strong><span>המיקום נשמר בכתובת ונחסם בגבול אזור הקישוט.</span><button type="button" className="reset-custom" onClick={() => setCustomPos(null)}>חזרה למרכז ↺</button></div>}
            <div className="adjust-controls" role="group" aria-label="גודל וסיבוב האיור">
              <div className="adjust-row">
                <label htmlFor="artwork-size">גודל</label>
                <input id="artwork-size" type="range" dir="ltr" min={MIN_SIZE} max={MAX_SIZE} step={1} value={size} aria-valuetext={`${size}%`} onChange={(event) => setSize(Number(event.target.value))} />
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
          </>}
          {tab === 'summary' && <>
            <div className="summary-card">
              <span className="small-label">THE COMBINATION</span>
              <div className="summary-row"><span>הבחירה שלכם</span><strong>{vessel.name} + {artwork.name}</strong></div>
              <div className="summary-row"><span>מיקום</span><strong>{isCustom ? 'מיקום חופשי' : preset.name}</strong></div>
              {isAdjusted && <div className="summary-row"><span>גודל וסיבוב</span><strong>{size}% · {rotationLabel(rotation)}</strong></div>}
              <p>{vessel.material === 'dark' ? 'שימו לב: על הגלזורה הכהה הגוונים העדינים כמעט אינם נראים. אין בכך הבטחה לתוצאה פיזית זהה.' : 'כל כלי נוצר ביד, ולכן המרקם והגוונים במציאות ישתנו מעט מההדמיה.'}</p>
              {(vessel.external || artwork.external) && <p className="summary-external" role="note">השילוב הנוכחי כולל נכסי בדיקה חיצוניים שאינם יצירות ART IN CLAY. ראו פירוט מקורות ורישיונות בתחתית העמוד.</p>}
              <div className="summary-footer"><span>POC בלבד · ללא הזמנה</span><button type="button" onClick={() => { setCollection('original'); setVesselId(vessels[0].id); setArtworkId('meadow'); setPresetId('center'); setCustomPos(null); setSize(100); setRotation(0); setEmpty(false); setTab('vessel') }}>מתחילים מחדש ↗</button></div>
            </div>
            <p className="editor-disclaimer">זו הדמיית מחקר על בסיס צילום, לא צילום של מוצר מוגמר. מפתח השחזור: <code dir="ltr">{configurationKey({ vessel, artwork, preset: presetId, placement: customPlacement, size: size / 100, rotation })}</code></p>
          </>}
        </div>
        <div className="editor-tabs" role="tablist" aria-label="שלבי העיצוב">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" id={`studio-tab-${item.id}`} aria-controls={`studio-panel-${item.id}`} aria-selected={tab === item.id} className="editor-tab" onClick={() => setTab(item.id)}>{item.label}</button>
          ))}
        </div>
      </section>
    </div>
  )
}
