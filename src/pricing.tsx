import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  MENU_ITEMS,
  type MenuCategory,
  type MenuIcon,
  type MenuItem,
} from './data'
import { supabase } from './lib/supabase'
import { useRealtimeRefetch } from './lib/realtime'
import { reportSyncError } from './lib/syncStatus'
import { useAuth } from './auth'

export type NewMenuItemInput = {
  name: string
  price: number
  category: MenuCategory
  icon: MenuIcon
}

type PricingContextValue = {
  /** Live menu used by New Entry, Prices, Analytics */
  menu: MenuItem[]
  catalog: MenuItem[]
  prices: Record<string, number>
  setItemPrice: (id: string, slsh: number) => void
  applyNightPricing: (next: { prices: Record<string, number> }) => void
  addMenuItem: (input: NewMenuItemInput) => MenuItem
  updateMenuItem: (id: string, patch: Partial<Omit<MenuItem, 'id'>>) => void
  removeMenuItem: (id: string) => void
  resetDefaults: () => void
}

const PricingContext = createContext<PricingContextValue | null>(null)

/** Local cache only — the source of truth is public.menu_items */
const MENU_KEY = 'grillgrain-menu-catalog-v1'

type MenuRow = {
  id: string
  name: string
  price: number | string
  category: MenuCategory
  icon: MenuIcon
  sort_order: number
}

function rowToItem(row: MenuRow): MenuItem {
  return {
    id: row.id,
    name: row.name,
    price: Math.max(0, Number(row.price) || 0),
    category: row.category,
    icon: row.icon || 'star',
  }
}

function itemToRow(item: MenuItem, sortOrder: number) {
  return {
    id: item.id,
    name: item.name,
    price: item.price,
    category: item.category,
    icon: item.icon,
    is_active: true,
    sort_order: sortOrder,
  }
}

function loadCatalog(): MenuItem[] {
  try {
    const raw = localStorage.getItem(MENU_KEY)
    if (!raw) return MENU_ITEMS.map((item) => ({ ...item }))
    const parsed = JSON.parse(raw) as MenuItem[]
    if (!Array.isArray(parsed) || !parsed.length) return MENU_ITEMS.map((item) => ({ ...item }))
    return parsed.filter((item) => item && item.id && item.name)
  } catch {
    return MENU_ITEMS.map((item) => ({ ...item }))
  }
}

function cache(catalog: MenuItem[]) {
  try {
    localStorage.setItem(MENU_KEY, JSON.stringify(catalog))
  } catch {
    /* optional */
  }
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

const cleanPrice = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0)

export function PricingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [catalog, setCatalogState] = useState<MenuItem[]>(loadCatalog)
  const catalogRef = useRef(catalog)

  const setCatalog = useCallback((next: MenuItem[]) => {
    // keep the same array identity when nothing changed, so open forms aren't reset
    if (JSON.stringify(next) === JSON.stringify(catalogRef.current)) return
    catalogRef.current = next
    cache(next)
    setCatalogState(next)
  }, [])

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, price, category, icon, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      reportSyncError(error)
      return
    }
    setCatalog((data as MenuRow[]).map(rowToItem))
  }, [setCatalog])

  useRealtimeRefetch('menu', ['menu_items'], isAuthenticated, () => void refetch())

  const run = useCallback(
    async (task: PromiseLike<{ error: unknown }>) => {
      const { error } = await task
      if (error) {
        reportSyncError(error)
        void refetch()
      }
    },
    [refetch],
  )

  const prices = useMemo(
    () => Object.fromEntries(catalog.map((item) => [item.id, item.price])) as Record<string, number>,
    [catalog],
  )

  const setItemPrice = useCallback(
    (id: string, slsh: number) => {
      const clean = cleanPrice(slsh)
      setCatalog(catalogRef.current.map((item) => (item.id === id ? { ...item, price: clean } : item)))
      void run(supabase.from('menu_items').update({ price: clean }).eq('id', id))
    },
    [run, setCatalog],
  )

  const applyNightPricing = useCallback(
    ({ prices: nextPrices }: { prices: Record<string, number> }) => {
      const next = catalogRef.current.map((item) =>
        nextPrices[item.id] !== undefined ? { ...item, price: cleanPrice(Number(nextPrices[item.id])) } : item,
      )
      setCatalog(next)
      void run(supabase.from('menu_items').upsert(next.map((item, i) => itemToRow(item, i + 1))))
    },
    [run, setCatalog],
  )

  const addMenuItem = useCallback(
    (input: NewMenuItemInput) => {
      const current = catalogRef.current
      const base = slugify(input.name) || 'item'
      let id = base
      let n = 1
      while (current.some((item) => item.id === id)) {
        id = `${base}-${n}`
        n += 1
      }
      const item: MenuItem = {
        id,
        name: input.name.trim(),
        price: cleanPrice(input.price),
        category: input.category,
        icon: input.icon,
      }
      setCatalog([...current, item])
      void run(supabase.from('menu_items').insert(itemToRow(item, current.length + 1)))
      return item
    },
    [run, setCatalog],
  )

  const updateMenuItem = useCallback(
    (id: string, patch: Partial<Omit<MenuItem, 'id'>>) => {
      let updated: MenuItem | null = null
      setCatalog(
        catalogRef.current.map((item) => {
          if (item.id !== id) return item
          updated = {
            ...item,
            name: patch.name !== undefined ? patch.name.trim() || item.name : item.name,
            price: patch.price !== undefined ? cleanPrice(patch.price) : item.price,
            category: patch.category ?? item.category,
            icon: patch.icon ?? item.icon,
          }
          return updated
        }),
      )
      const u = updated as MenuItem | null
      if (!u) return
      void run(
        supabase
          .from('menu_items')
          .update({ name: u.name, price: u.price, category: u.category, icon: u.icon })
          .eq('id', id),
      )
    },
    [run, setCatalog],
  )

  const removeMenuItem = useCallback(
    (id: string) => {
      setCatalog(catalogRef.current.filter((item) => item.id !== id))
      void run(supabase.from('menu_items').delete().eq('id', id))
    },
    [run, setCatalog],
  )

  const resetDefaults = useCallback(() => {
    const defaults = MENU_ITEMS.map((item) => ({ ...item }))
    setCatalog(defaults)
    void (async () => {
      const keep = defaults.map((item) => `"${item.id}"`).join(',')
      const del = await supabase.from('menu_items').delete().not('id', 'in', `(${keep})`)
      if (del.error) {
        reportSyncError(del.error)
        return
      }
      await run(supabase.from('menu_items').upsert(defaults.map((item, i) => itemToRow(item, i + 1))))
    })()
  }, [run, setCatalog])

  const value = useMemo<PricingContextValue>(
    () => ({
      menu: catalog,
      catalog,
      prices,
      setItemPrice,
      applyNightPricing,
      addMenuItem,
      updateMenuItem,
      removeMenuItem,
      resetDefaults,
    }),
    [addMenuItem, applyNightPricing, catalog, prices, removeMenuItem, resetDefaults, setItemPrice, updateMenuItem],
  )

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>
}

export function usePricing() {
  const ctx = useContext(PricingContext)
  if (!ctx) throw new Error('usePricing must be used within PricingProvider')
  return ctx
}
