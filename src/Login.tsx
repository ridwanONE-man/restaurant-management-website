import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, Mail, UtensilsCrossed } from 'lucide-react'
import { useAuth } from './auth'
import './Login.css'

export default function Login() {
  const { ready, isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (ready && isAuthenticated) return <Navigate to="/app/entry" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError('')
    const result = await login(email, password)
    setBusy(false)
    if (result.ok) {
      navigate('/app/entry')
      return
    }
    setError(result.error)
  }

  return (
    <main className="auth">
      <div className="auth__glow auth__glow--a" aria-hidden />
      <div className="auth__glow auth__glow--b" aria-hidden />

      <section className="auth-card" aria-label="Sign in">
        <div className="auth-logo">
          <span className="auth-logo__mark" aria-hidden>
            <UtensilsCrossed size={30} strokeWidth={2.2} />
          </span>
          <h1>
            Central <span>Fast Food</span>
          </h1>
        </div>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <label className={`auth-field ${email ? 'has-value' : ''}`}>
            <Mail size={18} className="auth-field__icon" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              inputMode="email"
              placeholder=" "
              required
            />
            <span className="auth-field__label">Email</span>
          </label>

          <label className={`auth-field ${password ? 'has-value' : ''}`}>
            <Lock size={18} className="auth-field__icon" aria-hidden />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder=" "
              required
            />
            <span className="auth-field__label">Password</span>
            <button
              type="button"
              className="auth-field__eye"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? <span className="auth-spinner" aria-hidden /> : null}
            {busy ? 'Signing in' : 'Sign in'}
            {busy ? null : <ArrowRight size={18} />}
          </button>
        </form>
      </section>
    </main>
  )
}
