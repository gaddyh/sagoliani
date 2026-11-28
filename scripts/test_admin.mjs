import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const baseUrl = process.env.POC_URL || 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chrome, headless: true })
const page = await browser.newPage()
const asset = (path) => new URL(`../public/assets/${path}`, import.meta.url)

const OPAQUE_JPEG_BASE64 = [
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7',
  'Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7',
  'Ozs7Ozs7Ozv/wAARCADwAPADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUF',
  'BAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW',
  'V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi',
  '4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC',
  'AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVm',
  'Z2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq',
  '8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzPFLijFOxWRqmJilApcUuKC0wxS4oxS4ploAKXFAFLimWmGKXFLilxQWmIBTsUYpcUy0w',
  'xS4oxS4oLTDFLijFLimWmGKXFLilxQWmIBTsUAUuKZSYYpcUYpcUFpgBS4oxTsUzRMTFKBS4pQKCkwxS4oxS4plphilAoxS4oLTM',
  'DFLijFLisD5RMAKXFGKdimWmJilxS4pcUFphilAoxSgUy0wxS4oxS4oLTDFLilApcUy0xMU7FGKXFBaYAUuKAKXFMtMMUuKMU4Cg',
  'tMTFLilxS4plJhilAoxSgUFphilxRilxTLTDFLilApcUFpiYp2KMUuKZaYAUuKAKXFBaZgYpcUYpcVgfKJhilAoxTsUy0xMUuKXF',
  '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'
].join('')

try {
  await page.goto(`${baseUrl}/admin/assets`)
  await assert.doesNotReject(() => page.getByRole('heading', { name: /מכינים מקום/ }).waitFor())
  await page.getByLabel('שם', { exact: true }).fill('איור בדיקה')
  await page.getByLabel(/איור שקוף או צילום/).setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/PNG, JPEG, WebP/).waitFor()

  await page.getByLabel(/איור שקוף או צילום/).setInputFiles({ name: 'opaque.jpeg', mimeType: 'image/jpeg', buffer: Buffer.from(OPAQUE_JPEG_BASE64, 'base64') })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/רקע מורכב/).waitFor()

  await page.getByLabel(/איור שקוף או צילום/).setInputFiles({ name: 'monkey-flower.jpg', mimeType: 'image/jpeg', buffer: await readFile(new URL('../assets-source/external/monkey-flower.jpg', import.meta.url)) })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/הטיוטה נשמרה/).waitFor()
  await page.getByText(/הרקע הוסר בקירוב/).waitFor()
  const alpha = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('art-in-clay-drafts'); request.onsuccess = () => resolve(request.result); request.onerror = reject })
    const drafts = await new Promise((resolve, reject) => { const request = db.transaction('assets').objectStore('assets').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = reject })
    db.close()
    const bitmap = await createImageBitmap(drafts[0].image)
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, 1, 1).data[3]
  })
  assert.ok(alpha < 100, `light paper corner should be transparent: ${alpha}`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'מחיקת טיוטה' }).click()
  await page.getByText(/עדיין אין טיוטות/).waitFor()
  await page.getByLabel('שם', { exact: true }).fill('איור בדיקה')
  await page.getByLabel(/איור שקוף או צילום/).setInputFiles({ name: 'meadow.png', mimeType: 'image/png', buffer: await readFile(asset('artwork/pink-dance.png')) })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/הטיוטה נשמרה/).waitFor()
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  await page.reload()
  await page.getByRole('button', { name: /איור בדיקה/ }).click()
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'מחיקת טיוטה' }).click()
  await page.getByText(/עדיין אין טיוטות/).waitFor()

  await page.getByRole('button', { name: 'כלי קרמיקה' }).click()
  await page.getByLabel('שם', { exact: true }).fill('קערת בדיקה')
  await page.getByLabel(/צילום כלי ריק/).setInputFiles({ name: 'plate.webp', mimeType: 'image/webp', buffer: await readFile(asset('vessels/shay-clean.webp')) })
  await page.getByLabel(/מסכת אזור קישוט/).setInputFiles({ name: 'meadow.png', mimeType: 'image/png', buffer: await readFile(asset('artwork/pink-dance.png')) })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/באותם ממדים/).waitFor()
  await page.getByLabel(/מסכת אזור קישוט/).setInputFiles({ name: 'plate-mask.png', mimeType: 'image/png', buffer: await readFile(asset('vessels/shay-clean-mask.png')) })
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByRole('status').getByText(/הטיוטה נשמרה/).waitFor()
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  assert.equal(await page.getByRole('button', { name: /קערת בדיקה/ }).count(), 1)
  await page.getByLabel('שם', { exact: true }).fill('קערה ללא מסכה')
  await page.getByLabel(/צילום כלי ריק/).setInputFiles({ name: 'rim-bowl.jpg', mimeType: 'image/jpeg', buffer: await readFile(new URL('../assets-source/external/rim-bowl.jpg', import.meta.url)) })
  await page.getByLabel(/מסכת אזור קישוט/).setInputFiles([])
  await page.getByRole('button', { name: 'עיבוד ושמירה כטיוטה' }).click()
  await page.getByText(/אזור הקישוט הוגדר אוטומטית/).waitFor()
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  const before = await page.locator('.admin-review canvas').evaluate((canvas) => canvas.toDataURL())
  await page.getByLabel('מרכז אנכי').fill('0.42')
  await page.getByLabel('רוחב').fill('0.18')
  await page.getByRole('button', { name: 'שמירת אזור קישוט' }).click()
  await page.getByRole('status').getByText(/אזור הקישוט עודכן/).waitFor()
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  await page.reload()
  await page.getByRole('button', { name: /קערה ללא מסכה/ }).click()
  assert.equal(await page.getByLabel('מרכז אנכי').inputValue(), '0.42')
  assert.equal(await page.getByLabel('רוחב').inputValue(), '0.18')
  await page.waitForFunction(() => document.querySelector('.admin-review canvas')?.width === 750)
  const after = await page.locator('.admin-review canvas').evaluate((canvas) => canvas.toDataURL())
  assert.notEqual(before, after, 'updated region should change rendering')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'admin mobile horizontal overflow')
  console.log('Admin uploads: validation, rendering, draft persistence, deletion and mobile layout OK')
} finally {
  await browser.close()
}
