import type { LoanRecord, NightEntry, PosOrder } from '../data'

/** Sales that still count (returned receipts are kept for the record but excluded) */
export function activeOrders(orders: PosOrder[] | undefined): PosOrder[] {
  return (orders ?? []).filter((o) => !o.returned)
}

/** Quantity sold per item id, ignoring returned receipts */
export function soldByItem(orders: PosOrder[] | undefined): Record<string, number> {
  const map: Record<string, number> = {}
  for (const order of activeOrders(orders)) {
    for (const line of order.lines) map[line.itemId] = (map[line.itemId] ?? 0) + line.qty
  }
  return map
}

export function itemSalesFrom(orders: PosOrder[] | undefined): NonNullable<NightEntry['itemSales']> {
  const map = new Map<string, { itemId: string; itemName: string; qty: number; unitPrice: number; value: number }>()
  for (const order of activeOrders(orders)) {
    for (const line of order.lines) {
      const row = map.get(line.itemId) ?? { itemId: line.itemId, itemName: line.itemName, qty: 0, unitPrice: 0, value: 0 }
      row.qty += line.qty
      row.value += line.qty * line.unitPrice
      row.unitPrice = row.qty ? Math.round(row.value / row.qty) : line.unitPrice
      map.set(line.itemId, row)
    }
  }
  return [...map.values()].filter((row) => row.qty > 0)
}

/** First item whose loans would exceed what is still sold, if any */
export function loanConflict(orders: PosOrder[], loans: LoanRecord[]): string | null {
  const sold = soldByItem(orders)
  const loaned: Record<string, { qty: number; name: string }> = {}
  for (const loan of loans) {
    const cur = loaned[loan.itemId] ?? { qty: 0, name: loan.itemName }
    cur.qty += loan.qty
    loaned[loan.itemId] = cur
  }
  for (const [id, { qty, name }] of Object.entries(loaned)) {
    if ((sold[id] ?? 0) < qty) return name
  }
  return null
}

/** Receipt number shown to people: stored number, or position in the night */
export function receiptNo(order: PosOrder, orders: PosOrder[]): number {
  if (order.no) return order.no
  const oldestFirst = [...orders].reverse()
  return oldestFirst.findIndex((o) => o.id === order.id) + 1
}

export function nextReceiptNo(orders: PosOrder[]): number {
  return orders.reduce((max, o, i) => Math.max(max, o.no ?? orders.length - i), 0) + 1
}
