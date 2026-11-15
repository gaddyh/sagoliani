import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const baseUrl = process.env.POC_URL || 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chrome, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
const output = new URL('../validation/', import.meta.url)
await mkdir(output, { recursive: true })

async function waitForPreview() {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    return canvas?.width === 750 && !document.querySelector('.preview-loading')
  })
}

try {
  for (const vessel of ['turquoise', 'blue']) {
    for (const artwork of ['meadow', 'spring', 'garden', 'wildflowers']) {
      await page.goto(`${baseUrl}/?collection=original&vessel=${vessel}&artwork=${artwork}&preset=center`)
      await waitForPreview()
      await page.getByRole('button', { name: 'לפני' }).click()
      await waitForPreview()
      await page.locator('canvas').evaluate((canvas) => {
        window.__before = new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
      })
      await page.getByRole('button', { name: 'אחרי' }).click()
      await waitForPreview()
      const metrics = await page.locator('canvas').evaluate(async (canvas, vesselId) => {
        const mask = new Image()
        mask.src = `/assets/vessels/${vesselId}-mask.png`
        await mask.decode()
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = canvas.width
        maskCanvas.height = canvas.height
        maskCanvas.getContext('2d').drawImage(mask, 0, 0, canvas.width, canvas.height)
        const maskData = maskCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let changed = 0
        let outside = 0
        for (let i = 0; i < after.length; i += 4) {
          if (Math.abs(after[i] - window.__before[i]) + Math.abs(after[i + 1] - window.__before[i + 1]) + Math.abs(after[i + 2] - window.__before[i + 2]) < 2) continue
          changed++
          if (maskData[i] === 0) outside++
        }
        return { changed, outside, signature: canvas.toDataURL() }
      }, vessel)
      assert.ok(metrics.changed > 30, `${vessel}/${artwork} has no visible rendering`)
      assert.equal(metrics.outside, 0, `${vessel}/${artwork} renders outside mask`)
      await page.screenshot({ path: new URL(`${vessel}-${artwork}.png`, output).pathname })
      await page.getByRole('button', { name: 'לפני' }).click()
      await waitForPreview()
      await page.getByRole('button', { name: 'אחרי' }).click()
      await waitForPreview()
      const repeated = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      assert.equal(metrics.signature, repeated, `${vessel}/${artwork} is not reproducible`)
      console.log(`${vessel}/${artwork}: ${metrics.changed} changed pixels, ${metrics.outside} outside mask, deterministic`)
    }
  }

  for (const vessel of ['ai-round-plate', 'ai-oval-plate', 'ai-rect-platter']) {
    for (const artwork of ['monkey-flower', 'gentian', 'poppy', 'ai-anemones', 'ai-blue-sprig', 'ai-poppies', 'ai-lavender']) {
      await page.goto(`${baseUrl}/?collection=external&vessel=${vessel}&artwork=${artwork}&preset=center`)
      await waitForPreview()
      await page.getByRole('button', { name: 'לפני' }).click()
      await waitForPreview()
      await page.locator('canvas').evaluate((canvas) => {
        window.__before = new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
      })
      await page.getByRole('button', { name: 'אחרי' }).click()
      await waitForPreview()
      const metrics = await page.locator('canvas').evaluate(async (canvas, vesselId) => {
        const mask = new Image()
        mask.src = `/assets/vessels/${vesselId}-mask.png`
        await mask.decode()
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = canvas.width
        maskCanvas.height = canvas.height
        maskCanvas.getContext('2d').drawImage(mask, 0, 0, canvas.width, canvas.height)
        const maskData = maskCanvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let changed = 0
        let outside = 0
        for (let i = 0; i < after.length; i += 4) {
          if (Math.abs(after[i] - window.__before[i]) + Math.abs(after[i + 1] - window.__before[i + 1]) + Math.abs(after[i + 2] - window.__before[i + 2]) < 2) continue
          changed++
          if (maskData[i] === 0) outside++
        }
        return { changed, outside, signature: canvas.toDataURL() }
      }, vessel)
      assert.ok(metrics.changed > 30, `${vessel}/${artwork} has no visible rendering`)
      assert.equal(metrics.outside, 0, `${vessel}/${artwork} renders outside mask`)
      await page.screenshot({ path: new URL(`${vessel}-${artwork}.png`, output).pathname })
      await page.getByRole('button', { name: 'לפני' }).click()
      await waitForPreview()
      await page.getByRole('button', { name: 'אחרי' }).click()
      await waitForPreview()
      const repeated = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
      assert.equal(metrics.signature, repeated, `${vessel}/${artwork} is not reproducible`)
      console.log(`${vessel}/${artwork}: ${metrics.changed} changed pixels, ${metrics.outside} outside mask, deterministic`)
    }
  }

  await page.goto(`${baseUrl}/?collection=external`)
  await waitForPreview()
  assert.equal(await page.getByRole('button', { name: /צלחת שוליים גליים/ }).count(), 1, 'external vessel chip missing')
  assert.equal(await page.getByRole('button', { name: /פרח קוף/ }).count(), 1, 'external artwork chip missing')
  await page.getByRole('button', { name: /נכסי בדיקה חיצוניים/ }).click()
  await page.getByRole('heading', { name: /מקורות ורישיונות/ }).waitFor()
  console.log('External collection toggle, chips and credits section: OK')

  await page.goto(`${baseUrl}/`)
  await waitForPreview()
  assert.equal(await page.locator('.product-card').count(), 8, 'catalog should list 8 brochure products')
  await page.screenshot({ path: new URL('page-full.png', output).pathname, fullPage: true })
  console.log('Brochure page sections and catalog: OK')

  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(`${baseUrl}/?collection=original&vessel=turquoise&artwork=meadow&preset=center`)
  await waitForPreview()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  const canvasBox = await page.locator('canvas').boundingBox()
  const centerX = canvasBox.x + canvasBox.width / 2
  const centerY = canvasBox.y + canvasBox.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 120, centerY + 80, { steps: 8 })
  await page.mouse.up()
  await waitForPreview()
  assert.match(page.url(), /pos=/, 'custom drag did not persist in URL')
  await page.locator('.custom-placement-note').waitFor()
  const draggedUrl = page.url()
  await page.reload()
  await waitForPreview()
  assert.equal(page.url(), draggedUrl, 'custom placement not restored from URL')
  await page.locator('.custom-placement-note').waitFor()
  await page.getByRole('button', { name: /חזרה לפריסט/ }).click()
  await waitForPreview()
  assert.doesNotMatch(page.url(), /pos=/, 'custom pos not cleared on reset')
  console.log('Free drag, URL persistence, reload restore and reset: OK')

  assert.ok(await page.getByRole('button', { name: /הורד.*PNG/ }).isEnabled(), 'download button disabled')
  const blobSize = await page.locator('canvas').evaluate(async (canvas) => {
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob?.size ?? 0), 'image/png'))
  })
  assert.ok(blobSize > 10000, `canvas PNG blob too small: ${blobSize}`)
  console.log(`Download PNG button enabled, canvas blob: ${blobSize} bytes: OK`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/?collection=original&vessel=turquoise&artwork=meadow&preset=center`)
  await waitForPreview()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow')
  await page.getByRole('button', { name: /קערת כחול עמוק/ }).click()
  await waitForPreview()
  await page.getByRole('button', { name: /פריחת אביב/ }).click()
  await waitForPreview()
  await page.getByRole('button', { name: /מעט הצידה/ }).click()
  await waitForPreview()
  assert.match(page.url(), /vessel=blue&artwork=spring&preset=offset/)
  await page.screenshot({ path: new URL('mobile-blue-spring-offset.png', output).pathname, fullPage: true })
  console.log('Mobile selection, preset switching, URL state and overflow: OK')
} finally {
  await browser.close()
}
