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

const openTab = (name) => page.getByRole('tab', { name, exact: true }).click()

try {
  for (const vessel of ['ai-round-plate', 'ai-oval-plate', 'ai-rect-platter']) {
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
  await openTab('איור')
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
  await page.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
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
  await openTab('גודל וסיבוב')
  await page.locator('.custom-placement-note').waitFor()
  const draggedUrl = page.url()
  await page.reload()
  await waitForPreview()
  assert.equal(page.url(), draggedUrl, 'custom placement not restored from URL')
  await openTab('גודל וסיבוב')
  await page.locator('.custom-placement-note').waitFor()
  await page.getByRole('button', { name: /חזרה למרכז/ }).click()
  await waitForPreview()
  assert.doesNotMatch(page.url(), /pos=/, 'custom pos not cleared on reset')
  console.log('Free drag, URL persistence, reload restore and reset: OK')

  const outsideMask = (vesselId) => page.locator('canvas').evaluate(async (canvas, id) => {
    const mask = new Image()
    mask.src = `/assets/vessels/${id}-mask.png`
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
  }, vesselId)
  for (const [vessel, artwork, size, rot] of [['ai-round-plate', 'meadow', 150, 90], ['ai-oval-plate', 'spring', 150, -90], ['ai-rect-platter', 'ai-lavender', 150, 45], ['ai-oval-plate', 'ai-anemones', 60, -60]]) {
    await page.goto(`${baseUrl}/?collection=${artwork.startsWith('ai-') ? 'external' : 'original'}&vessel=${vessel}&artwork=${artwork}&preset=center&size=${size}&rot=${rot}`)
    await waitForPreview()
    await openTab('גודל וסיבוב')
    assert.equal(await page.locator('#artwork-size').inputValue(), String(size), 'size not restored from URL')
    assert.equal(await page.locator('#artwork-rotation').inputValue(), String(rot), 'rotation not restored from URL')
    await page.getByRole('button', { name: 'לפני' }).click()
    await waitForPreview()
    await page.locator('canvas').evaluate((canvas) => { window.__before = new Uint8ClampedArray(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) })
    await page.getByRole('button', { name: 'אחרי' }).click()
    await waitForPreview()
    const metrics = await outsideMask(vessel)
    assert.ok(metrics.changed > 30, `${vessel}/${artwork} size ${size} rot ${rot} has no visible rendering`)
    assert.equal(metrics.outside, 0, `${vessel}/${artwork} size ${size} rot ${rot} renders outside mask`)
    await page.reload()
    await waitForPreview()
    assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), metrics.signature, `${vessel}/${artwork} size ${size} rot ${rot} is not reproducible`)
    console.log(`${vessel}/${artwork} size ${size}% rotation ${rot}°: ${metrics.changed} changed pixels, 0 outside mask, reproducible`)
  }

  await page.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
  await waitForPreview()
  const straight = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
  await openTab('גודל וסיבוב')
  await page.locator('#artwork-rotation').fill('30')
  await waitForPreview()
  assert.match(page.url(), /rot=30/)
  assert.notEqual(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), straight, 'rotation did not change the preview')
  await page.getByRole('button', { name: 'סיבוב ימינה ב־15 מעלות' }).click()
  assert.match(page.url(), /rot=45/)
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'סיבוב שמאלה ב־15 מעלות' }).click({ force: true })
  assert.match(page.url(), /rot=-90/, 'rotation should stop at -90')
  assert.equal(await page.getByRole('button', { name: 'סיבוב שמאלה ב־15 מעלות' }).isDisabled(), true)
  await page.locator('#artwork-size').fill('130')
  await waitForPreview()
  assert.match(page.url(), /size=130/)
  await openTab('סיכום')
  assert.match(await page.locator('.summary-card').innerText(), /130%.*90°\u2069? שמאלה/s)
  await openTab('גודל וסיבוב')
  await page.getByRole('button', { name: /איפוס גודל וסיבוב/ }).click()
  await waitForPreview()
  assert.doesNotMatch(page.url(), /size=|rot=/)
  assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), straight, 'reset should restore the original preview')
  assert.equal(await page.locator('.preset-grid').count(), 0, 'preset buttons should be removed')
  await page.locator('#artwork-rotation').fill('-20')
  await openTab('סיכום')
  await page.getByRole('button', { name: /מתחילים מחדש/ }).click()
  await waitForPreview()
  assert.doesNotMatch(page.url(), /rot=/, 'starting over should reset rotation')
  await page.goto(`${baseUrl}/?collection=original&vessel=ai-oval-plate&artwork=spring&preset=offset`)
  await waitForPreview()
  assert.match(page.url(), /preset=offset/, 'old links with a preset should still open')
  console.log('Size and rotation controls, limits, URL state, summary and reset: OK')

  assert.ok(await page.getByRole('button', { name: /הורד.*PNG/ }).isEnabled(), 'download button disabled')
  const blobSize = await page.locator('canvas').evaluate(async (canvas) => {
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob?.size ?? 0), 'image/png'))
  })
  assert.ok(blobSize > 10000, `canvas PNG blob too small: ${blobSize}`)
  const downloadNames = await page.evaluate(async () => {
    const names = []
    const original = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { if (this.download) names.push(this.download); else original.call(this) }
    const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label')?.includes('PNG'))
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 1100))
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 300))
    HTMLAnchorElement.prototype.click = original
    return names
  })
  assert.equal(downloadNames.length, 2, 'two downloads expected')
  for (const name of downloadNames) assert.match(name, /^art-in-clay_.+_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/, `download name should end with a timestamp: ${name}`)
  assert.notEqual(downloadNames[0], downloadNames[1], 'downloads a second apart should get different names')
  console.log(`Download PNG button enabled, canvas blob: ${blobSize} bytes, timestamped names (${downloadNames[1]}): OK`)

  await page.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
  await waitForPreview()
  await page.locator('canvas').scrollIntoViewIfNeeded()
  const decorated = await page.locator('canvas').evaluate((canvas) => canvas.toDataURL())
  const holdBox = await page.locator('canvas').boundingBox()
  await page.mouse.move(holdBox.x + holdBox.width / 2, holdBox.y + holdBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(900)
  await waitForPreview()
  assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), decorated, 'holding the preview must keep the artwork visible')
  await page.mouse.up()
  assert.doesNotMatch(page.url(), /pos=/, 'a press without moving must not move the artwork')
  await page.getByRole('button', { name: 'לפני' }).click()
  await waitForPreview()
  assert.notEqual(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), decorated, 'the before button should still show the empty vessel')
  await page.getByRole('button', { name: 'אחרי' }).click()
  await waitForPreview()
  assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.toDataURL()), decorated, 'the after button should bring the artwork back')
  console.log('Holding the preview keeps the artwork; before/after buttons: OK')

  const fitsOnScreen = async (label) => {
    await page.locator('#studio-editor').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect()
      return { h: innerHeight, canvas: box('canvas'), tabs: box('.editor-tabs'), body: box('.editor-body'), header: document.querySelector('.site-header').getBoundingClientRect() }
    })
    assert.ok(r.canvas.top >= r.header.bottom - 1, `${label}: preview hidden under the header`)
    for (const key of ['canvas', 'tabs', 'body']) assert.ok(r[key].bottom <= r.h + 1 && r[key].top >= 0, `${label}: ${key} does not fit on screen`)
    assert.ok(r.canvas.height > r.h * .3, `${label}: preview too small (${Math.round(r.canvas.height)}px)`)
  }
  for (const name of ['כלי', 'איור', 'גודל וסיבוב', 'סיכום']) { await openTab(name); await fitsOnScreen(`desktop ${name}`) }
  console.log('Desktop: preview and every tab fit on one screen: OK')

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const touchPage = await touchContext.newPage()
  await touchPage.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
  await touchPage.waitForFunction(() => document.querySelector('canvas')?.width === 750 && !document.querySelector('.preview-loading'))
  await touchPage.locator('#studio-editor').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await touchPage.waitForTimeout(800)
  await touchPage.locator('#studio-editor').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  const touchBox = await touchPage.locator('canvas').boundingBox()
  const cdp = await touchContext.newCDPSession(touchPage)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
  const cx = touchBox.x + touchBox.width / 2
  const cy = touchBox.y + touchBox.height / 2
  const fingers = (spread, degrees, shiftX = 0, shiftY = 0) => {
    const radians = degrees * Math.PI / 180
    const dx = Math.cos(radians) * spread / 2
    const dy = Math.sin(radians) * spread / 2
    return [[cx + shiftX - dx, cy + shiftY - dy], [cx + shiftX + dx, cy + shiftY + dy]]
  }
  const params = () => new URL(touchPage.url()).searchParams
  const scrollStart = await touchPage.evaluate(() => scrollY)
  await touch('touchStart', [fingers(100, 0)[0]])
  await touch('touchStart', fingers(100, 0))
  for (let step = 1; step <= 10; step++) await touch('touchMove', fingers(100 + step * 3, step * 3, step * 2, step))
  await touchPage.waitForTimeout(150)
  assert.equal(params().get('size'), '130', `pinch should grow to 130%: ${params().get('size')}`)
  assert.equal(params().get('rot'), '30', `twist should rotate 30°: ${params().get('rot')}`)
  assert.ok(params().get('pos'), 'moving two fingers should move the artwork')
  const afterPinch = params().get('pos').split(',').map(Number)
  const [stay, lifted] = fingers(130, 30, 20, 10)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: lifted[0], y: lifted[1], id: 1 }] })
  for (let step = 1; step <= 6; step++) await touch('touchMove', [[stay[0] + step * 5, stay[1]]])
  await touch('touchEnd', [])
  await touchPage.waitForTimeout(150)
  const afterDrag = params().get('pos').split(',').map(Number)
  assert.ok(afterDrag[0] > afterPinch[0] && Math.abs(afterDrag[1] - afterPinch[1]) < .001, 'the remaining finger should keep dragging without a jump')
  assert.equal(params().get('size'), '130', 'lifting a finger must not change the size')
  for (let step = 0; step <= 20; step++) await touch(step ? 'touchMove' : 'touchStart', fingers(step ? 100 + step * 20 : 100, step ? -step * 8 : 0))
  await touch('touchEnd', [])
  await touchPage.waitForTimeout(150)
  assert.equal(params().get('size'), '150', 'pinch must stop at 150%')
  assert.equal(params().get('rot'), '-90', 'twist must stop at -90°')
  assert.equal(await touchPage.evaluate(() => scrollY), scrollStart, 'gestures on the preview must not scroll the page')
  assert.equal(await touchPage.locator('.hint-touch').isVisible(), true, 'touch hint should show on phones')
  await touchContext.close()
  console.log('Two-finger pinch, twist and move, finger hand-off, limits and no page scroll: OK')

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
  await waitForPreview()
  await page.locator('#studio-editor').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  const wheelBox = await page.locator('canvas').boundingBox()
  await page.mouse.move(wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -30)
  await page.keyboard.up('Control')
  await page.waitForTimeout(150)
  const pinchedSize = Number(new URL(page.url()).searchParams.get('size'))
  assert.ok(pinchedSize > 100, `trackpad pinch (ctrl + wheel) should enlarge: ${pinchedSize}`)
  console.log(`Trackpad pinch on desktop: size ${pinchedSize}%: OK`)

  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ['כלי', 'איור', 'גודל וסיבוב', 'סיכום']) { await openTab(name); await fitsOnScreen(`phone ${name}`) }
  await page.setViewportSize({ width: 360, height: 640 })
  for (const name of ['כלי', 'איור', 'גודל וסיבוב', 'סיכום']) { await openTab(name); await fitsOnScreen(`small phone ${name}`) }
  console.log('Phones (390×844, 360×640): preview and every tab fit on one screen: OK')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/?collection=original&vessel=ai-round-plate&artwork=meadow&preset=center`)
  await waitForPreview()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow')
  await page.getByRole('button', { name: /צלחת אובאלית גלית/ }).click()
  await waitForPreview()
  await openTab('איור')
  await page.getByRole('button', { name: /פריחת אביב/ }).click()
  await waitForPreview()
  await openTab('גודל וסיבוב')
  await page.locator('#artwork-size').fill('120')
  await waitForPreview()
  assert.match(page.url(), /vessel=ai-oval-plate&artwork=spring&preset=center&size=120/)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow with controls')
  await page.screenshot({ path: new URL('mobile-blue-spring-size.png', output).pathname, fullPage: true })
  console.log('Mobile selection, size control, URL state and overflow: OK')
} finally {
  await browser.close()
}
