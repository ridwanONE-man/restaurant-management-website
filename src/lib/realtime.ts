import { useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { removeChannel, reportChannel } from './syncStatus'

/**
 * Subscribe to every change on the given tables and call `refetch` (debounced).
 * Also refetches whenever the channel (re)connects, so a phone waking from sleep
 * catches up on anything it missed.
 */
export function useRealtimeRefetch(
  name: string,
  tables: string[],
  enabled: boolean,
  refetch: () => void,
  onPayload?: (table: string, payload: { new: Record<string, unknown> }) => boolean | void,
) {
  const refetchRef = useRef(refetch)
  const payloadRef = useRef(onPayload)
  refetchRef.current = refetch
  payloadRef.current = onPayload
  const tablesKey = tables.join(',')

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => refetchRef.current(), 150)
    }

    let channel = supabase.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`)
    for (const table of tablesKey.split(',')) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          // handler may consume the event (return true) to skip a refetch
          const handled = payloadRef.current?.(table, payload as unknown as { new: Record<string, unknown> })
          if (!handled) schedule()
        },
      )
    }
    channel.subscribe((status) => {
      reportChannel(name, status)
      if (status === 'SUBSCRIBED') schedule()
    })

    // load right away — don't wait for the websocket to finish connecting
    refetchRef.current()

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', schedule)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', schedule)
      removeChannel(name)
      void supabase.removeChannel(channel)
    }
  }, [enabled, name, tablesKey])
}
