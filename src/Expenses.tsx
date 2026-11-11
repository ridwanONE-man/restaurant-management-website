import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Calculator,
  ClipboardList,
  Download,
  Plus,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import { formatSlshAmount, type NightEntry } from './data'
import { useLedger } from './ledger'
import LiveClock from './LiveClock'
import { downloadNightReport } from './report'
import './Expenses.css'

function sanitizeDecimalInput(raw: string) {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  return cleaned
}

type CostKey = 'chicken' | 'wholesaler' | 'grocerySpices' | 'other'

function costTextFrom(e: Record<CostKey, number>) {
  return {
    chicken: e.chicken ? String(e.chicken) : '',
    wholesaler: e.wholesaler ? String(e.wholesaler) : '',
    grocerySpices: e.grocerySpices ? String(e.grocerySpices) : '',
    other: e.other ? String(e.other) : '',
  }
}

/** Fingerprint of what auto-save would write — skips saves for changes that came from another device */
function autoSaveSig(draft: unknown, expenses: unknown) {
  return JSON.stringify({ draft, expenses })
}

const COST_FIELDS = [
  { key: 'chicken' as const, label: 'CHICKEN' },
  { key: 'wholesaler' as const, label: 'WHOLESALER' },
  { key: 'grocerySpices' as const, label: 'GROCERY SPICES' },
  { key: 'other' as const, label: 'OTHER' },
]

export default function Expenses() {
  const { saveNight } = useAuth()
  const {
    nightMoney,
    nightDraft,
    nightSession,
    draftRevision,
    lastAutoSavedAt,
    markAutoSaved,
    beginFreshNight,
    expenses,
    setExpenseField,
    addStaff,
    updateStaff,
    removeStaff,
    resetExpenses,
    staffTotal,
    operationalTotal,
    finalRemaining,
    buildHistoryEntry,
  } = useLedger()

  const lastAutoSig = useRef(autoSaveSig(nightDraft, expenses))
  const [costText, setCostText] = useState(() => costTextFrom(expenses))
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffSalary, setNewStaffSalary] = useState('')
  const [staffError, setStaffError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [autoSavedFlash, setAutoSavedFlash] = useState(false)

  const cash = nightDraft?.cashSales ?? nightMoney.cash
  const gross = nightDraft?.totalSales ?? nightMoney.gross
  const loan = nightDraft?.loanAmount ?? nightMoney.loan

  useEffect(() => {
    if (nightSession === 0) return
    setCostText({ chicken: '', wholesaler: '', grocerySpices: '', other: '' })
    setNewStaffName('')
    setNewStaffSalary('')
    setStaffError('')
    setActionError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nightSession])

  /** Another device changed tonight's sheet — show its numbers */
  useEffect(() => {
    if (draftRevision === 0) return
    setCostText(costTextFrom(expenses))
    lastAutoSig.current = autoSaveSig(nightDraft, expenses)
    // only react to remote revisions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRevision])

  /** Auto-save to History when expenses (or night sales) change */
  useEffect(() => {
    const sig = autoSaveSig(nightDraft, expenses)
    if (sig === lastAutoSig.current) return
    const hasSales = Boolean(
      nightDraft && (nightDraft.covers > 0 || nightDraft.loans.length > 0 || nightDraft.totalSales > 0),
    )
    const hasExpenses = operationalTotal > 0 || expenses.staff.length > 0
    if (!hasSales && !hasExpenses) return

    const timer = window.setTimeout(() => {
      const entry = buildHistoryEntry()
      if (!entry) return
      saveNight(entry)
      lastAutoSig.current = sig
      markAutoSaved()
      setAutoSavedFlash(true)
      setActionMsg('Auto-saved to History — New Entry stays in sync.')
      setActionError('')
      window.setTimeout(() => setAutoSavedFlash(false), 1600)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [
    buildHistoryEntry,
    expenses,
    markAutoSaved,
    nightDraft,
    operationalTotal,
    saveNight,
  ])

  function onCostField(key: keyof typeof costText, raw: string) {
    const cleaned = sanitizeDecimalInput(raw)
    setCostText((prev) => ({ ...prev, [key]: cleaned }))
    setExpenseField(key, cleaned === '' || cleaned === '.' ? 0 : Number(cleaned))
  }

  function onAddStaff() {
    const name = newStaffName.trim()
    const salary = Number(sanitizeDecimalInput(newStaffSalary) || 0)
    if (!name) {
      setStaffError('Enter the staff name.')
      return
    }
    if (!(salary > 0)) {
      setStaffError("Enter this person's salary amount.")
      return
    }
    addStaff(name, salary)
    setNewStaffName('')
    setNewStaffSalary('')
    setStaffError('')
  }

  function clearAll() {
    resetExpenses()
    setCostText({ chicken: '', wholesaler: '', grocerySpices: '', other: '' })
    setNewStaffName('')
    setNewStaffSalary('')
    setStaffError('')
  }

  function buildCompleteEntry(): NightEntry | null {
    return buildHistoryEntry()
  }

  function saveAndRefresh() {
    const entry = buildCompleteEntry()
    if (!entry) {
      setActionError('No night sales yet. Count sales on New Entry first.')
      setActionMsg('')
      return
    }
    saveNight(entry)
    setActionError('')
    setActionMsg('Night saved to History. New Entry and Expenses refreshed for a new night.')
    setSavedFlash(true)
    beginFreshNight()
    window.setTimeout(() => setSavedFlash(false), 2200)
  }

  function downloadComplete() {
    const entry = buildCompleteEntry()
    if (!entry) {
      setActionError('No night sales yet. Count sales on New Entry first.')
      setActionMsg('')
      return
    }
    downloadNightReport(entry)
    setActionError('')
    setActionMsg('Report downloaded (includes loans, phones, and expense breakdown).')
  }

  return (
    <div className="page expenses-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">MONEY OUT</p>
          <h1>Expenses Calculator</h1>
          <p className="expenses-lead">
            Counts and costs auto-save to History. New Entry and Expenses stay linked and refresh
            together when you start a new night.
          </p>
        </div>
        <div className="head-actions">
          <Link to="/app/entry" className="date-chip download-chip">
            Back to New Entry
            <ArrowRight size={16} />
          </Link>
          <LiveClock />
        </div>
      </div>

      {actionError ? <p className="expenses-banner is-error">{actionError}</p> : null}
      {actionMsg || autoSavedFlash || lastAutoSavedAt ? (
        <p className="expenses-banner is-ok">
          {actionMsg ||
            (autoSavedFlash
              ? 'Auto-saved to History.'
              : lastAutoSavedAt
                ? `Last auto-save ${lastAutoSavedAt}`
                : null)}
        </p>
      ) : null}

      <section className="panel night-cash-panel">
        <header>
          <Calculator size={18} className="accent-green" />
          <div>
            <h2>Tonight&apos;s Money (from New Entry)</h2>
            <p>Sold counts update here automatically — and auto-save to History</p>
          </div>
        </header>
        <div className="money-tiles">
          <div>
            <span>Gross sales</span>
            <strong>{formatSlshAmount(gross)}</strong>
          </div>
          <div>
            <span>Cash collected</span>
            <strong className="cash">{formatSlshAmount(cash)}</strong>
          </div>
          <div>
            <span>On loan</span>
            <strong className="loan">{formatSlshAmount(loan)}</strong>
          </div>
        </div>
        {!cash && !gross ? (
          <p className="expenses-hint">
            No night totals yet. Go to <Link to="/app/entry">New Entry</Link> and count tonight&apos;s
            sales first.
          </p>
        ) : nightDraft?.loans?.length ? (
          <p className="expenses-hint">
            {nightDraft.loans.length} loan line(s) on file — names &amp; phones are included in
            History auto-saves.
          </p>
        ) : null}
      </section>

      <section className="panel staff-panel">
        <header>
          <UserRound size={18} className="accent-orange" />
          <div>
            <h2>Staff Salaries</h2>
            <p>Add each person with their own salary — auto-saves when you add or edit</p>
          </div>
        </header>

        <div className="staff-add">
          <label>
            <span>STAFF NAME</span>
            <div className="money-input">
              <UserRound size={16} />
              <input
                type="text"
                value={newStaffName}
                placeholder="e.g. Ali"
                onChange={(e) => setNewStaffName(e.target.value)}
              />
            </div>
          </label>
          <label>
            <span>SALARY (SLSH)</span>
            <div className="money-input">
              <span>SLSH</span>
              <input
                type="text"
                inputMode="decimal"
                value={newStaffSalary}
                placeholder="0"
                onChange={(e) => setNewStaffSalary(sanitizeDecimalInput(e.target.value))}
              />
            </div>
          </label>
          <button type="button" className="staff-add-btn" onClick={onAddStaff}>
            <Plus size={16} />
            Add staff
          </button>
        </div>
        {staffError ? <p className="staff-error">{staffError}</p> : null}

        {expenses.staff.length ? (
          <div className="staff-list">
            {expenses.staff.map((person, index) => (
              <div key={person.id} className="staff-row">
                <span className="staff-index">{index + 1}</span>
                <input
                  type="text"
                  className="staff-name-input"
                  value={person.name}
                  onChange={(e) => updateStaff(person.id, { name: e.target.value })}
                />
                <div className="money-input staff-salary-input">
                  <span>SLSH</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={person.salary ? String(person.salary) : ''}
                    placeholder="0"
                    onChange={(e) => {
                      const cleaned = sanitizeDecimalInput(e.target.value)
                      updateStaff(person.id, {
                        salary: cleaned === '' || cleaned === '.' ? 0 : Number(cleaned),
                      })
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="staff-remove"
                  aria-label={`Remove ${person.name}`}
                  onClick={() => removeStaff(person.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="expenses-hint">No staff added yet. Add the first person above.</p>
        )}

        <div className="subtotal-row">
          <span>Staff salaries total ({expenses.staff.length})</span>
          <strong>{formatSlshAmount(staffTotal)}</strong>
        </div>
      </section>

      <section className="panel">
        <header>
          <ClipboardList size={18} className="accent-orange" />
          <div>
            <h2>Other Operational Costs</h2>
            <p>Chicken, wholesaler, grocery spices, and other — auto-saves as you type</p>
          </div>
        </header>
        <div className="expense-grid">
          {COST_FIELDS.map(({ key, label }) => (
            <label key={key} className="expense-field">
              <span>{label}</span>
              <div className="money-input">
                <span>SLSH</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={costText[key]}
                  placeholder="0"
                  onChange={(e) => onCostField(key, e.target.value)}
                />
              </div>
            </label>
          ))}
        </div>
        <div className="subtotal-row">
          <span>These costs total</span>
          <strong>
            {formatSlshAmount(
              expenses.chicken + expenses.wholesaler + expenses.grocerySpices + expenses.other,
            )}
          </strong>
        </div>
      </section>

      <section className="panel final-panel net-benefit-panel">
        <header>
          <Calculator size={18} className="accent-green" />
          <div>
            <h2>Net Benefit</h2>
            <p>Whole-night cash after every operational cost</p>
          </div>
        </header>

        <div className="net-benefit-layout">
          <div className="net-benefit-steps">
            <div className="net-step">
              <span>Cash collected tonight</span>
              <strong>{formatSlshAmount(cash)}</strong>
            </div>
            <div className="net-step deduct-step">
              <span>Staff salaries</span>
              <strong>{formatSlshAmount(-staffTotal)}</strong>
            </div>
            <div className="net-step deduct-step">
              <span>Chicken</span>
              <strong>{formatSlshAmount(-expenses.chicken)}</strong>
            </div>
            <div className="net-step deduct-step">
              <span>Wholesaler</span>
              <strong>{formatSlshAmount(-expenses.wholesaler)}</strong>
            </div>
            <div className="net-step deduct-step">
              <span>Grocery spices</span>
              <strong>{formatSlshAmount(-expenses.grocerySpices)}</strong>
            </div>
            <div className="net-step deduct-step">
              <span>Other</span>
              <strong>{formatSlshAmount(-expenses.other)}</strong>
            </div>
            <div className="net-step total-out">
              <span>Total expenses out</span>
              <strong>{formatSlshAmount(-operationalTotal)}</strong>
            </div>
          </div>

          <div className={`net-hero ${finalRemaining < 0 ? 'is-neg' : ''}`}>
            <span>NET BENEFIT</span>
            <strong>{formatSlshAmount(finalRemaining)}</strong>
            <em>
              {finalRemaining >= 0
                ? 'Cash left after tonight’s costs'
                : 'Expenses exceed cash collected'}
            </em>
          </div>
        </div>

        <div className="expense-actions">
          <button type="button" className="expense-download-btn" onClick={downloadComplete}>
            <Download size={18} />
            Download full report
          </button>
          <button type="button" className="expense-save-btn" onClick={saveAndRefresh}>
            <Save size={18} />
            {savedFlash ? 'Saved & refreshed' : 'Save & new night'}
          </button>
          <button type="button" className="ghost-clear" onClick={clearAll}>
            Clear expense fields
          </button>
        </div>
      </section>
    </div>
  )
}
