/**
 * Business day = one selling night. It runs from the cut-off time (default 01:30)
 * to the next day's cut-off, so a sale at 00:45 still belongs to the evening that
 * started before midnight.
 */
export const DEFAULT_CUTOFF = '01:30'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function parseCutoff(cutoff?: string | null) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((cutoff ?? '').trim())
  const h = m ? Math.min(23, Number(m[1])) : 1
  const min = m ? Math.min(59, Number(m[2])) : 30
  return { h, m: min, minutes: h * 60 + min, label: `${pad(h)}:${pad(min)}` }
}

/** Key of the business day a moment belongs to, e.g. "2026-11-12" */
export function businessDayKey(now: Date = new Date(), cutoff?: string | null): string {
  const shifted = new Date(now.getTime() - parseCutoff(cutoff).minutes * 60_000)
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`
}

function dateOfKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

/** "Nov 12, 2026" — the label History and Analytics group by */
export function businessDayDateLabel(key: string) {
  return dateOfKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Thursday Service" */
export function businessDayName(key: string) {
  return `${WEEKDAYS[dateOfKey(key).getDay()]} Service`
}

/** When the business day that contains `now` closes */
export function nextCutoffAt(now: Date = new Date(), cutoff?: string | null): Date {
  const { h, m } = parseCutoff(cutoff)
  const at = new Date(now)
  at.setHours(h, m, 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at
}

/** "4h 12m" / "35m" */
export function formatTimeLeft(ms: number) {
  const total = Math.max(0, Math.round(ms / 60_000))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h ? `${h}h ${pad(m)}m` : `${m}m`
}
