import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  UtensilsCrossed,
  User,
} from 'lucide-react'
import { useAuth } from './auth'
import './Login.css'

export default function Login() {
  const { ready, isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (ready && isAuthenticated) return <Navigate to="/app/entry" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
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
    <div className="login-page">
      <section className="login-hero" aria-label="Brand">
        <div className="login-hero__overlay" />
        <div className="login-hero__content">
          <div className="brand">
            <UtensilsCrossed size={22} strokeWidth={2.25} />
            <span>GRILL & GRAIN</span>
          </div>

          <div className="login-hero__copy">
            <h1>
              Master the Fire,
              <br />
              Manage the Profit.
            </h1>
            <p>
              The unified operating system for high-performance kitchens.
              Decisive data at your fingertips.
            </p>
          </div>

          <div className="login-hero__stats">
            <div>
              <span className="stat-label green">SERVICE</span>
              <strong>Live</strong>
            </div>
            <div>
              <span className="stat-label orange">LEDGER</span>
              <strong>SLSH</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel__inner">
          <header>
            <h2>Welcome Back, Chef</h2>
            <p>Access your kitchen dashboard to start service.</p>
          </header>

          <form onSubmit={onSubmit} noValidate>
            <label className="field">
              <span>USERNAME OR EMAIL</span>
              <div className="field__control">
                <User size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            <label className="field">
              <span>PASSWORD</span>
              <div className="field__control">
                <Lock size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="form-row">
              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>
              <a className="forgot" href="#forgot" onClick={(e) => e.preventDefault()}>
                Forgot Password?
              </a>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? 'SIGNING IN…' : 'LOGIN'} <ArrowRight size={18} />
            </button>
          </form>

          <div className="server-status">
            <span className="server-status__left">
              <span className="dot" />
              Kitchen Server: Online
            </span>
            <span>v2.4.0</span>
          </div>

          <p className="help-text">
            Need help? Contact system administrator or visit our{' '}
            <a href="#support" onClick={(e) => e.preventDefault()}>
              Support Portal
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  )
}
