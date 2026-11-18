import Ornament from '../components/Ornament'
import Studio from '../components/Studio'

export default function StudioPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/#top" aria-label="ART IN CLAY, חזרה לאתר">
            <span className="brand-name" dir="ltr">ART IN CLAY</span>
            <span className="brand-rule" />
            <span className="brand-caption">הסטודיו</span>
          </a>
          <nav className="site-nav" aria-label="ניווט ראשי">
            <a className="admin-back" href="/">חזרה לאתר ←</a>
            {import.meta.env.DEV && <a className="admin-back" href="/admin">הכנת נכסים ↗</a>}
          </nav>
        </div>
      </header>

      <main id="top">
        <section id="studio" className="studio page-content" aria-labelledby="studio-title">
          <h2 id="studio-title" className="section-title">הסטודיו · עצבו כלי משלכם</h2>
          <Ornament />
          <p className="section-lead">בחרו קערה, מצאו ציור שאתם אוהבים, וגררו אותו למקום שמתאים לכם.</p>
          <Studio />
        </section>
      </main>

      <footer className="site-footer"><span dir="ltr">ART IN CLAY ©</span><span>כשהחומר פוגש את המכחול</span><span>הדמיות להמחשה בלבד</span></footer>
    </div>
  )
}
