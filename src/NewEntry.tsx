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
  ArrowLeft,
  CircleCheck,
  CircleAlert,
  Undo2,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
  type TeaSettlement,
  waiterStats,
} from './data'
import { useWaiters } from './waiters'
import { activeOrders, itemSalesFrom, loanConflict, nextReceiptNo, receiptNo } from './lib/pos'
import { getMenuIcon } from './menuIcons'
import LiveClock, { formatDayLabel, formatEntryDate } from './LiveClock'
import { downloadNightReport } from './report'
import './NewEntry.css'
import './Pos.css'
import './Dashboard.css'

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
  for (const order of activeOrders(orders)) {
    for (const line of order.lines) base[line.itemId] = (base[line.itemId] ?? 0) + line.qty
  }
  return base
}

/** Fingerprint of what auto-save would write — skips saves for changes that came from another device */
function autoSaveSig(orders: PosOrder[], loans: LoanRecord[], expenses: unknown, tea: TeaSettlement[] = []) {
  return JSON.stringify({
    orders: orders.map((o) => [o.id, o.total, o.waiter ?? '', o.returned ? 1 : 0]),
    loans,
    expenses,
    tea: tea.map((t) => [t.waiter, t.cups, t.missingCups, t.received]),
  })
}

function newOrderId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function timeNowLabel() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export default function NewEntry() {
  const { saveNight, history } = useAuth()
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
  /** Tea cash the owner confirmed per waiter */
  const [teaSettlements, setTeaSettlements] = useState<TeaSettlement[]>(() => nightDraft?.teaSettlements ?? [])
  const [missingCups, setMissingCups] = useState<Record<string, number>>({})
  const lastAutoSig = useRef(autoSaveSig(orders, loanRecords, expenses, teaSettlements))
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
  /** Each box has its own page: /app/entry/fastfood · /cuntowadani · /shaah */
  const params = useParams()
  const navigate = useNavigate()
  const activeGroup: MenuGroup | null = MENU_GROUPS.some((g) => g.key === params.group)
    ? (params.group as MenuGroup)
    : null
  const activeGroupInfo = MENU_GROUPS.find((g) => g.key === activeGroup)

  useEffect(() => {
    if (params.group && !activeGroup) navigate('/app/entry', { replace: true })
  }, [activeGroup, navigate, params.group])

  function pickGroup(group: MenuGroup) {
    navigate(`/app/entry/${group}`)
  }

  function closeGroup() {
    navigate('/app/entry')
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
  const liveOrders = useMemo(() => activeOrders(orders), [orders])
  const grossSlsh = useMemo(() => liveOrders.reduce((sum, order) => sum + order.total, 0), [liveOrders])

  const loanSlsh = useMemo(
    () => loanRecords.reduce((sum, loan) => sum + loan.value, 0),
    [loanRecords],
  )

  const cashSlsh = grossSlsh - loanSlsh
  const covers = Object.values(counts).reduce((a, b) => a + b, 0)
  const loanCovers = loanRecords.reduce((a, b) => a + b.qty, 0)
  const paidCovers = covers - loanCovers

  const itemSales = useMemo(() => itemSalesFrom(orders), [orders])

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
      teaSettlements,
    })
  }, [
    orders,
    teaSettlements,
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
    setTeaSettlements([])
    setMissingCups({})
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
    const nextTea = nightDraft?.teaSettlements ?? []
    nightIdRef.current = nightDraft?.id ?? String(Date.now())
    setOrders(nextOrders)
    setLoanRecords(nextLoans)
    setTeaSettlements(nextTea)
    setLoanError('')
    lastAutoSig.current = autoSaveSig(nextOrders, nextLoans, expenses, nextTea)
    // only react to remote revisions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRevision])

  /** Auto-save to History whenever sales / loans change */
  useEffect(() => {
    const sig = autoSaveSig(orders, loanRecords, expenses, teaSettlements)
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
        teaSettlements,
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
    teaSettlements,
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
    for (const order of liveOrders) {
      for (const line of order.lines) {
        const t = totals[groupOfCategory(line.category)]
        t.qty += line.qty
        t.value += line.qty * line.unitPrice
      }
    }
    return totals
  }, [liveOrders, menu])

  /* ------------------------------------------------------------ dashboard */
  const returnedCount = orders.length - liveOrders.length

  /** Average of recent saved nights, to compare tonight against */
  const recentAvgSales = useMemo(() => {
    const past = history.filter((h) => h.id !== nightIdRef.current && h.totalSales > 0).slice(0, 7)
    return past.length ? Math.round(past.reduce((s, h) => s + h.totalSales, 0) / past.length) : 0
  }, [history])

  /** Sales per hour tonight (receipts with a real time only) */
  const hourly = useMemo(() => {
    const map = new Map<number, number>()
    for (const order of liveOrders) {
      if (order.time === 'Earlier') continue
      const h = new Date(order.at).getHours()
      map.set(h, (map.get(h) ?? 0) + order.total)
    }
    if (!map.size) return []
    const hours = [...map.keys()]
    const from = Math.min(...hours)
    const to = Math.max(...hours)
    const start = Math.max(from, to - 11)
    const rows = []
    for (let h = start; h <= to; h += 1) rows.push({ hour: h, value: map.get(h) ?? 0 })
    return rows
  }, [liveOrders])
  const hourlyMax = Math.max(1, ...hourly.map((r) => r.value))

  /** Per-box detail: receipts, top items */
  const groupDetail = useMemo(() => {
    const detail: Record<MenuGroup, { receipts: number; top: { name: string; qty: number; value: number }[] }> = {
      fastfood: { receipts: 0, top: [] },
      cuntowadani: { receipts: 0, top: [] },
      shaah: { receipts: 0, top: [] },
    }
    const tops: Record<MenuGroup, Map<string, { name: string; qty: number; value: number }>> = {
      fastfood: new Map(),
      cuntowadani: new Map(),
      shaah: new Map(),
    }
    for (const order of liveOrders) {
      const seen = new Set<MenuGroup>()
      for (const line of order.lines) {
        const g = groupOfCategory(line.category)
        seen.add(g)
        const cur = tops[g].get(line.itemId) ?? { name: line.itemName, qty: 0, value: 0 }
        cur.qty += line.qty
        cur.value += line.qty * line.unitPrice
        tops[g].set(line.itemId, cur)
      }
      for (const g of seen) detail[g].receipts += 1
    }
    for (const g of MENU_GROUPS) detail[g.key].top = [...tops[g.key].values()].sort((a, b) => b.qty - a.qty).slice(0, 4)
    return detail
  }, [liveOrders])

  /* ------------------------------------------------------- loans per box */
  const categoryOfItem = useMemo(() => new Map(menu.map((m) => [m.id, m.category])), [menu])
  const loanGroupOf = (loan: LoanRecord): MenuGroup => groupOfCategory(categoryOfItem.get(loan.itemId) ?? 'grill')
  const groupLoans = useMemo(() => {
    const totals: Record<MenuGroup, { qty: number; value: number }> = {
      fastfood: { qty: 0, value: 0 },
      cuntowadani: { qty: 0, value: 0 },
      shaah: { qty: 0, value: 0 },
    }
    for (const loan of loanRecords) {
      const t = totals[groupOfCategory(categoryOfItem.get(loan.itemId) ?? 'grill')]
      t.qty += loan.qty
      t.value += loan.value
    }
    return totals
  }, [categoryOfItem, loanRecords])
  /** Loan Book only works inside Fast Food / Cuntowadani pages, filtered to that box */
  const boxSoldItems = activeGroup ? soldItems.filter((item) => groupOfCategory(item.category) === activeGroup) : []
  const boxLoanRecords = activeGroup ? loanRecords.filter((loan) => loanGroupOf(loan) === activeGroup) : []

  /* --------------------------------------------------------- tea cash */
  const teaRows = useMemo(
    () =>
      waiterStats(orders).map((w) => {
        const settlement = teaSettlements.find((t) => t.waiter.toLowerCase() === w.name.toLowerCase()) ?? null
        const avgPrice = w.shaahCups ? w.value / w.shaahCups : 0
        const status: 'pending' | 'confirmed' | 'more' = !settlement
          ? 'pending'
          : w.shaahCups > settlement.cups
            ? 'more'
            : 'confirmed'
        return { ...w, avgPrice, settlement, status, newCups: settlement ? Math.max(0, w.shaahCups - settlement.cups) : w.shaahCups }
      }),
    [orders, teaSettlements],
  )
  const teaTotals = useMemo(() => {
    const expected = teaRows.reduce((s, r) => s + r.value, 0)
    const received = teaSettlements.reduce((s, t) => s + t.received, 0)
    const owed = teaSettlements.reduce((s, t) => s + t.owed, 0)
    const owedCups = teaSettlements.reduce((s, t) => s + t.missingCups, 0)
    return { expected, received, owed, owedCups, pending: Math.max(0, expected - received - owed) }
  }, [teaRows, teaSettlements])

  function confirmTea(row: (typeof teaRows)[number]) {
    const key = row.name.toLowerCase()
    const missing = Math.min(row.shaahCups, Math.max(0, Math.floor(missingCups[key] ?? 0)))
    const owed = Math.round(missing * row.avgPrice)
    const settlement: TeaSettlement = {
      waiter: row.name,
      cups: row.shaahCups,
      expected: row.value,
      missingCups: missing,
      owed,
      received: row.value - owed,
      at: new Date().toISOString(),
      time: timeNowLabel(),
    }
    setTeaSettlements((prev) => [...prev.filter((t) => t.waiter.toLowerCase() !== key), settlement])
    setMissingCups((prev) => ({ ...prev, [key]: 0 }))
  }

  function undoTea(waiter: string) {
    if (!window.confirm(`Undo the tea cash confirmation for ${waiter}?`)) return
    setTeaSettlements((prev) => prev.filter((t) => t.waiter.toLowerCase() !== waiter.toLowerCase()))
  }

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
      no: nextReceiptNo(orders),
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
    const next = orders.map((o) =>
      o.id === order.id
        ? { ...o, returned: { at: new Date().toISOString(), time: timeNowLabel(), reason: 'Returned from New Entry' } }
        : o,
    )
    const blocked = loanConflict(next, loanRecords)
    if (blocked) {
      setLoanError(`Remove the ${blocked} loans first — this sale is needed to cover them.`)
      return
    }
    if (!window.confirm(`Return receipt #${receiptNo(order, orders)} (${formatSlshAmount(order.total)})?`)) return
    setOrders(next)
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
        teaSettlements,
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
      {activeGroup && activeGroupInfo ? (
        <div className={`page-head group-page-head group-page-head--${activeGroup}`}>
          <div>
            <button type="button" className="group-back" onClick={closeGroup}>
              <ArrowLeft size={16} /> Dashboard
            </button>
            <h1>
              <span className="group-page-head__icon" aria-hidden>
                {activeGroup === 'fastfood' ? (
                  <UtensilsCrossed size={22} />
                ) : activeGroup === 'cuntowadani' ? (
                  <Wheat size={22} />
                ) : (
                  <Coffee size={22} />
                )}
              </span>
              {activeGroupInfo.title}
            </h1>
            <p className="group-page-head__hint">{activeGroupInfo.hint}</p>
          </div>
          <nav className="group-switch" aria-label="Switch box">
            {MENU_GROUPS.map((g) => (
              <Link
                key={g.key}
                to={`/app/entry/${g.key}`}
                replace
                className={`group-switch__item group-switch__item--${g.key} ${g.key === activeGroup ? 'active' : ''}`}
              >
                {g.title.replace(' (Tea)', '')}
                <b>{groupTotals[g.key].qty}</b>
              </Link>
            ))}
          </nav>
        </div>
      ) : (
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
      )}
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
          {!activeGroup ? (
          <>
          {/* ---------------- tonight's dashboard ---------------- */}
          <section className="dash" aria-label="Tonight's dashboard">
            <div className="dash-kpis">
              <article className="dash-kpi dash-kpi--sales">
                <span>Sales tonight</span>
                <strong>{formatSlshAmount(grossSlsh)}</strong>
                <em>
                  {liveOrders.length} receipt{liveOrders.length === 1 ? '' : 's'}
                  {recentAvgSales
                    ? ` · ${grossSlsh >= recentAvgSales ? '▲' : '▼'} avg ${formatSlshAmount(recentAvgSales)}`
                    : ''}
                </em>
              </article>
              <article className="dash-kpi dash-kpi--cash">
                <span>Cash collected</span>
                <strong>{formatSlshAmount(cashSlsh)}</strong>
                <em>{grossSlsh ? Math.round((cashSlsh / grossSlsh) * 100) : 0}% of sales</em>
              </article>
              <article className="dash-kpi dash-kpi--loan">
                <span>On loan</span>
                <strong>{formatSlshAmount(loanSlsh)}</strong>
                <em>
                  {loanCovers} item{loanCovers === 1 ? '' : 's'} · {loansByPerson.length} people
                </em>
              </article>
              <article className="dash-kpi dash-kpi--expense">
                <span>Expenses</span>
                <strong>{formatSlshAmount(operationalTotal)}</strong>
                <em>
                  <Link to="/app/expenses">Open Expenses</Link>
                </em>
              </article>
              <article className={`dash-kpi dash-kpi--net ${finalRemaining < 0 ? 'is-neg' : ''}`}>
                <span>Net remaining</span>
                <strong>{formatSlshAmount(finalRemaining)}</strong>
                <em>
                  {returnedCount ? `${returnedCount} returned · ` : ''}
                  <Link to="/app/receipts">Receipts</Link>
                </em>
              </article>
            </div>

            <div className="dash-hours panel">
              <header>
                <ChartColumn size={16} className="accent-green" />
                <h2>Sales by hour</h2>
                <small>{hourly.length ? `${hourly.length} hour${hourly.length === 1 ? '' : 's'}` : 'tonight'}</small>
              </header>
              {hourly.length ? (
                <div className="dash-hours__plot">
                  {hourly.map((r) => (
                    <div key={r.hour} className="dash-hours__col" title={`${r.hour}:00 · ${formatSlshAmount(r.value)}`}>
                      <i style={{ height: `${Math.max(r.value ? 6 : 2, (r.value / hourlyMax) * 100)}%` }} />
                      <span>{String(r.hour).padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-hours__empty">The chart fills in as you complete sales.</p>
              )}
            </div>
          </section>

          {/* ---------------- the three boxes ---------------- */}
          <div className="group-boxes" role="tablist" aria-label="Menu group">
            {MENU_GROUPS.map((group) => {
              const t = groupTotals[group.key]
              const active = activeGroup === group.key
              const share = grossSlsh ? Math.round((t.value / grossSlsh) * 100) : 0
              return (
                <button
                  key={group.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-expanded={active}
                  className={`group-box group-box--${group.key} ${active ? 'is-active' : ''}`}
                  onClick={() => pickGroup(group.key)}
                >
                  <span className="group-box__top">
                    <span className="group-box__icon" aria-hidden>
                      {group.key === 'fastfood' ? (
                        <UtensilsCrossed size={22} />
                      ) : group.key === 'cuntowadani' ? (
                        <Wheat size={22} />
                      ) : (
                        <Coffee size={22} />
                      )}
                    </span>
                    <ChevronUp size={18} className="group-box__chev" aria-hidden />
                  </span>
                  <strong className="group-box__title">{group.title}</strong>
                  <span className="group-box__hint">{group.hint}</span>
                  <span className="group-box__qty">
                    <b>{t.qty}</b> {group.key === 'shaah' ? 'cups' : 'sold'}
                  </span>
                  <span className="group-box__value">{formatSlshAmount(t.value)}</span>
                  <span className="group-box__bar" aria-label={`${share}% of tonight's sales`}>
                    <i style={{ width: `${share}%` }} />
                  </span>
                  <span className="group-box__cta">
                    <span className="ha-long">{active ? 'Close' : 'Open'} · </span>
                    {share}%<span className="ha-long"> of sales</span>
                  </span>
                </button>
              )
            })}
          </div>

          <p className="group-hint">Tap Fast Food, Cuntowadani or Shaah to open its page and start selling.</p>

          <div className="dash-mini">
            <section className="dash-card dash-card--loans">
              <header>
                <HandCoins size={17} />
                <h2>Loans</h2>
                <strong>{formatSlshAmount(loanSlsh)}</strong>
              </header>
              <div className="dash-card__split">
                <Link to="/app/entry/fastfood">
                  Fast Food <b>{formatSlshAmount(groupLoans.fastfood.value)}</b>
                </Link>
                <Link to="/app/entry/cuntowadani">
                  Cuntowadani <b>{formatSlshAmount(groupLoans.cuntowadani.value)}</b>
                </Link>
              </div>
              {loansByPerson.length ? (
                <ul className="dash-card__list">
                  {loansByPerson.slice(0, 3).map((person) => (
                    <li key={`${person.name}-${person.phone}`}>
                      <span>{person.name}</span>
                      <b>{formatSlshAmount(person.total)}</b>
                    </li>
                  ))}
                  {loansByPerson.length > 3 ? <li className="is-more">+{loansByPerson.length - 3} more</li> : null}
                </ul>
              ) : (
                <p className="dash-card__empty">No loans tonight.</p>
              )}
            </section>

            <section className="dash-card dash-card--tea">
              <header>
                <Coffee size={17} />
                <h2>Tea cash</h2>
                <strong>{formatSlshAmount(teaTotals.expected)}</strong>
              </header>
              <div className="dash-card__split">
                <span>
                  Confirmed <b className="is-ok">{formatSlshAmount(teaTotals.received)}</b>
                </span>
                <span>
                  {teaTotals.owed ? 'Owed' : 'Pending'}{' '}
                  <b className={teaTotals.owed ? 'is-bad' : undefined}>
                    {formatSlshAmount(teaTotals.owed || teaTotals.pending)}
                  </b>
                </span>
              </div>
              {teaRows.length ? (
                <ul className="dash-card__list">
                  {teaRows.map((row) => (
                    <li key={row.name}>
                      <span>
                        {row.name} · {row.shaahCups} cups
                      </span>
                      <em className={`tea-chip is-${row.status}`}>
                        {row.status === 'confirmed'
                          ? row.settlement?.missingCups
                            ? `Owes ${row.settlement.missingCups}`
                            : 'Confirmed'
                          : row.status === 'more'
                            ? `+${row.newCups} new`
                            : 'Pending'}
                      </em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-card__empty">No shaah sold yet.</p>
              )}
              <Link to="/app/entry/shaah" className="dash-card__cta">
                Confirm tea cash
              </Link>
            </section>
          </div>
          </>
          ) : null}

          {/* ---------------- a box's own page ---------------- */}
          {activeGroup ? (
            <section
              className={`group-space group-space--${activeGroup}`}
              aria-label={activeGroupInfo?.title}
            >

              {groupDetail[activeGroup].top.length ? (
                <div className="group-space__top">
                  <span>Top tonight</span>
                  {groupDetail[activeGroup].top.map((item, i) => (
                    <em key={item.name}>
                      <b>{i + 1}</b> {item.name} × {item.qty}
                    </em>
                  ))}
                </div>
              ) : null}

              {groupTotals[activeGroup].items === 0 ? (
                <div className="group-empty">
                  <p>No {MENU_GROUPS.find((g) => g.key === activeGroup)?.title} items yet.</p>
                  <Link to="/app/menu" className="expenses-link-btn">
                    <Plus size={16} /> Add items in Menu Studio
                  </Link>
                </div>
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

              {activeGroup === 'shaah' ? (
                <section className="panel tea-cash">
                  <header>
                    <Users size={18} className="accent-orange" />
                    <div>
                      <h2>Tea waiters · cash</h2>
                      <p>Confirm the shaah money each waiter hands in. Missing cups are signed to that waiter.</p>
                    </div>
                  </header>
                  {teaRows.length ? (
                    <ul className="tea-list">
                      {teaRows.map((row) => {
                        const key = row.name.toLowerCase()
                        const missing = Math.min(row.shaahCups, Math.max(0, missingCups[key] ?? 0))
                        const toReceive = row.value - Math.round(missing * row.avgPrice)
                        return (
                          <li key={row.name} className={`tea-row is-${row.status}`}>
                            <div className="tea-row__head">
                              <span className="tea-row__avatar" aria-hidden>
                                {row.name.slice(0, 1).toUpperCase()}
                              </span>
                              <div className="tea-row__who">
                                <strong>{row.name}</strong>
                                <span>
                                  {row.shaahCups} cup{row.shaahCups === 1 ? '' : 's'} · {formatSlshAmount(row.value)}
                                </span>
                              </div>
                              <span className={`tea-chip is-${row.status}`}>
                                {row.status === 'confirmed'
                                  ? 'Confirmed'
                                  : row.status === 'more'
                                    ? `+${row.newCups} new`
                                    : 'Not confirmed'}
                              </span>
                            </div>

                            {row.settlement ? (
                              <div className="tea-row__done">
                                <span>
                                  <CircleCheck size={15} /> Received {formatSlshAmount(row.settlement.received)} at{' '}
                                  {row.settlement.time}
                                </span>
                                {row.settlement.missingCups ? (
                                  <span className="tea-row__owes">
                                    <CircleAlert size={15} /> Owes {row.settlement.missingCups} cup
                                    {row.settlement.missingCups === 1 ? '' : 's'} ·{' '}
                                    {formatSlshAmount(row.settlement.owed)}
                                  </span>
                                ) : null}
                                <button type="button" className="tea-row__undo" onClick={() => undoTea(row.name)}>
                                  <Undo2 size={14} /> Undo
                                </button>
                              </div>
                            ) : null}

                            {row.status !== 'confirmed' ? (
                              <div className="tea-row__form">
                                <label>
                                  <span>Missing cups</span>
                                  <div className="pos-lines__qty">
                                    <button
                                      type="button"
                                      aria-label="One less missing cup"
                                      onClick={() => setMissingCups((p) => ({ ...p, [key]: Math.max(0, missing - 1) }))}
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <b>{missing}</b>
                                    <button
                                      type="button"
                                      aria-label="One more missing cup"
                                      onClick={() =>
                                        setMissingCups((p) => ({ ...p, [key]: Math.min(row.shaahCups, missing + 1) }))
                                      }
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </label>
                                <div className="tea-row__receive">
                                  <small>Cash to receive</small>
                                  <b>{formatSlshAmount(toReceive)}</b>
                                </div>
                                <button type="button" className="tea-row__confirm" onClick={() => confirmTea(row)}>
                                  <CircleCheck size={16} />
                                  {row.status === 'more' ? 'Confirm again' : 'Confirm cash'}
                                </button>
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="loan-empty">Pick a waiter when you sell shaah — they show up here to confirm their cash.</p>
                  )}
                </section>
              ) : (
                <section className="panel loan-book">
                  <header>
                    <HandCoins size={18} className="accent-orange" />
                    <div>
                      <h2>Loan Book · {activeGroupInfo?.title}</h2>
                      <p>
                        Items sold tonight appear here. Mark how many were taken on loan and by whom
                        (example: sold 20 sandwiches, 2 on loan).
                      </p>
                    </div>
                  </header>

                  {!boxSoldItems.length ? (
                    <p className="loan-empty">
                      Nothing here yet. Complete a sale above first — only sold items can be put on loan.
                    </p>
                  ) : (
                    <div className="loan-sold-list">
                      {boxSoldItems.map((item) => {
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

                  {boxLoanRecords.length ? (
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
                          {boxLoanRecords.map((loan) => (
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
                  ) : boxSoldItems.length ? (
                    <p className="loan-empty">
                      Enter a name, set how many to subtract as loan, then press Take loan.
                    </p>
                  ) : null}
                </section>
              )}

              {/* ---- tonight in this box (bottom of the page) ---- */}
              <div className="group-space__totals">
                <h3>Tonight in {activeGroupInfo?.title}</h3>
                {activeGroup === 'shaah' ? (
                  <div className="group-space__stats">
                    <div>
                      <small>Cups sold</small>
                      <b>{groupTotals.shaah.qty}</b>
                    </div>
                    <div>
                      <small>Money</small>
                      <b>{formatSlshAmount(groupTotals.shaah.value)}</b>
                    </div>
                    <div className="is-ok">
                      <small>Cash confirmed</small>
                      <b>{formatSlshAmount(teaTotals.received)}</b>
                    </div>
                    <div className={teaTotals.owed ? 'is-bad' : undefined}>
                      <small>Owed by waiters</small>
                      <b>{formatSlshAmount(teaTotals.owed)}</b>
                    </div>
                  </div>
                ) : (
                  <div className="group-space__stats">
                    <div>
                      <small>Sold</small>
                      <b>{groupTotals[activeGroup].qty}</b>
                    </div>
                    <div>
                      <small>Money</small>
                      <b>{formatSlshAmount(groupTotals[activeGroup].value)}</b>
                    </div>
                    <div className="is-warn">
                      <small>On loan</small>
                      <b>{formatSlshAmount(groupLoans[activeGroup].value)}</b>
                    </div>
                    <div className="is-ok">
                      <small>Total cash</small>
                      <b>{formatSlshAmount(groupTotals[activeGroup].value - groupLoans[activeGroup].value)}</b>
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}
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

      {!activeGroup ? (
      <>
      <div className="pos-insights pos-insights--single">
        <section className="panel pos-orders">
          <header>
            <Receipt size={18} className="accent-green" />
            <div>
              <h2>Tonight&apos;s sales</h2>
              <p>
                {liveOrders.length} sale{liveOrders.length === 1 ? '' : 's'} · {formatSlshAmount(grossSlsh)} · newest first
              </p>
            </div>
            <Link to="/app/receipts" className="pos-orders__all">
              All receipts
            </Link>
          </header>
          {orders.length ? (
            <ul className="order-list">
              {orders.slice(0, showAllOrders ? undefined : 12).map((order) => (
                <li key={order.id} className={order.returned ? 'is-returned' : undefined}>
                  <span className="order-list__time">#{receiptNo(order, orders)}</span>
                  <div className="order-list__body">
                    <strong>
                      {order.lines.map((l) => `${l.qty}× ${l.itemName}`).join(', ')}
                    </strong>
                    <span className="order-list__meta">
                      {order.time}
                      {order.waiter ? (
                        <span className="order-list__waiter">
                          <Users size={12} /> {order.waiter}
                        </span>
                      ) : null}
                      {order.returned ? <span className="order-list__returned">Returned</span> : null}
                    </span>
                  </div>
                  <b className="order-list__total">{order.total.toLocaleString()}</b>
                  {order.returned ? (
                    <span className="order-list__void order-list__void--done" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      className="order-list__void"
                      aria-label={`Return receipt #${receiptNo(order, orders)}`}
                      title="Return this sale"
                      onClick={() => voidOrder(order)}
                    >
                      <Ban size={15} />
                    </button>
                  )}
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

      </div>

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
      </>
      ) : null}
    </div>
  )
}
