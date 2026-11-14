import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (location.pathname === '/admin') {
  if (import.meta.env.DEV) {
    import('./admin/Admin').then(({ default: Admin }) => root.render(<React.StrictMode><Admin /></React.StrictMode>))
  } else {
    root.render(<main className="page-content"><h1>עמוד זה אינו זמין.</h1><a href="/">חזרה לסטודיו</a></main>)
  }
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
