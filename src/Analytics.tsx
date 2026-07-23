import { useMemo, useState } from 'react'
import {
  Banknote,
  ChartColumn,
  HandCoins,
  PieChart,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react'
import { useAuth } from './auth'
import { formatSlshAmount, type NightEntry } from './data'
import LiveClock from './LiveClock'
import './Analytics.css'

type RangeKey = '7' | '30' | '90' | 'all'

const RANGES: { id: RangeKey; label: string }[] = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const PIE_COLORS = ['#4ade80', '#f5a05a', '#60a5fa', '#f472b6', '#a78bfa', '#fbbf24']

function parseEntryDate(dateStr: string): Date | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(12, 0, 0, 0)
  return d
}

function inRange(entry: NightEntry, range: RangeKey) {
  if (range === 'all') return true
  const date = parseEntryDate(entry.date)
  if (!date) return true
  const days = Number(range)
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return date >= cutoff
}

function BarChart({
  bars,
}: {
  bars: { label: string; sales: number; net: number }[]
}) {
  const max = Math.max(...bars.map((b) => Math.max(b.sales, b.net, 0)), 1)
  if (!bars.length) {
    return <p className="chart-empty">No nights in this range yet. Save a night to see the bar chart.</p>
  }
  return (
    <div className="bar-chart">
      <div className="bar-chart__legend">
        <span>
          <i className="swatch sales" /> Sales
        </span>
        <span>
          <i className="swatch net" /> Net benefit
        </span>
      </div>
      <div className="bar-chart__plot">
        {bars.map((bar) => (
          <div key={bar.label} className="bar-col">
            <div className="bar-col__bars">
              <div
                className="bar sales"
                style={{ height: `${Math.max(4, (bar.sales / max) * 100)}%` }}
                title={`Sales ${formatSlshAmount(bar.sales)}`}
              />
              <div
                className="bar net"
                style={{ height: `${Math.max(4, (Math.max(0, bar.net) / max) * 100)}%` }}
                title={`Net ${formatSlshAmount(bar.net)}`}
              />
            </div>
            <span className="bar-col__label">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PieChartView({
  slices,
}: {
  slices: { label: string; value: number; color: string }[]
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) {
    return <p className="chart-empty">No expense data yet. Finalize a night with expenses to fill this pie.</p>
  }

  const size = 220
  const cx = size / 2
  const cy = size / 2
  const r = 84
  let angle = -Math.PI / 2

  const paths = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const portion = (slice.value / total) * Math.PI * 2
      const start = angle
      const end = angle + Math.max(portion, 0.0001)
      angle = end
      const x1 = cx + r * Math.cos(start)
      const y1 = cy + r * Math.sin(start)
      const x2 = cx + r * Math.cos(end)
      const y2 = cy + r * Math.sin(end)
      const large = end - start > Math.PI ? 1 : 0
      const d =
        Math.abs(end - start - Math.PI * 2) < 0.0001
          ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
      return { ...slice, d }
    })

  return (
    <div className="pie-wrap">
      <div className="pie-stage">
        <svg viewBox={`0 0 ${size} ${size}`} className="pie-svg" aria-hidden>
          {paths.map((p) => (
            <path key={p.label} d={p.d} fill={p.color} stroke="#121212" strokeWidth="2" />
          ))}
          <circle cx={cx} cy={cy} r={42} fill="#121212" />
          <text x={cx} y={cy - 4} textAnchor="middle" className="pie-center-label">
            TOTAL
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="pie-center-value">
            {formatSlshAmount(total).replace(' SLSH', '')}
          </text>
        </svg>
      </div>
      <ul className="pie-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <span className="dot" style={{ background: s.color }} />
            <span className="name">{s.label}</span>
            <strong>{formatSlshAmount(s.value)}</strong>
            <em>{Math.round((s.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Analytics() {
  const { history } = useAuth()
  const [range, setRange] = useState<RangeKey>('30')

  const scoped = useMemo(
    () => history.filter((row) => inRange(row, range)).slice().reverse(),
    [history, range],
  )

  const stats = useMemo(() => {
    const nights = scoped.length
    const sales = scoped.reduce((s, r) => s + r.totalSales, 0)
    const cash = scoped.reduce((s, r) => s + r.cashSales, 0)
    const loan = scoped.reduce((s, r) => s + r.loanAmount, 0)
    const expenses = scoped.reduce((s, r) => s + r.expenses, 0)
    const net = scoped.reduce((s, r) => s + r.netProfit, 0)
    const covers = scoped.reduce((s, r) => s + r.covers, 0)
    return {
      nights,
      sales,
      cash,
      loan,
      expenses,
      net,
      covers,
      avgNet: nights ? Math.round(net / nights) : 0,
      avgSales: nights ? Math.round(sales / nights) : 0,
      loanShare: sales ? Math.round((loan / sales) * 100) : 0,
    }
  }, [scoped])

  const barData = useMemo(() => {
    const recent = scoped.slice(-12)
    return recent.map((row) => ({
      label: row.date.replace(/,?\s*\d{4}$/, '').trim(),
      sales: row.totalSales,
      net: row.netProfit,
    }))
  }, [scoped])

  const expenseSlices = useMemo(() => {
    const buckets = {
      Staff: 0,
      Chicken: 0,
      Wholesaler: 0,
      'Grocery spices': 0,
      Other: 0,
    }
    for (const row of scoped) {
      const b = row.expenseBreakdown
      if (b) {
        buckets.Staff += b.staff.reduce((s, p) => s + p.salary, 0)
        buckets.Chicken += b.chicken
        buckets.Wholesaler += b.wholesaler
        buckets['Grocery spices'] += b.grocerySpices
        buckets.Other += b.other
      } else if (row.expenses > 0) {
        buckets.Other += row.expenses
      }
    }
    return Object.entries(buckets)
      .filter(([, value]) => value > 0)
      .map(([label, value], i) => ({
        label,
        value,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
  }, [scoped])

  const cashLoanSlices = useMemo(() => {
    const slices = [
      { label: 'Cash collected', value: stats.cash, color: '#4ade80' },
      { label: 'On loan', value: stats.loan, color: '#f5a05a' },
    ].filter((s) => s.value > 0)
    return slices
  }, [stats.cash, stats.loan])

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>()
    for (const row of scoped) {
      for (const item of row.itemSales ?? []) {
        const cur = map.get(item.itemId) ?? { name: item.itemName, qty: 0, value: 0 }
        cur.qty += item.qty
        cur.value += item.value
        map.set(item.itemId, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 6)
  }, [scoped])

  const topBorrowers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; total: number }>()
    for (const row of scoped) {
      for (const loan of row.loans ?? []) {
        const key = `${loan.personName.trim().toLowerCase()}|${(loan.phoneNumber ?? '').trim()}`
        const cur = map.get(key) ?? {
          name: loan.personName.trim(),
          phone: (loan.phoneNumber ?? '').trim(),
          total: 0,
        }
        cur.total += loan.value
        map.set(key, cur)
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6)
  }, [scoped])

  const maxItemValue = Math.max(...topItems.map((i) => i.value), 1)

  return (
    <div className="page analytics-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">INSIGHTS</p>
          <h1>Analytics</h1>
          <p className="analytics-lead">
            Live kitchen performance from your saved nights — sales, loans, expenses, and net
            benefit.
          </p>
        </div>
        <div className="head-actions">
          <div className="range-tabs">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={range === r.id ? 'active' : undefined}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <LiveClock />
        </div>
      </div>

      {!history.length ? (
        <section className="panel analytics-empty">
          <ChartColumn size={28} />
          <h2>No data to analyze yet</h2>
          <p>
            Save nights from New Entry and Expenses. Charts and KPIs will appear here automatically.
          </p>
        </section>
      ) : (
        <>
          <div className="kpi-grid">
            <article className="kpi-card">
              <span>
                <TrendingUp size={16} /> Gross sales
              </span>
              <strong>{formatSlshAmount(stats.sales)}</strong>
              <em>Avg {formatSlshAmount(stats.avgSales)} / night</em>
            </article>
            <article className="kpi-card">
              <span>
                <Banknote size={16} /> Cash collected
              </span>
              <strong className="green">{formatSlshAmount(stats.cash)}</strong>
              <em>{stats.nights} nights in range</em>
            </article>
            <article className="kpi-card">
              <span>
                <HandCoins size={16} /> On loan
              </span>
              <strong className="orange">{formatSlshAmount(stats.loan)}</strong>
              <em>{stats.loanShare}% of sales</em>
            </article>
            <article className="kpi-card">
              <span>
                <Wallet size={16} /> Expenses
              </span>
              <strong className="orange">{formatSlshAmount(stats.expenses)}</strong>
              <em>{stats.covers} covers</em>
            </article>
            <article className="kpi-card kpi-card--wide">
              <span>
                <PieChart size={16} /> Net benefit
              </span>
              <strong className={stats.net < 0 ? 'red' : 'green'}>{formatSlshAmount(stats.net)}</strong>
              <em>Avg {formatSlshAmount(stats.avgNet)} per night</em>
            </article>
          </div>

          <div className="charts-grid">
            <section className="panel chart-panel">
              <header>
                <ChartColumn size={18} className="accent-green" />
                <div>
                  <h2>Sales &amp; net by night</h2>
                  <p>Bar chart · last {Math.min(12, scoped.length)} nights in range</p>
                </div>
              </header>
              <BarChart bars={barData} />
            </section>

            <section className="panel chart-panel">
              <header>
                <PieChart size={18} className="accent-orange" />
                <div>
                  <h2>Expense mix</h2>
                  <p>Pie chart · staff, chicken, wholesaler &amp; more</p>
                </div>
              </header>
              <PieChartView slices={expenseSlices} />
            </section>
          </div>

          <div className="charts-grid">
            <section className="panel chart-panel">
              <header>
                <Banknote size={18} className="accent-green" />
                <div>
                  <h2>Cash vs loan</h2>
                  <p>Share of money collected vs outstanding loans</p>
                </div>
              </header>
              <PieChartView slices={cashLoanSlices} />
            </section>

            <section className="panel chart-panel">
              <header>
                <Utensils size={18} className="accent-orange" />
                <div>
                  <h2>Top menu items</h2>
                  <p>Highest sales value in this range</p>
                </div>
              </header>
              {topItems.length ? (
                <ul className="rank-list">
                  {topItems.map((item, i) => (
                    <li key={item.name}>
                      <div className="rank-list__head">
                        <span>
                          {i + 1}. {item.name}
                        </span>
                        <strong>{formatSlshAmount(item.value)}</strong>
                      </div>
                      <div className="rank-bar">
                        <i style={{ width: `${(item.value / maxItemValue) * 100}%` }} />
                      </div>
                      <em>{item.qty} sold</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="chart-empty">Item breakdowns appear after you save nights with sales counts.</p>
              )}
            </section>
          </div>

          <section className="panel chart-panel">
            <header>
              <HandCoins size={18} className="accent-orange" />
              <div>
                <h2>Top loan names</h2>
                <p>People with the highest outstanding loan totals</p>
              </div>
            </header>
            {topBorrowers.length ? (
              <div className="borrower-grid">
                {topBorrowers.map((person, i) => (
                  <article key={`${person.name}-${person.phone}`} className="borrower-tile">
                    <span className="rank">#{i + 1}</span>
                    <div>
                      <strong>{person.name}</strong>
                      {person.phone ? <em>{person.phone}</em> : null}
                    </div>
                    <b>{formatSlshAmount(person.total)}</b>
                  </article>
                ))}
              </div>
            ) : (
              <p className="chart-empty">No loans recorded in this range.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
