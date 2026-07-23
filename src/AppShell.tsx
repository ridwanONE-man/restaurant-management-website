import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Clock3,
  LayoutList,
  LogOut,
  Settings,
  Tags,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { useAuth } from './auth'
import { useSettings } from './appSettings'
import './AppShell.css'

const NAV = [
  { to: '/app/entry', label: 'New Entry', icon: LayoutList },
  { to: '/app/expenses', label: 'Expenses', icon: Wallet },
  { to: '/app/history', label: 'History', icon: Clock3 },
  { to: '/app/menu', label: 'Menu Studio', icon: UtensilsCrossed },
  { to: '/app/prices', label: 'Night Prices', icon: Tags },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

export default function AppShell() {
  const { logout, email } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()

  function signOut() {
    logout()
    navigate('/')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <UtensilsCrossed size={20} strokeWidth={2.3} />
          <span>{settings.kitchenName}</span>
        </div>

        <nav className="sidebar__nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="live-status">
            <span className="live-status__label">LIVE STATUS</span>
            <div className="live-status__row">
              <span className="dot" />
              <span>{settings.shiftLabel}</span>
            </div>
          </div>

          <div className="profile-card">
            <div className="profile-avatar" aria-hidden>
              <UserRound size={18} />
            </div>
            <div>
              <strong>{settings.managerName}</strong>
              <span>{settings.role}</span>
            </div>
          </div>

          <button type="button" className="sidebar-logout" onClick={signOut}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar__email">{email}</div>
          <div className="topbar__right">
            <NavLink to="/app/settings" className="admin-mode" title="Open settings">
              <Settings size={16} />
              Settings
            </NavLink>
            <button type="button" className="admin-mode logout-top" onClick={signOut} title="Sign out">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
