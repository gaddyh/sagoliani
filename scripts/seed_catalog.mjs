// Seeds the studio catalog (products, sizes, artworks, variants) from the
// storefront's static TypeScript data, and ensures the two artist accounts
// exist. Idempotent — safe to run repeatedly.
//
// Usage: node scripts/seed_catalog.mjs
// Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY (falls back to .env.local values)
//
// The service key stays in this local script and never reaches the browser.

import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
    }
  } catch { /* .env.local is optional when env vars are provided directly */ }
}
loadEnvLocal()

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
}

async function rest(path, body) {
  const response = await fetch(`${url}/rest/v1/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
}

// --- 1. Load catalog data through Vite SSR (same pattern as prerender.mjs) ---

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let products, finishedVariants, galleryArtworks
try {
  ;({ products, finishedVariants } = await vite.ssrLoadModule('/src/data/products.ts'))
  ;({ galleryArtworks } = await vite.ssrLoadModule('/src/data/gallery.ts'))
} finally {
  await vite.close()
}

const categoryOf = (id) =>
  id.includes('bowl') ? 'קערה'
  : id.includes('platter') ? 'מגש'
  : id.includes('plate') ? 'צלחת'
  : id === 'vase' ? 'אגרטל'
  : id === 'river-stones' ? 'סט'
  : 'כלי'

// --- 2. Seed catalog tables ---

await rest('ceramic_products?on_conflict=id', products.map((product, index) => ({
  id: product.id,
  name: product.name,
  description: product.detail,
  category: categoryOf(product.id),
  uses: product.uses ?? null,
  min_desired_inventory: 0,
  is_active: true,
  sort_order: index,
})))

// Artwork print sizes (cm) that fit each vessel, provided by the artists
// (Nov 2026) — these are the default PRINT dimensions of the artwork for a
// mapping on that vessel, NOT the physical dimensions of the vessel itself.
// Width = רוחב/אורך (the longer dimension), height = גובה.
const PRINT_AREAS = {
  'shay-bowl': { 'קוטר 16': [5, 12], 'קוטר 20': [5, 12] },
  'omer-bowl': { 'קוטר 16': [5, 12], 'קוטר 20': [5, 12] },
  'river-stones': { 'גדול': [8, 9], 'בינוני': [7, 8], 'קטן': [4, 5] },
  'irit-platter': { 'מגש': [23, 6] },
  'ella-platter': { 'מגש': [23, 6] },
  'yael-bowl': { 'קוטר כ-25 ס״מ': [12, 15] },
  'mika-plate': { 'צלחת': [8, 12] },
  'gaddy-plate': { 'קוטר כ-25 ס״מ': [18, 10] },
}

await rest('product_sizes?on_conflict=product_id,label', products.flatMap((product) =>
  product.sizes.map((size) => {
    const area = PRINT_AREAS[product.id]?.[size.label]
    return {
      product_id: product.id,
      label: size.label,
      price_ils: size.price,
      print_width_cm: area ? area[0] : null,
      print_height_cm: area ? area[1] : null,
    }
  })))

await rest('artworks?on_conflict=id', galleryArtworks.map((artwork) => ({
  id: artwork.id,
  name: artwork.name,
  artist: null,
  description: null,
  preview_path: artwork.image,
  original_path: null,
  is_active: true,
  show_in_gallery: true,
  notes: null,
})))

// Photographed combos are not linked to gallery artworks by ID; the concrete
// artwork for an order item is chosen at confirmation (update_order_item_artwork).
await rest('catalog_variants?on_conflict=id', finishedVariants.map((variant) => ({
  id: variant.id,
  product_id: variant.productId,
  material: variant.material,
  artwork_id: null,
  display_name: variant.artworkName,
  images: variant.images,
  image_artwork_names: variant.imageArtworkNames ?? null,
  is_published: true,
})))

console.log(`Seeded ${products.length} products, ${galleryArtworks.length} artworks, ${finishedVariants.length} variants.`)

// --- 3. Ensure the two artist accounts + profiles exist ---

const devArtists = [
  { email: 'irit@sagoliani.art', password: 'studio-dev-2026', display_name: 'עירית סגול' },
  { email: 'efrat@sagoliani.art', password: 'studio-dev-2026', display_name: 'אפרת ליאני' },
]

const listResponse = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
})
if (!listResponse.ok) throw new Error(`list users: ${listResponse.status} ${await listResponse.text()}`)
const { users } = await listResponse.json()
const existingEmails = new Set(users.map((user) => user.email))

for (const artist of devArtists) {
  let userId = users.find((user) => user.email === artist.email)?.id
  if (!userId) {
    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: artist.email, password: artist.password, email_confirm: true }),
    })
    if (!createResponse.ok) throw new Error(`create ${artist.email}: ${createResponse.status} ${await createResponse.text()}`)
    userId = (await createResponse.json()).id
    console.log(`Created artist ${artist.email}`)
  }
  await rest('profiles?on_conflict=id', [{ id: userId, display_name: artist.display_name }])
}

console.log('Seed complete.')
