import type { Artwork, Vessel } from '../data/catalog'

export interface Region { x: number; y: number; rx: number; ry: number }

export interface DraftAsset {
  id: string
  kind: 'vessel' | 'artwork'
  name: string
  detail: string
  createdAt: number
  image: Blob
  mask?: Blob
  material?: 'light' | 'dark'
  region?: Region
  note?: string
}

const MAX_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 20_000_000
const DB_NAME = 'art-in-clay-drafts'
const VESSEL_WIDTH = 750
const VESSEL_HEIGHT = 1000
export const initialRegion: Region = { x: .5, y: .55, rx: .24, ry: .16 }

async function decode(file: File): Promise<ImageBitmap> {
  if (!file || file.size === 0 || file.size > MAX_BYTES) throw new Error('יש לבחור תמונה בגודל עד 10MB.')
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = header.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255
  const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP'
  const gif = String.fromCharCode(...header.slice(0, 4)) === 'GIF8'
  const bmp = header[0] === 66 && header[1] === 77
  if (!png && !jpeg && !webp && !gif && !bmp) throw new Error('אפשר להעלות PNG, JPEG, WebP, GIF או BMP תקינים. פורמטים אחרים יש להמיר תחילה.')
  try {
    const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (!image.width || !image.height || image.width * image.height > MAX_PIXELS) {
      image.close()
      throw new Error('ממדי התמונה גדולים מדי (עד 20 מיליון פיקסלים).')
    }
    return image
  } catch (error) {
    if (error instanceof Error && error.message.includes('מיליון')) throw error
    throw new Error('לא ניתן לפענח את קובץ התמונה.')
  }
}

function canvasFor(image: ImageBitmap, width = image.width, height = image.height, fill?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  if (!fill) { ctx.drawImage(image, 0, 0, width, height); return canvas }
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, width, height)
  const scale = Math.min(width / image.width, height / image.height)
  ctx.drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale)
  return canvas
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('עיבוד התמונה נכשל.')), 'image/png'))
}

export function createRegionMask(region: Region): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = VESSEL_WIDTH
  canvas.height = VESSEL_HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.ellipse(region.x * canvas.width, region.y * canvas.height, region.rx * canvas.width, region.ry * canvas.height, 0, 0, Math.PI * 2)
  ctx.fill()
  return toPng(canvas)
}

function isolatePaper(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = frame
  let transparent = false
  for (let i = 3; i < data.length; i += 4) if (data[i] < 240) { transparent = true; break }
  if (transparent) return
  const size = Math.max(2, Math.floor(Math.min(canvas.width, canvas.height) * .06))
  const corners: number[][] = []
  for (const y of [0, canvas.height - size]) for (const x of [0, canvas.width - size]) {
    const sum = [0, 0, 0]
    for (let row = y; row < y + size; row++) for (let col = x; col < x + size; col++) {
      const i = (row * canvas.width + col) * 4
      for (let channel = 0; channel < 3; channel++) sum[channel] += data[i + channel]
    }
    corners.push(sum.map((value) => value / (size * size)))
  }
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, corner) => sum + corner[channel], 0) / 4)
  const distance = (rgb: number[]) => Math.sqrt(rgb.reduce((sum, value, channel) => sum + (value - background[channel]) ** 2, 0) / 3)
  if (background.reduce((sum, value) => sum + value, 0) / 3 < 190 || corners.some((corner) => distance(corner) > 28)) {
    throw new Error('לא ניתן להסיר רקע מורכב אוטומטית. השתמשו באיור שקוף או בצילום על נייר בהיר ואחיד.')
  }
  let painted = 0
  for (let i = 0; i < data.length; i += 4) {
    const alpha = Math.max(0, Math.min(1, (distance([data[i], data[i + 1], data[i + 2]]) - 12) / 75))
    if (alpha > .2) painted++
    for (let channel = 0; channel < 3; channel++) data[i + channel] = Math.max(0, Math.min(255, (data[i + channel] - (1 - alpha) * background[channel]) / Math.max(alpha, .2)))
    data[i + 3] = Math.round(alpha * 255)
  }
  if (painted < canvas.width * canvas.height * .002) throw new Error('לא נמצא ציור מובחן על הרקע הבהיר.')
  ctx.putImageData(frame, 0, 0)
}

export async function processDraft(kind: DraftAsset['kind'], name: string, detail: string, file: File, maskFile?: File, material?: 'light' | 'dark'): Promise<DraftAsset> {
  if (!name.trim()) throw new Error('יש להזין שם לנכס.')
  const image = await decode(file)
  try {
    const base = { id: crypto.randomUUID(), kind, name: name.trim(), detail: detail.trim(), createdAt: Date.now() }
    if (kind === 'artwork') {
      const scale = Math.min(1, 900 / Math.max(image.width, image.height))
      const canvas = canvasFor(image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)))
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let transparent = false
      let painted = false
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 240) transparent = true
        if (pixels[i] > 20) painted = true
        if (transparent && painted) break
      }
      if (!transparent) isolatePaper(canvas)
      else if (!painted) throw new Error('האיור ריק. יש לבחור קובץ עם ציור גלוי.')
      return { ...base, image: await toPng(canvas), note: transparent ? undefined : 'הרקע הוסר בקירוב מנייר בהיר. בדקו קצוות, צבעים ושקיפות מול המקור.' }
    }
    const normalized = canvasFor(image, VESSEL_WIDTH, VESSEL_HEIGHT, '#e8e4da')
    let region: Region | undefined
    let maskBlob: Blob
    if (maskFile) {
      const mask = await decode(maskFile)
      try {
        if (image.width !== mask.width || image.height !== mask.height) throw new Error('המסכה והצילום חייבים להיות באותם ממדים לפני ההתאמה.')
        const canvas = canvasFor(mask, VESSEL_WIDTH, VESSEL_HEIGHT, '#000')
        const ctx = canvas.getContext('2d')!
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
        let inside = 0
        let outside = 0
        for (let i = 0; i < pixels.data.length; i += 4) {
          const alpha = pixels.data[i + 3]
          const value = Math.round((pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3 * alpha / 255)
          if (value > 200) inside++
          if (value < 20) outside++
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value
          pixels.data[i + 3] = 255
        }
        if (!inside || !outside) throw new Error('המסכה צריכה להכיל אזור לבן לקישוט ורקע שחור מחוץ לו.')
        ctx.putImageData(pixels, 0, 0)
        maskBlob = await toPng(canvas)
      } finally { mask.close() }
    } else {
      region = { ...initialRegion }
      maskBlob = await createRegionMask(region)
    }
    return { ...base, material: material ?? 'light', image: await toPng(normalized), mask: maskBlob, region, note: region ? 'אזור הקישוט הוגדר אוטומטית כאליפסה משוערת. יש להתאים אותו לתמונה לפני בדיקת האיור.' : undefined }
  } finally { image.close() }
}

function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('לא ניתן לפתוח את אחסון הטיוטות בדפדפן.'))
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDrafts()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('assets', mode)
      const request = action(tx.objectStore('assets'))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(new Error('שמירת הטיוטה נכשלה. בדקו את שטח האחסון בדפדפן.'))
      tx.onabort = () => reject(new Error('שמירת הטיוטה בוטלה.'))
    })
  } finally { db.close() }
}

export const listDrafts = () => transaction<DraftAsset[]>('readonly', (store) => store.getAll())
export const saveDraft = (draft: DraftAsset) => transaction<IDBValidKey>('readwrite', (store) => store.put(draft))
export const removeDraft = (id: string) => transaction<undefined>('readwrite', (store) => store.delete(id))

export function draftVessel(draft: DraftAsset, image: string, mask: string): Vessel {
  return {
    id: draft.id as Vessel['id'], name: draft.name, detail: draft.detail, image, mask,
    material: draft.material ?? 'light', curve: .032, perspective: .15,
    placements: {
      center: { x: draft.region?.x ?? .51, y: draft.region?.y ?? .575, width: (draft.region?.rx ?? .24) * 1.05 },
      small: { x: draft.region?.x ?? .51, y: draft.region?.y ?? .575, width: (draft.region?.rx ?? .24) * .78 },
      offset: { x: Math.min(.9, (draft.region?.x ?? .5) + (draft.region?.rx ?? .24) * .28), y: (draft.region?.y ?? .55) - (draft.region?.ry ?? .16) * .2, width: (draft.region?.rx ?? .24) * .92 },
    },
  }
}

export function draftArtwork(draft: DraftAsset, image: string): Artwork {
  return { id: draft.id as Artwork['id'], name: draft.name, detail: draft.detail, image, source: 'טיוטת איור מקומית' }
}
