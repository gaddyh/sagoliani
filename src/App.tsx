import { useEffect, useRef, useState } from 'react'
import Ornament from './components/Ornament'
import { artists, availableVariants, displayVariant, priceLabel, publishedProducts, sizeOf, type Material, type Product } from './data/products'

type CartItem = { variantId: string; sizeLabel: string; quantity: number }
const EFRAT = artists.find((artist) => artist.name.startsWith('אפרת'))!
const materialName: Record<Material, string> = { smooth: 'חלק', speckled: 'מנוקד' }
const cartKey = 'art-in-clay-cart-v3'

function restoreCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(cartKey) || '[]')
    if (!Array.isArray(stored)) return []
    const seen = new Set<string>()
    return stored.filter((item): item is CartItem => {
      const variant = availableVariants.find((entry) => entry.id === item?.variantId)
      const product = variant && publishedProducts.find((entry) => entry.id === variant.productId)
      if (!product || !product.sizes.some((size) => size.label === item.sizeLabel) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || seen.has(item.variantId + item.sizeLabel)) return false
      seen.add(item.variantId + item.sizeLabel)
      return true
    })
  } catch {
    return []
  }
}

function detailsOf(items: CartItem[]) {
  return items.flatMap((item) => {
    const variant = availableVariants.find((entry) => entry.id === item.variantId)
    const entry = variant && publishedProducts.find((entry) => entry.id === variant.productId)
    return variant && entry ? [{ ...item, variant, product: entry, size: sizeOf(entry, item.sizeLabel) }] : []
  })
}

function App() {
  const [product, setProduct] = useState<Product | null>(null)
  const [material, setMaterial] = useState<Material>('smooth')
  const [sizeLabel, setSizeLabel] = useState('')
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [cart, setCart] = useState<CartItem[]>(restoreCart)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup')
  const [notes, setNotes] = useState('')
  const orderForm = useRef<HTMLFormElement>(null)
  const productSection = useRef<HTMLElement>(null)
  const pendingProductScroll = useRef(false)

  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)) } catch { return }
  }, [cart])

  function scrollProductIntoView() {
    requestAnimationFrame(() => {
      const image = productSection.current?.querySelector<HTMLImageElement>('.variant-preview img')
      if (image && !image.complete) return
      pendingProductScroll.current = false
      const order = productSection.current?.querySelector<HTMLElement>('.purchase-row')
      if (order) window.scrollTo({ top: order.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 12, behavior: 'smooth' })
      else productSection.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }

  function openProduct(next: Product) {
    const first = displayVariant(next)
    if (!first) return
    setProduct(next)
    setMaterial(first.material)
    setSizeLabel(next.sizes[0].label)
    setSelectedVariant(first.id)
    setSelectedImage(0)
    setQuantity(1)
    pendingProductScroll.current = true
    scrollProductIntoView()
  }

  function chooseMaterial(next: Material) {
    setMaterial(next)
    setSelectedVariant(availableVariants.find((variant) => variant.productId === product?.id && variant.material === next)?.id ?? null)
    setSelectedImage(0)
  }

  const visibleVariants = availableVariants.filter((variant) => variant.productId === product?.id && variant.material === material)
  const chosenVariant = visibleVariants.find((variant) => variant.id === selectedVariant)
  const activeSize = product ? sizeOf(product, sizeLabel) : null
  const cartDetails = detailsOf(cart)
  const total = cartDetails.reduce((sum, item) => sum + item.size.price * item.quantity, 0)
  const itemCount = cartDetails.reduce((sum, item) => sum + item.quantity, 0)

  function addToCart() {
    if (!chosenVariant || !activeSize) return
    setCart((items) => {
      const existing = items.find((item) => item.variantId === chosenVariant.id && item.sizeLabel === activeSize.label)
      if (existing) return items.map((item) => item.variantId === chosenVariant.id && item.sizeLabel === activeSize.label ? { ...item, quantity: Math.min(99, item.quantity + quantity) } : item)
      return [...items, { variantId: chosenVariant.id, sizeLabel: activeSize.label, quantity }]
    })
    document.getElementById('cart')?.scrollIntoView({ behavior: 'smooth' })
  }

  function updateCart(variantId: string, cartSize: string, next: number) {
    setCart((items) => items.map((item) => item.variantId === variantId && item.sizeLabel === cartSize ? { ...item, quantity: Math.max(1, Math.min(99, next)) } : item))
  }

  const message = [
    `שלום, אשמח לבדוק הזמנה מ-ART IN CLAY.`,
    `שם: ${name.trim()}`,
    `טלפון: ${phone.trim()}`,
    ...cartDetails.map(({ variant, product: entry, size, quantity: count }) => `${entry.name}${entry.sizes.length > 1 ? ` | מידה: ${size.label}` : ''} | ${materialName[variant.material]} | ציור: ${variant.artworkName} | ${count} × ${size.price} ₪ = ${count * size.price} ₪ (קוד: ${variant.id})`),
    `סכום מוצרים: ${total} ₪ (לא כולל משלוח)`,
    `אספקה: ${delivery === 'pickup' ? 'איסוף עצמי' : 'משלוח — לתיאום מחיר ופרטים'}`,
    ...(notes.trim() ? [`הערות: ${notes.trim()}`] : []),
    'אבקש אישור זמינות, מחיר סופי וקישור PayBox לתשלום לאחר האישור.',
  ].join('\n')
  const whatsapp = `https://wa.me/${EFRAT.whatsapp}?text=${encodeURIComponent(message)}`

  function validOrder(): boolean {
    return Boolean(cartDetails.length && orderForm.current?.reportValidity())
  }

  function clearCart() {
    setCart([])
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="ART IN CLAY, לראש העמוד">
            <span className="brand-name" dir="ltr">ART IN CLAY</span>
            <span className="brand-rule" />
            <span className="brand-caption">כשהחומר פוגש את המכחול</span>
          </a>
          <nav className="site-nav" aria-label="ניווט ראשי">
            <a href="#collection">הקולקציה</a>
            <a href="#before-ordering">לפני שמזמינים</a>
            <a href="#contact">צרו קשר</a>
            {import.meta.env.DEV && <a className="admin-back" href="/admin">הכנת נכסים ↗</a>}
          </nav>
          <div className="cart-tools">
            <a className="cart-link" href="#cart" aria-label={`עגלת קניות, ${itemCount} פריטים`}>עגלה <span aria-hidden="true">({itemCount})</span></a>
            {itemCount > 0 && <button type="button" className="clear-cart" onClick={clearCart}>פינוי העגלה</button>}
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero page-content">
          <div className="hero-text">
            <h1 className="hero-title" dir="ltr">ART IN CLAY</h1>
            <p className="hero-tagline">כשהחומר פוגש את המכחול</p>
            <p className="hero-names">עירית סגול ואפרת ליאני</p>
            <Ornament />
            <p className="hero-copy">קולקציה ייחודית המחברת בין עבודות יד וקדרות בקרמיקה לציורי מים מקוריים. בחרו כלי, חומר וציור מתוך צילומי המוצרים המוגמרים.</p>
            <div className="hero-actions"><a className="primary-link" href="#collection">לקולקציה</a></div>
          </div>
          <div className="hero-image"><img src="/assets/hero.webp" alt="כלי קרמיקה בעבודת יד עם ציורי פרחים בצבעי מים" /></div>
          <img className="hero-sprig" src="/assets/brochure/sprig.webp" alt="" aria-hidden="true" />
        </section>

        <section className="story page-content" aria-labelledby="story-title">
          <h2 id="story-title" className="section-title">רגע של חיבור</h2>
          <Ornament />
          <p>חברות שיצרה אומנות משותפת. קולקציה ייחודית המחברת בין עבודות יד וקדרות בקרמיקה לציורי מים מקוריים.</p>
          <p>כל פריט הוא <span dir="ltr">One of a Kind</span>. ייתכנו הבדלים במידות, בצורה, בגוונים ובעיטור בין הפריטים.</p>
        </section>

        <section id="collection" className="collection page-content" aria-labelledby="collection-title">
          <h2 id="collection-title" className="section-title">הקולקציה</h2>
          <Ornament />
          {publishedProducts.length ? <div className="collection-grid">
            {publishedProducts.map((entry) => {
              const variant = displayVariant(entry)!
              return <article key={entry.id} className="product-card">
                <button type="button" className="product-open" onClick={() => openProduct(entry)} aria-label={`לצפייה ב${entry.name}`}>
                  <span className="product-photo"><img src={variant.images[0]} alt={`${entry.name}, ${materialName[variant.material]}, ציור ${variant.artworkName}`} loading="lazy" /></span>
                  <span className="product-label"><strong>{entry.name}</strong><span>{entry.detail} | {priceLabel(entry)}</span></span>
                  <span className="design-button">לצפייה בציורים</span>
                </button>
              </article>
            })}
          </div> : <p className="catalog-empty" role="status">הקולקציה מתעדכנת. בקרוב יופיעו כאן צילומים של מוצרים מוגמרים לבחירה.</p>}
          <p className="catalog-note">כל פריט נוצר בעבודת יד; הצילומים מציגים שילובים קיימים, וייתכנו הבדלים בין הפריטים.</p>
        </section>

        {product && <section ref={productSection} className="product-detail page-content" aria-labelledby="product-title">
          <button type="button" className="back-link" onClick={() => { setProduct(null); document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' }) }}>← חזרה לקולקציה</button>
          <h2 id="product-title" className="section-title">{product.name}</h2>
          <p className="section-lead">{product.detail} · {priceLabel(product)}</p>
          {product.sizes.length > 1 && <label className="size-choice">מידה
            <select value={activeSize?.label} onChange={(event) => setSizeLabel(event.target.value)}>
              {product.sizes.map((size) => <option key={size.label} value={size.label}>{size.label} · {size.price} ₪</option>)}
            </select>
          </label>}
          <fieldset className="material-choices">
            <legend>בחירת חומר</legend>
            {(['smooth', 'speckled'] as const).map((option) => <label key={option}>
              <input type="radio" name="material" value={option} checked={material === option} onChange={() => chooseMaterial(option)} />
              {materialName[option]}
            </label>)}
          </fieldset>
          {visibleVariants.length ? <>
            {visibleVariants.length > 1 && <>
              <p className="gallery-heading">בחרו ציור מתוך התמונות של {materialName[material]}:</p>
              <div className="finished-gallery">
                {visibleVariants.map((variant) => <button type="button" key={variant.id} className={`finished-option ${selectedVariant === variant.id ? 'selected' : ''}`} aria-pressed={selectedVariant === variant.id} onClick={() => { setSelectedVariant(variant.id); setSelectedImage(0) }}>
                  <img src={variant.images[0]} alt={`${product.name} על רקע ${materialName[material]} עם ציור ${variant.artworkName}`} loading="lazy" />
                  <span>{variant.artworkName}</span>
                </button>)}
              </div>
            </>}
            {chosenVariant && <>
              {chosenVariant.images.length > 1 && <div className="variant-thumbnails" role="group" aria-label="זוויות צילום של השילוב הנבחר">
                {chosenVariant.images.map((image, index) => <button type="button" key={image} className={selectedImage === index ? 'selected' : ''} aria-label={`צילום ${index + 1} מתוך ${chosenVariant.images.length}`} aria-pressed={selectedImage === index} onClick={() => setSelectedImage(index)}><img src={image} alt="" loading="lazy" /></button>)}
              </div>}
              <div className="variant-preview"><img src={chosenVariant.images[selectedImage]} alt={`${product.name}, ${materialName[material]}, ${chosenVariant.artworkName}, צילום ${selectedImage + 1} מתוך ${chosenVariant.images.length}`} onLoad={() => { if (pendingProductScroll.current) scrollProductIntoView() }} /></div>
              <div className="purchase-row"><strong>{product.name}{product.sizes.length > 1 ? ` · ${activeSize?.label} ·` : ''} {materialName[material]} + ציור {chosenVariant.artworkName} · {activeSize?.price} ₪</strong><label>כמות <input type="number" min="1" max="99" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} /></label><button type="button" className="primary-link" onClick={addToCart}>הוספה לעגלה</button></div>
            </>}
          </> : <p className="catalog-empty" role="status">אין כרגע צילומים זמינים של {product.name} ברקע {materialName[material]}.</p>}
        </section>}

        <section id="cart" className="cart-section page-content" aria-labelledby="cart-title">
          <h2 id="cart-title" className="section-title">העגלה שלכם</h2>
          <Ornament />
          {cartDetails.length ? <>
            <ul className="cart-items">{cartDetails.map(({ variant, product: entry, size, quantity: count }) => <li key={`${variant.id}:${size.label}`}>
              <img src={variant.images[0]} alt="" loading="lazy" />
              <div><strong>{entry.name}</strong><span>{entry.sizes.length > 1 ? `מידה ${size.label} · ` : ''}{materialName[variant.material]} · ציור {variant.artworkName}</span><span>{size.price} ₪ ליחידה</span></div>
              <label>כמות <input type="number" min="1" max="99" value={count} onChange={(event) => updateCart(variant.id, size.label, Number(event.target.value) || 1)} /></label>
              <strong>{size.price * count} ₪</strong>
              <button type="button" className="remove-item" onClick={() => setCart((items) => items.filter((item) => !(item.variantId === variant.id && item.sizeLabel === size.label)))}>הסרה</button>
            </li>)}</ul>
            <p className="cart-total">סכום מוצרים: <strong>{total} ₪</strong></p>
            <p className="cart-caution">לא כולל משלוח. הזמנה וזמינות אינן מאושרות עד שאפרת תאשר את הפרטים והמחיר הסופי.</p>
            <form ref={orderForm} className="cart-form" onSubmit={(event) => event.preventDefault()}>
              <h3>שליחת בקשה</h3>
              <div className="cart-fields"><label>שם <input autoComplete="name" required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label><label>טלפון <input type="tel" autoComplete="tel" required maxLength={25} value={phone} onChange={(event) => setPhone(event.target.value)} /></label></div>
              <fieldset className="delivery-choices"><legend>אופן קבלה</legend><label><input type="radio" name="delivery" checked={delivery === 'pickup'} onChange={() => setDelivery('pickup')} /> איסוף עצמי</label><label><input type="radio" name="delivery" checked={delivery === 'delivery'} onChange={() => setDelivery('delivery')} /> משלוח בתיאום</label></fieldset>
              <label>הערות (רשות) <textarea maxLength={500} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
              <div className="cart-actions"><a className="primary-link" href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={(event) => { if (!validOrder()) event.preventDefault(); else setCart([]) }}>שליחת בקשה בוואטסאפ</a></div>
              <p className="cart-assurance"><strong>לאחר שתשלח הבקשה, נאשר לכם את הזמינות ונשלח בקשה לתשלום דרך קישור PayBox.</strong></p>
            </form>
          </> : <p className="catalog-empty">העגלה עדיין ריקה. בחרו מוצר וציור מהקולקציה.</p>}
        </section>

        <section id="before-ordering" className="before-ordering page-content" aria-labelledby="before-title">
          <h2 id="before-title" className="section-title">כדאי לדעת לפני שמזמינים</h2>
          <Ornament />
          <div className="info-grid"><div className="info-card"><h3>בחירת החומר</h3><p>ניתן להזמין את הכלים בחומר בצבע שמנת חלק או שמנת מנוקד, לפי הצילומים הזמינים.</p></div><div className="info-card"><h3>בחירת הציור</h3><p>בחרו מתוך צילומי השילובים הזמינים. כל פריט מיוצר ביד וייתכנו הבדלים בין הפריטים.</p></div><div className="info-card"><h3>הזמנת סטים</h3><p>המעוניינים בסט הכולל עיטור זהה החוזר על עצמו, מתבקשים לציין זאת מראש.</p></div></div>
        </section>

        <section id="care" className="care page-content" aria-labelledby="care-title">
          <h2 id="care-title" className="section-title">תתחדשו!</h2>
          <Ornament />
          <p className="section-lead">הכלים שבידכם נוצרו בעבודת יד ובאהבה גדולה ❤️</p>
          <p className="care-intro">כדי שתוכלו ליהנות מהם לאורך זמן, הנה כמה דברים שכדאי לדעת:</p>
          <div className="info-grid">
            <div className="info-card"><h3>טיפול יומיומי</h3><p>הכלים מתאימים לשטיפה ידנית רגילה וגם למדיח כלים.</p></div>
            <div className="info-card"><h3>חום התנור</h3><p>ניתן לאפייה בתנור עד 170°.</p></div>
            <div className="info-card"><h3>מיקרוגל</h3><p>ניתן לחימום קצר.</p></div>
          </div>
          <p className="care-signoff">מאחלות לכם הנאה גדולה וכיף!</p>
        </section>

        <section id="contact" className="contact page-content" aria-labelledby="contact-title">
          <img className="artists-photo" src="/assets/artists.webp" alt="עירית סגול ואפרת ליאני" loading="lazy" />
          <div><p className="one-of-a-kind" dir="ltr">One of a Kind</p><Ornament /><h2 id="contact-title" className="section-title">לפרטים</h2><ul className="contact-list">{artists.map((artist) => <li key={artist.phone}><strong>{artist.name}</strong><a href={`tel:+${artist.whatsapp}`} dir="ltr">{artist.phone}</a><a href={`https://wa.me/${artist.whatsapp}`} target="_blank" rel="noopener noreferrer">וואטסאפ ↗</a></li>)}</ul></div>
        </section>
      </main>
      <footer className="site-footer"><span dir="ltr">ART IN CLAY ©</span><span>כשהחומר פוגש את המכחול</span><span>מוצרים בעבודת יד</span></footer>
    </div>
  )
}

export default App
