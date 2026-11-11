import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from './auth'
import { formatSlshAmount, type NightEntry } from './data'
import LiveClock from './LiveClock'
import { downloadNightReport } from './report'
import { useSettings } from './appSettings'
import './History.css'

type DatePreset = 'today' | '3days' | 'week' | 'month' | 'year' | 'custom' | 'all'

const PRESET_OPTIONS: { id: DatePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '3days', label: 'Last 3 days' },
  { id: 'week', label: 'Last week' },
  { id: 'month', label: 'Last month' },
  { id: 'year', label: 'Last year' },
  { id: 'custom', label: 'Custom date' },
  { id: 'all', label: 'All time' },
]

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parseEntryDate(dateStr: string): Date | null {
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(12, 0, 0, 0)
  return parsed
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function rangeForPreset(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date()
  const to = startOfDay(now)
  to.setHours(23, 59, 59, 999)

  if (preset === 'all') return { from: null, to: null }
  if (preset === 'custom') return { from: null, to: null }

  const from = startOfDay(now)
  if (preset === 'today') {
    return { from, to }
  }
  if (preset === '3days') {
    from.setDate(from.getDate() - 2)
    return { from, to }
  }
  if (preset === 'week') {
    from.setDate(from.getDate() - 6)
    return { from, to }
  }
  if (preset === 'month') {
    from.setDate(from.getDate() - 29)
    return { from, to }
  }
  // year
  from.setFullYear(from.getFullYear() - 1)
  from.setDate(from.getDate() + 1)
  return { from, to }
}

function presetLabel(preset: DatePreset, customLabel?: string) {
  if (preset === 'custom' && customLabel) return customLabel
  return PRESET_OPTIONS.find((o) => o.id === preset)?.label ?? 'Date range'
}

function CashCell({
  slsh,
  signed,
  tone,
}: {
  slsh: number
  signed?: boolean
  tone?: 'expense' | 'profit'
}) {
  return (
    <div className={`cash-cell ${tone ?? ''}`}>
      <strong>{formatSlshAmount(slsh, { signed })}</strong>
    </div>
  )
}

function loanNames(row: NightEntry) {
  const loans = row.loans ?? []
  if (!loans.length) return '—'
  const labels = [
    ...new Set(
      loans
        .map((l) => {
          const name = l.personName.trim()
          const phone = (l.phoneNumber ?? '').trim()
          if (!name) return ''
          return phone ? `${name} (${phone})` : name
        })
        .filter(Boolean),
    ),
  ]
  return labels.join(', ')
}

function loansByPerson(row: NightEntry) {
  const map = new Map<string, { name: string; phone: string; total: number; lines: NightEntry['loans'] }>()
  for (const loan of row.loans ?? []) {
    const key = `${loan.personName.trim().toLowerCase()}|${(loan.phoneNumber ?? '').trim()}`
    const existing = map.get(key)
    if (existing) {
      existing.total += loan.value
      existing.lines.push(loan)
    } else {
      map.set(key, {
        name: loan.personName.trim(),
        phone: (loan.phoneNumber ?? '').trim(),
        total: loan.value,
        lines: [loan],
      })
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

const PAGE_SIZE = 10

export default function History() {
  const { history } = useAuth()
  const { settings } = useSettings()
  const now = new Date()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<NightEntry | null>(null)
  const [preset, setPreset] = useState<DatePreset>('all')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customYear, setCustomYear] = useState(now.getFullYear())
  const [customMonth, setCustomMonth] = useState(now.getMonth())
  const [customDay, setCustomDay] = useState(now.getDate())
  const [appliedCustom, setAppliedCustom] = useState<{
    year: number
    month: number
    day: number
  } | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    const years: number[] = []
    for (let y = current; y >= current - 10; y -= 1) years.push(y)
    return years
  }, [])

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(customYear, customMonth) }, (_, i) => i + 1),
    [customMonth, customYear],
  )

  useEffect(() => {
    const maxDay = daysInMonth(customYear, customMonth)
    if (customDay > maxDay) setCustomDay(maxDay)
  }, [customDay, customMonth, customYear])

  useEffect(() => {
    if (!pickerOpen) return
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const dateRange = useMemo(() => {
    if (preset === 'custom' && appliedCustom) {
      const from = new Date(appliedCustom.year, appliedCustom.month, appliedCustom.day, 0, 0, 0, 0)
      const to = new Date(appliedCustom.year, appliedCustom.month, appliedCustom.day, 23, 59, 59, 999)
      return { from, to }
    }
    return rangeForPreset(preset)
  }, [appliedCustom, preset])

  const customChipLabel = appliedCustom
    ? `${MONTH_OPTIONS[appliedCustom.month].slice(0, 3)} ${appliedCustom.day}, ${appliedCustom.year}`
    : 'Custom date'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return history.filter((row) => {
      const entryDate = parseEntryDate(row.date)
      if (dateRange.from && dateRange.to && entryDate) {
        if (entryDate < dateRange.from || entryDate > dateRange.to) return false
      } else if (dateRange.from && dateRange.to && !entryDate) {
        return false
      }

      if (!q) return true
      const names = loanNames(row).toLowerCase()
      return (
        row.date.toLowerCase().includes(q) ||
        row.dayLabel.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q) ||
        names.includes(q)
      )
    })
  }, [dateRange.from, dateRange.to, history, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const rows = filtered.slice(start, start + PAGE_SIZE)

  const avgNetSlsh = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + r.netProfit, 0) / filtered.length)
    : 0
  const rangeCovers = filtered.reduce((s, r) => s + r.covers, 0)
  const avgCovers = filtered.length ? Math.round(rangeCovers / filtered.length) : 0

  const trendHeights = useMemo(() => {
    if (!filtered.length) return Array.from({ length: 12 }, () => 8)
    const nets = filtered.slice(0, 12).map((r) => r.netProfit).reverse()
    const max = Math.max(...nets.map((n) => Math.abs(n)), 1)
    while (nets.length < 12) nets.unshift(0)
    return nets.map((n) => Math.max(8, Math.round((Math.abs(n) / max) * 100)))
  }, [filtered])

  const detailPeople = selected ? loansByPerson(selected) : []
  const breakdown = selected?.expenseBreakdown

  function choosePreset(next: DatePreset) {
    setPreset(next)
    setPage(1)
    if (next !== 'custom') {
      setAppliedCustom(null)
      setPickerOpen(false)
    }
  }

  function applyCustomDate() {
    setPreset('custom')
    setAppliedCustom({ year: customYear, month: customMonth, day: customDay })
    setPage(1)
    setPickerOpen(false)
  }

  return (
    <div className={`page history-page ${settings.compactTables ? 'is-compact' : ''}`}>
      <div className="history-toolbar">
        <div>
          <h1>Sales History</h1>
          <p className="rate-note">All amounts in Somaliland Shillings (SLSH)</p>
        </div>
        <div className="history-actions">
          <label className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search date, status, loan name..."
            />
          </label>

          <div className="date-range" ref={pickerRef}>
            <button
              type="button"
              className={`chip-btn date-range__trigger ${pickerOpen ? 'is-open' : ''}`}
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
              aria-haspopup="dialog"
            >
              <CalendarDays size={16} />
              <span>{presetLabel(preset, customChipLabel)}</span>
              <ChevronDown size={15} />
            </button>

            {pickerOpen ? (
              <div className="date-range__panel" role="dialog" aria-label="Filter by date">
                <p className="date-range__title">Quick ranges</p>
                <div className="date-range__presets">
                  {PRESET_OPTIONS.filter((o) => o.id !== 'custom').map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={preset === option.id ? 'active' : undefined}
                      onClick={() => choosePreset(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <p className="date-range__title">Custom date</p>
                <div className="date-range__custom">
                  <label>
                    <span>Year</span>
                    <select
                      value={customYear}
                      onChange={(e) => {
                        setCustomYear(Number(e.target.value))
                        setPreset('custom')
                      }}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Month</span>
                    <select
                      value={customMonth}
                      onChange={(e) => {
                        setCustomMonth(Number(e.target.value))
                        setPreset('custom')
                      }}
                    >
                      {MONTH_OPTIONS.map((name, index) => (
                        <option key={name} value={index}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Day</span>
                    <select
                      value={customDay}
                      onChange={(e) => {
                        setCustomDay(Number(e.target.value))
                        setPreset('custom')
                      }}
                    >
                      {dayOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="date-range__apply" onClick={applyCustomDate}>
                  Apply custom date
                </button>
              </div>
            ) : null}
          </div>

          <LiveClock />
        </div>
      </div>

      <div className="metric-row">
        <article className="metric-card">
          <span className="metric-label">AVG NIGHTLY NET</span>
          <strong className="metric-value green">{formatSlshAmount(avgNetSlsh)}</strong>
          <div className="metric-foot green">
            <TrendingUp size={14} />
            {presetLabel(preset, customChipLabel)}
          </div>
        </article>

        <article className="metric-card">
          <span className="metric-label">PROFIT TREND</span>
          <div className="bars" aria-hidden>
            {trendHeights.map((h, i) => (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={i >= trendHeights.length - 3 ? 'hot' : undefined}
              />
            ))}
          </div>
          <div className="bars-labels">
            <span>{filtered.length ? 'RANGE' : 'NO DATA'}</span>
            <span>NOW</span>
          </div>
        </article>

        <article className="metric-card">
          <span className="metric-label">COVERS IN RANGE</span>
          <strong className="metric-value gold">{rangeCovers.toLocaleString()}</strong>
          <div className="metric-foot muted">
            <Users size={14} />
            Avg. {avgCovers} per service · {filtered.length} nights
          </div>
        </article>
      </div>

      <section className="table-card">
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>TOTAL SALES</th>
                <th>CASH</th>
                <th>LOAN</th>
                <th>EXPENSES</th>
                <th>CASH NET</th>
                <th>COVERS</th>
                <th>LOAN NAMES</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Date">
                    <div className="date-cell">
                      <strong>{row.date}</strong>
                      <span>
                        {row.dayLabel}
                        {row.timeLabel ? ` · ${row.timeLabel}` : ''}
                      </span>
                    </div>
                  </td>
                  <td data-label="Total sales">
                    <CashCell slsh={row.totalSales} />
                  </td>
                  <td data-label="Cash">
                    <CashCell slsh={row.cashSales ?? row.totalSales - (row.loanAmount ?? 0)} />
                  </td>
                  <td data-label="Loan">
                    <CashCell slsh={row.loanAmount ?? 0} tone="expense" />
                  </td>
                  <td data-label="Expenses">
                    <CashCell slsh={-row.expenses} tone="expense" />
                  </td>
                  <td data-label="Cash net">
                    <CashCell slsh={row.netProfit} signed tone="profit" />
                  </td>
                  <td data-label="Covers">
                    <div className="date-cell">
                      <strong>{row.covers}</strong>
                      <span>{row.loanCovers ?? 0} loan</span>
                    </div>
                  </td>
                  <td data-label="Loan names">
                    <div className="loan-names">{loanNames(row)}</div>
                  </td>
                  <td data-label="Status">
                    <span className={`status ${row.status.toLowerCase()}`}>{row.status}</span>
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="more-btn"
                        aria-label="View night details"
                        title="View details"
                        onClick={() => setSelected(row)}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className="more-btn"
                        aria-label="Download night report"
                        title="Download night report"
                        onClick={() => downloadNightReport(row)}
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="history-empty-cell">
                    No saved nights yet. Save from New Entry or Expenses to build history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="table-footer">
          <span>
            Showing {filtered.length === 0 ? 0 : start + 1}-{Math.min(start + PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length} entries
          </span>
          <div className="pager">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={n === currentPage ? 'active' : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {totalPages > 4 ? <span className="ellipsis">…</span> : null}
            {totalPages > 3 ? (
              <button
                type="button"
                className={currentPage === totalPages ? 'active' : undefined}
                onClick={() => setPage(totalPages)}
              >
                {totalPages}
              </button>
            ) : null}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>

      {selected ? (
        <div className="history-modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="history-modal__head">
              <div>
                <p className="eyebrow">NIGHT DETAIL</p>
                <h2 id="history-detail-title">
                  {selected.date}
                  {selected.timeLabel ? ` · ${selected.timeLabel}` : ''}
                </h2>
                <p>
                  {selected.dayLabel} · <span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span>
                </p>
              </div>
              <div className="history-modal__actions">
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => downloadNightReport(selected)}
                >
                  <Download size={16} />
                  Download report
                </button>
                <button
                  type="button"
                  className="icon-square"
                  aria-label="Close"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="detail-money-grid">
              <div>
                <span>Gross sales</span>
                <strong>{formatSlshAmount(selected.totalSales)}</strong>
              </div>
              <div>
                <span>Cash collected</span>
                <strong className="ok">{formatSlshAmount(selected.cashSales)}</strong>
              </div>
              <div>
                <span>On loan</span>
                <strong className="warn">{formatSlshAmount(selected.loanAmount)}</strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong className="warn">{formatSlshAmount(selected.expenses)}</strong>
              </div>
              <div className="span-2">
                <span>Net benefit</span>
                <strong className="ok">{formatSlshAmount(selected.netProfit)}</strong>
              </div>
            </div>

            {selected.itemSales?.length ? (
              <section className="detail-section">
                <h3>Item sales</h3>
                <ul className="detail-list">
                  {selected.itemSales.map((row) => (
                    <li key={row.itemId}>
                      <span>
                        {row.itemName} × {row.qty}
                      </span>
                      <strong>{formatSlshAmount(row.value)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="detail-section">
              <h3>Loans (names &amp; phones)</h3>
              {detailPeople.length ? (
                <div className="detail-loan-grid">
                  {detailPeople.map((person) => (
                    <article key={`${person.name}-${person.phone}`} className="detail-loan-card">
                      <header>
                        <div>
                          <strong>{person.name}</strong>
                          {person.phone ? <em>{person.phone}</em> : null}
                        </div>
                        <span>{formatSlshAmount(person.total)}</span>
                      </header>
                      <ul>
                        {person.lines.map((line) => (
                          <li key={line.id}>
                            {line.itemName} × {line.qty} · {formatSlshAmount(line.value)}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="detail-empty">No loans this night.</p>
              )}
            </section>

            {breakdown ? (
              <section className="detail-section">
                <h3>Expense breakdown</h3>
                <ul className="detail-list">
                  {breakdown.staff.map((person, i) => (
                    <li key={`${person.name}-${i}`}>
                      <span>Staff · {person.name}</span>
                      <strong>{formatSlshAmount(person.salary)}</strong>
                    </li>
                  ))}
                  <li>
                    <span>Chicken</span>
                    <strong>{formatSlshAmount(breakdown.chicken)}</strong>
                  </li>
                  <li>
                    <span>Wholesaler</span>
                    <strong>{formatSlshAmount(breakdown.wholesaler)}</strong>
                  </li>
                  <li>
                    <span>Grocery spices</span>
                    <strong>{formatSlshAmount(breakdown.grocerySpices)}</strong>
                  </li>
                  <li>
                    <span>Other</span>
                    <strong>{formatSlshAmount(breakdown.other)}</strong>
                  </li>
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
