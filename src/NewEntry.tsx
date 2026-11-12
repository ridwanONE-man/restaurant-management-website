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
  Coffee,
  Wheat,
  UtensilsCrossed,
  Receipt,
  ChevronUp,
  X,
  Check,
  Users,
  Ban,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import { usePricing } from './pricing'
import { useLedger } from './ledger'
import {
  MENU_GROUPS,
  MENU_SECTIONS,
  groupOfCategory,
  formatSlshAmount,
  type LoanRecord,
  type MenuGroup,
  type MenuItem,
  type NightEntry,
  type PosOrder,
  waiterStats,
} from './data'
import { useWaiters } from './waiters'
import { getMenuIcon } from './menuIcons'
import LiveClock, { formatDayLabel, formatEntryDate } from './LiveClock'
import { downloadNightReport } from './report'
import './NewEntry.css'
import './Pos.css'

function emptyCounts(menu: MenuItem[]) {
  return Object.fromEntries(menu.map((item) => [item.id, 0])) as Record<string, number>
}

type DraftLike = {
  orders?: PosOrder[]
  itemSales?: { itemId: string; itemName: string; qty: number; unitPrice: number; value: number }[]
} | null

/** Orders of the working night. Older drafts only had totals — turn those into one opening order. */
function ordersFromDraft(menu: MenuItem[], draft: DraftLike): PosOrder[] {
  if (draft?.orders?.length) return draft.orders
  const lines = (draft?.itemSales ?? [])
    .filter((row) => row.qty > 0)
    .map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      category: menu.find((m) => m.id === row.itemId)?.category ?? ('grill' as const),
      qty: row.qty,
      unitPrice: row.qty ? row.value / row.qty : row.unitPrice,
    }))
  if (!lines.length) return []
  return [
    {
      id: 'opening-count',
      at: new Date().toISOString(),
      time: 'Earlier',
      lines,
      total: lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
      waiter: null,
    },
  ]
}

function countsFromOrders(menu: MenuItem[], orders: PosOrder[]) {
  const base = emptyCounts(menu)
  for (const order of orders) {
    for (const line of order.lines) base[line.itemId] = (base[line.itemId] ?? 0) + line.qty
  }
  return base
}

/** Fingerprint of what auto-save would write — skips saves for changes that came from another device */
function autoSaveSig(orders: PosOrder[], loans: LoanRecord[], expenses: unknown) {
  return JSON.stringify({ orders: orders.map((o) => [o.id, o.total, o.waiter ?? '']), loans, expenses })
}

function newOrderId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

const GROUP_KEY = 'cff-entry-group'

function loadGroup(): MenuGroup {
  try {
    const saved = localStorage.getItem(GROUP_KEY)
    return saved === 'cuntowadani' || saved === 'shaah' ? saved : 'fastfood'
  } catch {
    return 'fastfood'
  }
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
    draftRevision,
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
  const { waiters, addWaiter } = useWaiters()
  const [orders, setOrders] = useState<PosOrder[]>(() => ordersFromDraft(menu, nightDraft))
  const counts = useMemo(() => countsFromOrders(menu, orders), [menu, orders])
  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>(() => nightDraft?.loans ?? [])
  const lastAutoSig = useRef(autoSaveSig(orders, loanRecords, expenses))
  /** The order being rung up on this device (shared once it is completed) */
  const [ticket, setTicket] = useState<Record<string, number>>({})
  const [ticketWaiter, setTicketWaiter] = useState('')
  const [ticketError, setTicketError] = useState('')
  const [ticketOpen, setTicketOpen] = useState(false)
  const [saleFlash, setSaleFlash] = useState('')
  const [newWaiterName, setNewWaiterName] = useState('')
  const [addingWaiter, setAddingWaiter] = useState(false)
  const [showAllOrders, setShowAllOrders] = useState(false)
  const [loanDrafts, setLoanDrafts] = useState<Record<string, { name: string; phone: string; qty: number }>>({})
  const [loanError, setLoanError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [autoSavedFlash, setAutoSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeGroup, setActiveGroup] = useState<MenuGroup>(loadGroup)

  function pickGroup(group: MenuGroup) {
    setActiveGroup(group)
    try {
      localStorage.setItem(GROUP_KEY, group)
    } catch {
      /* optional */
    }
  }

  /** Drop loans / ticket lines for items that were removed from the menu */
  useEffect(() => {
    setTicket((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => menu.some((m) => m.id === id)))
      return Object.keys(next).length === Object.keys(prev).length ? prev : next
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

  /** Money uses the price at the moment of each sale */
  const grossSlsh = useMemo(() => orders.reduce((sum, order) => sum + order.total, 0), [orders])

  const loanSlsh = useMemo(
    () => loanRecords.reduce((sum, loan) => sum + loan.value, 0),
    [loanRecords],
  )

  const cashSlsh = grossSlsh - loanSlsh
  const covers = Object.values(counts).reduce((a, b) => a + b, 0)
  const loanCovers = loanRecords.reduce((a, b) => a + b.qty, 0)
  const paidCovers = covers - loanCovers

  const itemSales = useMemo(() => {
    const map = new Map<string, { itemId: string; itemName: string; qty: number; unitPrice: number; value: number }>()
    for (const order of orders) {
      for (const line of order.lines) {
        const row = map.get(line.itemId) ?? { itemId: line.itemId, itemName: line.itemName, qty: 0, unitPrice: 0, value: 0 }
        row.qty += line.qty
        row.value += line.qty * line.unitPrice
        row.unitPrice = row.qty ? Math.round(row.value / row.qty) : line.unitPrice
        map.set(line.itemId, row)
      }
    }
    return [...map.values()].filter((row) => row.qty > 0)
  }, [orders])

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
      orders,
    })
  }, [
    orders,
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
    setOrders([])
    setTicket({})
    setTicketError('')
    setLoanRecords([])
    setLoanDrafts({})
    setLoanError('')
    setSaveError('')
    lastAutoSig.current = autoSaveSig([], [], expenses)
    // intentionally only react to nightSession — menu sync is handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nightSession])

  /** Another device changed tonight's sheet — load its counts and loans */
  useEffect(() => {
    if (draftRevision === 0) return
    const nextOrders = ordersFromDraft(menu, nightDraft)
    const nextLoans = nightDraft?.loans ?? []
    nightIdRef.current = nightDraft?.id ?? String(Date.now())
    setOrders(nextOrders)
    setLoanRecords(nextLoans)
    setLoanError('')
    lastAutoSig.current = autoSaveSig(nextOrders, nextLoans, expenses)
    // only react to remote revisions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRevision])

  /** Auto-save to History whenever sales / loans change */
  useEffect(() => {
    const sig = autoSaveSig(orders, loanRecords, expenses)
    if (sig === lastAutoSig.current) return
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
        orders,
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
      lastAutoSig.current = sig
      markAutoSaved()
      setAutoSavedFlash(true)
      window.setTimeout(() => setAutoSavedFlash(false), 1600)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [
    cashSlsh,
    orders,
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

  /** Sold count + money per top-level group, shown on the tabs */
  const groupTotals = useMemo(() => {
    const totals: Record<MenuGroup, { items: number; qty: number; value: number }> = {
      fastfood: { items: 0, qty: 0, value: 0 },
      cuntowadani: { items: 0, qty: 0, value: 0 },
      shaah: { items: 0, qty: 0, value: 0 },
    }
    for (const item of menu) totals[groupOfCategory(item.category)].items += 1
    for (const order of orders) {
      for (const line of order.lines) {
        const t = totals[groupOfCategory(line.category)]
        t.qty += line.qty
        t.value += line.qty * line.unitPrice
      }
    }
    return totals
  }, [orders, menu])

  /* ------------------------------------------------------------------ POS */
  const ticketLines = useMemo(
    () =>
      Object.entries(ticket)
        .map(([id, qty]) => ({ item: menu.find((m) => m.id === id), qty }))
        .filter((row): row is { item: MenuItem; qty: number } => Boolean(row.item) && row.qty > 0),
    [menu, ticket],
  )
  const ticketQty = ticketLines.reduce((sum, row) => sum + row.qty, 0)
  const ticketTotal = ticketLines.reduce((sum, row) => sum + row.qty * row.item.price, 0)
  const ticketHasShaah = ticketLines.some((row) => row.item.category === 'shaah')

  const waiterActivity = useMemo(() => waiterStats(orders), [orders])

  function addToTicket(item: MenuItem) {
    setTicket((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))
    setTicketError('')
    setSaleFlash('')
  }

  function changeTicketQty(id: string, delta: number) {
    setTicket((prev) => {
      const qty = Math.max(0, (prev[id] ?? 0) + delta)
      const next = { ...prev }
      if (qty === 0) delete next[id]
      else next[id] = qty
      return next
    })
    setTicketError('')
  }

  function clearTicket() {
    setTicket({})
    setTicketError('')
  }

  function completeSale() {
    if (!ticketLines.length) {
      setTicketError('Tap items to add them to the order first.')
      return
    }
    if (ticketHasShaah && !ticketWaiter) {
      setTicketError('Pick the waiter who is taking the shaah.')
      setTicketOpen(true)
      return
    }
    const order: PosOrder = {
      id: newOrderId(),
      at: new Date().toISOString(),
      time: timeNowLabel(),
      lines: ticketLines.map(({ item, qty }) => ({
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        qty,
        unitPrice: item.price,
      })),
      total: ticketTotal,
      waiter: ticketHasShaah ? ticketWaiter || null : null,
    }
    setOrders((prev) => [order, ...prev])
    setTicket({})
    setTicketError('')
    setTicketOpen(false)
    setSaleFlash(`Sale ${formatSlshAmount(order.total)} recorded${order.waiter ? ` · ${order.waiter}` : ''}`)
    window.setTimeout(() => setSaleFlash(''), 2600)
  }

  function voidOrder(order: PosOrder) {
    // cancelling must not leave fewer sold items than are on loan
    const after = countsFromOrders(
      menu,
      orders.filter((o) => o.id !== order.id),
    )
    const blocked = order.lines.find((line) => (after[line.itemId] ?? 0) < (loanQtyByItem[line.itemId] ?? 0))
    if (blocked) {
      setLoanError(`Remove the ${blocked.itemName} loans first — this sale is needed to cover them.`)
      return
    }
    if (!window.confirm(`Cancel the ${order.time} sale of ${formatSlshAmount(order.total)}?`)) return
    setOrders((prev) => prev.filter((o) => o.id !== order.id))
  }

  async function onAddWaiter() {
    if (addingWaiter) return
    setAddingWaiter(true)
    const result = await addWaiter(newWaiterName)
    setAddingWaiter(false)
    if (!result.ok) {
      setTicketError(result.error)
      return
    }
    setTicketWaiter(result.waiter.name)
    setNewWaiterName('')
    setTicketError('')
  }

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
        orders,
        status: 'SALES',
      }
    )
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
            <strong>
              <span className="ha-long">Edit SLSH Prices</span>
              <span className="ha-short">Prices</span>
            </strong>
          </Link>
          <button
            type="button"
            className="date-chip download-chip"
            onClick={downloadReport}
            aria-label="Download night report"
          >
            <Download size={16} />
            <span className="ha-long">Download night report</span>
            <span className="ha-short">Report</span>
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

      <div className="pos-layout">
        <div className="pos-menu">
          <div className="group-tabs" role="tablist" aria-label="Menu group">
            {MENU_GROUPS.map((group) => {
              const t = groupTotals[group.key]
              const active = activeGroup === group.key
              return (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`group-tab group-tab--${group.key} ${active ? 'is-active' : ''}`}
                  onClick={() => pickGroup(group.key)}
                >
                  <span className="group-tab__icon" aria-hidden>
                    {group.key === 'fastfood' ? (
                      <UtensilsCrossed size={20} />
                    ) : group.key === 'cuntowadani' ? (
                      <Wheat size={20} />
                    ) : (
                      <Coffee size={20} />
                    )}
                  </span>
                  <span className="group-tab__copy">
                    <strong>{group.title}</strong>
                    <em>{group.hint}</em>
                  </span>
                  <span className="group-tab__stats">
                    <b>{t.qty}</b>
                    <small>{formatSlshAmount(t.value)}</small>
                  </span>
                </button>
              )
            })}
          </div>

          {groupTotals[activeGroup].items === 0 ? (
            <section className="panel group-empty">
              <p>No {MENU_GROUPS.find((g) => g.key === activeGroup)?.title} items yet.</p>
              <Link to="/app/menu" className="expenses-link-btn">
                <Plus size={16} /> Add items in Menu Studio
              </Link>
            </section>
          ) : null}

          {MENU_SECTIONS.filter((section) => section.group === activeGroup).map((section) => {
            const items = menu.filter((item) => item.category === section.key)
            if (!items.length) return null
            return (
              <section key={section.key} className={`menu-section menu-section--${section.key}`}>
                <div className="menu-section__head">
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.hint} · tap to add to the order</p>
                  </div>
                </div>
                <div className="item-grid pos-grid">
                  {items.map((item) => {
                    const Icon = getMenuIcon(item.icon)
                    const sold = counts[item.id] ?? 0
                    const loanQty = loanQtyByItem[item.id] ?? 0
                    const inTicket = ticket[item.id] ?? 0
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`item-card pos-tile tone-${item.category} ${inTicket ? 'is-in-ticket' : ''}`}
                        onClick={() => addToTicket(item)}
                        aria-label={`Add ${item.name} to order`}
                      >
                        {inTicket ? <span className="pos-tile__badge">{inTicket}</span> : null}
                        <span className="item-card__meta">
                          <span className="item-icon">
                            <Icon size={20} />
                          </span>
                          <span className="item-copy">
                            <span className="pos-tile__name">{item.name}</span>
                            <span className="price-slsh-main">{item.price.toLocaleString()} SLSH</span>
                          </span>
                        </span>
                        <span className="pos-tile__foot">
                          <span>
                            Sold tonight <b>{sold}</b>
                          </span>
                          {loanQty ? <em>{loanQty} loan</em> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <aside className={`pos-ticket ${ticketOpen ? 'is-open' : ''} ${ticketQty ? 'has-items' : ''}`} aria-label="Current order">
          <button type="button" className="pos-ticket__bar" onClick={() => setTicketOpen((v) => !v)}>
            <span className="pos-ticket__bar-icon">
              <Receipt size={18} />
              {ticketQty ? <b>{ticketQty}</b> : null}
            </span>
            <span className="pos-ticket__bar-copy">
              <strong>{ticketQty ? `${ticketQty} item${ticketQty === 1 ? '' : 's'}` : 'Current order'}</strong>
              <small>{ticketQty ? 'Tap to review & complete' : 'Tap items to start'}</small>
            </span>
            <span className="pos-ticket__bar-total">{formatSlshAmount(ticketTotal)}</span>
            <ChevronUp size={18} className="pos-ticket__chevron" />
          </button>

          <div className="pos-ticket__body">
            <header className="pos-ticket__head">
              <div>
                <h2>Current order</h2>
                <p>{ticketQty ? `${ticketQty} item${ticketQty === 1 ? '' : 's'}` : 'Tap items on the menu'}</p>
              </div>
              {ticketQty ? (
                <button type="button" className="pos-ticket__clear" onClick={clearTicket}>
                  <X size={15} /> Clear
                </button>
              ) : null}
            </header>

            {ticketLines.length ? (
              <ul className="pos-lines">
                {ticketLines.map(({ item, qty }) => (
                  <li key={item.id} className={`tone-${item.category}`}>
                    <div className="pos-lines__name">
                      <strong>{item.name}</strong>
                      <span>{item.price.toLocaleString()} SLSH each</span>
                    </div>
                    <div className="pos-lines__qty">
                      <button type="button" aria-label={`One less ${item.name}`} onClick={() => changeTicketQty(item.id, -1)}>
                        <Minus size={14} />
                      </button>
                      <b>{qty}</b>
                      <button type="button" aria-label={`One more ${item.name}`} onClick={() => changeTicketQty(item.id, 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong className="pos-lines__total">{(qty * item.price).toLocaleString()}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pos-empty">
                <Receipt size={22} />
                Tap a food, cuntowadani or shaah on the menu — it is added here automatically.
              </p>
            )}

            {ticketHasShaah ? (
            <div className="pos-waiter is-required">
              <div className="pos-waiter__label">
                <Users size={15} />
                <span>TEA WAITER</span>
                <em>Who is taking the shaah?</em>
              </div>
              <div className="pos-waiter__chips">
                {waiters.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={ticketWaiter === w.name ? 'active' : undefined}
                    onClick={() => {
                      setTicketWaiter((cur) => (cur === w.name ? '' : w.name))
                      setTicketError('')
                    }}
                  >
                    {ticketWaiter === w.name ? <Check size={13} /> : null}
                    {w.name}
                  </button>
                ))}
              </div>
              <div className="pos-waiter__add">
                <input
                  type="text"
                  value={newWaiterName}
                  placeholder={waiters.length ? 'New waiter name' : 'Add the first waiter'}
                  onChange={(e) => setNewWaiterName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void onAddWaiter()
                    }
                  }}
                />
                <button type="button" onClick={() => void onAddWaiter()} disabled={!newWaiterName.trim() || addingWaiter}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
            ) : null}

            {ticketError ? <p className="pos-error">{ticketError}</p> : null}

            <div className="pos-total">
              <span>Total</span>
              <strong>{formatSlshAmount(ticketTotal)}</strong>
            </div>
            <button type="button" className="save-btn pos-complete" onClick={completeSale} disabled={!ticketQty}>
              <Check size={18} />
              COMPLETE SALE
            </button>
          </div>
        </aside>
      </div>

      {saleFlash ? <p className="entry-save-ok pos-flash">{saleFlash}</p> : null}

      <div className="pos-insights">
        <section className="panel pos-orders">
          <header>
            <Receipt size={18} className="accent-green" />
            <div>
              <h2>Tonight&apos;s sales</h2>
              <p>
                {orders.length} sale{orders.length === 1 ? '' : 's'} · {formatSlshAmount(grossSlsh)} · newest first
              </p>
            </div>
          </header>
          {orders.length ? (
            <ul className="order-list">
              {orders.slice(0, showAllOrders ? undefined : 12).map((order) => (
                <li key={order.id}>
                  <span className="order-list__time">{order.time}</span>
                  <div className="order-list__body">
                    <strong>
                      {order.lines.map((l) => `${l.qty}× ${l.itemName}`).join(', ')}
                    </strong>
                    {order.waiter ? (
                      <span className="order-list__waiter">
                        <Users size={12} /> {order.waiter}
                      </span>
                    ) : null}
                  </div>
                  <b className="order-list__total">{order.total.toLocaleString()}</b>
                  <button
                    type="button"
                    className="order-list__void"
                    aria-label={`Cancel the ${order.time} sale`}
                    title="Cancel this sale"
                    onClick={() => voidOrder(order)}
                  >
                    <Ban size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="loan-empty">No sales yet tonight. Completed orders appear here with their time.</p>
          )}
          {orders.length > 12 ? (
            <button type="button" className="order-list__more" onClick={() => setShowAllOrders((v) => !v)}>
              {showAllOrders ? 'Show fewer' : `Show all ${orders.length} sales`}
            </button>
          ) : null}
        </section>

        <section className="panel waiter-panel">
          <header>
            <Users size={18} className="accent-orange" />
            <div>
              <h2>Waiter activity</h2>
              <p>Shaah served tonight per waiter · compare days in Analytics</p>
            </div>
          </header>
          {waiterActivity.length ? (
            <ol className="waiter-rank">
              {waiterActivity.map((w, i) => {
                const top = waiterActivity[0].shaahCups || 1
                return (
                  <li key={w.name}>
                    <span className="waiter-rank__pos">{i + 1}</span>
                    <div className="waiter-rank__body">
                      <div className="waiter-rank__row">
                        <strong>{w.name}</strong>
                        <span>
                          <b>{w.shaahCups}</b> shaah
                        </span>
                      </div>
                      <div className="waiter-rank__bar">
                        <i style={{ width: `${Math.max(4, (w.shaahCups / top) * 100)}%` }} />
                      </div>
                      <small>
                        {w.orders} order{w.orders === 1 ? '' : 's'} · {formatSlshAmount(w.value)}
                      </small>
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="loan-empty">Pick a waiter when you sell shaah — their totals show up here.</p>
          )}
        </section>
      </div>

      <section className="panel loan-book">
        <header>
          <HandCoins size={18} className="accent-orange" />
          <div>
            <h2>Loan Book</h2>
            <p>
              Items sold tonight appear here. Mark how many were taken on loan and by whom
              (example: sold 20 sandwiches, 2 on loan).
            </p>
          </div>
        </header>

        {!soldItems.length ? (
          <p className="loan-empty">
            Nothing here yet. Complete a sale above first — only sold items can be put on loan.
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
