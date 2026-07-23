import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AppSettings = {
  kitchenName: string
  managerName: string
  role: string
  shiftLabel: string
  compactTables: boolean
  confirmBeforeClear: boolean
}

type SettingsContextValue = {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  kitchenName: 'GRILL & GRAIN',
  managerName: 'Shift Manager',
  role: 'Kitchen Admin',
  shiftLabel: 'Night Service',
  compactTables: false,
  confirmBeforeClear: true,
}

const SETTINGS_KEY = 'grillgrain-app-settings-v1'

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS))
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings }),
    [resetSettings, settings, updateSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
