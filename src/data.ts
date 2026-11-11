export type MenuCategory = 'grill' | 'plates' | 'sides' | 'juice'

export type MenuIcon =
  | 'sandwich'
  | 'shawarma'
  | 'shawarmaSpecial'
  | 'rice'
  | 'riceChicken'
  | 'chips'
  | 'mango'
  | 'strawberry'
  | 'banana'
  | 'mushakal'
  | 'steak'
  | 'salad'
  | 'coffee'
  | 'pizza'
  | 'fish'
  | 'dessert'
  | 'drink'
  | 'star'

export type MenuItem = {
  id: string
  name: string
  /** Price in Somaliland Shillings */
  price: number
  category: MenuCategory
  icon: MenuIcon
}

export type LoanRecord = {
  id: string
  personName: string
  /** Phone / contact number of the loan taker */
  phoneNumber: string
  itemId: string
  itemName: string
  qty: number
  unitPrice: number
  value: number
}

export type ExpenseBreakdown = {
  staff: { name: string; salary: number }[]
  chicken: number
  wholesaler: number
  grocerySpices: number
  other: number
}

export type NightEntry = {
  id: string
  date: string
  dayLabel: string
  /** Exact time when saved, e.g. 15:42:08 */
  timeLabel?: string
  /** Amounts stored in SLSH */
  totalSales: number
  /** Value of items taken as loan (unpaid) */
  loanAmount: number
  /** Cash collected = totalSales - loanAmount */
  cashSales: number
  /** Operational expenses total (SLSH) */
  expenses: number
  /** Detailed expense lines when saved from Expenses */
  expenseBreakdown?: ExpenseBreakdown
  /** Final remaining / net benefit = cashSales - expenses */
  netProfit: number
  covers: number
  loanCovers: number
  /** Named loan records for the night */
  loans: LoanRecord[]
  /** Optional item breakdown for reports */
  itemSales?: { itemId: string; itemName: string; qty: number; unitPrice: number; value: number }[]
  /** SALES = night money saved before expenses; FINALIZED = expenses included */
  status: 'FINALIZED' | 'REVIEW' | 'SALES'
}

/** Menu prices in Somaliland Shillings */
export const MENU_ITEMS: MenuItem[] = [
  { id: 'sandwich', name: 'Sandwich', price: 15_400, category: 'grill', icon: 'sandwich' },
  { id: 'shawarma', name: 'Shawarma', price: 18_700, category: 'grill', icon: 'shawarma' },
  { id: 'shawarma-special', name: 'Shawarma Special', price: 22_000, category: 'grill', icon: 'shawarmaSpecial' },
  { id: 'rice', name: 'Rice', price: 7_700, category: 'plates', icon: 'rice' },
  { id: 'rice-chicken', name: 'Rice with Chicken', price: 18_700, category: 'plates', icon: 'riceChicken' },
  { id: 'chips', name: 'Chips', price: 7_700, category: 'sides', icon: 'chips' },
  { id: 'mango', name: 'Mango Juice', price: 13_200, category: 'juice', icon: 'mango' },
  { id: 'strawberry', name: 'Strawberry Juice', price: 16_500, category: 'juice', icon: 'strawberry' },
  { id: 'banana', name: 'Banana Juice', price: 11_000, category: 'juice', icon: 'banana' },
  { id: 'mushakal', name: 'Mushakal Juice', price: 15_400, category: 'juice', icon: 'mushakal' },
]

export const DEFAULT_PRICES: Record<string, number> = Object.fromEntries(
  MENU_ITEMS.map((item) => [item.id, item.price]),
)

export const MENU_SECTIONS: { key: MenuCategory; title: string; hint: string }[] = [
  { key: 'grill', title: 'Grill Favorites', hint: 'Sandwiches & shawarma' },
  { key: 'plates', title: 'Rice Plates', hint: 'Half & chicken plates' },
  { key: 'sides', title: 'Sides', hint: 'Crispy extras' },
  { key: 'juice', title: 'Fresh Juices', hint: 'Cold pressed blends' },
]


export function formatSlshAmount(slsh: number, opts?: { signed?: boolean }) {
  const abs = Math.abs(slsh).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })
  if (opts?.signed) {
    if (slsh > 0) return `+${abs} SLSH`
    if (slsh < 0) return `-${abs} SLSH`
  }
  if (slsh < 0) return `-${abs} SLSH`
  return `${abs} SLSH`
}
