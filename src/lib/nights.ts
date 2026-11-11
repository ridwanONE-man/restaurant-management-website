import type { NightEntry, PosOrder } from '../data'

/** Row shape returned by `select('*, night_item_sales(*), night_loans(*), night_staff_salaries(*)')` */
export type NightRow = {
  id: string
  service_date: string | null
  date_label: string
  day_label: string
  time_label: string | null
  status: NightEntry['status']
  total_sales: number | string
  loan_amount: number | string
  cash_sales: number | string
  expenses_total: number | string
  net_profit: number | string
  covers: number
  loan_covers: number
  expense_chicken: number | string
  expense_wholesaler: number | string
  expense_grocery_spices: number | string
  expense_other: number | string
  created_at: string
  orders?: PosOrder[] | null
  night_item_sales?: {
    item_id: string | null
    item_name: string
    qty: number
    unit_price: number | string
    line_total: number | string
    created_at: string
  }[]
  night_loans?: {
    id: string
    person_name: string
    phone_number: string
    item_id: string | null
    item_name: string
    qty: number
    unit_price: number | string
    loan_value: number | string
    created_at: string
  }[]
  night_staff_salaries?: { staff_name: string; salary: number | string; created_at: string }[]
}

export const NIGHT_SELECT = '*, night_item_sales(*), night_loans(*), night_staff_salaries(*)'

const n = (v: unknown) => Number(v) || 0
const byCreated = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)

export function rowToNight(row: NightRow): NightEntry {
  const staff = [...(row.night_staff_salaries ?? [])].sort(byCreated)
  return {
    id: row.id,
    date: row.date_label,
    dayLabel: row.day_label,
    timeLabel: row.time_label ?? undefined,
    totalSales: n(row.total_sales),
    loanAmount: n(row.loan_amount),
    cashSales: n(row.cash_sales),
    expenses: n(row.expenses_total),
    expenseBreakdown: {
      staff: staff.map((s) => ({ name: s.staff_name, salary: n(s.salary) })),
      chicken: n(row.expense_chicken),
      wholesaler: n(row.expense_wholesaler),
      grocerySpices: n(row.expense_grocery_spices),
      other: n(row.expense_other),
    },
    netProfit: n(row.net_profit),
    covers: row.covers,
    loanCovers: row.loan_covers,
    loans: [...(row.night_loans ?? [])].sort(byCreated).map((l) => ({
      id: l.id,
      personName: l.person_name,
      phoneNumber: l.phone_number,
      itemId: l.item_id ?? '',
      itemName: l.item_name,
      qty: l.qty,
      unitPrice: n(l.unit_price),
      value: n(l.loan_value),
    })),
    itemSales: [...(row.night_item_sales ?? [])].sort(byCreated).map((s) => ({
      itemId: s.item_id ?? '',
      itemName: s.item_name,
      qty: s.qty,
      unitPrice: n(s.unit_price),
      value: n(s.line_total),
    })),
    orders: Array.isArray(row.orders) ? row.orders : [],
    status: row.status,
  }
}

function toIsoDate(label: string) {
  const d = new Date(label)
  if (Number.isNaN(d.getTime())) return null
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** JSON payload for the `save_night` RPC */
export function nightToPayload(entry: NightEntry) {
  return { ...entry, serviceDate: toIsoDate(entry.date) }
}
