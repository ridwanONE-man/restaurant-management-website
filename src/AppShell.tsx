import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Clock3,
  LayoutList,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Tags,
  UserRound,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from './auth'
import { useSettings } from './appSettings'
import { useSyncStatus } from './lib/syncStatus'
import './AppShell.css'

const NAV = [
  { to: '/app/entry', label: 'New Entry', short: 'Entry', icon: LayoutList },
  { to: '/app/receipts', label: 'Receipts', short: 'Receipts', icon: ReceiptText },
  { to: '/app/expenses', label: 'Expenses', short: 'Expenses', icon: Wallet },
  { to: '/app/history', label: 'History', short: 'History', icon: Clock3 },
  { to: '/app/menu', label: 'Menu Studio', short: 'Menu', icon: UtensilsCrossed },
  { to: '/app/prices', label: 'Night Prices', short: 'Prices', icon: Tags },
  { to: '/app/analytics', label: 'Analytics', short: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', short: 'Settings', icon: Settings },
]

/** Shown in the phone bottom bar; everything else lives in the drawer */
const BOTTOM_NAV = NAV.slice(0, 4)

const SYNC_LABEL = {
  live: 'Live sync',
  connecting: 'Connecting…',
  offline: 'Offline',
  error: 'Sync issue',
} as const

function SyncPill({ compact = false }: { compact?: boolean }) {
  const { state, message } = useSyncStatus()
  return (
    <span className={`sync-pill sync-pill--${state}`} title={message || SYNC_LABEL[state]} role="status">
      <span className="sync-pill__dot" aria-hidden />
      {compact ? null : <span>{SYNC_LABEL[state]}</span>}
    </span>
  )
}

export default function AppShell() {
  const { logout, email } = useAuth()
  const { settings } = useSettings()
  const { state: syncState, message: syncMessage } = useSyncStatus()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // close the drawer whenever the route changes
  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // lock page scroll + allow Esc while the drawer is open
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen])

  async function signOut() {
    await logout()
    navigate('/')
  }

  const currentLabel = NAV.find((n) => location.pathname.startsWith(n.to))?.label ?? ''

  return (
    <div className={`shell ${settings.compactTables ? 'is-compact' : ''}`}>
      {/* Phone top bar */}
      <header className="mobile-bar">
        <button
          type="button"
          className="mobile-bar__menu"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>
        <span className="brand-mark brand-mark--sm" aria-hidden>
          <UtensilsCrossed size={15} strokeWidth={2.4} />
        </span>
        <div className="mobile-bar__title">
          <span className="mobile-bar__brand">{settings.kitchenName}</span>
          <strong>{currentLabel}</strong>
        </div>
        <SyncPill compact />
      </header>

      <div
        className={`drawer-backdrop ${drawerOpen ? 'is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />

      <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__brand">
          <span className="brand-mark">
            <UtensilsCrossed size={19} strokeWidth={2.3} />
          </span>
          <span className="brand-name sidebar__text">
            <strong>{settings.kitchenName}</strong>
            <small>Kitchen Manager</small>
          </span>
          <button
            type="button"
            className="sidebar__close"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar__nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <Icon size={18} />
              <span className="sidebar__text">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="live-status" title={syncMessage || undefined}>
            <span className="live-status__label">LIVE STATUS</span>
            <div className={`live-status__row is-${syncState}`}>
              <span className="dot" />
              <span>{syncState === 'live' ? settings.shiftLabel : SYNC_LABEL[syncState]}</span>
            </div>
            {syncState === 'live' ? <span className="live-status__sub">Synced across devices</span> : null}
          </div>

          <div className="profile-card">
            <div className="profile-avatar" aria-hidden>
              <UserRound size={18} />
            </div>
            <div className="profile-card__text">
              <strong>{settings.managerName}</strong>
              <span>{settings.role}</span>
              <em>{email}</em>
            </div>
          </div>

          <button type="button" className="sidebar-logout" onClick={signOut} title="Sign out">
            <LogOut size={15} />
            <span className="sidebar__text">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar__email">
            <SyncPill />
            <span className="topbar__email-text">{email}</span>
          </div>
          <div className="topbar__right">
            <NavLink to="/app/settings" className="admin-mode" title="Open settings">
              <Settings size={16} />
              <span>Settings</span>
            </NavLink>
            <button type="button" className="admin-mode logout-top" onClick={signOut} title="Sign out">
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </header>
        <main className="shell-content">
          <Outlet />
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="bottom-nav" aria-label="Quick navigation">
        {BOTTOM_NAV.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'bottom-nav__item active' : 'bottom-nav__item')}>
            <Icon size={20} />
            <span>{short}</span>
          </NavLink>
        ))}
        <button type="button" className="bottom-nav__item" onClick={() => setDrawerOpen(true)}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  )
}
