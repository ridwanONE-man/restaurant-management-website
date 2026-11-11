import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { NightEntry } from './data'
import { supabase } from './lib/supabase'
import { NIGHT_SELECT, nightToPayload, rowToNight, type NightRow } from './lib/nights'
import { useRealtimeRefetch } from './lib/realtime'
import { reportSyncError } from './lib/syncStatus'
import { migrateLocalDataOnce } from './lib/migrate'

type Result = { ok: true } | { ok: false; error: string }

type AuthContextValue = {
  /** False until the stored session has been checked */
  ready: boolean
  isAuthenticated: boolean
  email: string
  login: (email: string, password: string) => Promise<Result>
  logout: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<Result>
  history: NightEntry[]
  saveNight: (entry: NightEntry) => void
  clearHistory: () => void
  replaceHistory: (entries: NightEntry[]) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Local cache so History shows instantly before the network answers */
const HISTORY_CACHE_KEY = 'grillgrain-history-cache-v1'

function loadCache(): NightEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as NightEntry[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCache(entries: NightEntry[]) {
  try {
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(entries))
  } catch {
    /* storage full / private mode — cache is optional */
  }
}

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Invalid email or password.'
  if (/email not confirmed/i.test(message)) return 'This email is not confirmed yet.'
  if (/fetch|network/i.test(message)) return 'Cannot reach the server. Check your internet connection.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [history, setHistory] = useState<NightEntry[]>(loadCache)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const isAuthenticated = Boolean(session)

  useEffect(() => {
    if (isAuthenticated) void migrateLocalDataOnce()
  }, [isAuthenticated])

  const refetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('nights')
      .select(NIGHT_SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      reportSyncError(error)
      return
    }
    const next = (data as NightRow[]).map(rowToNight)
    setHistory(next)
    writeCache(next)
  }, [])

  useRealtimeRefetch('history', ['nights'], isAuthenticated, () => void refetchHistory())

  /** Run writes one after another so rapid auto-saves never race */
  const enqueue = useCallback((task: () => Promise<void>) => {
    saveQueue.current = saveQueue.current.then(task).catch(reportSyncError)
    return saveQueue.current
  }, [])

  const saveNight = useCallback(
    (entry: NightEntry) => {
      setHistory((prev) => {
        const idx = prev.findIndex((row) => row.id === entry.id)
        const next = idx >= 0 ? prev.map((row, i) => (i === idx ? entry : row)) : [entry, ...prev]
        writeCache(next)
        return next
      })
      void enqueue(async () => {
        const { error } = await supabase.rpc('save_night', { p: nightToPayload(entry) })
        if (error) throw error
      })
    },
    [enqueue],
  )

  const clearHistory = useCallback(() => {
    setHistory([])
    writeCache([])
    void enqueue(async () => {
      const { error } = await supabase.from('nights').delete().neq('id', '')
      if (error) throw error
    })
  }, [enqueue])

  const replaceHistory = useCallback(
    (entries: NightEntry[]) => {
      setHistory(entries)
      writeCache(entries)
      void enqueue(async () => {
        const { error } = await supabase.from('nights').delete().neq('id', '')
        if (error) throw error
        for (const entry of [...entries].reverse()) {
          const res = await supabase.rpc('save_night', { p: nightToPayload(entry) })
          if (res.error) throw res.error
        }
      })
    },
    [enqueue],
  )

  const login = useCallback(async (email: string, password: string): Promise<Result> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) return { ok: false, error: friendlyAuthError(error.message) }
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const email = session?.user.email ?? ''

  const changePassword = useCallback(
    async (current: string, next: string): Promise<Result> => {
      if (next.trim().length < 6) {
        return { ok: false, error: 'New password must be at least 6 characters.' }
      }
      const check = await supabase.auth.signInWithPassword({ email, password: current })
      if (check.error) return { ok: false, error: 'Current password is incorrect.' }
      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) return { ok: false, error: friendlyAuthError(error.message) }
      return { ok: true }
    },
    [email],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      isAuthenticated,
      email,
      login,
      logout,
      changePassword,
      history,
      saveNight,
      clearHistory,
      replaceHistory,
    }),
    [changePassword, clearHistory, email, history, isAuthenticated, login, logout, ready, replaceHistory, saveNight],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
