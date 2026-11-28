import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (location.pathname === '/admin/studio') {
  import('./admin/StudioPage').then(({ default: StudioPage }) => root.render(<React.StrictMode><StudioPage /></React.StrictMode>))
} else if (location.pathname === '/admin/assets') {
  // Legacy asset-preparation workspace (browser-local drafts only).
  if (import.meta.env.DEV) {
    import('./admin/Admin').then(({ default: Admin }) => root.render(<React.StrictMode><Admin /></React.StrictMode>))
  } else {
    root.render(<main className="page-content"><h1>עמוד זה אינו זמין.</h1><a href="/">חזרה לאתר</a></main>)
  }
} else if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
  // Studio management system (login-gated; business logic lives in Supabase).
  import('./admin/AdminApp').then(({ default: AdminApp }) => root.render(<React.StrictMode><AdminApp /></React.StrictMode>))
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
