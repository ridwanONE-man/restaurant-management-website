import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { LoanRecord, NightEntry } from './data'

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

/** Full night working copy shared between New Entry and Expenses */
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
}

type LedgerContextValue = {
  nightMoney: NightMoney
  setNightMoney: (money: NightMoney) => void
  nightDraft: NightDraft | null
  setNightDraft: (draft: NightDraft | null) => void
  clearNightDraft: () => void
  /** Increments when both pages are refreshed for a new night */
  nightSession: number
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
}

const EMPTY_NIGHT: NightMoney = {
  gross: 0,
  cash: 0,
  loan: 0,
  covers: 0,
  loanCovers: 0,
}

const EMPTY_EXPENSES: ExpenseState = {
  staff: [],
  chicken: 0,
  wholesaler: 0,
  grocerySpices: 0,
  other: 0,
}

const EXPENSE_KEY = 'grillgrain-expenses-v2'
const DRAFT_KEY = 'grillgrain-night-draft-v1'

function timeNowLabel() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function loadExpenses(): ExpenseState {
  try {
    const raw = localStorage.getItem(EXPENSE_KEY)
    if (!raw) return { ...EMPTY_EXPENSES, staff: [] }
    const parsed = JSON.parse(raw) as Partial<ExpenseState>
    return {
      ...EMPTY_EXPENSES,
      ...parsed,
      staff: Array.isArray(parsed.staff) ? parsed.staff : [],
    }
  } catch {
    return { ...EMPTY_EXPENSES, staff: [] }
  }
}

function loadDraft(): NightDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as NightDraft
  } catch {
    return null
  }
}

function persistExpenses(next: ExpenseState) {
  localStorage.setItem(EXPENSE_KEY, JSON.stringify(next))
}

function persistDraft(draft: NightDraft | null) {
  if (!draft) localStorage.removeItem(DRAFT_KEY)
  else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [nightMoney, setNightMoneyState] = useState<NightMoney>(EMPTY_NIGHT)
  const [nightDraft, setNightDraftState] = useState<NightDraft | null>(loadDraft)
  const [expenses, setExpensesState] = useState<ExpenseState>(loadExpenses)
  const [nightSession, setNightSession] = useState(0)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null)

  const staffTotal = expenses.staff.reduce((sum, s) => sum + (Number(s.salary) || 0), 0)
  const operationalTotal =
    staffTotal + expenses.chicken + expenses.wholesaler + expenses.grocerySpices + expenses.other
  const allDeductions = operationalTotal
  const cashBase = nightDraft?.cashSales ?? nightMoney.cash
  const finalRemaining = cashBase - allDeductions

  const setNightMoney = useCallback((money: NightMoney) => {
    setNightMoneyState(money)
  }, [])

  const setNightDraft = useCallback((draft: NightDraft | null) => {
    persistDraft(draft)
    setNightDraftState(draft)
    if (draft) {
      setNightMoneyState({
        gross: draft.totalSales,
        cash: draft.cashSales,
        loan: draft.loanAmount,
        covers: draft.covers,
        loanCovers: draft.loanCovers,
      })
    }
  }, [])

  const clearNightDraft = useCallback(() => {
    persistDraft(null)
    setNightDraftState(null)
    setNightMoneyState(EMPTY_NIGHT)
  }, [])

  const resetExpenses = useCallback(() => {
    const empty = { ...EMPTY_EXPENSES, staff: [] }
    persistExpenses(empty)
    setExpensesState(empty)
  }, [])

  const beginFreshNight = useCallback(() => {
    persistDraft(null)
    setNightDraftState(null)
    setNightMoneyState(EMPTY_NIGHT)
    const empty = { ...EMPTY_EXPENSES, staff: [] }
    persistExpenses(empty)
    setExpensesState(empty)
    setLastAutoSavedAt(null)
    setNightSession((n) => n + 1)
  }, [])

  const markAutoSaved = useCallback(() => {
    setLastAutoSavedAt(timeNowLabel())
  }, [])

  const setExpenseField = useCallback(
    (key: 'chicken' | 'wholesaler' | 'grocerySpices' | 'other', value: number) => {
      setExpensesState((prev) => {
        const next = {
          ...prev,
          [key]: Math.max(0, Number.isFinite(value) ? value : 0),
        }
        persistExpenses(next)
        return next
      })
    },
    [],
  )

  const addStaff = useCallback((name: string, salary: number) => {
    setExpensesState((prev) => {
      const next = {
        ...prev,
        staff: [
          ...prev.staff,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim() || `Staff ${prev.staff.length + 1}`,
            salary: Math.max(0, Number.isFinite(salary) ? salary : 0),
          },
        ],
      }
      persistExpenses(next)
      return next
    })
  }, [])

  const updateStaff = useCallback(
    (id: string, patch: Partial<Pick<StaffSalary, 'name' | 'salary'>>) => {
      setExpensesState((prev) => {
        const next = {
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
        }
        persistExpenses(next)
        return next
      })
    },
    [],
  )

  const removeStaff = useCallback((id: string) => {
    setExpensesState((prev) => {
      const next = { ...prev, staff: prev.staff.filter((s) => s.id !== id) }
      persistExpenses(next)
      return next
    })
  }, [])

  const buildHistoryEntry = useCallback((): NightEntry | null => {
    const draft = nightDraft
    const hasSales = Boolean(draft && (draft.covers > 0 || draft.loans.length > 0 || draft.totalSales > 0))
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
      status: operationalTotal > 0 || expenses.staff.length > 0 ? 'FINALIZED' : 'SALES',
    }
  }, [expenses, nightDraft, operationalTotal])

  const value = useMemo<LedgerContextValue>(
    () => ({
      nightMoney,
      setNightMoney,
      nightDraft,
      setNightDraft,
      clearNightDraft,
      nightSession,
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
    }),
    [
      addStaff,
      allDeductions,
      beginFreshNight,
      buildHistoryEntry,
      clearNightDraft,
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
