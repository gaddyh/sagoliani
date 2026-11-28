// Initial physical-inventory import for Sagoliani Studio.
//
// Source: a JSON snapshot transcribed from the studio's inventory
// spreadsheet (e.g. sagoliani_inventory_2026-11-28.json).
//
// Usage:
//   node scripts/import_inventory.mjs sagoliani_inventory_2026-11-28.json
//        — dry run (default): Hebrew summary, nothing is written.
//   node scripts/import_inventory.mjs sagoliani_inventory_2026-11-28.json --apply
//        — writes the units. Idempotent: rerunning never duplicates inventory
//          (unique import_ref per unit; conflicts are ignored).
//
// Policy (per the artists' requirements, Nov 2026):
//   * formed_quantity_explicit is treated as verified.
//   * Otherwise the larger of formed_quantity_estimated and
//     reported_stock_quantity is imported (never their sum — the overlap is
//     unresolved, so adding them would double-count physical pieces).
//   * ordered_quantity is aggregate demand: displayed for context, never
//     imported, and no orders are created from it.
//   * formed_drying maps to stage 2 (המתנה לשריפה ראשונה): the pieces are
//     formed and drying; no firing is assumed to have happened.
//   * Creation dates, locations and source notes are preserved on each unit.

import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim()
    }
  } catch { /* optional */ }
}
loadEnvLocal()

const BASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE = process.env.SUPABASE_SERVICE_KEY
if (!SERVICE) {
  console.error('חסר SUPABASE_SERVICE_KEY — הגדירו .env.local לפני הרצה.')
  process.exit(1)
}

const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }

// Hebrew spreadsheet names -> catalog product ids (plus catalog-name matching).
const PRODUCT_ALIASES = {
  'קערת שי': 'shay-bowl',
  'קערת עומר': 'omer-bowl',
  'אבן נחל': 'river-stones',
  'סט צלחות להגשה ״אבני נחל״': 'river-stones',
  'מגש עירית': 'irit-platter',
  'מגש אלה': 'ella-platter',
  'מגש מיקה': 'mika-plate',
  'צלחת מיקה': 'mika-plate',
  'צלחת גדי': 'gaddy-plate',
  'תבנית יעל': 'yael-bowl',
}

const STAGE_FORMED_DRYING = 2 // formed and drying -> waiting for the first firing

async function fetchCatalog() {
  const [products, sizes] = await Promise.all([
    fetch(`${BASE}/rest/v1/ceramic_products?select=id,name,is_active&order=sort_order`, { headers }).then((r) => r.json()),
    fetch(`${BASE}/rest/v1/product_sizes?select=product_id,label`, { headers }).then((r) => r.json()),
  ])
  return { products: products ?? [], sizes: sizes ?? [] }
}

function resolveProduct(name, products) {
  if (PRODUCT_ALIASES[name]) {
    const product = products.find((entry) => entry.id === PRODUCT_ALIASES[name] && entry.is_active)
    if (product) return { product, basis: 'כינוי מוכר' }
  }
  const exact = products.find((entry) => entry.is_active && entry.name === name)
  if (exact) return { product: exact, basis: 'שם קטלוג מדויק' }
  const partial = products.find((entry) => entry.is_active && (entry.name.includes(name) || name.includes(entry.name)))
  if (partial) return { product: partial, basis: 'התאמה חלקית לשם הקטלוג' }
  return { product: null, basis: '' }
}

function resolveSize(rawLabel, productId, sizes) {
  const productSizes = sizes.filter((size) => size.product_id === productId)
  if (!rawLabel) {
    if (productSizes.length === 1) return { label: productSizes[0].label, basis: 'מידה יחידה בקטלוג' }
    return { label: null, basis: `חסרה מידה — בקטלוג ${productSizes.length} מידות` }
  }
  const direct = productSizes.find((size) => size.label === rawLabel)
  if (direct) return { label: direct.label, basis: 'התאמה מדויקת' }
  const normalized = productSizes.find((size) => size.label.replace('קוטר ', '').trim() === String(rawLabel).trim())
  if (normalized) return { label: normalized.label, basis: 'נרמול מספר למידת קוטר' }
  return { label: null, basis: `מידה "${rawLabel}" לא נמצאה בקטלוג` }
}

function quantityOf(item) {
  if (item.formed_quantity_explicit != null) {
    return { quantity: item.formed_quantity_explicit, basis: 'מאומת', verified: true }
  }
  const estimated = item.formed_quantity_estimated ?? 0
  const stock = item.reported_stock_quantity ?? 0
  const quantity = Math.max(estimated, stock)
  if (quantity === 0) return { quantity: 0, basis: 'אין כמות', verified: false }
  const basis = stock > estimated ? 'מדווח כמלאי' : 'מוסק מהרישום'
  return { quantity, basis, verified: false }
}

function unitNotes(item) {
  const parts = []
  if (item.formation_date) parts.push(`נוצר ב-${item.formation_date}`)
  if (item.formation_location) parts.push(`מיובש ב${item.formation_location}`)
  if (item.notes_he) parts.push(item.notes_he)
  return parts.join(' · ') || null
}

// ---------------------------------------------------------------------------
const [file, ...flags] = process.argv.slice(2).filter((argument) => argument !== '--apply')
const apply = process.argv.includes('--apply')
if (!file) {
  console.error('שימוש: node scripts/import_inventory.mjs <inventory.json> [--apply]')
  process.exit(1)
}

const snapshot = JSON.parse(readFileSync(new URL(file, `file://${process.cwd()}/`), 'utf8'))
const catalog = await fetchCatalog()

const rows = []
const problems = []
for (const item of snapshot.items) {
  const { product, basis: productBasis } = resolveProduct(item.product_name_he, catalog.products)
  if (!product) {
    problems.push(`שורה ${item.source_row}: מוצר "${item.product_name_he}" לא זוהה מול הקטלוג — השורה לא תיובא.`)
    continue
  }
  const { label: sizeLabel, basis: sizeBasis } = resolveSize(item.size_label, product.id, catalog.sizes)
  if (!sizeLabel) {
    problems.push(`שורה ${item.source_row}: ${product.name} — ${sizeBasis} — השורה לא תיובא.`)
    continue
  }
  if (!['smooth', 'speckled'].includes(item.material)) {
    problems.push(`שורה ${item.source_row}: חומר לא מוכר "${item.material}" — השורה לא תיובא.`)
    continue
  }
  const { quantity, basis, verified } = quantityOf(item)
  const overlapAmbiguous = item.formed_quantity_estimated != null
    && item.reported_stock_quantity != null
    && item.stock_overlap_with_formed_quantity === 'unknown'
  rows.push({
    item, product, sizeLabel, quantity, verified, basis, productBasis, sizeBasis, overlapAmbiguous,
  })
}

// --- Hebrew dry-run summary -------------------------------------------------
const line = '─'.repeat(72)
console.log(`\n${line}`)
console.log(`סיכום ייבוא מלאי פיזי — טיוטה (${apply ? 'כתיבה' : 'ייבוא ניסיון, שום דבר לא נכתב'})`)
console.log(`מקור: ${file} · תצלום מלאי ${snapshot.snapshot_date}`)
console.log(line)

for (const row of rows) {
  const flags = [
    row.verified ? 'מאומת' : `${row.basis}${row.item.requires_quantity_confirmation ? ' ⚠ דורש אישור כמות' : ''}`,
    row.overlapAmbiguous ? '⚠ חפיפה לא ודאית בין הנוצרים למלאי המדווח — יובאה הכמות הגדולה מבין השניים (בלי ספירה כפולה)' : '',
  ].filter(Boolean)
  console.log(`\nשורה ${row.item.source_row} · ${row.product.name} · ${row.sizeLabel} · ${row.item.material_he}`)
  console.log(`  כמות לייבוא: ${row.quantity} יחידות (${flags.join(' · ')})`)
  console.log(`  זיהוי: מוצר — ${row.productBasis} · מידה — ${row.sizeBasis}`)
  const created = row.item.formation_date ? `נוצר ${row.item.formation_date}` : 'תאריך יצירה לא רשום'
  const location = row.item.formation_location ? ` · ${row.item.formation_location}` : ''
  console.log(`  ${created}${location} · שלב: נוצר ומיובש — ממתין לשריפה הראשונה (לא הונחה שהתבצעה שריפה)`)
  if (row.item.notes_he) console.log(`  הערות מקור: ${row.item.notes_he}`)
  console.log(`  דרישה מצטברת (לייבוא בלבד, לא נכנס למלאי): ${row.item.ordered_quantity}`)
}

const total = rows.reduce((sum, row) => sum + row.quantity, 0)
const verifiedTotal = rows.filter((row) => row.verified).reduce((sum, row) => sum + row.quantity, 0)
console.log(`\n${line}`)
console.log(`סה״כ יחידות לייבוא: ${total}`)
console.log(`  מתוכן מאומשות: ${verifiedTotal} · מוסקות/מדווחות: ${total - verifiedTotal}`)
if (problems.length) {
  console.log(`\n⚠ שורות שלא ייובאו:`)
  for (const problem of problems) console.log(`  • ${problem}`)
}
console.log(line)

if (!apply) {
  console.log('זו טיוטה בלבד. לכתיבה בפועל הריצו עם --apply\n')
  process.exit(0)
}

// --- Apply ------------------------------------------------------------------
const importTag = `inv-${snapshot.snapshot_date}`
const payload = rows.flatMap((row) => Array.from({ length: row.quantity }, (_, index) => ({
  product_id: row.product.id,
  size_label: row.sizeLabel,
  material: row.item.material,
  stage_id: STAGE_FORMED_DRYING,
  notes: [`יובא מהמלאי ${snapshot.snapshot_date}`, unitNotes(row.item)].filter(Boolean).join(' · '),
  import_ref: `${importTag}:row-${row.item.source_row}:u${index + 1}`,
  created_at: row.item.formation_date ? `${row.item.formation_date}T12:00:00+02:00` : undefined,
})))

// Uniform keys for the bulk upsert (PostgREST requirement) + stable created_at.
const createdFallback = `${snapshot.snapshot_date}T12:00:00+02:00`
const units = payload.map((unit) => ({ ...unit, created_at: unit.created_at ?? createdFallback }))

const response = await fetch(`${BASE}/rest/v1/ceramic_units?on_conflict=import_ref`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
  body: JSON.stringify(units),
})
if (!response.ok) {
  console.error(`כתיבת היחידות נכשלה: ${response.status} ${await response.text()}`)
  process.exit(1)
}
const inserted = await response.json()

// Append a creation event per newly inserted unit (skipped on rerun).
if (inserted.length) {
  const events = inserted.map((unit) => ({
    ceramic_unit_id: unit.id,
    stage_id: STAGE_FORMED_DRYING,
    result: 'created',
    notes: `יובא מהמלאי ההתחלתי (${importTag})`,
  }))
  const eventResponse = await fetch(`${BASE}/rest/v1/production_events`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(events),
  })
  if (!eventResponse.ok) {
    console.error(`רישום אירועי היצירה נכשל: ${eventResponse.status}`)
    process.exit(1)
  }
}

console.log(`\nייובאו ${inserted.length} יחידות חדשות (מתוך ${units.length} בבקשה).`)
console.log(`יחידות שכבר היו קיימות מריצה קודמת: ${units.length - inserted.length} (לא שוכפלו).`)
