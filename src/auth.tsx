import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_EMAIL, DEFAULT_PASSWORD, type NightEntry } from './data'

type AuthContextValue = {
  isAuthenticated: boolean
  email: string
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string }
  logout: () => void
  changePassword: (
    current: string,
    next: string,
  ) => { ok: true } | { ok: false; error: string }
  history: NightEntry[]
  saveNight: (entry: NightEntry) => void
  clearHistory: () => void
  replaceHistory: (entries: NightEntry[]) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_KEY = 'grillgrain-auth'
const HISTORY_KEY = 'grillgrain-history-slsh-v6'
const CREDS_KEY = 'grillgrain-creds-v1'

type Creds = { email: string; password: string }

function loadCreds(): Creds {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    if (!raw) return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }
    const parsed = JSON.parse(raw) as Partial<Creds>
    return {
      email: (parsed.email ?? DEFAULT_EMAIL).trim().toLowerCase(),
      password: parsed.password ?? DEFAULT_PASSWORD,
    }
  } catch {
    return { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }
  }
}

function loadHistory(): NightEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NightEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(AUTH_KEY) === '1',
  )
  const [creds, setCreds] = useState<Creds>(loadCreds)
  const [history, setHistory] = useState<NightEntry[]>(loadHistory)

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      email: creds.email,
      login: (email, password) => {
        const e = email.trim().toLowerCase()
        const p = password
        if (e === creds.email && p === creds.password) {
          localStorage.setItem(AUTH_KEY, '1')
          setIsAuthenticated(true)
          return { ok: true }
        }
        return { ok: false, error: 'Invalid email or password.' }
      },
      logout: () => {
        localStorage.removeItem(AUTH_KEY)
        setIsAuthenticated(false)
      },
      changePassword: (current, next) => {
        if (current !== creds.password) {
          return { ok: false, error: 'Current password is incorrect.' }
        }
        if (next.trim().length < 6) {
          return { ok: false, error: 'New password must be at least 6 characters.' }
        }
        const updated = { ...creds, password: next }
        localStorage.setItem(CREDS_KEY, JSON.stringify(updated))
        setCreds(updated)
        return { ok: true }
      },
      history,
      saveNight: (entry) => {
        setHistory((prev) => {
          const idx = prev.findIndex((row) => row.id === entry.id)
          const next =
            idx >= 0
              ? prev.map((row, i) => (i === idx ? entry : row))
              : [entry, ...prev]
          localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
          return next
        })
      },
      clearHistory: () => {
        localStorage.setItem(HISTORY_KEY, JSON.stringify([]))
        setHistory([])
      },
      replaceHistory: (entries) => {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
        setHistory(entries)
      },
    }),
    [creds, history, isAuthenticated],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
