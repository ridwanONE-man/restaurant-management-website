import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { LoanRecord, NightEntry, PosOrder, TeaSettlement } from './data'
import { supabase, CLIENT_ID } from './lib/supabase'
import { useRealtimeRefetch } from './lib/realtime'
import { reportSyncError } from './lib/syncStatus'
import { useAuth } from './auth'
import { activeOrders, itemSalesFrom, loanConflict } from './lib/pos'
import { businessDayDateLabel, businessDayKey, businessDayName, parseCutoff } from './lib/businessDay'
import { useSettings } from './appSettings'

export type NightMoney = {
  gross: number
  cash: number
  loan: number
  covers: number
  loanCovers: number
}

export type StaffSalary = {
  id: string
  name: string
  salary: number
}

export type ExpenseState = {
  staff: StaffSalary[]
  chicken: number
  wholesaler: number
  grocerySpices: number
  other: number
}

/** Full night working copy shared between New Entry and Expenses (and every device) */
export type NightDraft = {
  id: string
  date: string
  dayLabel: string
  totalSales: number
  loanAmount: number
  cashSales: number
  covers: number
  loanCovers: number
  loans: LoanRecord[]
  itemSales: NonNullable<NightEntry['itemSales']>
  /** POS sales of the night; counts and money are derived from these */
  orders: PosOrder[]
  /** Tea cash confirmed per waiter */
  teaSettlements?: TeaSettlement[]
  /** Business day this night belongs to (YYYY-MM-DD, closes at the cut-off time) */
  businessDay?: string
}

type LedgerContextValue = {
  nightMoney: NightMoney
  setNightMoney: (money: NightMoney) => void
  nightDraft: NightDraft | null
  setNightDraft: (draft: NightDraft | null) => void
  clearNightDraft: () => void
  /** Increments when this device starts a fresh night */
  nightSession: number
  /** Increments whenever the working night was replaced by data from the server / another device */
  draftRevision: number
  lastAutoSavedAt: string | null
  markAutoSaved: () => void
  /** Clear sales draft + expenses and refresh New Entry / Expenses */
  beginFreshNight: () => void
  expenses: ExpenseState
  setExpenseField: (key: 'chicken' | 'wholesaler' | 'grocerySpices' | 'other', value: number) => void
  addStaff: (name: string, salary: number) => void
  updateStaff: (id: string, patch: Partial<Pick<StaffSalary, 'name' | 'salary'>>) => void
  removeStaff: (id: string) => void
  resetExpenses: () => void
  staffTotal: number
  operationalTotal: number
  allDeductions: number
  finalRemaining: number
  /** Build the current night record for History (sales + expenses) */
  buildHistoryEntry: () => NightEntry | null
  /** Business day of the night being worked on right now */
  businessDay: string
  /** Day that was closed automatically at the cut-off (until the next sale) */
  lastAutoClosed: string | null
  /** Return (or restore) a completed sale of tonight; gives back the updated History entry */
  setOrderReturned: (
    orderId: string,
    returned: boolean,
    reason?: string | null,
  ) => { ok: true; entry: NightEntry | null } | { ok: false; error: string }
}

const EMPTY_NIGHT: NightMoney = {
  gross: 0,
  cash: 0,
  loan: 0,
  covers: 0,
  loanCovers: 0,
}

const emptyExpenses = (): ExpenseState => ({
  staff: [],
  chicken: 0,
  wholesaler: 0,
  grocerySpices: 0,
  other: 0,
})

/** Local cache keys (the source of truth is public.night_drafts, id = 'current') */
const EXPENSE_KEY = 'grillgrain-expenses-v2'
const DRAFT_KEY = 'grillgrain-night-draft-v1'

function timeNowLabel() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function normalizeExpenses(raw: unknown): ExpenseState {
  const parsed = (raw && typeof raw === 'object' ? raw : {}) as Partial<ExpenseState>
  const num = (v: unknown) => Math.max(0, Number(v) || 0)
  return {
    staff: Array.isArray(parsed.staff)
      ? parsed.staff.map((s) => ({ id: String(s.id), name: String(s.name ?? ''), salary: num(s.salary) }))
      : [],
    chicken: num(parsed.chicken),
    wholesaler: num(parsed.wholesaler),
    grocerySpices: num(parsed.grocerySpices),
    other: num(parsed.other),
  }
}

function normalizeDraft(raw: unknown): NightDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<NightDraft>
  if (!d.id) return null
  return {
    id: String(d.id),
    date: String(d.date ?? ''),
    dayLabel: String(d.dayLabel ?? ''),
    totalSales: Number(d.totalSales) || 0,
    loanAmount: Number(d.loanAmount) || 0,
    cashSales: Number(d.cashSales) || 0,
    covers: Number(d.covers) || 0,
    loanCovers: Number(d.loanCovers) || 0,
    loans: Array.isArray(d.loans) ? d.loans : [],
    itemSales: Array.isArray(d.itemSales) ? d.itemSales : [],
    orders: Array.isArray(d.orders) ? d.orders : [],
    teaSettlements: Array.isArray(d.teaSettlements) ? d.teaSettlements : [],
    businessDay: typeof d.businessDay === 'string' ? d.businessDay : undefined,
  }
}

function hasContent(d: NightDraft | null) {
  return Boolean(d && (d.covers > 0 || d.loans.length > 0 || d.totalSales > 0 || d.orders.length > 0))
}

/** Comparable fingerprint of the working night (ignores labels and empty drafts) */
function signature(draft: NightDraft | null, expenses: ExpenseState) {
  const d = hasContent(draft) ? draft! : null
  return JSON.stringify({
    d: d && {
      id: d.id,
      t: d.totalSales,
      l: d.loanAmount,
      c: d.cashSales,
      cv: d.covers,
      lc: d.loanCovers,
      loans: d.loans,
      items: d.itemSales,
      orders: d.orders,
      tea: d.teaSettlements ?? [],
    },
    e: expenses,
  })
}

function readCache<T>(key: string, parse: (v: unknown) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parse(JSON.parse(raw)) : fallback
  } catch {
    return fallback
  }
}

function writeCache(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* optional */
  }
}

function moneyFrom(draft: NightDraft | null): NightMoney {
  if (!draft) return EMPTY_NIGHT
  return {
    gross: draft.totalSales,
    cash: draft.cashSales,
    loan: draft.loanAmount,
    covers: draft.covers,
    loanCovers: draft.loanCovers,
  }
}

type DraftRow = {
  draft: unknown
  expenses: unknown
  client_id: string | null
}

function operationalOf(expenses: ExpenseState) {
  const staff = expenses.staff.reduce((sum, s) => sum + (Number(s.salary) || 0), 0)
  return staff + expenses.chicken + expenses.wholesaler + expenses.grocerySpices + expenses.other
}

/** History record for a working night (sales + expenses) */
function historyEntryFor(draft: NightDraft | null, expenses: ExpenseState): NightEntry | null {
  const operationalTotal = operationalOf(expenses)
  const hasSales = hasContent(draft)
  const hasExpenses = operationalTotal > 0 || expenses.staff.length > 0
  if (!hasSales && !hasExpenses) return null

  const cash = draft?.cashSales ?? 0
  return {
    id: draft?.id ?? `night-${Date.now()}`,
    date:
      draft?.date ??
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    dayLabel: draft?.dayLabel ?? 'Night Service',
    timeLabel: timeNowLabel(),
    totalSales: draft?.totalSales ?? 0,
    loanAmount: draft?.loanAmount ?? 0,
    cashSales: cash,
    expenses: operationalTotal,
    expenseBreakdown: {
      staff: expenses.staff.map((s) => ({ name: s.name, salary: s.salary })),
      chicken: expenses.chicken,
      wholesaler: expenses.wholesaler,
      grocerySpices: expenses.grocerySpices,
      other: expenses.other,
    },
    netProfit: cash - operationalTotal,
    covers: draft?.covers ?? 0,
    loanCovers: draft?.loanCovers ?? 0,
    loans: draft?.loans ?? [],
    itemSales: draft?.itemSales ?? [],
    orders: draft?.orders ?? [],
    teaSettlements: draft?.teaSettlements ?? [],
    status: hasExpenses ? 'FINALIZED' : 'SALES',
  }
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, saveNight } = useAuth()
  const { settings } = useSettings()
  const cutoffRef = useRef(settings.dayCutoff)
  cutoffRef.current = settings.dayCutoff
  const [lastAutoClosed, setLastAutoClosed] = useState<string | null>(null)
  const closingRef = useRef(false)
  const [nightDraft, setNightDraftState] = useState<NightDraft | null>(() =>
    readCache(DRAFT_KEY, normalizeDraft, null),
  )
  const [expenses, setExpensesState] = useState<ExpenseState>(() =>
    readCache(EXPENSE_KEY, normalizeExpenses, emptyExpenses()),
  )
  const [nightMoney, setNightMoneyState] = useState<NightMoney>(() => moneyFrom(nightDraft))
  const [nightSession, setNightSession] = useState(0)
  const [draftRevision, setDraftRevision] = useState(0)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null)

  const draftRef = useRef(nightDraft)
  const expensesRef = useRef(expenses)
  /** Writes are held back until the server copy has been loaded once */
  const loadedRef = useRef(false)
  const lastSigRef = useRef<string | null>(null)
  const writeTimer = useRef<number | undefined>(undefined)

  const flushWrite = useCallback(async () => {
    const sig = signature(draftRef.current, expensesRef.current)
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig
    const { error } = await supabase.from('night_drafts').upsert({
      id: 'current',
      draft: hasContent(draftRef.current) ? draftRef.current : {},
      expenses: expensesRef.current,
      client_id: CLIENT_ID,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      lastSigRef.current = null
      reportSyncError(error)
    }
  }, [])

  const scheduleWrite = useCallback(() => {
    if (!loadedRef.current) return
    window.clearTimeout(writeTimer.current)
    writeTimer.current = window.setTimeout(() => void flushWrite(), 250)
  }, [flushWrite])

  // flush a pending write if the tab is being hidden/closed
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && loadedRef.current) {
        window.clearTimeout(writeTimer.current)
        void flushWrite()
      }
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [flushWrite])

  const commitDraft = useCallback((draft: NightDraft | null) => {
    draftRef.current = draft
    writeCache(DRAFT_KEY, draft)
    setNightDraftState(draft)
    setNightMoneyState(moneyFrom(draft))
  }, [])

  const commitExpenses = useCallback((next: ExpenseState) => {
    expensesRef.current = next
    writeCache(EXPENSE_KEY, next)
    setExpensesState(next)
  }, [])

  /** Apply the shared row coming from the server or another device */
  const applyRemote = useCallback(
    (row: DraftRow) => {
      const firstLoad = !loadedRef.current
      loadedRef.current = true
      // our own echo — local state is already newer or equal
      if (!firstLoad && row.client_id === CLIENT_ID) return
      const draft = normalizeDraft(row.draft)
      const exp = normalizeExpenses(row.expenses)
      const remoteSig = signature(draft, exp)
      lastSigRef.current = remoteSig
      if (remoteSig === signature(draftRef.current, expensesRef.current)) return
      window.clearTimeout(writeTimer.current)
      commitDraft(hasContent(draft) ? draft : null)
      commitExpenses(exp)
      setDraftRevision((n) => n + 1)
    },
    [commitDraft, commitExpenses],
  )

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('night_drafts')
      .select('draft, expenses, client_id')
      .eq('id', 'current')
      .maybeSingle()
    if (error) {
      reportSyncError(error)
      return
    }
    if (data) applyRemote(data as DraftRow)
    else {
      loadedRef.current = true
      scheduleWrite()
    }
  }, [applyRemote, scheduleWrite])

  useRealtimeRefetch('ledger', ['night_drafts'], isAuthenticated, () => void refetch(), (_table, payload) => {
    if (payload.new && 'draft' in payload.new) {
      applyRemote(payload.new as unknown as DraftRow)
      return true
    }
    return false
  })

  useEffect(() => {
    if (!isAuthenticated) loadedRef.current = false
  }, [isAuthenticated])

  const staffTotal = expenses.staff.reduce((sum, s) => sum + (Number(s.salary) || 0), 0)
  const operationalTotal =
    staffTotal + expenses.chicken + expenses.wholesaler + expenses.grocerySpices + expenses.other
  const allDeductions = operationalTotal
  const cashBase = nightDraft?.cashSales ?? nightMoney.cash
  const finalRemaining = cashBase - allDeductions

  const setNightMoney = useCallback((money: NightMoney) => {
    setNightMoneyState(money)
  }, [])

  const setNightDraft = useCallback(
    (draft: NightDraft | null) => {
      let next = draft
      if (draft) {
        const prev = draftRef.current
        // the day is fixed by the first sale of the night, then kept
        const day =
          prev && prev.id === draft.id && prev.businessDay && hasContent(prev)
            ? prev.businessDay
            : businessDayKey(new Date(), cutoffRef.current)
        next = { ...draft, businessDay: day, date: businessDayDateLabel(day), dayLabel: businessDayName(day) }
        if (hasContent(next)) setLastAutoClosed(null)
      }
      commitDraft(next)
      scheduleWrite()
    },
    [commitDraft, scheduleWrite],
  )

  /** At the cut-off (default 01:30) save the night to History and start the next day */
  useEffect(() => {
    if (!isAuthenticated) return
    const check = async () => {
      if (closingRef.current || !loadedRef.current) return
      const local = draftRef.current
      const today = businessDayKey(new Date(), cutoffRef.current)
      if (!local || !hasContent(local) || !local.businessDay || local.businessDay === today) return
      closingRef.current = true
      try {
        // re-read the shared sheet first: another device may already have closed the day
        const { data, error } = await supabase
          .from('night_drafts')
          .select('draft, expenses, client_id')
          .eq('id', 'current')
          .maybeSingle()
        if (error) throw error
        const remote = normalizeDraft(data?.draft)
        if (!remote || !hasContent(remote) || !remote.businessDay || remote.businessDay === today) {
          if (data) applyRemote({ ...(data as DraftRow), client_id: null })
          return
        }
        const entry = historyEntryFor(remote, normalizeExpenses(data?.expenses))
        if (entry) {
          saveNight({
            ...entry,
            status: 'FINALIZED',
            timeLabel: `${parseCutoff(cutoffRef.current).label} · auto-closed`,
          })
        }
        window.clearTimeout(writeTimer.current)
        commitDraft(null)
        commitExpenses(emptyExpenses())
        setLastAutoSavedAt(null)
        setNightSession((n) => n + 1)
        setLastAutoClosed(remote.businessDay)
        lastSigRef.current = null
        await flushWrite()
      } catch (err) {
        reportSyncError(err)
      } finally {
        closingRef.current = false
      }
    }
    void check()
    const id = window.setInterval(() => void check(), 30_000)
    const onVisible = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [applyRemote, commitDraft, commitExpenses, flushWrite, isAuthenticated, saveNight])

  const clearNightDraft = useCallback(() => {
    commitDraft(null)
    scheduleWrite()
  }, [commitDraft, scheduleWrite])

  const resetExpenses = useCallback(() => {
    commitExpenses(emptyExpenses())
    scheduleWrite()
  }, [commitExpenses, scheduleWrite])

  const beginFreshNight = useCallback(() => {
    commitDraft(null)
    commitExpenses(emptyExpenses())
    setLastAutoSavedAt(null)
    setNightSession((n) => n + 1)
    scheduleWrite()
  }, [commitDraft, commitExpenses, scheduleWrite])

  const markAutoSaved = useCallback(() => {
    setLastAutoSavedAt(timeNowLabel())
  }, [])

  const updateExpenses = useCallback(
    (fn: (prev: ExpenseState) => ExpenseState) => {
      commitExpenses(fn(expensesRef.current))
      scheduleWrite()
    },
    [commitExpenses, scheduleWrite],
  )

  const setExpenseField = useCallback(
    (key: 'chicken' | 'wholesaler' | 'grocerySpices' | 'other', value: number) => {
      updateExpenses((prev) => ({ ...prev, [key]: Math.max(0, Number.isFinite(value) ? value : 0) }))
    },
    [updateExpenses],
  )

  const addStaff = useCallback(
    (name: string, salary: number) => {
      updateExpenses((prev) => ({
        ...prev,
        staff: [
          ...prev.staff,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim() || `Staff ${prev.staff.length + 1}`,
            salary: Math.max(0, Number.isFinite(salary) ? salary : 0),
          },
        ],
      }))
    },
    [updateExpenses],
  )

  const updateStaff = useCallback(
    (id: string, patch: Partial<Pick<StaffSalary, 'name' | 'salary'>>) => {
      updateExpenses((prev) => ({
        ...prev,
        staff: prev.staff.map((s) =>
          s.id === id
            ? {
                ...s,
                name: patch.name !== undefined ? patch.name : s.name,
                salary:
                  patch.salary !== undefined
                    ? Math.max(0, Number.isFinite(patch.salary) ? patch.salary : 0)
                    : s.salary,
              }
            : s,
        ),
      }))
    },
    [updateExpenses],
  )

  const removeStaff = useCallback(
    (id: string) => {
      updateExpenses((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.id !== id) }))
    },
    [updateExpenses],
  )

  const buildHistoryEntry = useCallback(
    (): NightEntry | null => historyEntryFor(nightDraft, expenses),
    [expenses, nightDraft],
  )

  const setOrderReturned = useCallback(
    (orderId: string, returned: boolean, reason?: string | null) => {
      const draft = draftRef.current
      if (!draft) return { ok: false as const, error: 'There are no sales tonight.' }
      const now = new Date()
      const orders = draft.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              returned: returned ? { at: now.toISOString(), time: timeNowLabel(), reason: reason ?? null } : null,
            }
          : o,
      )
      const blocked = loanConflict(orders, draft.loans)
      if (blocked) {
        return {
          ok: false as const,
          error: `Remove the ${blocked} loan first — this sale is needed to cover it.`,
        }
      }
      const live = activeOrders(orders)
      const totalSales = live.reduce((sum, o) => sum + o.total, 0)
      const covers = live.reduce((sum, o) => sum + o.lines.reduce((n, l) => n + l.qty, 0), 0)
      const next: NightDraft = {
        ...draft,
        orders,
        itemSales: itemSalesFrom(orders),
        totalSales,
        covers,
        cashSales: totalSales - draft.loanAmount,
      }
      commitDraft(next)
      scheduleWrite()
      return { ok: true as const, entry: historyEntryFor(next, expensesRef.current) }
    },
    [commitDraft, scheduleWrite],
  )

  const value = useMemo<LedgerContextValue>(
    () => ({
      nightMoney,
      setNightMoney,
      nightDraft,
      setNightDraft,
      clearNightDraft,
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
      allDeductions,
      finalRemaining,
      buildHistoryEntry,
      setOrderReturned,
      businessDay: nightDraft?.businessDay && hasContent(nightDraft)
        ? nightDraft.businessDay
        : businessDayKey(new Date(), settings.dayCutoff),
      lastAutoClosed,
    }),
    [
      setOrderReturned,
      lastAutoClosed,
      settings.dayCutoff,
      addStaff,
      allDeductions,
      beginFreshNight,
      buildHistoryEntry,
      clearNightDraft,
      draftRevision,
      expenses,
      finalRemaining,
      lastAutoSavedAt,
      markAutoSaved,
      nightDraft,
      nightMoney,
      nightSession,
      operationalTotal,
      removeStaff,
      resetExpenses,
      setExpenseField,
      setNightDraft,
      setNightMoney,
      staffTotal,
      updateStaff,
    ],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger() {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used within LedgerProvider')
  return ctx
}
