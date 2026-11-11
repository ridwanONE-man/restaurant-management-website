import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './lib/supabase'
import { useRealtimeRefetch } from './lib/realtime'
import { reportSyncError } from './lib/syncStatus'
import { useAuth } from './auth'

export type Waiter = { id: string; name: string }

type Result = { ok: true; waiter: Waiter } | { ok: false; error: string }

type WaitersContextValue = {
  waiters: Waiter[]
  addWaiter: (name: string) => Promise<Result>
  renameWaiter: (id: string, name: string) => void
  removeWaiter: (id: string) => void
}

const WaitersContext = createContext<WaitersContextValue | null>(null)

/** Local cache only — the source of truth is public.waiters */
const CACHE_KEY = 'cff-waiters-cache-v1'

function loadCache(): Waiter[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Waiter[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function cache(list: Waiter[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    /* optional */
  }
}

export function WaitersProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [waiters, setWaitersState] = useState<Waiter[]>(loadCache)
  const ref = useRef(waiters)

  const setWaiters = useCallback((next: Waiter[]) => {
    if (JSON.stringify(next) === JSON.stringify(ref.current)) return
    ref.current = next
    cache(next)
    setWaitersState(next)
  }, [])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('waiters')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) {
      reportSyncError(error)
      return
    }
    setWaiters(data as Waiter[])
  }, [setWaiters])

  useRealtimeRefetch('waiters', ['waiters'], isAuthenticated, () => void refetch())

  const addWaiter = useCallback(
    async (raw: string): Promise<Result> => {
      const name = raw.trim().replace(/\s+/g, ' ')
      if (!name) return { ok: false, error: 'Enter the waiter name.' }
      const existing = ref.current.find((w) => w.name.toLowerCase() === name.toLowerCase())
      if (existing) return { ok: true, waiter: existing }
      const { data, error } = await supabase
        .from('waiters')
        .insert({ name, is_active: true })
        .select('id, name')
        .single()
      if (error) {
        // name exists but was removed earlier → reactivate it
        const again = await supabase
          .from('waiters')
          .update({ is_active: true })
          .ilike('name', name)
          .select('id, name')
          .maybeSingle()
        if (again.error || !again.data) {
          reportSyncError(error)
          return { ok: false, error: 'Could not save the waiter. Check your connection.' }
        }
        await refetch()
        return { ok: true, waiter: again.data as Waiter }
      }
      const waiter = data as Waiter
      setWaiters([...ref.current, waiter].sort((a, b) => a.name.localeCompare(b.name)))
      return { ok: true, waiter }
    },
    [refetch, setWaiters],
  )

  const renameWaiter = useCallback(
    (id: string, raw: string) => {
      const name = raw.trim().replace(/\s+/g, ' ')
      if (!name) return
      setWaiters(ref.current.map((w) => (w.id === id ? { ...w, name } : w)))
      void supabase
        .from('waiters')
        .update({ name })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            reportSyncError(error)
            void refetch()
          }
        })
    },
    [refetch, setWaiters],
  )

  const removeWaiter = useCallback(
    (id: string) => {
      setWaiters(ref.current.filter((w) => w.id !== id))
      // soft delete — past nights still show the name
      void supabase
        .from('waiters')
        .update({ is_active: false })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            reportSyncError(error)
            void refetch()
          }
        })
    },
    [refetch, setWaiters],
  )

  const value = useMemo(
    () => ({ waiters, addWaiter, renameWaiter, removeWaiter }),
    [addWaiter, removeWaiter, renameWaiter, waiters],
  )

  return <WaitersContext.Provider value={value}>{children}</WaitersContext.Provider>
}

export function useWaiters() {
  const ctx = useContext(WaitersContext)
  if (!ctx) throw new Error('useWaiters must be used within WaitersProvider')
  return ctx
}
