import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_PRICES,
  MENU_ITEMS,
  type MenuCategory,
  type MenuIcon,
  type MenuItem,
} from './data'

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

const PRICES_KEY = 'grillgrain-night-prices-slsh-v1'
const MENU_KEY = 'grillgrain-menu-catalog-v1'

function loadCatalog(): MenuItem[] {
  try {
    const raw = localStorage.getItem(MENU_KEY)
    if (!raw) return MENU_ITEMS.map((item) => ({ ...item }))
    const parsed = JSON.parse(raw) as MenuItem[]
    if (!Array.isArray(parsed) || !parsed.length) return MENU_ITEMS.map((item) => ({ ...item }))
    return parsed
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        price: Math.max(0, Number(item.price) || 0),
        category: (item.category as MenuCategory) || 'grill',
        icon: (item.icon as MenuIcon) || 'star',
      }))
  } catch {
    return MENU_ITEMS.map((item) => ({ ...item }))
  }
}

function loadPrices(catalog: MenuItem[]): Record<string, number> {
  const base = Object.fromEntries(catalog.map((item) => [item.id, item.price]))
  try {
    const raw = localStorage.getItem(PRICES_KEY)
    if (!raw) return { ...base }
    const parsed = JSON.parse(raw) as Record<string, number>
    const next = { ...base }
    for (const [id, value] of Object.entries(parsed)) {
      if (id in next) next[id] = Math.max(0, Number(value) || 0)
    }
    return next
  } catch {
    return { ...base }
  }
}

function persistCatalog(catalog: MenuItem[]) {
  localStorage.setItem(MENU_KEY, JSON.stringify(catalog))
}

function persistPrices(prices: Record<string, number>) {
  localStorage.setItem(PRICES_KEY, JSON.stringify(prices))
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export function PricingProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<MenuItem[]>(loadCatalog)
  const [prices, setPrices] = useState<Record<string, number>>(() => loadPrices(loadCatalog()))

  const menu = useMemo(
    () =>
      catalog.map((item) => ({
        ...item,
        price: prices[item.id] ?? item.price,
      })),
    [catalog, prices],
  )

  const setItemPrice = useCallback((id: string, slsh: number) => {
    const clean = Math.max(0, Number.isFinite(slsh) ? slsh : 0)
    setPrices((prev) => {
      const next = { ...prev, [id]: clean }
      persistPrices(next)
      return next
    })
    setCatalog((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, price: clean } : item))
      persistCatalog(next)
      return next
    })
  }, [])

  const applyNightPricing = useCallback(({ prices: nextPrices }: { prices: Record<string, number> }) => {
    setPrices((prev) => {
      const next = { ...prev }
      for (const [id, value] of Object.entries(nextPrices)) {
        if (id in next) next[id] = Math.max(0, Number(value) || 0)
      }
      persistPrices(next)
      return next
    })
    setCatalog((prev) => {
      const next = prev.map((item) => ({
        ...item,
        price: nextPrices[item.id] !== undefined ? Math.max(0, Number(nextPrices[item.id]) || 0) : item.price,
      }))
      persistCatalog(next)
      return next
    })
  }, [])

  const addMenuItem = useCallback((input: NewMenuItemInput) => {
    const base = slugify(input.name) || 'item'
    let nextId = base
    setCatalog((prev) => {
      let n = 1
      while (prev.some((item) => item.id === nextId)) {
        nextId = `${base}-${n}`
        n += 1
      }
      const item: MenuItem = {
        id: nextId,
        name: input.name.trim(),
        price: Math.max(0, Number.isFinite(input.price) ? input.price : 0),
        category: input.category,
        icon: input.icon,
      }
      const next = [...prev, item]
      persistCatalog(next)
      setPrices((pricePrev) => {
        const priceNext = { ...pricePrev, [item.id]: item.price }
        persistPrices(priceNext)
        return priceNext
      })
      return next
    })
    return {
      id: nextId,
      name: input.name.trim(),
      price: Math.max(0, Number.isFinite(input.price) ? input.price : 0),
      category: input.category,
      icon: input.icon,
    }
  }, [])

  const updateMenuItem = useCallback((id: string, patch: Partial<Omit<MenuItem, 'id'>>) => {
    setCatalog((prev) => {
      const next = prev.map((item) => {
        if (item.id !== id) return item
        return {
          ...item,
          name: patch.name !== undefined ? patch.name.trim() || item.name : item.name,
          price:
            patch.price !== undefined
              ? Math.max(0, Number.isFinite(patch.price) ? patch.price : 0)
              : item.price,
          category: patch.category ?? item.category,
          icon: patch.icon ?? item.icon,
        }
      })
      persistCatalog(next)
      if (patch.price !== undefined) {
        const clean = Math.max(0, Number.isFinite(patch.price) ? patch.price : 0)
        setPrices((pricePrev) => {
          const priceNext = { ...pricePrev, [id]: clean }
          persistPrices(priceNext)
          return priceNext
        })
      }
      return next
    })
  }, [])

  const removeMenuItem = useCallback((id: string) => {
    setCatalog((prev) => {
      const next = prev.filter((item) => item.id !== id)
      persistCatalog(next)
      return next
    })
    setPrices((prev) => {
      const next = { ...prev }
      delete next[id]
      persistPrices(next)
      return next
    })
  }, [])

  const resetDefaults = useCallback(() => {
    const defaults = MENU_ITEMS.map((item) => ({ ...item }))
    persistCatalog(defaults)
    persistPrices({ ...DEFAULT_PRICES })
    setCatalog(defaults)
    setPrices({ ...DEFAULT_PRICES })
  }, [])

  const value = useMemo<PricingContextValue>(
    () => ({
      menu,
      catalog,
      prices,
      setItemPrice,
      applyNightPricing,
      addMenuItem,
      updateMenuItem,
      removeMenuItem,
      resetDefaults,
    }),
    [
      addMenuItem,
      applyNightPricing,
      catalog,
      menu,
      prices,
      removeMenuItem,
      resetDefaults,
      setItemPrice,
      updateMenuItem,
    ],
  )

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>
}

export function usePricing() {
  const ctx = useContext(PricingContext)
  if (!ctx) throw new Error('usePricing must be used within PricingProvider')
  return ctx
}
