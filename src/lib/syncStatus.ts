import { useSyncExternalStore } from 'react'

/** Tiny global store for the live-sync indicator (sidebar + mobile top bar) */
export type SyncState = 'connecting' | 'live' | 'offline' | 'error'

type Snapshot = { state: SyncState; message: string }

let snapshot: Snapshot = { state: 'connecting', message: '' }
const listeners = new Set<() => void>()
const channelStates = new Map<string, string>()

function emit(next: Snapshot) {
  if (next.state === snapshot.state && next.message === snapshot.message) return
  snapshot = next
  for (const l of listeners) l()
}

/** Called by each realtime channel with its subscribe status */
export function reportChannel(name: string, status: string) {
  channelStates.set(name, status)
  recompute()
}

export function removeChannel(name: string) {
  channelStates.delete(name)
  recompute()
}

let lastError = ''
let errorTimer: number | undefined

/** Surface a failed read/write for a few seconds */
export function reportSyncError(err: unknown) {
  const message =
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  console.error('[sync]', err)
  lastError = message
  recompute()
  window.clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => {
    lastError = ''
    recompute()
  }, 6000)
}

function recompute() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit({ state: 'offline', message: 'Offline — changes will sync when you reconnect' })
    return
  }
  if (lastError) {
    emit({ state: 'error', message: lastError })
    return
  }
  const values = [...channelStates.values()]
  if (!values.length) {
    emit({ state: 'connecting', message: '' })
    return
  }
  if (values.every((v) => v === 'SUBSCRIBED')) emit({ state: 'live', message: '' })
  else if (values.some((v) => v === 'CHANNEL_ERROR' || v === 'TIMED_OUT'))
    emit({ state: 'error', message: 'Realtime connection lost — retrying…' })
  else emit({ state: 'connecting', message: '' })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', recompute)
  window.addEventListener('offline', recompute)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
