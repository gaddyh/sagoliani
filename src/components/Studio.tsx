import { useEffect, useMemo, useRef, useState } from 'react'
import { artworks, presets, vessels, type ArtworkId, type Placement, type PresetId, type VesselId } from '../data/catalog'
import { artists, products, type Material } from '../data/products'
import { configurationKey, preloadAssets, renderCombination } from '../renderer/composite'

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
const DRAG_THRESHOLD = 6
const EFRAT = artists.find((artist) => artist.name.startsWith('אפרת'))!
const NEW_PRODUCT = '__new__'
const VESSEL_PRODUCTS: Partial<Record<VesselId, string>> = { 'shay-clean': 'shay-bowl', 'shay-dots': 'shay-bowl' }

function ts(text: string): string {
  return "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

function parsePlacementParam(value: string | null): Placement | null {
  if (!value) return null
  const [x, y] = value.split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, width: 0 }
}

export default function Studio() {
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
  const [tab, setTab] = useState<Tab>('vessel')
  const [customerName, setCustomerName] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [requestError, setRequestError] = useState('')
  const [requestSent, setRequestSent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [catalogProductId, setCatalogProductId] = useState('')
  const [catalogSizeLabel, setCatalogSizeLabel] = useState('')
  const [catalogMaterial, setCatalogMaterial] = useState<Material>('smooth')
  const [newProductId, setNewProductId] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductDetail, setNewProductDetail] = useState('')
  const [newProductSizes, setNewProductSizes] = useState<{ label: string; price: string }[]>([{ label: '', price: '' }])
  const [catalogPreview, setCatalogPreview] = useState('')
  const [catalogResult, setCatalogResult] = useState<{ filename: string; imagePath: string; productId: string; material: Material } | null>(null)
  const requestDialog = useRef<HTMLDialogElement>(null)
  const catalogDialog = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origin: Placement; moved: boolean } | null>(null)
  const vessel = vessels.find((item) => item.id === vesselId)!
  const artwork = artworks.find((item) => item.id === artworkId)!
  const preset = presets.find((item) => item.id === presetId)!
  const basePlacement = vessel.placements[presetId]
  const customPlacement = useMemo<Placement | null>(() => customPos ? { ...customPos, width: basePlacement.width } : null, [customPos, basePlacement])
  const isCustom = customPos !== null
  const isAdjusted = size !== 100 || rotation !== 0

  useEffect(() => { preloadAssets(vessels, artworks) }, [])

  const designUrl = useMemo(() => {
    const url = new URL(location.href)
    url.searchParams.set('vessel', vesselId)
    url.searchParams.set('artwork', artworkId)
    url.searchParams.set('preset', presetId)
    if (customPos) url.searchParams.set('pos', `${customPos.x.toFixed(4)},${customPos.y.toFixed(4)}`)
    else url.searchParams.delete('pos')
    if (size !== 100) url.searchParams.set('size', String(size))
    else url.searchParams.delete('size')
    if (rotation) url.searchParams.set('rot', String(rotation))
    else url.searchParams.delete('rot')
    return url
  }, [vesselId, artworkId, presetId, customPos, size, rotation])

  useEffect(() => {
    const url = new URL(designUrl)
    url.hash = window.location.hash
    window.history.replaceState(null, '', url)
  }, [designUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let current = true
    setRenderState('loading')
    renderCombination(canvas, { vessel, artwork, preset: presetId, empty: empty, placement: customPlacement, size: size / 100, rotation }, () => current)
      .then(() => { if (current) setRenderState('ready') })
      .catch(() => { if (current) setRenderState('error') })
    return () => { current = false }
  }, [vessel, artwork, presetId, empty, customPlacement, size, rotation])


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
      return
    }
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
    if (!drag) return
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.moved = true
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
    dragRef.current = null
    setDragging(false)
  }

  const placementText = `${isCustom ? 'מיקום חופשי' : preset.name}${isAdjusted ? `, גודל ${size}%, סיבוב ${rotationLabel(rotation).replace(/[\u2066\u2069]/g, '')}` : ''}`
  const requestLink = new URL(designUrl)
  requestLink.hash = 'studio-editor'
  const requestMessage = [
    `שלום ${EFRAT.name.split(' ')[0]}, אשמח להזמין כלי מעוצב מ-ART IN CLAY.`,
    `שם: ${customerName.trim()}`,
    `כלי: ${vessel.name}`,
    `ציור: ${artwork.name}`,
    `מיקום: ${placementText}`,
    ...(customerNote.trim() ? [`הערות: ${customerNote.trim()}`] : []),
    `ההדמיה שלי: ${requestLink.href}`,
  ].join('\n')
  const requestHref = `https://wa.me/${EFRAT.whatsapp}?text=${encodeURIComponent(requestMessage)}`

  function openRequest() {
    setRequestError('')
    setRequestSent(false)
    setCopied(false)
    requestDialog.current?.showModal()
  }

  function sendRequest(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!customerName.trim()) {
      event.preventDefault()
      setRequestError('נא למלא שם, כדי שאפרת תדע למי לחזור.')
      return
    }
    setRequestError('')
    setRequestSent(true)
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(requestMessage)
    } catch {
      // Older browsers or embedded views without clipboard access: copy through a temporary text field.
      const field = document.createElement('textarea')
      field.value = requestMessage
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
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
      const now = new Date()
      const pad = (value: number) => String(value).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
      link.download = `art-in-clay_${safeVessel}_${safeArtwork}_${stamp}.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  function openCatalog() {
    const canvas = canvasRef.current
    if (!canvas || renderState !== 'ready') return
    const thumb = document.createElement('canvas')
    thumb.width = 150
    thumb.height = 200
    thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height)
    setCatalogProductId(VESSEL_PRODUCTS[vesselId] ?? '')
    const next = products.find((item) => item.id === VESSEL_PRODUCTS[vesselId])
    setCatalogSizeLabel(next?.sizes[0]?.label ?? '')
    setCatalogMaterial(vessel.name.includes('מנוקד') ? 'speckled' : 'smooth')
    setNewProductId('')
    setNewProductName(vessel.name.replace(/\s·\s(חלק|מנוקד)$/, ''))
    setNewProductDetail('')
    setNewProductSizes([{ label: '', price: '' }])
    setCatalogPreview(thumb.toDataURL('image/png'))
    setCatalogResult(null)
    catalogDialog.current?.showModal()
  }

  async function addToCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas || renderState !== 'ready') return
    const isNew = catalogProductId === NEW_PRODUCT
    const productId = isNew ? newProductId.trim() : catalogProductId
    if (!productId) return
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .9))
    if (!blob) return
    const ext = blob.type === 'image/webp' ? 'webp' : 'png'
    const filename = `${productId}-${catalogMaterial}-${artworkId}.${ext}`
    const imagePath = `/assets/products/${productId}/${catalogMaterial}/${filename}`
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    const snippet = [
      ...(isNew ? [
        '// הוסיפו ל־products ב־src/data/products.ts (וגם את המזהה ל־ProductId):',
        `  { id: ${ts(productId)}, name: ${ts(newProductName.trim())}, detail: ${ts(newProductDetail.trim())}, sizes: [${newProductSizes.filter((size) => size.label.trim() && size.price.trim()).map((size) => `{ label: ${ts(size.label.trim())}, price: ${Number(size.price) || 0} }`).join(', ')}] },`,
        '',
      ] : []),
      '// הוסיפו ל־finishedVariants ב־src/data/products.ts:',
      `  { id: ${ts(`${productId}-${catalogMaterial}-${artworkId}`)}, productId: ${ts(productId)}, material: ${ts(catalogMaterial)}, artworkId: ${ts(artworkId)}, artworkName: ${ts(artwork.name)}, images: [${ts(imagePath)}] },`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(snippet)
    } catch {
      // Older browsers or embedded views without clipboard access: copy through a temporary text field.
      const field = document.createElement('textarea')
      field.value = snippet
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCatalogResult({ filename, imagePath, productId, material: catalogMaterial })
  }

  return (
    <div className="editor" id="studio-editor">
      <section className="editor-stage" aria-label="הדמיית הכלי והאיור">
        <div className="stage-frame">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`הדמיה: ${vessel.name} ${empty ? 'ללא איור' : `עם איור ${artwork.name}`}`}
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
          {!empty && <span className={dragging ? 'drag-hint' : 'drag-hint subtle'}>{dragging ? 'מזיזים…' : <><span className="hint-touch">גררו להזזה · שתי אצבעות לגודל וסיבוב</span><span className="hint-mouse">גררו להזזה · צביטה במשטח המגע לגודל</span></>}</span>}
          <div className="stage-actions">
            <div className="compare-controls" role="group" aria-label="השוואת הכלי הריק לתוצאה">
              <button type="button" className={empty ? 'compare-button active' : 'compare-button'} aria-pressed={empty} onClick={() => setEmpty(true)}>לפני</button>
              <button type="button" className={!empty ? 'compare-button active' : 'compare-button'} aria-pressed={!empty} onClick={() => setEmpty(false)}>אחרי</button>
            </div>
            <button type="button" className="download-button" onClick={downloadImage} disabled={renderState !== 'ready'} aria-label="הורדת ההדמיה כקובץ PNG">הורד PNG ↓</button>
            <button type="button" className="download-button" onClick={openCatalog} disabled={renderState !== 'ready'}>הוספה לקטלוג ↗</button>
          </div>
        </div>
      </section>

      <section className="editor-panel" aria-label="בחירת הכלי והאיור">
        <div className="editor-caption">
          <button type="button" className="request-button" onClick={openRequest} disabled={renderState === 'error'}>שליחת בקשה לאפרת</button>
          <strong>{vessel.name}</strong>
          <span>{empty ? 'הכלי ללא איור' : `בשילוב ${artwork.name}`}{isCustom || isAdjusted ? ` · ${isCustom ? 'מיקום חופשי' : preset.name}${isAdjusted ? ` · ${size}% · ${rotationLabel(rotation)}` : ''}` : ''}</span>
        </div>
        <div className="editor-body" role="tabpanel" id={`studio-panel-${tab}`} aria-labelledby={`studio-tab-${tab}`}>
          {tab === 'vessel' && <>
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
            <div className="option-strip artwork-strip">
              {artworks.map((item) => (
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
              <div className="summary-footer"><span>POC בלבד · ללא הזמנה</span><button type="button" onClick={() => { setVesselId(vessels[0].id); setArtworkId('meadow'); setPresetId('center'); setCustomPos(null); setSize(100); setRotation(0); setEmpty(false); setTab('vessel') }}>מתחילים מחדש ↗</button></div>
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

      <dialog ref={requestDialog} className="request-dialog" aria-labelledby="request-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        <form method="dialog" className="request-form" onSubmit={(event) => event.preventDefault()}>
          <div className="request-head">
            <h3 id="request-title">שליחת בקשה לאפרת</h3>
            <button type="button" className="request-close" aria-label="סגירה" onClick={() => requestDialog.current?.close()}>×</button>
          </div>
          <p className="request-summary"><strong>{vessel.name}</strong> + <strong>{artwork.name}</strong> · {placementText}</p>
          <label>שם <input name="customer-name" autoComplete="name" required maxLength={60} value={customerName} onChange={(event) => { setCustomerName(event.target.value); setRequestError('') }} /></label>
          <label><span>הערות <span className="request-optional">(רשות)</span></span>
            <textarea name="customer-note" rows={3} maxLength={500} placeholder="למשל: כמות או סט, חומר חלק או מנוקד, איסוף או משלוח" value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} />
          </label>
          {requestError && <p className="request-error" role="alert">{requestError}</p>}
          <a className="request-send" href={requestHref} target="_blank" rel="noopener noreferrer" onClick={sendRequest}>שליחה בוואטסאפ לאפרת</a>
          {requestSent && <div className="request-after" role="status">
            <p>וואטסאפ אמור להיפתח עם ההודעה; נשאר רק ללחוץ ״שליחה״. ההודעה כוללת קישור שפותח בדיוק את ההדמיה שלכם.</p>
            <p>לא נפתח? העתיקו את ההודעה ושלחו לאפרת בוואטסאפ: <a href={`tel:+${EFRAT.whatsapp}`} dir="ltr">{EFRAT.phone}</a></p>
            <button type="button" className="request-secondary" onClick={copyMessage}>{copied ? 'ההודעה הועתקה ✓' : 'העתקת ההודעה'}</button>
          </div>}
          <p className="request-note">ההודעה נשלחת מהוואטסאפ שלכם ישירות לאפרת; הפרטים לא נשמרים באתר. הציור הסופי מותאם לגודל הכלי ולעיצובו על ידי היוצרות.</p>
        </form>
      </dialog>

      <dialog ref={catalogDialog} className="request-dialog" aria-labelledby="catalog-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close() }}>
        <form method="dialog" className="request-form" onSubmit={addToCatalog}>
          <div className="request-head">
            <h3 id="catalog-title">הוספת הדמיה לקטלוג החנות</h3>
            <button type="button" className="request-close" aria-label="סגירה" onClick={() => catalogDialog.current?.close()}>×</button>
          </div>
          <div className="catalog-preview-row">
            {catalogPreview && <img className="catalog-preview" src={catalogPreview} alt="" />}
            <p className="request-summary"><strong>{vessel.name}</strong><br />+ <strong>{artwork.name}</strong></p>
          </div>
          <label>מוצר בחנות
            <select value={catalogProductId} onChange={(event) => {
              setCatalogProductId(event.target.value)
              const next = products.find((item) => item.id === event.target.value)
              setCatalogSizeLabel(next?.sizes[0]?.label ?? '')
            }}>
              <option value="">— בחירת מוצר —</option>
              {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value={NEW_PRODUCT}>מוצר חדש…</option>
            </select>
          </label>
          {catalogProductId && catalogProductId !== NEW_PRODUCT && <label>מידה
            <select value={catalogSizeLabel} onChange={(event) => setCatalogSizeLabel(event.target.value)}>
              {products.find((item) => item.id === catalogProductId)!.sizes.map((size) => <option key={size.label} value={size.label}>{size.label} · {size.price} ₪</option>)}
            </select>
          </label>}
          {catalogProductId === NEW_PRODUCT && <>
            <label>מזהה מוצר באנגלית <input dir="ltr" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="mika-bowl" value={newProductId} onChange={(event) => setNewProductId(event.target.value)} /></label>
            <label>שם המוצר <input required maxLength={80} value={newProductName} onChange={(event) => setNewProductName(event.target.value)} /></label>
            <label>תיאור קצר <input maxLength={160} placeholder="מידות או שימוש, למשל: קוטר 17 · למרק או לסלטים" value={newProductDetail} onChange={(event) => setNewProductDetail(event.target.value)} /></label>
            <div className="catalog-sizes" role="group" aria-label="מידות ומחירים">
              {newProductSizes.map((size, index) => <div className="catalog-size-row" key={index}>
                <input required maxLength={40} placeholder="מידה (למשל קוטר 17)" value={size.label} onChange={(event) => setNewProductSizes((rows) => rows.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} />
                <input required type="number" min="1" placeholder="מחיר ₪" value={size.price} onChange={(event) => setNewProductSizes((rows) => rows.map((row, i) => i === index ? { ...row, price: event.target.value } : row))} />
                <button type="button" className="catalog-size-remove" aria-label="הסרת מידה" onClick={() => setNewProductSizes((rows) => rows.length > 1 ? rows.filter((_, i) => i !== index) : rows)}>×</button>
              </div>)}
              <button type="button" className="request-secondary" onClick={() => setNewProductSizes((rows) => [...rows, { label: '', price: '' }])}>+ הוספת מידה</button>
            </div>
          </>}
          <fieldset className="material-choices catalog-material">
            <legend>חומר</legend>
            {(['smooth', 'speckled'] as const).map((option) => <label key={option}>
              <input type="radio" name="catalog-material" value={option} checked={catalogMaterial === option} onChange={() => setCatalogMaterial(option)} />
              {option === 'smooth' ? 'חלק' : 'מנוקד'}
            </label>)}
          </fieldset>
          <button type="submit" className="request-send">הורדת ההדמיה והעתקת הרשומה</button>
          {catalogResult && <div className="request-after" role="status">
            <p>הקובץ <code dir="ltr">{catalogResult.filename}</code> הורד והרשומה הועתקה ללוח.</p>
            <p>לפרסום: העבירו את הקובץ ל־<code dir="ltr">public{catalogResult.imagePath}</code> (תיקיית <code dir="ltr">{catalogResult.productId}/{catalogResult.material}</code>), הדביקו את הרשומה ב־<code dir="ltr">src/data/products.ts</code> ואז commit ו־push.</p>
            <p>שימו לב: זו הדמיית סטודיו של השילוב, לא צילום של מוצר מוגמר.</p>
          </div>}
        </form>
      </dialog>
    </div>
  )
}
