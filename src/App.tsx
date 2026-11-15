import Ornament from './components/Ornament'
import Studio from './components/Studio'
import { artworks, vessels } from './data/catalog'
import { artists, priceLabel, products } from './data/products'

const externalAssets = [...vessels, ...artworks].filter((item) => item.external && item.credit)

function App() {
  function openStudio() {
    document.getElementById('studio-editor')?.scrollIntoView({ behavior: 'smooth' })
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
            <a href="#studio-editor">הסטודיו</a>
            <a href="#before-ordering">לפני שמזמינים</a>
            <a href="#contact">צרו קשר</a>
            {import.meta.env.DEV && <a className="admin-back" href="/admin">הכנת נכסים ↗</a>}
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero page-content">
          <div className="hero-text">
            <h1 className="hero-title" dir="ltr">ART IN CLAY</h1>
            <p className="hero-tagline">כשהחומר פוגש את המכחול</p>
            <p className="hero-names">עירית סגל ואפרת ליאני</p>
            <Ornament />
            <p className="hero-copy">קולקציה ייחודית המחברת בין עבודות יד וקדרות בקרמיקה לציורי מים מקוריים. בחרו כלי, מצאו ציור שמדבר אליכם, וראו איך הם נפגשים.</p>
            <div className="hero-actions">
              <a className="primary-link" href="#studio-editor">לעצב כלי משלכם</a>
              <a className="secondary-link" href="#collection">לקולקציה</a>
            </div>
          </div>
          <div className="hero-image">
            <img src="/assets/brochure/hero.webp" alt="כלי קרמיקה בעבודת יד עם ציורי פרחים בצבעי מים" />
          </div>
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
          <div className="collection-grid">
            {products.map((product) => (
              <article key={product.id} className="product-card">
                <div className="product-photo"><img src={product.image} alt={product.name} loading="lazy" /></div>
                <div className="product-label">
                  <strong>{product.name}</strong>
                  <span>{product.sizes.length > 1 ? product.sizes.map((size) => `${size.label} ${size.price} ₪`).join(' | ') : `${product.detail} | ${priceLabel(product)}`}</span>
                </div>
                <button type="button" className="design-button" onClick={openStudio}>עצבו את שלכם</button>
              </article>
            ))}
          </div>
          <p className="catalog-note">התמונות להמחשה בלבד ומציגות את סגנון הקולקציה, ואינן בהכרח מייצגות פריט זהה לזה שיסופק.</p>
        </section>

        <section id="studio" className="studio page-content" aria-labelledby="studio-title">
          <h2 id="studio-title" className="section-title">הסטודיו · עצבו כלי משלכם</h2>
          <Ornament />
          <p className="section-lead">בחרו קערה, מצאו ציור שאתם אוהבים, וגררו אותו למקום שמתאים לכם.</p>
          <Studio />
        </section>

        <section id="before-ordering" className="before-ordering page-content" aria-labelledby="before-title">
          <h2 id="before-title" className="section-title">כדאי לדעת לפני שמזמינים</h2>
          <Ornament />
          <div className="info-grid">
            <div className="info-card"><h3>בחירת החומר</h3><p>ניתן להזמין את הכלים בחומר בצבע שמנת חלק או שמנת מנוקד.</p></div>
            <div className="info-card"><h3>בחירת ציור המים</h3><p>ייעשה בהתאם לגודל הכלי ולעיצובו על ידי היוצרות. המיקום שבחרתם בסטודיו הוא ההעדפה שלכם.</p></div>
            <div className="info-card"><h3>הזמנת סטים</h3><p>המעוניינים בסט הכולל עיטור זהה החוזר על עצמו, מתבקשים לציין זאת מראש.</p></div>
          </div>
        </section>

        <section id="contact" className="contact page-content" aria-labelledby="contact-title">
          <img className="artists-photo" src="/assets/brochure/artists.webp" alt="עירית סגל ואפרת ליאני" loading="lazy" />
          <div>
            <p className="one-of-a-kind" dir="ltr">One of a Kind</p>
            <Ornament />
            <h2 id="contact-title" className="section-title">לפרטים</h2>
            <ul className="contact-list">
              {artists.map((artist) => (
                <li key={artist.phone}>
                  <strong>{artist.name}</strong>
                  <a href={`tel:+${artist.whatsapp}`} dir="ltr">{artist.phone}</a>
                  <a href={`https://wa.me/${artist.whatsapp}`} target="_blank" rel="noopener noreferrer">וואטסאפ ↗</a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="credits page-content" aria-label="מקורות ורישיונות נכסי בדיקה חיצוניים">
          <h2>מקורות ורישיונות · נכסי בדיקה חיצוניים</h2>
          <p className="credits-intro">חלק מצילומי ההדמיה והאיורים המסומנים ״בדיקה״ הם נכסים חיצוניים ברישיון פתוח, שמשמשים להמחשת הטכניקה בלבד ואינם יצירות של ART IN CLAY.</p>
          <ul className="credits-list">
            {externalAssets.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.credit!.author}</span>
                <span>רישיון: {item.credit!.licenseUrl ? <a href={item.credit!.licenseUrl} target="_blank" rel="noopener noreferrer">{item.credit!.license}</a> : item.credit!.license}</span>
                {item.credit!.sourceUrl ? <a href={item.credit!.sourceUrl} target="_blank" rel="noopener noreferrer">מקור ↗</a> : <span />}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="site-footer"><span dir="ltr">ART IN CLAY ©</span><span>כשהחומר פוגש את המכחול</span><span>הדמיות להמחשה בלבד</span></footer>
    </div>
  )
}

export default App
