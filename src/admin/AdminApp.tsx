import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import NewOrderPage from './pages/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage'
import InventoryPage from './pages/InventoryPage'
import ArtworksPage from './pages/ArtworksPage'
import MappingsPage from './pages/MappingsPage'
import PrintQueuePage from './pages/PrintQueuePage'
import KilnPage from './pages/KilnPage'

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [artistName, setArtistName] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setArtistName(''); return }
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle()
        if (!data) {
          // The session points at a user that no longer exists (e.g. the
          // local database was reset). Signing out lands on the login page
          // instead of showing empty, permission-blocked screens.
          await supabase.auth.signOut()
          return
        }
        setArtistName(data.display_name)
      } catch { setArtistName('') }
    })()
  }, [session?.user])

  if (!isSupabaseConfigured) {
    return <main className="sa-main"><div className="sa-card"><h1>הגדרות חסרות</h1><p>חסרים משתני סביבה (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). הגדירו אותם ונסו שוב.</p></div></main>
  }

  if (!ready) return <div className="sa-splash" aria-busy="true">טוען…</div>
  if (!session) return <LoginPage />

  return (
    <BrowserRouter>
      <div className="sa-shell">
        <header className="sa-header">
          <div className="sa-header-inner">
            <a className="sa-brand" href="/admin">
              <span className="brand-name" dir="ltr">ART IN CLAY</span>
              <span className="sa-brand-caption">ניהול הסטודיו</span>
            </a>
            <nav className="sa-nav" aria-label="ניווט ראשי">
              <NavLink to="/admin" end>לוח בקרה</NavLink>
              <NavLink to="/admin/orders">הזמנות</NavLink>
              <NavLink to="/admin/inventory">מלאי</NavLink>
              <NavLink to="/admin/artworks">יצירות</NavLink>
              <NavLink to="/admin/mappings">שילובים</NavLink>
              <NavLink to="/admin/print">הדפסות</NavLink>
              <NavLink to="/admin/kiln">תנורים</NavLink>
              <NavLink to="/admin/orders/new">הזמנה חדשה</NavLink>
            </nav>
            <div className="sa-user">
              <span className="sa-user-name">{artistName || session.user.email}</span>
              <button type="button" className="sa-logout" onClick={() => supabase.auth.signOut()}>יציאה</button>
            </div>
          </div>
        </header>
        <main className="sa-main">
          <Routes>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/orders/new" element={<NewOrderPage />} />
            <Route path="/admin/orders/:id" element={<OrderDetailPage />} />
            <Route path="/admin/orders" element={<OrdersPage />} />
            <Route path="/admin/inventory" element={<InventoryPage />} />
            <Route path="/admin/artworks" element={<ArtworksPage />} />
            <Route path="/admin/mappings" element={<MappingsPage />} />
            <Route path="/admin/print" element={<PrintQueuePage />} />
            <Route path="/admin/kiln" element={<KilnPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
        <nav className="sa-tabbar" aria-label="ניווט תחתון">
          <NavLink to="/admin" end>לוח</NavLink>
          <NavLink to="/admin/orders">הזמנות</NavLink>
          <NavLink to="/admin/inventory">מלאי</NavLink>
          <NavLink to="/admin/orders/new">חדשה</NavLink>
        </nav>
      </div>
    </BrowserRouter>
  )
}
