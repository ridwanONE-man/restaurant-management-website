import { useMemo, useState } from 'react'
import {
  Check,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { usePricing } from './pricing'
import {
  MENU_SECTIONS,
  formatSlshAmount,
  type MenuCategory,
  type MenuIcon,
  type MenuItem,
} from './data'
import { MENU_ICON_OPTIONS, getMenuIcon } from './menuIcons'
import LiveClock from './LiveClock'
import './MenuStudio.css'

function sanitizeDecimalInput(raw: string) {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  return cleaned
}

type FormState = {
  name: string
  price: string
  category: MenuCategory
  icon: MenuIcon
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '',
  category: 'grill',
  icon: 'star',
}

export default function MenuStudio() {
  const { menu, addMenuItem, updateMenuItem, removeMenuItem, resetDefaults } = usePricing()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<MenuCategory | 'all'>('all')
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  const filtered = useMemo(() => {
    if (filter === 'all') return menu
    return menu.filter((item) => item.category === filter)
  }, [filter, menu])

  const countsByCategory = useMemo(() => {
    const map: Record<string, number> = { all: menu.length }
    for (const section of MENU_SECTIONS) {
      map[section.key] = menu.filter((i) => i.category === section.key).length
    }
    return map
  }, [menu])

  function showFlash(message: string) {
    setFlash(message)
    window.setTimeout(() => setFlash(''), 2200)
  }

  function startEdit(item: MenuItem) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      icon: item.icon,
    })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function onSubmit() {
    const name = form.name.trim()
    const price = Number(form.price || 0)
    if (!name) {
      setError('Enter an item name.')
      return
    }
    if (!(price > 0)) {
      setError('Enter a price greater than zero.')
      return
    }

    if (editingId) {
      updateMenuItem(editingId, {
        name,
        price,
        category: form.category,
        icon: form.icon,
      })
      showFlash(`Updated “${name}” — New Entry & Prices refresh automatically.`)
    } else {
      addMenuItem({
        name,
        price,
        category: form.category,
        icon: form.icon,
      })
      showFlash(`Added “${name}” — it now appears on New Entry & Night Prices.`)
    }

    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  function onDelete(item: MenuItem) {
    if (!window.confirm(`Remove “${item.name}” from the menu? It will disappear from New Entry and Prices.`)) {
      return
    }
    removeMenuItem(item.id)
    if (editingId === item.id) cancelEdit()
    showFlash(`Removed “${item.name}” from the kitchen menu.`)
  }

  function onResetMenu() {
    if (!window.confirm('Restore the original Central Fast Food menu? Custom items will be lost.')) return
    resetDefaults()
    cancelEdit()
    showFlash('Menu restored to defaults.')
  }

  return (
    <div className="page menu-studio">
      <section className="menu-hero">
        <div className="menu-hero__copy">
          <p className="eyebrow">KITCHEN MENU</p>
          <h1>
            <UtensilsCrossed size={34} strokeWidth={2.2} />
            Menu Studio
          </h1>
          <p>
            Build your board. Add favorites, drop what you no longer serve — changes land instantly on
            New Entry and Night Prices.
          </p>
          <div className="menu-hero__stats">
            <div>
              <span>LIVE ITEMS</span>
              <strong>{menu.length}</strong>
            </div>
            <div>
              <span>CATEGORIES</span>
              <strong>{MENU_SECTIONS.length}</strong>
            </div>
            <div>
              <span>STATUS</span>
              <strong className="live">Synced</strong>
            </div>
          </div>
        </div>
        <div className="menu-hero__side">
          <LiveClock />
          <div className="menu-hero__orb" aria-hidden>
            <Sparkles size={28} />
            <span>Your house flavors</span>
          </div>
        </div>
      </section>

      {flash ? <p className="menu-flash">{flash}</p> : null}

      <section className="menu-composer panel">
        <header>
          <div>
            <h2>{editingId ? 'Edit menu item' : 'Add a new favorite'}</h2>
            <p>
              {editingId
                ? 'Update name, price, category, or icon — saves across the kitchen.'
                : 'Name it, price it, pick a look — it appears on New Entry right away.'}
            </p>
          </div>
          {editingId ? (
            <button type="button" className="ghost-chip" onClick={cancelEdit}>
              <X size={15} />
              Cancel edit
            </button>
          ) : null}
        </header>

        <div className="composer-grid">
          <label>
            <span>ITEM NAME</span>
            <input
              type="text"
              value={form.name}
              placeholder="e.g. Chicken Burger"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label>
            <span>PRICE (SLSH)</span>
            <div className="price-field">
              <em>SLSH</em>
              <input
                type="text"
                inputMode="decimal"
                value={form.price}
                placeholder="0"
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: sanitizeDecimalInput(e.target.value) }))
                }
              />
            </div>
          </label>
          <label>
            <span>CATEGORY</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MenuCategory }))}
            >
              {MENU_SECTIONS.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="icon-picker">
          <span className="icon-picker__label">LOOK / ICON</span>
          <div className="icon-picker__grid">
            {MENU_ICON_OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={form.icon === id ? 'active' : undefined}
                onClick={() => setForm((f) => ({ ...f, icon: id }))}
                title={label}
              >
                <Icon size={18} />
                <em>{label}</em>
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="menu-error">{error}</p> : null}

        <div className="composer-actions">
          <button type="button" className="primary-action" onClick={onSubmit}>
            {editingId ? <Check size={17} /> : <Plus size={17} />}
            {editingId ? 'Save changes' : 'Add to menu'}
          </button>
          <button type="button" className="ghost-chip" onClick={onResetMenu}>
            Restore default menu
          </button>
        </div>
      </section>

      <div className="menu-filters">
        <button
          type="button"
          className={filter === 'all' ? 'active' : undefined}
          onClick={() => setFilter('all')}
        >
          All <b>{countsByCategory.all}</b>
        </button>
        {MENU_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={filter === section.key ? 'active' : undefined}
            onClick={() => setFilter(section.key)}
          >
            {section.title} <b>{countsByCategory[section.key] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="menu-board">
        {filtered.length ? (
          filtered.map((item, index) => {
            const Icon = getMenuIcon(item.icon)
            const section = MENU_SECTIONS.find((s) => s.key === item.category)
            return (
              <article
                key={item.id}
                className={`menu-card menu-card--${item.category} ${editingId === item.id ? 'is-editing' : ''}`}
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="menu-card__icon">
                  <Icon size={22} />
                </div>
                <div className="menu-card__body">
                  <span className="menu-card__cat">{section?.title ?? item.category}</span>
                  <h3>{item.name}</h3>
                  <strong>{formatSlshAmount(item.price)}</strong>
                </div>
                <div className="menu-card__actions">
                  <button type="button" aria-label={`Edit ${item.name}`} onClick={() => startEdit(item)}>
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            )
          })
        ) : (
          <div className="menu-empty">
            <UtensilsCrossed size={28} />
            <h3>No items in this section</h3>
            <p>Add a favorite above — it will show here and on New Entry automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}
