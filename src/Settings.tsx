import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Database,
  Download,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Shield,
  Store,
  Sun,
  Tags,
  Trash2,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react'
import { useAuth } from './auth'
import { useLedger } from './ledger'
import { usePricing } from './pricing'
import { useSettings } from './appSettings'
import { useTheme, type ThemeMode } from './theme'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]
import LiveClock from './LiveClock'
import { downloadTextFile } from './report'
import './Settings.css'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { email, logout, changePassword, history, clearHistory } = useAuth()
  const { settings, updateSettings, resetSettings } = useSettings()
  const { resetDefaults } = usePricing()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const { resetExpenses, clearNightDraft } = useLedger()

  const [kitchenName, setKitchenName] = useState(settings.kitchenName)
  const [managerName, setManagerName] = useState(settings.managerName)
  const [role, setRole] = useState(settings.role)
  const [shiftLabel, setShiftLabel] = useState(settings.shiftLabel)
  const [profileMsg, setProfileMsg] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const [actionMsg, setActionMsg] = useState('')
  const [actionError, setActionError] = useState('')

  function saveProfile() {
    updateSettings({
      kitchenName: kitchenName.trim() || 'Central Fast Food',
      managerName: managerName.trim() || 'Shift Manager',
      role: role.trim() || 'Kitchen Admin',
      shiftLabel: shiftLabel.trim() || 'Night Service',
    })
    setProfileMsg('Kitchen profile saved.')
    window.setTimeout(() => setProfileMsg(''), 2000)
  }

  // keep the form in step when settings change on another device
  useEffect(() => {
    setKitchenName(settings.kitchenName)
    setManagerName(settings.managerName)
    setRole(settings.role)
    setShiftLabel(settings.shiftLabel)
  }, [settings.kitchenName, settings.managerName, settings.role, settings.shiftLabel])

  async function onChangePassword() {
    setPasswordError('')
    setPasswordMsg('')
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    const result = await changePassword(currentPassword, newPassword)
    if (!result.ok) {
      setPasswordError(result.error)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordMsg('Password updated. Use it next time you sign in.')
  }

  function confirmAction(message: string) {
    if (!settings.confirmBeforeClear) return true
    return window.confirm(message)
  }

  function onClearHistory() {
    if (!confirmAction('Delete all saved night history? This cannot be undone.')) return
    clearHistory()
    setActionError('')
    setActionMsg('All history cleared.')
  }

  function onClearWorkingNight() {
    if (!confirmAction('Clear tonight’s working draft and expense fields?')) return
    clearNightDraft()
    resetExpenses()
    setActionError('')
    setActionMsg('Working night draft and expenses cleared.')
  }

  function onResetPrices() {
    if (!confirmAction('Reset all menu prices to defaults?')) return
    resetDefaults()
    setActionError('')
    setActionMsg('Menu prices reset to defaults.')
  }

  function onResetAppSettings() {
    if (!confirmAction('Reset kitchen profile and preference toggles?')) return
    resetSettings()
    setKitchenName('Central Fast Food')
    setManagerName('Shift Manager')
    setRole('Kitchen Admin')
    setShiftLabel('Night Service')
    setActionError('')
    setActionMsg('App settings reset.')
  }

  function onExportHistory() {
    if (!history.length) {
      setActionError('No history to export yet.')
      setActionMsg('')
      return
    }
    downloadTextFile(
      `central-fast-food-history-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(history, null, 2),
      'application/json;charset=utf-8',
    )
    setActionError('')
    setActionMsg('History JSON downloaded.')
  }

  async function onLogout() {
    await logout()
    navigate('/')
  }

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">KITCHEN SETUP</p>
          <h1>Settings</h1>
          <p className="settings-lead">
            Manage kitchen profile, security, data, and sign out of Central Fast Food.
          </p>
        </div>
        <LiveClock />
      </div>

      {actionMsg ? <p className="settings-banner is-ok">{actionMsg}</p> : null}
      {actionError ? <p className="settings-banner is-error">{actionError}</p> : null}

      <div className="settings-grid">
        <section className="panel appearance-panel">
          <header>
            <Palette size={18} className="accent-green" />
            <div>
              <h2>Appearance</h2>
              <p>Choose light or dark mode — saved on this device</p>
            </div>
          </header>
          <div className="theme-picker" role="radiogroup" aria-label="Color mode">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={themeMode === value}
                className={`theme-option ${themeMode === value ? 'is-active' : ''}`}
                onClick={() => setThemeMode(value)}
              >
                <span className={`theme-option__preview pv-${value}`} aria-hidden>
                  <i className="pv-side" />
                  <span className="pv-main">
                    <i className="pv-bar pv-accent" />
                    <i className="pv-bar" />
                    <i className="pv-bar" />
                  </span>
                </span>
                <span className="theme-option__label">
                  <Icon size={16} />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <header>
            <Store size={18} className="accent-green" />
            <div>
              <h2>Kitchen profile</h2>
              <p>Name shown in the sidebar and reports</p>
            </div>
          </header>
          <div className="settings-fields">
            <label>
              <span>KITCHEN NAME</span>
              <input value={kitchenName} onChange={(e) => setKitchenName(e.target.value)} />
            </label>
            <label>
              <span>MANAGER NAME</span>
              <input value={managerName} onChange={(e) => setManagerName(e.target.value)} />
            </label>
            <label>
              <span>ROLE</span>
              <input value={role} onChange={(e) => setRole(e.target.value)} />
            </label>
            <label>
              <span>SHIFT LABEL</span>
              <input value={shiftLabel} onChange={(e) => setShiftLabel(e.target.value)} />
            </label>
          </div>
          <div className="settings-row-actions">
            <button type="button" className="primary-btn" onClick={saveProfile}>
              <Save size={16} />
              Save profile
            </button>
            {profileMsg ? <span className="inline-ok">{profileMsg}</span> : null}
          </div>
        </section>

        <section className="panel">
          <header>
            <UserRound size={18} className="accent-orange" />
            <div>
              <h2>Account</h2>
              <p>Signed-in identity for this kitchen</p>
            </div>
          </header>
          <div className="account-card">
            <span>SIGNED IN AS</span>
            <strong>{email}</strong>
            <em>Currency: Somaliland Shillings (SLSH)</em>
          </div>
          <button type="button" className="danger-btn" onClick={onLogout}>
            <LogOut size={16} />
            Sign out / Logout
          </button>
        </section>

        <section className="panel">
          <header>
            <KeyRound size={18} className="accent-orange" />
            <div>
              <h2>Change password</h2>
              <p>Update the password used at login</p>
            </div>
          </header>
          <div className="settings-fields">
            <label>
              <span>CURRENT PASSWORD</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              <span>NEW PASSWORD</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>CONFIRM NEW PASSWORD</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          {passwordError ? <p className="field-error">{passwordError}</p> : null}
          {passwordMsg ? <p className="inline-ok">{passwordMsg}</p> : null}
          <button type="button" className="primary-btn" onClick={onChangePassword}>
            <Shield size={16} />
            Update password
          </button>
        </section>

        <section className="panel">
          <header>
            <Shield size={18} className="accent-green" />
            <div>
              <h2>Preferences</h2>
              <p>Local display and safety options</p>
            </div>
          </header>
          <label className="toggle-row">
            <div>
              <strong>Confirm before clearing data</strong>
              <span>Ask before wiping history or drafts</span>
            </div>
            <input
              type="checkbox"
              checked={settings.confirmBeforeClear}
              onChange={(e) => updateSettings({ confirmBeforeClear: e.target.checked })}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Compact history tables</strong>
              <span>Tighter row spacing on History</span>
            </div>
            <input
              type="checkbox"
              checked={settings.compactTables}
              onChange={(e) => updateSettings({ compactTables: e.target.checked })}
            />
          </label>
          <div className="quick-links">
            <Link to="/app/menu">
              <UtensilsCrossed size={15} />
              Menu Studio
            </Link>
            <Link to="/app/prices">
              <Tags size={15} />
              Edit night prices
            </Link>
            <Link to="/app/history">
              <Database size={15} />
              Open history
            </Link>
          </div>
        </section>

        <section className="panel span-2">
          <header>
            <Database size={18} className="accent-orange" />
            <div>
              <h2>Data &amp; reset</h2>
              <p>Export, clear, or restore defaults — saved nights only, no sample data</p>
            </div>
          </header>
          <div className="data-actions">
            <button type="button" className="ghost-btn" onClick={onExportHistory}>
              <Download size={16} />
              Export history JSON
            </button>
            <button type="button" className="ghost-btn" onClick={onClearWorkingNight}>
              <Trash2 size={16} />
              Clear working night
            </button>
            <button type="button" className="ghost-btn" onClick={onResetPrices}>
              <Tags size={16} />
              Reset menu prices
            </button>
            <button type="button" className="ghost-btn" onClick={onResetAppSettings}>
              <RotateCcw size={16} />
              Reset app settings
            </button>
            <button type="button" className="danger-outline-btn" onClick={onClearHistory}>
              <Trash2 size={16} />
              Clear all history
            </button>
          </div>
          <p className="data-note">
            History nights saved: <strong>{history.length}</strong>
          </p>
        </section>
      </div>
    </div>
  )
}
