import { useCallback, useEffect, useSyncExternalStore } from 'react'

/** Per-device appearance preference (each phone/laptop can choose its own) */
export type ThemeMode = 'light' | 'dark' | 'system'

const KEY = 'cff-theme-mode'
const listeners = new Set<() => void>()

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

let mode: ThemeMode = readMode()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function resolveTheme(m: ThemeMode): 'light' | 'dark' {
  if (m === 'system') return media?.matches === false ? 'light' : 'dark'
  return m
}

function apply(animate: boolean) {
  const root = document.documentElement
  const resolved = resolveTheme(mode)
  if (animate) {
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 350)
  }
  root.setAttribute('data-theme', resolved)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#ffffff' : '#121010')
}

export function setThemeMode(next: ThemeMode) {
  mode = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* optional */
  }
  apply(true)
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  apply(false)
  media?.addEventListener('change', () => {
    if (mode === 'system') {
      apply(true)
      for (const l of listeners) l()
    }
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, () => mode)
  const set = useCallback((m: ThemeMode) => setThemeMode(m), [])
  // keep other tabs of this browser in step
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        mode = readMode()
        apply(true)
        for (const l of listeners) l()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return { mode: current, resolved: resolveTheme(current), setMode: set }
}
