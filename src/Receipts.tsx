import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  ChevronRight,
  CircleCheck,
  Printer,
  ReceiptText,
  Search,
  Undo2,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useAuth } from './auth'
import { useLedger } from './ledger'
import { useSettings } from './appSettings'
import { formatSlshAmount, type PosOrder } from './data'
import { receiptNo } from './lib/pos'
import LiveClock from './LiveClock'
import './Receipts.css'

type Filter = 'all' | 'paid' | 'returned'

const RETURN_REASONS = ['Customer left', 'Wrong order', 'Entered by mistake', 'Other']

function itemCount(order: PosOrder) {
  return order.lines.reduce((sum, l) => sum + l.qty, 0)
}

export default function Receipts() {
  const { history, saveNight } = useAuth()
  const { nightDraft, setOrderReturned } = useLedger()
  const { settings } = useSettings()

  const [nightId, setNightId] = useState<string>('tonight')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState(RETURN_REASONS[0])
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  const pastNights = useMemo(
    () => history.filter((h) => h.id !== nightDraft?.id && (h.orders?.length ?? 0) > 0),
    [history, nightDraft?.id],
  )

  const isTonight = nightId === 'tonight'
  const night = isTonight ? null : pastNights.find((h) => h.id === nightId) ?? null
  const orders = useMemo<PosOrder[]>(
    () => (isTonight ? nightDraft?.orders ?? [] : night?.orders ?? []),
    [isTonight, night, nightDraft?.orders],
  )
  const nightLabel = isTonight ? nightDraft?.date || 'Tonight' : night?.date ?? ''

  // the chosen past night disappeared (e.g. history cleared on another device)
  useEffect(() => {
    if (!isTonight && !night) setNightId('tonight')
  }, [isTonight, night])

  const summary = useMemo(() => {
    const paid = orders.filter((o) => !o.returned)
    const returned = orders.filter((o) => o.returned)
    return {
      paidCount: paid.length,
      paidValue: paid.reduce((s, o) => s + o.total, 0),
      returnedCount: returned.length,
      returnedValue: returned.reduce((s, o) => s + o.total, 0),
    }
  }, [orders])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter === 'paid' && o.returned) return false
      if (filter === 'returned' && !o.returned) return false
      if (!q) return true
      const hay = [
        `#${receiptNo(o, orders)}`,
        String(receiptNo(o, orders)),
        o.time,
        o.waiter ?? '',
        ...o.lines.map((l) => l.itemName),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [filter, orders, query])

  const open = openId ? orders.find((o) => o.id === openId) ?? null : null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeReceipt()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  function openReceipt(order: PosOrder) {
    setOpenId(order.id)
    setReturning(false)
    setReason(RETURN_REASONS[0])
    setError('')
  }

  function closeReceipt() {
    setOpenId(null)
    setReturning(false)
    setError('')
  }

  function applyReturn(order: PosOrder, returned: boolean) {
    const res = setOrderReturned(order.id, returned, returned ? reason : null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (res.entry) saveNight(res.entry)
    const no = receiptNo(order, orders)
    setFlash(
      returned
        ? `Receipt #${no} returned — ${formatSlshAmount(order.total)} taken off tonight’s sales.`
        : `Receipt #${no} restored to tonight’s sales.`,
    )
    window.setTimeout(() => setFlash(''), 3200)
    setReturning(false)
    setError('')
    if (returned) closeReceipt()
  }

  return (
    <div className="page receipts-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">SALES VOUCHERS</p>
          <h1>Receipts</h1>
        </div>
        <div className="head-actions">
          <label className="receipts-night">
            <span className="sr-only">Night</span>
            <select value={nightId} onChange={(e) => setNightId(e.target.value)}>
              <option value="tonight">Tonight</option>
              {pastNights.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.date} · {h.orders?.length} receipts
                </option>
              ))}
            </select>
          </label>
          <LiveClock />
        </div>
      </div>

      {flash ? <p className="entry-save-ok receipts-flash">{flash}</p> : null}

      <div className="receipt-stats">
        <article className="receipt-stat">
          <span>
            <CircleCheck size={15} /> Paid receipts
          </span>
          <strong>{summary.paidCount}</strong>
          <em>{formatSlshAmount(summary.paidValue)}</em>
        </article>
        <article className="receipt-stat receipt-stat--returned">
          <span>
            <Undo2 size={15} /> Returned
          </span>
          <strong>{summary.returnedCount}</strong>
          <em>{formatSlshAmount(summary.returnedValue)}</em>
        </article>
      </div>

      <div className="receipt-toolbar">
        <div className="receipt-filters" role="tablist" aria-label="Receipt status">
          {(
            [
              ['all', 'All', orders.length],
              ['paid', 'Paid', summary.paidCount],
              ['returned', 'Returned', summary.returnedCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'active' : undefined}
              onClick={() => setFilter(key)}
            >
              {label} <b>{count}</b>
            </button>
          ))}
        </div>
        <label className="search receipt-search">
          <Search size={16} />
          <input
            value={query}
            placeholder="Receipt #, item or waiter"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {!isTonight ? (
        <p className="receipt-note">
          Past nights are view-only. Returns can only be made on tonight’s receipts.
        </p>
      ) : null}

      {visible.length ? (
        <ul className="receipt-list">
          {visible.map((order) => {
            const no = receiptNo(order, orders)
            return (
              <li key={order.id}>
                <button
                  type="button"
                  className={`receipt-card ${order.returned ? 'is-returned' : ''}`}
                  onClick={() => openReceipt(order)}
                >
                  <span className="receipt-card__no">
                    <small>No.</small>
                    {no}
                  </span>
                  <span className="receipt-card__body">
                    <strong>{order.lines.map((l) => `${l.qty}× ${l.itemName}`).join(', ')}</strong>
                    <span className="receipt-card__meta">
                      {order.time}
                      <i aria-hidden>·</i>
                      {itemCount(order)} item{itemCount(order) === 1 ? '' : 's'}
                      {order.waiter ? (
                        <>
                          <i aria-hidden>·</i>
                          <span className="receipt-card__waiter">
                            <Users size={12} /> {order.waiter}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="receipt-card__side">
                    <b>{order.total.toLocaleString()}</b>
                    <span className={`receipt-badge ${order.returned ? 'is-returned' : 'is-paid'}`}>
                      {order.returned ? 'Returned' : 'Paid'}
                    </span>
                  </span>
                  <ChevronRight size={18} className="receipt-card__chev" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <section className="panel receipt-empty">
          <ReceiptText size={30} />
          <h2>{orders.length ? 'No receipts match' : 'No receipts yet'}</h2>
          <p>
            {orders.length
              ? 'Try another filter or search.'
              : 'Every sale you complete on New Entry gets a numbered receipt here.'}
          </p>
          {!orders.length && isTonight ? (
            <Link to="/app/entry" className="expenses-link-btn">
              Go to New Entry
            </Link>
          ) : null}
        </section>
      )}

      {open ? (
        <div className="receipt-backdrop" role="presentation" onClick={closeReceipt}>
          <div
            className="receipt-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Receipt ${receiptNo(open, orders)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="receipt-sheet__close" aria-label="Close receipt" onClick={closeReceipt}>
              <X size={18} />
            </button>

            <article className={`receipt-paper ${open.returned ? 'is-returned' : ''}`}>
              <header className="receipt-paper__head">
                <span className="brand-mark">
                  <UtensilsCrossed size={18} strokeWidth={2.3} />
                </span>
                <strong>{settings.kitchenName}</strong>
                <span>Sales receipt</span>
              </header>

              <div className="receipt-paper__info">
                <div>
                  <small>Receipt</small>
                  <b>#{receiptNo(open, orders)}</b>
                </div>
                <div>
                  <small>Date</small>
                  <b>{nightLabel}</b>
                </div>
                <div>
                  <small>Time</small>
                  <b>{open.time}</b>
                </div>
              </div>

              <ul className="receipt-paper__lines">
                {open.lines.map((line) => (
                  <li key={line.itemId}>
                    <span>
                      <b>{line.qty} ×</b> {line.itemName}
                      <small>{line.unitPrice.toLocaleString()} each</small>
                    </span>
                    <strong>{(line.qty * line.unitPrice).toLocaleString()}</strong>
                  </li>
                ))}
              </ul>

              <div className="receipt-paper__total">
                <span>Total</span>
                <strong>{formatSlshAmount(open.total)}</strong>
              </div>

              {open.waiter ? (
                <p className="receipt-paper__row">
                  <span>Tea waiter</span>
                  <b>{open.waiter}</b>
                </p>
              ) : null}

              <div className={`receipt-paper__status ${open.returned ? 'is-returned' : 'is-paid'}`}>
                {open.returned ? (
                  <>
                    <Undo2 size={16} />
                    <span>
                      Returned at {open.returned.time}
                      {open.returned.reason ? ` · ${open.returned.reason}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <CircleCheck size={16} />
                    <span>Paid</span>
                  </>
                )}
              </div>

              <p className="receipt-paper__thanks">Mahadsanid · Thank you!</p>
            </article>

            {error ? <p className="pos-error receipt-sheet__error">{error}</p> : null}

            {returning && !open.returned ? (
              <div className="receipt-return">
                <p className="receipt-return__title">Why is this sale returned?</p>
                <div className="receipt-return__reasons">
                  {RETURN_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={reason === r ? 'active' : undefined}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="receipt-actions">
                  <button type="button" className="receipt-btn" onClick={() => setReturning(false)}>
                    Keep sale
                  </button>
                  <button type="button" className="receipt-btn receipt-btn--danger" onClick={() => applyReturn(open, true)}>
                    <Ban size={16} />
                    Return {formatSlshAmount(open.total)}
                  </button>
                </div>
              </div>
            ) : (
              <div className="receipt-actions">
                <button type="button" className="receipt-btn" onClick={() => window.print()}>
                  <Printer size={16} />
                  Print
                </button>
                {isTonight && !open.returned ? (
                  <button
                    type="button"
                    className="receipt-btn receipt-btn--danger"
                    onClick={() => {
                      setReturning(true)
                      setError('')
                    }}
                  >
                    <Undo2 size={16} />
                    Return sale
                  </button>
                ) : null}
                {isTonight && open.returned ? (
                  <button type="button" className="receipt-btn receipt-btn--primary" onClick={() => applyReturn(open, false)}>
                    <CircleCheck size={16} />
                    Restore sale
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
