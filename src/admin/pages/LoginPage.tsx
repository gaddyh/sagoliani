import { useState, type FormEvent } from 'react'
import Ornament from '../../components/Ornament'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) setError(authError.message === 'Invalid login credentials' ? 'דוא״ל או סיסמה שגויים.' : authError.message)
    setBusy(false)
  }

  return (
    <div className="sa-login-shell">
      <form className="sa-login-card" onSubmit={signIn}>
        <span className="brand-name" dir="ltr">ART IN CLAY</span>
        <Ornament />
        <h1>כניסה לניהול הסטודיו</h1>
        <label>דוא״ל <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>סיסמה <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="submit" className="sa-primary" disabled={busy}>{busy ? 'נכנסים…' : 'כניסה'}</button>
        {error && <p className="sa-error" role="alert">{error}</p>}
        <p className="sa-hint">מדובר במערכת הפנימית של הסטודיו. לחזרה לאתר <a href="/">לחצו כאן</a>.</p>
      </form>
    </div>
  )
}
