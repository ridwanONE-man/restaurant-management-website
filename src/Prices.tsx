import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  RefreshCcw,
  Save,
  Tags,
} from 'lucide-react'
import { usePricing } from './pricing'
import {
  MENU_SECTIONS,
  formatSlshAmount,
} from './data'
import { getMenuIcon } from './menuIcons'
import './Prices.css'

function sanitizeDecimalInput(raw: string) {
  let cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  return cleaned
}

function toNumber(raw: string) {
  if (raw === '' || raw === '.') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function pricesToDraft(prices: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(prices).map(([id, value]) => [id, String(value)]),
  ) as Record<string, string>
}

export default function Prices() {
  const { menu, prices, applyNightPricing, resetDefaults } = usePricing()
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>(() => pricesToDraft(prices))
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setDraftPrices(pricesToDraft(prices))
  }, [prices])

  const dirty = useMemo(
    () => menu.some((item) => toNumber(draftPrices[item.id] ?? '') !== (prices[item.id] ?? item.price)),
    [draftPrices, menu, prices],
  )

  function setPrice(id: string, raw: string) {
    setDraftPrices((prev) => ({ ...prev, [id]: sanitizeDecimalInput(raw) }))
  }

  function apply() {
    const nextPrices = Object.fromEntries(
      menu.map((item) => [item.id, toNumber(draftPrices[item.id] ?? String(item.price))]),
    )
    applyNightPricing({ prices: nextPrices })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  function reset() {
    resetDefaults()
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page prices-page">
      <div className="prices-hero">
        <div className="prices-hero__copy">
          <p className="eyebrow">NIGHT BOARD</p>
          <h1>Tonight&apos;s Prices</h1>
          <p className="prices-lead">
            Set every food price in Somaliland Shillings for tonight. Changes apply to New Entry
            after you hit Apply.
          </p>
        </div>
        <div className="prices-hero__actions">
          <button type="button" className="ghost-btn" onClick={reset}>
            <RefreshCcw size={16} />
            Reset defaults
          </button>
          <button type="button" className="apply-btn" onClick={apply} disabled={!dirty && !saved}>
            {saved ? <Check size={18} /> : <Save size={18} />}
            {saved ? 'APPLIED' : 'APPLY TONIGHT'}
          </button>
        </div>
      </div>

      {MENU_SECTIONS.map((section) => {
        const items = menu.filter((item) => item.category === section.key)
        if (!items.length) return null
        return (
          <section key={section.key} className={`price-section tone-${section.key}`}>
            <div className="price-section__head">
              <Tags size={16} />
              <div>
                <h2>{section.title}</h2>
                <p>{section.hint} — set price in SLSH</p>
              </div>
            </div>

            <div className="price-grid">
              {items.map((item) => {
                const Icon = getMenuIcon(item.icon)
                const text = draftPrices[item.id] ?? String(item.price)
                const slsh = toNumber(text)
                const baseSlsh = item.price
                const changed = slsh !== baseSlsh && draftPrices[item.id] !== undefined
                const quick = [baseSlsh, 10_000, 15_000, 18_000, 20_000, 22_000].filter(
                  (v, i, arr) => arr.indexOf(v) === i,
                )
                return (
                  <article key={item.id} className={`price-card ${changed ? 'is-changed' : ''}`}>
                    <div className="price-card__top">
                      <div className="price-card__icon">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3>{item.name}</h3>
                        <span className="default-hint">
                          Current {baseSlsh.toLocaleString()} SLSH
                        </span>
                      </div>
                      {changed ? <em className="changed-pill">Tonight</em> : null}
                    </div>

                    <label className="price-usd-field">
                      <span>SLSH PRICE</span>
                      <div className="price-usd-input">
                        <span>SLSH</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={text}
                          placeholder="0"
                          onChange={(e) => setPrice(item.id, e.target.value)}
                        />
                      </div>
                    </label>

                    <div className="price-slsh-out">
                      <span>Tonight&apos;s price</span>
                      <strong>{formatSlshAmount(slsh)}</strong>
                    </div>

                    <div className="quick-row">
                      {quick.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDraftPrices((p) => ({ ...p, [item.id]: String(v) }))}
                        >
                          {formatSlshAmount(v)}
                        </button>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="prices-sticky">
        <div>
          <strong>{dirty ? 'Unsaved night changes' : 'Board matches live prices'}</strong>
          <span>{menu.length} items · Somaliland Shillings only</span>
        </div>
        <button type="button" className="apply-btn" onClick={apply}>
          {saved ? <Check size={18} /> : <Save size={18} />}
          {saved ? 'APPLIED' : 'APPLY TONIGHT'}
        </button>
      </div>
    </div>
  )
}
