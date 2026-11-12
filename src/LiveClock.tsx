import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function formatLiveDateTime(d = new Date()) {
  const mon = MONTHS[d.getMonth()]
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${mon} ${day} — ${year}, ${hh}:${mm}:${ss}`
}

/** Short form for phones, e.g. "NOV 12 · 10:11" */
export function formatShortDateTime(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`
}

export function formatEntryDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDayLabel(d = new Date()) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return `${days[d.getDay()]} Service`
}

/** Live date/time chip that ticks every second */
export default function LiveClock({ className = 'date-chip' }: { className?: string }) {
  const [label, setLabel] = useState(() => formatLiveDateTime())
  const [short, setShort] = useState(() => formatShortDateTime())

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setLabel(formatLiveDateTime(now))
      setShort(formatShortDateTime(now))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className={`${className} live-clock`} title={label}>
      <CalendarDays size={16} />
      <span className="clock-full">{label}</span>
      <span className="clock-short">{short}</span>
    </div>
  )
}
