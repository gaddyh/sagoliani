import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const baseUrl = process.env.POC_URL || 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: chrome, headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(baseUrl)
  assert.match(await page.locator('.hero-logo').getAttribute('src'), /\/assets\/logo\.webp$/, 'the logo should appear above the hero title')
  assert.match(await page.locator('.story-art').getAttribute('src'), /\/assets\/story\.webp$/, 'the story section should be the designed image')
  assert.ok((await page.locator('.product-card').count()) >= 1, 'only products with photographed variants should be listed')
  const shayCard = page.locator('.product-card').filter({ hasText: 'קערת שי' })
  assert.match(await shayCard.locator('.product-label').innerText(), /קערת שי/)
  assert.match(await shayCard.locator('.product-photo img').getAttribute('src'), /shay-bowl\/smooth\/purple-embrace-01\.webp$/)
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  try {
    await page.waitForFunction(() => {
      const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom
      const preview = document.querySelector('.variant-preview').getBoundingClientRect()
      const order = document.querySelector('.purchase-row').getBoundingClientRect()
      return preview.top >= headerBottom && order.top >= 0 && order.bottom <= innerHeight
    }, null, { timeout: 5000 })
  } catch {
    assert.fail('opening a product should auto-scroll to show the artwork choices, the photo and the order row without further scrolling')
  }
  await page.getByRole('radio', { name: 'חלק' }).waitFor()
  assert.equal(await page.getByRole('radio', { name: 'חלק' }).isChecked(), true)
  assert.equal(await page.locator('.finished-option').count(), 0, 'shay-bowl should not show an artwork picker')
  assert.equal(await page.locator('.material-choices .choice-label').innerText(), 'חומר', 'the material row should be labelled חומר')
  assert.equal(await page.locator('.artwork-choices .choice-label').innerText(), 'ציור', 'the artwork row should be labelled ציור')
  assert.ok((await page.locator('.artwork-add').innerText()).includes('בחירת ציור מהגלריה'), 'the plus button should read בחירת ציור מהגלריה')
  assert.equal(await page.evaluate(() => {
    const size = getComputedStyle(document.querySelector('.size-choice'))
    const material = getComputedStyle(document.querySelector('.material-choices .choice-label'))
    const artwork = getComputedStyle(document.querySelector('.artwork-choices .choice-label'))
    const oneLine = (labelSel, controlSel) => {
      const label = document.querySelector(labelSel).getBoundingClientRect()
      const control = document.querySelector(controlSel).getBoundingClientRect()
      return control.right <= label.left + 1 && Math.abs((label.top + label.bottom) / 2 - (control.top + control.bottom) / 2) <= 3
    }
    return size.fontSize === material.fontSize && size.fontSize === artwork.fontSize
      && size.fontFamily === material.fontFamily && size.fontFamily === artwork.fontFamily
      && oneLine('.material-choices .choice-label', '.material-choices label')
      && oneLine('.artwork-choices .choice-label', '.artwork-add')
  }), true, 'the חומר and ציור rows should match the מידה row: one centered line, same label size and font')
  assert.equal(await page.locator('.variant-thumbnails button').count(), 4, 'all existing smooth photos should show as thumbnails')
  assert.match(await page.locator('.variant-preview img').getAttribute('src'), /shay-bowl\/smooth\/purple-embrace-01\.webp$/)
  await page.locator('.variant-thumbnails button').nth(1).click()
  assert.match(await page.locator('.variant-preview img').getAttribute('src'), /shay-bowl\/smooth\/purple-embrace-02\.webp$/)
  await page.getByRole('radio', { name: 'מנוקד' }).check()
  assert.equal(await page.locator('.variant-thumbnails button').count(), 3, 'all existing speckled photos should show as thumbnails')
  assert.match(await page.locator('.variant-preview img').getAttribute('src'), /shay-bowl\/speckled\/purple-embrace-01\.webp$/)
  await page.getByRole('radio', { name: 'חלק' }).check()

  const size = page.locator('.size-choice select')
  assert.deepEqual(await size.locator('option').allInnerTexts(), ['קוטר 16 · 78 ₪', 'קוטר 20 · 88 ₪'], 'size dropdown should list both sizes with prices')
  assert.match(await page.locator('.purchase-row strong').innerText(), /קוטר 16 .*78 ₪/)
  await size.selectOption('קוטר 20')
  assert.match(await page.locator('.purchase-row strong').innerText(), /קוטר 20 .*88 ₪/)
  await page.locator('.purchase-row input').fill('2')
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-total').innerText(), 'סכום מוצרים: 176 ₪')
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.locator('.size-choice select').selectOption('קוטר 16')
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  assert.equal(await page.locator('.cart-items li').count(), 2, 'different sizes of one variant must be separate cart lines')
  assert.equal(await page.locator('.cart-total').innerText(), 'סכום מוצרים: 254 ₪')
  await page.reload()
  assert.equal(await page.locator('.cart-total').innerText(), 'סכום מוצרים: 254 ₪', 'cart must survive reload')

  await page.context().route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }))
  await page.locator('.cart-actions a').click()
  assert.equal(page.context().pages().length, 1, 'invalid order must not open WhatsApp')
  await page.getByLabel('שם', { exact: true }).fill('דנה כהן')
  await page.getByLabel('טלפון').fill('0501234567')
  assert.equal(await page.getByRole('radio', { name: 'איסוף עצמי מבינימינה' }).isChecked(), true, 'בינימינה self pickup should be the default')
  assert.equal(await page.getByRole('radio', { name: 'איסוף עצמי משדה נחמיה' }).count(), 1, 'the שדה נחמיה pickup option should exist')
  await page.getByRole('radio', { name: 'משלוח בתיאום לפי איזור מגורים' }).check()
  const href = await page.locator('.cart-actions a').getAttribute('href')
  assert.match(href, /^https:\/\/wa\.me\/972523894291\?text=/)
  const text = new URL(href).searchParams.get('text')
  for (const part of ['דנה כהן', '0501234567', 'קערת שי', 'מידה: קוטר 20', 'מגוון ציורים', '2 × 88 ₪ = 176 ₪', 'מידה: קוטר 16', '1 × 78 ₪ = 78 ₪', 'סכום מוצרים: 254 ₪', 'אספקה: משלוח בתיאום לפי איזור מגורים', 'אישור זמינות', 'PayBox']) assert.ok(text.includes(part), `missing from order: ${part}`)
  assert.equal(await page.getByRole('button', { name: 'העתקת ההודעה' }).count(), 0, 'the order form should send only via WhatsApp without a copy button')
  await page.locator('.cart-items input').first().fill('1')
  assert.equal(await page.locator('.cart-total').innerText(), 'סכום מוצרים: 166 ₪', 'quantity change must update the line total')
  await page.getByRole('button', { name: 'הסרה' }).first().click()
  assert.equal(await page.locator('.cart-items li').count(), 1)
  assert.equal(await page.locator('.cart-total').innerText(), 'סכום מוצרים: 78 ₪')
  await page.getByRole('button', { name: 'פינוי העגלה' }).click()
  await page.getByText('העגלה עדיין ריקה').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('art-in-clay-cart-v3')), '[]', 'manual clear must empty the stored cart')

  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.locator('.size-choice select').selectOption('קוטר 20')
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  const [whatsappPage] = await Promise.all([page.context().waitForEvent('page'), page.locator('.cart-actions a').click()])
  await whatsappPage.close()
  await page.getByText('העגלה עדיין ריקה').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('art-in-clay-cart-v3')), '[]', 'cart must be cleared after sending')
  await page.context().unroute('https://wa.me/**')

  await page.getByRole('button', { name: /לצפייה במגש אלה/ }).click()
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  const ellaLine = await page.locator('.cart-items li').first().innerText()
  assert.ok(ellaLine.includes('מגש אלה') && !ellaLine.includes('מידה'), 'single-size products should not repeat their size label in the cart')
  const ellaHref = await page.locator('.cart-actions a').getAttribute('href')
  const ellaText = new URL(ellaHref).searchParams.get('text')
  assert.ok(ellaText.includes('מגש אלה | חלק | ציור: ריקוד בשדה') && !ellaText.includes('מידה:'), 'single-size products should not repeat their size label in the order message')
  await page.getByRole('button', { name: 'פינוי העגלה' }).click()
  await page.getByText('העגלה עדיין ריקה').waitFor()

  await page.getByRole('button', { name: /לצפייה במגש עירית/ }).click()
  await page.getByRole('heading', { name: 'מגש עירית' }).waitFor()
  await page.waitForTimeout(900)
  assert.match(await page.locator('.purchase-row strong').innerText(), /מגש עירית חלק \+ ציור לחש ורוד · 155 ₪/, 'the purchase row should name the artwork of the selected photo')
  await page.getByRole('radio', { name: 'מנוקד' }).check()
  assert.match(await page.locator('.purchase-row strong').innerText(), /מגש עירית מנוקד \+ ציור שדה פרחי בר · 155 ₪/, 'switching the material should switch to its first photo artwork')
  await page.locator('.variant-thumbnails button').nth(2).click()
  assert.match(await page.locator('.purchase-row strong').innerText(), /מגש עירית מנוקד \+ ציור לחש ורוד · 155 ₪/, 'switching the photo should switch the artwork name')
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  const iritLine = await page.locator('.cart-items li').first().innerText()
  assert.ok(iritLine.includes('ציור לחש ורוד'), 'the cart line should carry the selected artwork name')
  assert.match(await page.locator('.cart-items li img').first().getAttribute('src'), /pink_whisper\.webp$/, 'the cart line should show the selected artwork photo')
  await page.getByRole('button', { name: 'פינוי העגלה' }).click()
  await page.getByText('העגלה עדיין ריקה').waitFor()

  // --- Custom artwork selection from the existing gallery ---
  const galleryPick = (artworkName) => page.locator('.gallery-grid .gallery-item').filter({ hasText: artworkName }).locator('button.gallery-photo')
  const plusButton = page.locator('.artwork-choices .artwork-add')
  const customThumb = page.locator('.custom-artwork-thumb')

  // the plus button also appears for a variant with a single photograph (irit-platter smooth)
  await page.getByRole('button', { name: /לצפייה במגש עירית/ }).click()
  await page.getByRole('radio', { name: 'חלק' }).check()
  await page.getByRole('heading', { name: 'מגש עירית' }).waitFor()
  assert.equal(await page.locator('.variant-thumbnails button').count(), 0, 'the smooth variant has a single photo, so no photo thumbnails')
  assert.equal(await plusButton.count(), 1, 'the gallery-artwork plus button should appear even with one photograph')
  await page.getByRole('button', { name: 'חזרה לקולקציה' }).first().click()

  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  await page.locator('.size-choice select').selectOption('קוטר 16')
  await page.locator('.purchase-row input').fill('2')
  await page.locator('.variant-thumbnails button').nth(1).click()
  await page.waitForTimeout(400)
  assert.equal(await plusButton.count(), 1, 'the plus button should appear for multi-photo variants too')
  assert.equal(await page.evaluate(() => {
    const thumbs = document.querySelector('.variant-thumbnails').getBoundingClientRect()
    const preview = document.querySelector('.variant-preview').getBoundingClientRect()
    return thumbs.right <= preview.left + 1 && thumbs.bottom > preview.top && preview.right > thumbs.right
  }), true, 'the small photos should sit beside the large image (left side), not above it')
  assert.equal(await page.evaluate(() => {
    const label = document.querySelector('.artwork-choices .choice-label').getBoundingClientRect()
    const plus = document.querySelector('.artwork-add').getBoundingClientRect()
    const preview = document.querySelector('.variant-preview').getBoundingClientRect()
    return plus.right <= label.left + 1 && Math.abs((label.top + label.bottom) / 2 - (plus.top + plus.bottom) / 2) <= 3 && plus.bottom <= preview.top + 2
  }), true, 'the plus button should share the בחירת ציור מהגלריה row and sit above the photo area')

  // entering selection mode scrolls to the gallery artworks and shows the notification
  await plusButton.click()
  await page.locator('.artwork-pick-bar').waitFor()
  assert.ok((await page.locator('.artwork-pick-bar').innerText()).includes('בחרו ציור לקערת שי'), 'the notification should name the product')
  assert.ok((await page.locator('.artwork-pick-bar').innerText()).includes('חלק · קוטר 16 · 78 ₪'), 'the notification should show the current combination')
  assert.ok((await page.locator('.artwork-pick-bar').innerText()).includes('לחצו על הציור שתרצו לשלב בכלי שלכם'), 'the notification should instruct the customer')
  try {
    await page.waitForFunction(() => {
      const bar = document.querySelector('.artwork-pick-bar')?.getBoundingClientRect()
      const header = document.querySelector('.site-header').getBoundingClientRect()
      const grid = document.querySelector('.gallery-grid').getBoundingClientRect()
      return bar && header && grid && grid.top >= 0 && grid.top < innerHeight * 0.5 && grid.top >= bar.bottom - 2 && bar.top >= header.bottom - 1
    }, null, { timeout: 5000 })
  } catch {
    assert.fail('the plus button should scroll to the gallery artworks below the sticky notification, without covering the header')
  }
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.gallery-item') !== null), true, 'focus should move to the gallery artworks for keyboard selection')
  assert.equal(await customThumb.count(), 0, 'no custom thumbnail yet')

  // keyboard selection works: Enter on the focused artwork selects it
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  assert.equal(await page.locator('.artwork-pick-bar').count(), 0, 'selecting an artwork should remove the notification')
  try {
    await page.waitForFunction(() => {
      const header = document.querySelector('.site-header').getBoundingClientRect()
      const title = document.querySelector('#product-title').getBoundingClientRect()
      return title.top >= header.bottom && title.top < innerHeight
    }, null, { timeout: 5000 })
  } catch {
    assert.fail('selecting an artwork should scroll back to the same product')
  }
  assert.equal(await page.getByRole('radio', { name: 'חלק' }).isChecked(), true, 'the material should be preserved')
  assert.equal(await page.locator('.size-choice select').inputValue(), 'קוטר 16', 'the size should be preserved')
  assert.equal(await page.locator('.purchase-row input').inputValue(), '2', 'the quantity should be preserved')
  assert.match(await page.locator('.variant-preview img').getAttribute('src'), /purple-embrace-02\.webp$/, 'the product photograph should stay unchanged')
  assert.match(await customThumb.locator('img').getAttribute('src'), /gallery\/gallery-09\.webp$/, 'the selected artwork should appear as a thumbnail next to the plus button')
  assert.match(await page.locator('.purchase-row strong').innerText(), /עם הציור ״שלל שרב״/, 'the purchase summary should reflect the custom artwork')
  assert.ok(await page.getByText('בחרתם ציור בהזמנה אישית').isVisible(), 'the custom-order note should appear near the photograph')
  assert.equal(await page.evaluate(() => {
    const img = document.querySelector('.custom-artwork-thumb img')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    img.dispatchEvent(event)
    return event.defaultPrevented && img.draggable === false && getComputedStyle(img).userSelect === 'none'
  }), true, 'the custom artwork thumbnail should block the context menu, dragging and selection')

  // selecting another artwork replaces the previous selection
  await plusButton.click()
  await page.locator('.artwork-pick-bar').waitFor()
  await galleryPick('ערב כחול עמוק').click()
  await page.waitForTimeout(400)
  assert.match(await customThumb.locator('img').getAttribute('src'), /gallery\/gallery-02\.webp$/, 'choosing another artwork should replace the selection')
  assert.match(await page.locator('.purchase-row strong').innerText(), /קערת שי · קוטר 16 · חלק · עם הציור ״ערב כחול עמוק״ · 78 ₪/, 'the summary should follow the spec format')

  // cancelling gallery selection preserves the previous artwork
  await plusButton.click()
  await page.locator('.artwork-pick-bar').waitFor()
  await page.locator('.artwork-pick-cancel').click()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('.artwork-pick-bar').count(), 0, 'cancelling should remove the notification')
  assert.match(await customThumb.locator('img').getAttribute('src'), /gallery\/gallery-02\.webp$/, 'cancelling should preserve the previous artwork selection')
  assert.equal(await page.getByRole('heading', { name: 'קערת שי' }).isVisible(), true, 'cancelling should return to the product')

  // removing the custom artwork returns to the photographed selection
  await page.locator('.custom-artwork-remove').click()
  assert.equal(await customThumb.count(), 0, 'the remove button should clear the custom artwork')
  assert.match(await page.locator('.purchase-row strong').innerText(), /\+ ציור/, 'removing the custom artwork should restore the photographed artwork summary')

  // clicking a product photograph clears the custom artwork
  await plusButton.click()
  await galleryPick('ערב כחול עמוק').click()
  await page.waitForTimeout(400)
  await page.locator('.variant-thumbnails button').nth(0).click()
  assert.equal(await customThumb.count(), 0, 'clicking a product photograph should return to the photographed selection')

  // custom order is added to the cart correctly and coexists with a normal order
  await plusButton.click()
  await galleryPick('ערב כחול עמוק').click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-items li').count(), 2, 'normal and custom orders should coexist as separate cart lines')
  const customLine = page.locator('.cart-items li').filter({ hasText: 'ערב כחול עמוק' })
  assert.equal(await customLine.count(), 1, 'exactly one custom line')
  assert.ok((await customLine.innerText()).includes('הזמנה אישית עם הציור ״ערב כחול עמוק״'), 'the custom line should carry the artwork name')
  assert.ok((await customLine.innerText()).includes('מידה קוטר 16 · חלק'), 'the custom line should show size and material')
  assert.ok((await customLine.innerText()).includes('78 ₪ ליחידה'), 'the custom line should use the existing size price')
  assert.match(await customLine.locator('img').first().getAttribute('src'), /purple-embrace-01\.webp$/, 'the custom line should keep the ceramic product photograph')
  assert.match(await customLine.locator('.cart-custom-artwork img').getAttribute('src'), /gallery\/gallery-02\.webp$/, 'the custom line should show the artwork thumbnail resolved from the gallery')
  assert.equal(await page.evaluate(() => {
    const check = (img) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      img.dispatchEvent(event)
      const style = getComputedStyle(img)
      return event.defaultPrevented && img.draggable === false && style.userSelect === 'none' && style.webkitTouchCallout === 'none'
    }
    return check(document.querySelector('.gallery-grid .gallery-item img')) && check(document.querySelector('.cart-custom-artwork img'))
  }), true, 'gallery and cart artwork images should block the context menu, dragging, selection and long-press callouts')

  // a second, different custom artwork on the same product stays a separate line
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  await plusButton.click()
  await galleryPick('מים מתוקים').click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-items li').count(), 3, 'different custom artworks on the same product must stay separate')

  // adding the identical custom combination again increases its quantity
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  await plusButton.click()
  await galleryPick('ערב כחול עמוק').click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'הוספה לעגלה' }).click()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-items li').count(), 3, 'an identical custom combination should merge into its cart line')
  assert.equal(await customLine.locator('input').inputValue(), '3', 'adding the same custom combination twice should increase its quantity')

  // custom artwork selections survive reload
  const beforeReload = await page.locator('.cart-total').innerText()
  await page.reload()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-total').innerText(), beforeReload, 'custom cart lines must survive reload')
  assert.equal(await page.locator('.cart-items li').filter({ hasText: 'הזמנה אישית' }).count(), 2, 'both custom lines should survive reload')
  assert.ok((await page.locator('.cart-items li').filter({ hasText: 'מים מתוקים' }).innerText()).includes('הזמנה אישית'), 'the second custom line should keep its artwork')

  // quantity updates and removal target the correct cart item
  await customLine.locator('input').fill('1')
  await page.waitForTimeout(200)
  await page.locator('.cart-items li').filter({ hasText: 'מים מתוקים' }).locator('input').fill('4')
  await page.waitForTimeout(200)
  assert.equal(await customLine.locator('input').inputValue(), '1', 'quantity updates must target the right line')
  await page.locator('.cart-items li').filter({ hasText: 'מים מתוקים' }).getByRole('button', { name: 'הסרה' }).click()
  assert.equal(await page.locator('.cart-items li').count(), 2, 'removal must remove only the targeted custom line')

  // the WhatsApp message explicitly identifies the custom artwork request
  await page.getByLabel('שם', { exact: true }).fill('דנה כהן')
  await page.getByLabel('טלפון').fill('0501234567')
  const customHref = await page.locator('.cart-actions a').getAttribute('href')
  const customText = new URL(customHref).searchParams.get('text')
  for (const part of [
    'קערת שי | מידה: קוטר 16 | חלק | הזמנה אישית: מבקש/ת את הכלי עם הציור ״ערב כחול עמוק״ במקום הציור שבתמונה',
    'קוד כלי: shay-bowl-smooth | קוד ציור: gallery-02',
    'ציור: מגוון ציורים',
  ]) assert.ok(customText.includes(part), `missing from custom order: ${part}`)

  // previously stored cart items remain compatible, and invalid custom ids are dropped
  await page.evaluate(() => localStorage.setItem('art-in-clay-cart-v3', JSON.stringify([
    { variantId: 'shay-bowl-smooth', sizeLabel: 'קוטר 16', artworkName: 'מגוון ציורים', image: '/assets/products/shay-bowl/smooth/purple-embrace-01.webp', quantity: 1 },
    { variantId: 'shay-bowl-smooth', sizeLabel: 'קוטר 16', artworkName: 'ערב כחול עמוק', image: '/assets/products/shay-bowl/smooth/purple-embrace-01.webp', quantity: 1 },
  ])))
  await page.reload()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-items li').count(), 2, 'legacy stored items should restore as-is')
  assert.equal(await page.locator('.cart-items li').filter({ hasText: 'הזמנה אישית' }).count(), 0, 'legacy items are never re-labelled as custom orders')
  await page.evaluate(() => localStorage.setItem('art-in-clay-cart-v3', JSON.stringify([
    { variantId: 'shay-bowl-smooth', sizeLabel: 'קוטר 16', artworkName: 'ערב כחול עמוק', image: '/assets/products/shay-bowl/smooth/purple-embrace-01.webp', quantity: 1, customArtworkId: 'gallery-02' },
    { variantId: 'shay-bowl-smooth', sizeLabel: 'קוטר 16', artworkName: 'ערב כחול עמוק', image: '/assets/products/shay-bowl/smooth/purple-embrace-01.webp', quantity: 2 },
  ])))
  await page.reload()
  await page.getByText('סכום מוצרים:', { exact: false }).first().waitFor()
  assert.equal(await page.locator('.cart-items li').count(), 2, 'a normal and a custom line with the same artwork name must stay separate')
  await page.evaluate(() => localStorage.setItem('art-in-clay-cart-v3', JSON.stringify([
    { variantId: 'shay-bowl-smooth', sizeLabel: 'קוטר 16', artworkName: 'ערב כחול עמוק', image: '/assets/products/shay-bowl/smooth/purple-embrace-01.webp', quantity: 1, customArtworkId: 'gallery-99' },
  ])))
  await page.reload()
  await page.getByText('העגלה עדיין ריקה').waitFor()
  assert.equal(await page.evaluate(() => localStorage.getItem('art-in-clay-cart-v3')), '[]', 'an invalid custom artwork id must be dropped, not converted to a normal order')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /לצפייה בקערת שי/ }).click()
  await page.getByRole('radio', { name: 'חלק' }).waitFor()
  await page.locator('.size-choice select').selectOption('קוטר 20')
  assert.match(await page.locator('.purchase-row strong').innerText(), /קוטר 20 .*88 ₪/)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow')
  await page.locator('.artwork-choices .artwork-add').click()
  await page.locator('.artwork-pick-bar').waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow with the pick bar')
  await page.locator('.gallery-grid .gallery-item').filter({ hasText: 'ערב כחול עמוק' }).locator('button.gallery-photo').click()
  await page.getByRole('heading', { name: 'קערת שי' }).waitFor()
  assert.match(await page.locator('.purchase-row strong').innerText(), /עם הציור ״ערב כחול עמוק״/, 'mobile selection should update the summary')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow with the custom thumbnail')
  await page.setViewportSize({ width: 360, height: 640 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'small mobile horizontal overflow')
  console.log('Shop: published products, material radios, size dropdown, cart lines per size, WhatsApp order, mobile: OK')
} finally {
  await browser.close()
}
