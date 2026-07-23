import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartColumn,
  Download,
  HandCoins,
  Minus,
  Plus,
  Save,
  Tags,
  Trash2,
  UserRound,
  Phone,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import { usePricing } from './pricing'
import { useLedger } from './ledger'
import {
  MENU_SECTIONS,
  formatSlshAmount,
  type LoanRecord,
  type MenuItem,
  type NightEntry,
} from './data'
import { getMenuIcon } from './menuIcons'
import LiveClock, { formatDayLabel, formatEntryDate } from './LiveClock'
import { downloadNightReport } from './report'
import './NewEntry.css'

function emptyCounts(menu: MenuItem[]) {
  return Object.fromEntries(menu.map((item) => [item.id, 0])) as Record<string, number>
}

function timeNowLabel() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export default function NewEntry() {
  const { saveNight } = useAuth()
  const { menu } = usePricing()
  const {
    setNightDraft,
    nightDraft,
    nightSession,
    lastAutoSavedAt,
    markAutoSaved,
    beginFreshNight,
    expenses,
    operationalTotal,
    allDeductions,
    finalRemaining,
    buildHistoryEntry,
  } = useLedger()
  const nightIdRef = useRef(nightDraft?.id ?? String(Date.now()))
  const skipFirstAutoSave = useRef(true)
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const base = emptyCounts(menu)
    if (!nightDraft?.itemSales?.length) return base
    for (const row of nightDraft.itemSales) {
      if (row.itemId in base) base[row.itemId] = row.qty
    }
    return base
  })
  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>(() => nightDraft?.loans ?? [])
  const [loanDrafts, setLoanDrafts] = useState<Record<string, { name: string; phone: string; qty: number }>>({})
  const [loanError, setLoanError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [autoSavedFlash, setAutoSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState('')

  /** Keep counts aligned when menu items are added or removed */
  useEffect(() => {
    setCounts((prev) => {
      const next = emptyCounts(menu)
      for (const item of menu) next[item.id] = prev[item.id] ?? 0
      return next
    })
    setLoanRecords((prev) => prev.filter((loan) => menu.some((item) => item.id === loan.itemId)))
  }, [menu])

  const soldItems = useMemo(
    () => menu.filter((item) => (counts[item.id] ?? 0) > 0),
    [counts, menu],
  )

  const loanQtyByItem = useMemo(() => {
    const map: Record<string, number> = emptyCounts(menu)
    for (const loan of loanRecords) {
      map[loan.itemId] = (map[loan.itemId] ?? 0) + loan.qty
    }
    return map
  }, [loanRecords, menu])

  const grossSlsh = useMemo(
    () => menu.reduce((sum, item) => sum + item.price * (counts[item.id] ?? 0), 0),
    [counts, menu],
  )

  const loanSlsh = useMemo(
    () => loanRecords.reduce((sum, loan) => sum + loan.value, 0),
    [loanRecords],
  )

  const cashSlsh = grossSlsh - loanSlsh
  const covers = Object.values(counts).reduce((a, b) => a + b, 0)
  const loanCovers = loanRecords.reduce((a, b) => a + b.qty, 0)
  const paidCovers = covers - loanCovers

  const itemSales = useMemo(
    () =>
      menu
        .map((item) => {
          const qty = counts[item.id] ?? 0
          return {
            itemId: item.id,
            itemName: item.name,
            qty,
            unitPrice: item.price,
            value: item.price * qty,
          }
        })
        .filter((row) => row.qty > 0),
    [counts, menu],
  )

  useEffect(() => {
    setNightDraft({
      id: nightIdRef.current,
      date: formatEntryDate(),
      dayLabel: formatDayLabel(),
      totalSales: grossSlsh,
      loanAmount: loanSlsh,
      cashSales: cashSlsh,
      covers,
      loanCovers,
      loans: loanRecords,
      itemSales,
    })
  }, [
    cashSlsh,
    covers,
    grossSlsh,
    itemSales,
    loanCovers,
    loanRecords,
    loanSlsh,
    setNightDraft,
  ])

  /** After a fresh-night refresh, wipe local counters on both pages */
  useEffect(() => {
    if (nightSession === 0) return
    nightIdRef.current = String(Date.now())
    setCounts(emptyCounts(menu))
    setLoanRecords([])
    setLoanDrafts({})
    setLoanError('')
    setSaveError('')
    skipFirstAutoSave.current = true
    // intentionally only react to nightSession — menu sync is handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nightSession])

  /** Auto-save to History whenever sales / loans change */
  useEffect(() => {
    if (skipFirstAutoSave.current) {
      skipFirstAutoSave.current = false
      return
    }
    if (!covers && !loanRecords.length) return

    const timer = window.setTimeout(() => {
      const draft = {
        id: nightIdRef.current,
        date: formatEntryDate(),
        dayLabel: formatDayLabel(),
        totalSales: grossSlsh,
        loanAmount: loanSlsh,
        cashSales: cashSlsh,
        covers,
        loanCovers,
        loans: loanRecords,
        itemSales,
      }
      setNightDraft(draft)
      const entry: NightEntry = {
        ...draft,
        timeLabel: timeNowLabel(),
        expenses: operationalTotal,
        expenseBreakdown: {
          staff: expenses.staff.map((s) => ({ name: s.name, salary: s.salary })),
          chicken: expenses.chicken,
          wholesaler: expenses.wholesaler,
          grocerySpices: expenses.grocerySpices,
          other: expenses.other,
        },
        netProfit: cashSlsh - operationalTotal,
        status: operationalTotal > 0 || expenses.staff.length > 0 ? 'FINALIZED' : 'SALES',
      }
      saveNight(entry)
      markAutoSaved()
      setAutoSavedFlash(true)
      window.setTimeout(() => setAutoSavedFlash(false), 1600)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [
    cashSlsh,
    covers,
    expenses,
    grossSlsh,
    itemSales,
    loanCovers,
    loanRecords,
    loanSlsh,
    markAutoSaved,
    operationalTotal,
    saveNight,
    setNightDraft,
  ])

  const loansByPerson = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; total: number; lines: LoanRecord[] }>()
    for (const loan of loanRecords) {
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
  }, [loanRecords])

  /** Sales-only snapshot for download when needed */
  function buildSalesEntry(): NightEntry {
    return (
      buildHistoryEntry() ?? {
        id: nightIdRef.current,
        date: formatEntryDate(),
        dayLabel: formatDayLabel(),
        timeLabel: timeNowLabel(),
        totalSales: grossSlsh,
        loanAmount: loanSlsh,
        cashSales: cashSlsh,
        expenses: 0,
        netProfit: cashSlsh,
        covers,
        loanCovers,
        loans: loanRecords,
        itemSales,
        status: 'SALES',
      }
    )
  }

  function bumpSold(id: string, delta: number) {
    setCounts((prev) => {
      const nextQty = Math.max(0, (prev[id] ?? 0) + delta)
      const loaned = loanQtyByItem[id] ?? 0
      if (nextQty < loaned) {
        setLoanError(`Cannot go below loaned qty (${loaned}) for this item. Remove loans first.`)
        return prev
      }
      setLoanError('')
      return { ...prev, [id]: nextQty }
    })
  }

  function getDraft(itemId: string) {
    return loanDrafts[itemId] ?? { name: '', phone: '', qty: 1 }
  }

  function setDraftName(itemId: string, name: string) {
    setLoanDrafts((prev) => ({
      ...prev,
      [itemId]: { ...getDraft(itemId), name },
    }))
  }

  function setDraftPhone(itemId: string, phone: string) {
    setLoanDrafts((prev) => ({
      ...prev,
      [itemId]: { ...getDraft(itemId), phone },
    }))
  }

  function bumpDraftQty(itemId: string, delta: number) {
    const remaining = (counts[itemId] ?? 0) - (loanQtyByItem[itemId] ?? 0)
    setLoanDrafts((prev) => {
      const current = prev[itemId] ?? { name: '', phone: '', qty: 1 }
      const next = Math.max(1, Math.min(remaining || 1, current.qty + delta))
      return { ...prev, [itemId]: { ...current, qty: next } }
    })
  }

  function takeLoan(itemId: string) {
    const item = menu.find((m) => m.id === itemId)
    const draft = getDraft(itemId)
    const name = draft.name.trim()
    const phone = draft.phone.trim()
    const qty = Math.max(0, Math.floor(draft.qty || 0))
    if (!item) return
    if (!name) {
      setLoanError(`Enter the person name for ${item.name} loan.`)
      return
    }
    if (!phone) {
      setLoanError(`Enter the phone number for ${name}.`)
      return
    }
    if (qty < 1) {
      setLoanError('Loan quantity must be at least 1.')
      return
    }
    const sold = counts[item.id] ?? 0
    const alreadyLoaned = loanQtyByItem[item.id] ?? 0
    const remaining = sold - alreadyLoaned
    if (qty > remaining) {
      setLoanError(
        `Only ${remaining} of ${item.name} left (sold ${sold}, already loaned ${alreadyLoaned}).`,
      )
      return
    }

    const record: LoanRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      personName: name,
      phoneNumber: phone,
      itemId: item.id,
      itemName: item.name,
      qty,
      unitPrice: item.price,
      value: item.price * qty,
    }
    setLoanRecords((prev) => [...prev, record])
    setLoanDrafts((prev) => ({
      ...prev,
      [itemId]: { name: draft.name, phone: draft.phone, qty: 1 },
    }))
    setLoanError('')
  }

  function adjustLoanRecord(id: string, delta: number) {
    setLoanRecords((prev) =>
      prev
        .map((loan) => {
          if (loan.id !== id) return loan
          const qty = Math.max(0, loan.qty + delta)
          if (qty === 0) return null
          return { ...loan, qty, value: loan.unitPrice * qty }
        })
        .filter((loan): loan is LoanRecord => loan !== null),
    )
    setLoanError('')
  }

  function removeLoan(id: string) {
    setLoanRecords((prev) => prev.filter((loan) => loan.id !== id))
    setLoanError('')
  }

  function saveAndRefresh() {
    if (!covers && !loanRecords.length) {
      setSaveError('Add tonight’s sales (or loans) before saving.')
      return
    }
    const entry = buildHistoryEntry()
    if (entry) saveNight(entry)
    setSaveError('')
    setSavedFlash(true)
    beginFreshNight()
    window.setTimeout(() => setSavedFlash(false), 2200)
  }

  function downloadReport() {
    if (!covers && !loanRecords.length) {
      setSaveError('Nothing to download yet — count sold items first.')
      return
    }
    downloadNightReport(buildSalesEntry())
    setSaveError('')
  }

  return (
    <div className="page entry-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">MANAGEMENT CONSOLE</p>
          <h1>Daily Billing Entry</h1>
        </div>
        <div className="head-actions">
          <Link to="/app/prices" className="rate-badge rate-badge--link" title="Edit tonight's prices">
            <Tags size={15} />
            <strong>Edit SLSH Prices</strong>
          </Link>
          <button type="button" className="date-chip download-chip" onClick={downloadReport}>
            <Download size={16} />
            Download night report
          </button>
          <LiveClock />
        </div>
      </div>
      {saveError ? <p className="entry-save-error">{saveError}</p> : null}
      {autoSavedFlash || lastAutoSavedAt ? (
        <p className="entry-save-ok">
          {autoSavedFlash
            ? 'Auto-saved to History — Expenses page is updated too.'
            : `Last auto-save ${lastAutoSavedAt}`}
        </p>
      ) : null}
      {savedFlash ? (
        <p className="entry-save-ok">
          Night saved to History. New Entry and Expenses were refreshed for a new night.
        </p>
      ) : null}

      {MENU_SECTIONS.map((section) => {
        const items = menu.filter((item) => item.category === section.key)
        if (!items.length) return null
        return (
          <section key={section.key} className={`menu-section menu-section--${section.key}`}>
            <div className="menu-section__head">
              <div>
                <h2>{section.title}</h2>
                <p>{section.hint} · count sold, then assign loans by name</p>
              </div>
            </div>
            <div className="item-grid">
              {items.map((item) => {
                const Icon = getMenuIcon(item.icon)
                const qty = counts[item.id] ?? 0
                const loanQty = loanQtyByItem[item.id] ?? 0
                const paidQty = qty - loanQty
                const lineTotal = item.price * qty
                const loanTotal = item.price * loanQty
                return (
                  <article key={item.id} className={`item-card tone-${item.category}`}>
                    <div className="item-card__meta">
                      <div className="item-icon">
                        <Icon size={20} />
                      </div>
                      <div className="item-copy">
                        <h3>{item.name}</h3>
                        <div className="price-stack">
                          <span className="price-slsh-main">{item.price.toLocaleString()} SLSH</span>
                        </div>
                      </div>
                    </div>

                    <div className="count-block">
                      <div className="count-block__label">
                        <span>Sold tonight</span>
                        <em>
                          {paidQty} paid · {loanQty} loan
                        </em>
                      </div>
                      <div className="counter">
                        <button type="button" className="counter-btn minus" onClick={() => bumpSold(item.id, -1)}>
                          <Minus size={16} />
                        </button>
                        <strong>{qty}</strong>
                        <button type="button" className="counter-btn plus" onClick={() => bumpSold(item.id, 1)}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {qty > 0 ? (
                      <div className="line-total line-total--split">
                        <div>
                          <span>Line total</span>
                          <strong className="line-total__slsh">{formatSlshAmount(lineTotal)}</strong>
                        </div>
                        {loanQty > 0 ? (
                          <div>
                            <span>Loan value</span>
                            <strong className="line-total__loan">{formatSlshAmount(loanTotal)}</strong>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="panel loan-book">
        <header>
          <HandCoins size={18} className="accent-orange" />
          <div>
            <h2>Loan Book</h2>
            <p>
              First count sold food above. Only those items appear here — then subtract how many
              were taken as loan (example: sold 20 sandwiches, loan 2).
            </p>
          </div>
        </header>

        {!soldItems.length ? (
          <p className="loan-empty">
            Nothing here yet. Add sold counts above first (e.g. Sandwich +20). Items you never count
            (like Chips) will not show in the Loan Book.
          </p>
        ) : (
          <div className="loan-sold-list">
            {soldItems.map((item) => {
              const Icon = getMenuIcon(item.icon)
              const sold = counts[item.id] ?? 0
              const loaned = loanQtyByItem[item.id] ?? 0
              const left = sold - loaned
              const draft = getDraft(item.id)
              const draftQty = Math.min(draft.qty, Math.max(1, left || 1))
              return (
                <article key={item.id} className={`loan-sold-row tone-${item.category}`}>
                  <div className="loan-sold-row__head">
                    <div className="loan-sold-row__icon">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        Sold <strong>{sold}</strong> · Paid <strong>{sold - loaned}</strong> · Loan{' '}
                        <strong>{loaned}</strong> · Left to loan <strong>{left}</strong>
                      </p>
                    </div>
                    <span className="loan-sold-row__price">{item.price.toLocaleString()} SLSH</span>
                  </div>

                  <div className="loan-sold-row__controls">
                    <label>
                      <span>PERSON NAME</span>
                      <div className="money-input">
                        <UserRound size={16} />
                        <input
                          type="text"
                          value={draft.name}
                          placeholder="Who took this loan?"
                          onChange={(e) => setDraftName(item.id, e.target.value)}
                        />
                      </div>
                    </label>

                    <label>
                      <span>PHONE NUMBER</span>
                      <div className="money-input">
                        <Phone size={16} />
                        <input
                          type="tel"
                          value={draft.phone}
                          placeholder="e.g. 063-4412345"
                          onChange={(e) => setDraftPhone(item.id, e.target.value)}
                        />
                      </div>
                    </label>

                    <label>
                      <span>SUBTRACT AS LOAN</span>
                      <div className="counter counter--loan loan-qty-counter">
                        <button
                          type="button"
                          className="counter-btn minus"
                          onClick={() => bumpDraftQty(item.id, -1)}
                          disabled={draftQty <= 1 || left < 1}
                        >
                          <Minus size={16} />
                        </button>
                        <strong>{left < 1 ? 0 : draftQty}</strong>
                        <button
                          type="button"
                          className="counter-btn plus loan-plus"
                          onClick={() => bumpDraftQty(item.id, 1)}
                          disabled={draftQty >= left || left < 1}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </label>

                    <button
                      type="button"
                      className="loan-add-btn"
                      onClick={() => takeLoan(item.id)}
                      disabled={left < 1}
                    >
                      Take loan
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {loanError ? <p className="loan-error">{loanError}</p> : null}

        {loanRecords.length ? (
          <div className="loan-table-wrap">
            <table className="loan-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Number</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Value</th>
                  <th>Adjust</th>
                </tr>
              </thead>
              <tbody>
                {loanRecords.map((loan) => (
                  <tr key={loan.id}>
                    <td>
                      <strong>{loan.personName}</strong>
                    </td>
                    <td>{loan.phoneNumber || '—'}</td>
                    <td>{loan.itemName}</td>
                    <td>{loan.qty}</td>
                    <td>{formatSlshAmount(loan.value)}</td>
                    <td>
                      <div className="loan-row-actions">
                        <button
                          type="button"
                          className="loan-adjust"
                          aria-label="Subtract one"
                          onClick={() => adjustLoanRecord(loan.id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <button
                          type="button"
                          className="loan-adjust"
                          aria-label="Add one"
                          disabled={((counts[loan.itemId] ?? 0) - (loanQtyByItem[loan.itemId] ?? 0)) < 1}
                          onClick={() => {
                            const left = (counts[loan.itemId] ?? 0) - (loanQtyByItem[loan.itemId] ?? 0)
                            if (left < 1) {
                              setLoanError(`No more ${loan.itemName} left to loan.`)
                              return
                            }
                            adjustLoanRecord(loan.id, 1)
                          }}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          type="button"
                          className="loan-remove"
                          aria-label={`Remove loan for ${loan.personName}`}
                          onClick={() => removeLoan(loan.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : soldItems.length ? (
          <p className="loan-empty">
            Enter a name, set how many to subtract as loan, then press Take loan.
          </p>
        ) : null}
      </section>

      <div className="bottom-grid bottom-grid--summary">
        <section className="panel summary-panel summary-panel--wide">
          <header>
            <ChartColumn size={18} className="accent-green" />
            <div>
              <h2>Night Money Summary</h2>
              <p>Sales & loans here · expenses on the Expenses page</p>
            </div>
          </header>

          <div className="summary-body">
            <span className="summary-label">CASH COLLECTED TONIGHT</span>
            <div className="summary-profit">
              <strong className="summary-slsh-main">{formatSlshAmount(cashSlsh)}</strong>
            </div>

            <div className="summary-lines">
              <div>
                <span>
                  <i className="dot white" /> Gross (all items)
                </span>
                <strong>{formatSlshAmount(grossSlsh)}</strong>
              </div>
              <div>
                <span>
                  <i className="dot cash" /> Cash collected
                </span>
                <strong>{formatSlshAmount(cashSlsh)}</strong>
              </div>
              <div>
                <span>
                  <i className="dot loan" /> On loan
                </span>
                <strong className="loan-val">{formatSlshAmount(loanSlsh)}</strong>
              </div>
              <div className="covers-line">
                <span>Items · paid / loan</span>
                <strong>
                  {paidCovers} / {loanCovers}
                </strong>
              </div>
            </div>

            <div className="expense-preview">
              <div className="expense-preview__head">
                <Wallet size={16} />
                <span>AFTER EXPENSES (from Expenses page)</span>
              </div>
              <div className="summary-lines">
                <div>
                  <span>− Operational expenses</span>
                  <strong className="expense-val">{formatSlshAmount(-operationalTotal)}</strong>
                </div>
                <div>
                  <span>Total deducted</span>
                  <strong className="expense-val">{formatSlshAmount(-allDeductions)}</strong>
                </div>
              </div>
              <div className={`final-remaining ${finalRemaining < 0 ? 'is-neg' : ''}`}>
                <span>Final remaining</span>
                <strong>{formatSlshAmount(finalRemaining)}</strong>
              </div>
              <Link to="/app/expenses" className="expenses-link-btn">
                Open Expenses Calculator
              </Link>
            </div>

            {loansByPerson.length ? (
              <div className="borrower-list">
                <span className="summary-label">LOAN NAMES</span>
                {loansByPerson.map((person) => (
                  <div key={`${person.name}-${person.phone}`} className="borrower-card">
                    <div className="borrower-card__head">
                      <div>
                        <strong>{person.name}</strong>
                        {person.phone ? <em className="borrower-phone">{person.phone}</em> : null}
                      </div>
                      <span>{formatSlshAmount(person.total)}</span>
                    </div>
                    <ul>
                      {person.lines.map((line) => (
                        <li key={line.id}>
                          {line.itemName} × {line.qty} · {formatSlshAmount(line.value)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="summary-actions">
            <button type="button" className="download-btn" onClick={downloadReport}>
              <Download size={18} />
              DOWNLOAD REPORT
            </button>
            <button type="button" className="save-btn" onClick={saveAndRefresh}>
              <Save size={18} />
              {savedFlash ? 'SAVED & REFRESHED' : 'SAVE & NEW NIGHT'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
