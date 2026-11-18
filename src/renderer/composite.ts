import { assetVersion, type Artwork, type Placement, type PresetId, type Vessel } from '../data/catalog'

export interface RenderSelection {
  vessel: Vessel
  artwork: Artwork
  preset: PresetId
  empty?: boolean
  placement?: Placement | null
  size?: number
  rotation?: number
  wrap?: number
}

interface ArtSource {
  image: CanvasImageSource
  width: number
  height: number
}

const WIDTH = 750
const HEIGHT = 1000
const imageCache = new Map<string, Promise<HTMLImageElement>>()
const maskBoundsCache = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
const rotatedCache = new Map<string, ArtSource>()

/** Rotates the flat artwork before the vessel warp; degrees > 0 turn right (clockwise). */
function rotatedArtwork(image: HTMLImageElement, degrees: number): ArtSource {
  if (!degrees) return { image, width: image.naturalWidth, height: image.naturalHeight }
  const key = `${image.src}@${degrees.toFixed(1)}`
  const cached = rotatedCache.get(key)
  if (cached) return cached
  const radians = degrees * Math.PI / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(image.naturalWidth * cos + image.naturalHeight * sin)
  canvas.height = Math.ceil(image.naturalWidth * sin + image.naturalHeight * cos)
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(radians)
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  const source = { image: canvas, width: canvas.width, height: canvas.height }
  if (rotatedCache.size > 60) rotatedCache.delete(rotatedCache.keys().next().value!)
  rotatedCache.set(key, source)
  return source
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return cached
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load ${src}`))
    image.src = src
  })
  imageCache.set(src, pending)
  void pending.catch(() => { if (imageCache.get(src) === pending) imageCache.delete(src) })
  return pending
}

export function releaseAssets(...sources: string[]): void {
  for (const source of sources) imageCache.delete(source)
}

export function preloadAssets(vessels: Vessel[], artworks: Artwork[]): void {
  for (const vessel of vessels) {
    void loadImage(vessel.image).catch(() => {})
    void loadImage(vessel.mask).catch(() => {})
  }
  for (const artwork of artworks) void loadImage(artwork.image).catch(() => {})
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  return ctx
}

function maskBounds(maskImage: HTMLImageElement): { minX: number; minY: number; maxX: number; maxY: number } {
  const cached = maskBoundsCache.get(maskImage.src)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(maskImage, 0, 0, WIDTH, HEIGHT)
  const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT)
  let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0
  let found = false
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (data[(y * WIDTH + x) * 4]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        found = true
      }
    }
  }
  const bounds = found ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: WIDTH, maxY: HEIGHT }
  maskBoundsCache.set(maskImage.src, bounds)
  return bounds
}

function clampPlacement(placement: Placement, artWidth: number, artHeight: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Placement {
  const halfW = artWidth / 2
  const halfH = artHeight / 2
  const minX = bounds.minX + halfW
  const maxX = bounds.maxX - halfW
  const minY = bounds.minY + halfH
  const maxY = bounds.maxY - halfH
  // When the artwork is larger than the decoration area, its center may roam the whole
  // bounds so an oversized painting can be pushed toward the side or bottom of the vessel.
  const cx = maxX < minX ? Math.min(Math.max(placement.x * WIDTH, bounds.minX), bounds.maxX) : Math.min(Math.max(placement.x * WIDTH, minX), maxX)
  const cy = maxY < minY ? Math.min(Math.max(placement.y * HEIGHT, bounds.minY), bounds.maxY) : Math.min(Math.max(placement.y * HEIGHT, minY), maxY)
  return { x: cx / WIDTH, y: cy / HEIGHT, width: placement.width }
}

function warpArtwork(canvas: HTMLCanvasElement, source: ArtSource, vessel: Vessel, placement: Placement, width: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }, wrap: number): void {
  const ctx = context(canvas)
  const height = width * source.height / source.width
  const cx = placement.x * WIDTH
  const cy = placement.y * HEIGHT
  const columns = 32
  const rows = 40
  // Spherical wrap: remap the flat overlay onto the bowl as a sphere seen from above.
  // Radial distances compress like sin(θ) toward the rim, so straight strokes become
  // arcs curving around the bowl; beyond the rim (the visible outer wall) the surface
  // recedes steeply and compresses to a small fraction. wrap=0 keeps the flat overlay.
  const rimX = (bounds.minX + bounds.maxX) / 2
  const rimY = (bounds.minY + bounds.maxY) / 2
  const rimRX = (bounds.maxX - bounds.minX) / 2
  const rimRY = (bounds.maxY - bounds.minY) / 2
  const strength = wrap
  const wrapPoint = (x: number, y: number) => {
    if (!strength) return { x, y }
    const dx = (x - rimX) / rimRX
    const dy = (y - rimY) / rimRY
    const t = Math.hypot(dx, dy)
    if (t < 1e-6) return { x, y }
    const capped = Math.min(t, Math.PI / 2)
    const sphere = Math.sin(capped) + Math.max(0, t - Math.PI / 2) * .5
    const factor = (t * (1 - strength) + sphere * strength) / t
    return { x: rimX + dx * rimRX * factor, y: rimY + dy * rimRY * factor }
  }
  const point = (u: number, v: number) => {
    const edge = (v - .5) * 2
    return wrapPoint(
      cx + (u - .5) * width * (1 - vessel.perspective * edge * edge),
      cy + (v - .5) * height * .94 + vessel.curve * height * ((u - .5) * 2) ** 2,
    )
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const u0 = col / columns
      const u1 = (col + 1) / columns
      const v0 = row / rows
      const v1 = (row + 1) / rows
      const a = point(u0, v0)
      const b = point(u1, v0)
      const c = point(u0, v1)
      const d = point(u1, v1)
      const x = Math.min(a.x, c.x)
      const y = Math.min(a.y, b.y)
      const right = Math.max(b.x, d.x)
      const bottom = Math.max(c.y, d.y)
      ctx.drawImage(
        source.image,
        u0 * source.width, v0 * source.height,
        source.width / columns, source.height / rows,
        x, y, right - x + .35, bottom - y + .35,
      )
    }
  }
}

export function configurationKey({ vessel, artwork, preset, placement, size = 1, rotation = 0, wrap }: RenderSelection): string {
  const custom = placement ? `:${placement.x.toFixed(4)},${placement.y.toFixed(4)}` : ''
  const adjusted = size !== 1 || rotation || wrap !== undefined ? `:s${size.toFixed(2)}r${rotation}${wrap !== undefined ? `w${wrap.toFixed(2)}` : ''}` : ''
  return `${assetVersion}:${vessel.id}:${artwork.id}:${preset}${custom}${adjusted}`
}

export function effectivePlacement(selection: RenderSelection): Placement {
  return selection.placement ?? selection.vessel.placements[selection.preset]
}

export async function renderCombination(canvas: HTMLCanvasElement, selection: RenderSelection, isCurrent = () => true): Promise<void> {
  const { vessel, artwork, preset, empty, placement: customPlacement, size = 1, rotation = 0 } = selection
  const [baseImage, maskImage, artImage] = await Promise.all([
    loadImage(vessel.image), loadImage(vessel.mask), loadImage(artwork.image),
  ])
  if (!isCurrent()) return
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = context(canvas)
  ctx.drawImage(baseImage, 0, 0, WIDTH, HEIGHT)
  if (empty) return

  const basePlacement = customPlacement ?? vessel.placements[preset]
  const source = rotatedArtwork(artImage, rotation)
  // Size applies to the painting itself; the rotated canvas is larger, so its drawn width grows with it.
  const artWidth = basePlacement.width * WIDTH * (artwork.scale ?? 1) * size * source.width / artImage.naturalWidth
  const artHeight = artWidth * source.height / source.width
  const placement = clampPlacement(basePlacement, artWidth, artHeight, maskBounds(maskImage))
  const paintCanvas = document.createElement('canvas')
  paintCanvas.width = WIDTH
  paintCanvas.height = HEIGHT
  warpArtwork(paintCanvas, source, vessel, placement, artWidth, maskBounds(maskImage), selection.wrap ?? vessel.wrap ?? 1)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = WIDTH
  maskCanvas.height = HEIGHT
  const maskCtx = context(maskCanvas)
  maskCtx.drawImage(maskImage, 0, 0, WIDTH, HEIGHT)

  const base = ctx.getImageData(0, 0, WIDTH, HEIGHT)
  const paint = context(paintCanvas).getImageData(0, 0, WIDTH, HEIGHT).data
  const mask = maskCtx.getImageData(0, 0, WIDTH, HEIGHT).data
  const output = base.data

  for (let i = 0; i < output.length; i += 4) {
    if (!paint[i + 3] || !mask[i]) continue
    const brightness = .2126 * output[i] + .7152 * output[i + 1] + .0722 * output[i + 2]
    const highlight = vessel.material === 'light' ? Math.min(.38, Math.max(0, (brightness - 175) / 175)) : 0
    const alpha = paint[i + 3] / 255 * mask[i] / 255 * (vessel.material === 'light' ? .83 : .55) * (1 - highlight)
    for (let channel = 0; channel < 3; channel++) {
      const surface = output[i + channel]
      const pigment = vessel.material === 'light'
        ? paint[i + channel] * (.52 + .48 * surface / 210)
        : surface * (.35 + .65 * paint[i + channel] / 255)
      output[i + channel] = surface * (1 - alpha) + pigment * alpha
    }
  }
  ctx.putImageData(base, 0, 0)
}
