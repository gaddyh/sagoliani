// Studio admin end-to-end test (M1 + M2).
//
// Drives the real storefront against the local Supabase stack:
//   1. Customer adds to cart and sends a WhatsApp request (capture path).
//   2. Artist logs into /admin and sees the request on the dashboard.
//   3. Artist opens the order, confirms it (choosing artwork for assorted
//      items) and stock is allocated / production units created.
//   4. The missing artwork mapping appears in the prep queue; saving it
//      (dims prefilled from the vessel's decoration area) flips the order's
//      print to ready, and the print queue marks it printed.
//   5. Inventory: stage filter cards and bulk unit creation.
//   6. Cancel releases the inventory.
//
// Requires: `supabase start`, `node scripts/seed_catalog.mjs`, `npm run dev`.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const baseUrl = process.env.POC_URL || 'http://127.0.0.1:5173'
const adminEmail = process.env.ADMIN_EMAIL || 'irit@sagoliani.art'
const adminPassword = process.env.ADMIN_PASSWORD || 'studio-dev-2026'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// Deterministic artwork used for the mapping leg; its mapping is cleaned up
// before each run so the prep-queue flow is repeatable.
const testArtworkName = 'דק מן הדק' // the vessel's default artwork

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
if (process.env.SUPABASE_SERVICE_KEY) {
  const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
  const headers = { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  // Test residue only: imported real inventory (import_ref set) is never
  // touched. Failures are loud — a silent miss leaves stale stock that
  // breaks the deterministic flow below.
  const phones = ['0520000001', '0520000002', '0529990001', '0529990002', '0501234567', '0508675084']
  for (const phone of phones) {
    const response = await fetch(`${url}/rest/v1/orders?customer_phone=eq.${phone}`, { method: 'DELETE', headers })
    if (response.status >= 400) throw new Error(`cleanup failed (${response.status}): orders ${phone}`)
  }
  for (const path of [
    '/rest/v1/production_events?kiln_batch_id=not.is.null',
    '/rest/v1/kiln_batches?id=neq.00000000-0000-0000-0000-000000000000',
    '/rest/v1/ceramic_units?import_ref=is.null',
    '/rest/v1/artwork_mapping_versions?product_id=eq.yael-bowl&artwork_id=eq.gallery-12',
  ]) {
    const response = await fetch(`${url}${path}`, { method: 'DELETE', headers })
    if (response.status >= 400) throw new Error(`cleanup failed (${response.status}): ${path}`)
  }
}


const browser = await chromium.launch({ executablePath: chrome, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const fail = (message) => { console.error(`✘ ${message}`); process.exitCode = 1 }

try {
  // --- 1. Storefront: capture an order request -----------------------------
  await page.goto(baseUrl)
  await page.getByRole('button', { name: /לצפייה בתבנית יעל/ }).click()
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByLabel('שם', { exact: true }).fill('בדיקה אוטומטית')
  await page.getByLabel('טלפון').fill('052-0000001')
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }))

  const popupPromise = page.waitForEvent('popup', { timeout: 15000 })
  await page.getByRole('button', { name: 'שליחת בקשה בוואטסאפ' }).click()
  const popup = await popupPromise
  await popup.waitForURL((url) => url.href.startsWith('https://wa.me/'))
  const popupUrl = popup.url()
  assert.ok(popupUrl.startsWith('https://wa.me/'), `WhatsApp popup opened: ${popupUrl}`)
  assert.ok(popupUrl.includes('R-'), 'server-issued order number appears in the message')
  const messageText = decodeURIComponent(popupUrl.split('text=')[1] ?? '')
  assert.ok(messageText.includes('הדפסה: 12×15 ס"מ'), 'the order message carries the artwork print size that fits the vessel')
  await popup.close()
  assert.equal(await page.locator('.capture-error').count(), 0, 'no capture error shown')
  console.log('✔ storefront captured the request and opened WhatsApp with a server number')

  // --- 2. Admin: login -------------------------------------------------------
  await page.goto(`${baseUrl}/admin`)
  await page.getByLabel('דוא״ל').fill(adminEmail)
  await page.getByLabel('סיסמה').fill(adminPassword)
  await page.getByRole('button', { name: 'כניסה' }).click()
  await page.getByRole('heading', { name: 'מה אני צריכה לעשות עכשיו?' }).waitFor()
  console.log('✔ artist logged in, dashboard renders')

  // --- 3. The captured request appears and can be confirmed ------------------
  await page.getByRole('link', { name: 'בקשות חדשות לאישור' }).click()
  await page.getByText('בדיקה אוטומטית').first().waitFor()
  await page.getByRole('link', { name: /^R-/ }).first().click()
  await page.getByRole('heading', { name: /הזמנה R-/ }).waitFor()
  console.log('✔ captured request visible in the orders queue and detail page')

  await page.getByRole('button', { name: 'אישור הזמנה' }).click()
  await page.getByRole('button', { name: 'אישור סופי' }).click()
  await page.locator('.sa-notice').getByText('ההזמנה אושרה').waitFor()
  await page.locator('.sa-units li').first().waitFor({ timeout: 15000 })
  console.log('✔ order confirmed and physical units allocated')

  // --- 3b. Print list for the order (aggregated by artwork and size) -------
  await page.getByRole('button', { name: 'רשימת הדפסות להזמנה' }).click()
  const printList = page.locator('.sa-print-list textarea')
  await printList.waitFor()
  const printListText = await printList.inputValue()
  assert.ok(printListText.includes(`רשימת הדפסות · R-`), 'the print list is titled with the order number')
  assert.ok(printListText.includes(`${testArtworkName}: צריכה מהציור הזה 1 יחי'. גובה 15 ורוחה 12 ס"מ.`), `aggregated print line per artwork and size: ${printListText}`)
  await page.getByRole('button', { name: 'העתקה ללוח' }).click()
  await page.getByText('✔ הועתק ללוח').waitFor()
  console.log('✔ order print list aggregates artwork and print size with copy-to-clipboard')

  // --- 3c. Multi-order aggregated print list (orders page) -----------------
  await page.goto(`${baseUrl}/admin/orders`)
  await page.locator('.sa-order-check').first().check()
  await page.getByRole('button', { name: 'רשימת הדפסות מצטברת' }).click()
  const aggregateBox = page.locator('.sa-print-list textarea')
  await aggregateBox.waitFor()
  const aggregateText = await aggregateBox.inputValue()
  assert.ok(aggregateText.includes('רשימת הדפסות מצטברת · 1 הזמנות · R-'), 'aggregate header lists the selected orders')
  assert.ok(aggregateText.includes(`${testArtworkName}: צריכה מהציור הזה 1 יחי'. גובה 15 ורוחה 12 ס"מ.`), 'aggregated line matches the order print list')
  await page.getByRole('button', { name: 'העתקה ללוח' }).click()
  await page.getByText('✔ הועתק ללוח').waitFor()
  console.log('✔ orders page multi-select aggregated print list works')

  // --- 4. Mapping prep queue -> print queue (M2) -----------------------------
  await page.goto(`${baseUrl}/admin/mappings`)
  await page.getByRole('heading', { name: 'שילובי הכנה' }).waitFor()
  await page.locator('.sa-item-row').filter({ hasText: testArtworkName }).getByRole('button', { name: 'הכנה' }).click()
  const widthInput = page.locator('.sa-form-grid input[type="number"]').first()
  await widthInput.waitFor()
  assert.equal(await widthInput.inputValue(), '12', 'print width prefilled from the vessel decoration area')
  await page.getByRole('button', { name: 'שמירת ההכנה' }).click()
  await page.locator('.sa-notice').getByText('ההכנה נשמרה').waitFor()
  console.log('✔ mapping saved with prefilled decoration-area dimensions')

  await page.goto(`${baseUrl}/admin/print`)
  await page.getByRole('heading', { name: 'תור הדפסות' }).waitFor()
  await page.locator('.sa-print-groups > li').filter({ hasText: testArtworkName }).waitFor()
  await page.getByRole('button', { name: 'סימון כל ההדפסות כבוצעו' }).click()
  await page.locator('.sa-notice').getByText('סומנו כבוצעו').waitFor()
  assert.equal(await page.locator('.sa-print-groups > li').count(), 0, 'print queue empties after marking printed')
  console.log('✔ print queue marked printed and emptied')

  // --- 5. Inventory: stage filters + bulk creation (M2) -----------------------
  await page.goto(`${baseUrl}/admin/inventory`)
  await page.getByRole('heading', { name: 'מלאי קרמיקה' }).waitFor()
  await page.locator('.sa-unit-list li').first().waitFor({ timeout: 15000 })
  const before = await page.locator('.sa-unit-list li').count()
  await page.getByRole('button', { name: '+ הוספת יחידות' }).click()
  await page.getByLabel('כמות').fill('2')
  await page.getByLabel("שלב התחלתי").selectOption('שריפה ראשונה')
  await page.getByRole('button', { name: 'הוספת 2 יחידות' }).click()
  await page.locator('.sa-notice').getByText('2 יחידות נוספו').waitFor()
  await page.locator('.sa-unit-list li').first().waitFor()
  assert.equal(await page.locator('.sa-unit-list li').count(), before + 2, 'bulk creation adds the units')
  await page.getByRole('button', { name: /שריפה ראשונה/ }).click()
  await page.locator('.sa-unit-list li').first().waitFor()
  console.log('✔ inventory list, bulk creation and stage filter work')

  // --- 5b. Kiln batch flow (M3) ----------------------------------------------
  await page.goto(`${baseUrl}/admin/kiln`)
  await page.getByRole('heading', { name: 'תנורים' }).waitFor()
  // Deselect everything first — the real imported inventory must never
  // enter a test batch — then select only the two test units.
  const checkedBoxes = page.locator('input.sa-order-check:checked')
  while (await checkedBoxes.count()) await checkedBoxes.first().uncheck()
  const testUnitRows = page.locator('.sa-unit-row').filter({ hasText: 'תבנית לעוגה' }).locator('input')
  for (let i = 0; i < await testUnitRows.count(); i += 1) await testUnitRows.nth(i).check()
  await page.getByRole('button', { name: 'יצירת אצווה (2 כלים)' }).click()
  await page.locator('.sa-notice').getByText('נפתחה אצווה עם 2 כלים').waitFor()
  await page.getByRole('button', { name: 'התחלת שריפה' }).click()
  await page.locator('.sa-notice').getByText('השריפה החלה').waitFor()
  await page.getByRole('button', { name: 'השלמת השריפה' }).click()
  await page.locator('.sa-batch-results .sa-unit-row').nth(1).getByLabel('פסול').check()
  await page.getByRole('button', { name: 'אישור תוצאות השריפה' }).click()
  await page.locator('.sa-notice').getByText('האצווה הושלמה').waitFor()
  await page.getByText('תקינים: 1').waitFor()
  await page.getByText('פסול: 1').waitFor()
  console.log('✔ kiln batch created, fired and completed with per-unit results')

  // --- 6. Cancel releases the inventory ---------------------------------------
  await page.goto(`${baseUrl}/admin/orders`)
  await page.getByRole('link', { name: /^R-/ }).first().click()
  await page.getByRole('button', { name: 'ביטול ההזמנה' }).click()
  await page.getByLabel('סיבת הביטול').fill('בדיקה')
  await page.getByRole('button', { name: 'אישור ביטול' }).click()
  await page.locator('.sa-notice').getByText('ההזמנה בוטלה').waitFor()
  console.log('✔ order cancelled')

  await browser.close()
  console.log('\nStudio admin e2e: all steps passed.')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
  await page.screenshot({ path: 'validation/studio-admin-failure.png', fullPage: true }).catch(() => {})
  await browser.close()
  process.exit()
}
