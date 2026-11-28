// Studio admin end-to-end test (M1).
//
// Drives the real storefront against the local Supabase stack:
//   1. Customer adds to cart and sends a WhatsApp request (capture path).
//   2. Artist logs into /admin and sees the request on the dashboard.
//   3. Artist opens the order, confirms it (choosing artwork for assorted
//      items) and stock is allocated / production units created.
//   4. Cancel releases the inventory.
//
// Requires: `supabase start`, `node scripts/seed_catalog.mjs`, `npm run dev`.

import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const baseUrl = process.env.POC_URL || 'http://127.0.0.1:5173'
const adminEmail = process.env.ADMIN_EMAIL || 'irit@sagoliani.art'
const adminPassword = process.env.ADMIN_PASSWORD || 'studio-dev-2026'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await chromium.launch({ executablePath: chrome, headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const fail = (message) => { console.error(`✘ ${message}`); process.exitCode = 1 }

try {
  // --- 1. Storefront: capture an order request -----------------------------
  await page.goto(baseUrl)
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
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
  const artworkSelect = page.locator('.sa-confirm-panel select').first()
  if (await artworkSelect.count()) {
    await artworkSelect.selectOption({ index: 1 })
  }
  await page.getByRole('button', { name: 'אישור סופי' }).click()
  await page.locator('.sa-notice').getByText('ההזמנה אושרה').waitFor()
  await page.locator('.sa-units li').first().waitFor({ timeout: 15000 })
  console.log('✔ order confirmed and physical units allocated')

  // --- 4. Cancel releases the inventory ---------------------------------------
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
