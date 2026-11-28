// Private-bucket storage helpers for the studio admin.
//
// Two private buckets: `artworks` (originals + previews) and `print-files`.
// Nothing is public — previews and print files are served to the artists via
// short-lived signed URLs. Static catalog paths (e.g. /assets/gallery/…)
// that predate the system are used directly.

import { supabase } from './supabase'

export function isStaticPath(path: string | null | undefined): boolean {
  return Boolean(path && path.startsWith('/'))
}

const signedCache = new Map<string, { url: string; expires: number }>()

async function signedUrl(bucket: string, path: string, lifetimeSeconds = 3600): Promise<string | null> {
  const cached = signedCache.get(`${bucket}/${path}`)
  if (cached && cached.expires > Date.now() + 60_000) return cached.url
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, lifetimeSeconds)
  if (data?.signedUrl) {
    signedCache.set(`${bucket}/${path}`, { url: data.signedUrl, expires: Date.now() + lifetimeSeconds * 1000 })
    return data.signedUrl
  }
  return null
}

export function resolveArtworkUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return Promise.resolve(null)
  if (isStaticPath(path)) return Promise.resolve(path)
  return signedUrl('artworks', path)
}

export function resolvePrintFileUrl(path: string): Promise<string | null> {
  if (isStaticPath(path)) return Promise.resolve(path)
  return signedUrl('print-files', path)
}

async function makePreview(file: File, maxSize = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('יצירת תצוגה מקדימה נכשלה.'))), 'image/webp', 0.85))
  } finally {
    bitmap.close()
  }
}

// Uploads an artwork original (kept private) plus a generated WebP preview.
export async function uploadArtworkFiles(original: File, artworkId: string): Promise<{ originalPath: string; previewPath: string }> {
  const stamp = Date.now()
  const originalPath = `originals/${artworkId}/${stamp}-${sanitize(original.name)}`
  const { error: originalError } = await supabase.storage.from('artworks').upload(originalPath, original)
  if (originalError) throw new Error(`העלאת הקובץ המקורי נכשלה: ${originalError.message}`)

  let previewPath: string
  try {
    const preview = await makePreview(original)
    previewPath = `previews/${artworkId}/${stamp}.webp`
    const { error: previewError } = await supabase.storage.from('artworks').upload(previewPath, preview, { contentType: 'image/webp' })
    if (previewError) throw new Error(`העלאת התצוגה המקדימה נכשלה: ${previewError.message}`)
  } catch (error) {
    // The original is the important part; a missing preview is recoverable.
    void supabase.storage.from('artworks').remove([originalPath]).catch(() => {})
    throw error
  }
  return { originalPath, previewPath }
}

// Print-ready files live under version-scoped paths so a replaced file can
// never orphan the historical record of a previous mapping version.
export async function uploadPrintFile(file: File, productKey: string, artworkKey: string): Promise<string> {
  const path = `${productKey}/${artworkKey}/${Date.now()}-${sanitize(file.name)}`
  const { error } = await supabase.storage.from('print-files').upload(path, file)
  if (error) throw new Error(`העלאת קובץ ההדפסה נכשלה: ${error.message}`)
  return path
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'
}
