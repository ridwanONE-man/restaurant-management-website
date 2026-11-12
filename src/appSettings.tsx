import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from './lib/supabase'
import { useRealtimeRefetch } from './lib/realtime'
import { reportSyncError } from './lib/syncStatus'
import { useAuth } from './auth'

export type AppSettings = {
  kitchenName: string
  managerName: string
  role: string
  shiftLabel: string
  compactTables: boolean
  confirmBeforeClear: boolean
  /** The selling day closes at this time after midnight, e.g. "01:30" */
  dayCutoff: string
}

type SettingsContextValue = {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const DEFAULT_SETTINGS: AppSettings = {
  kitchenName: 'Central Fast Food',
  managerName: 'Shift Manager',
  role: 'Kitchen Admin',
  shiftLabel: 'Night Service',
  compactTables: false,
  confirmBeforeClear: true,
  dayCutoff: '01:30',
}

/** Local cache only — the source of truth is public.kitchen_settings */
const SETTINGS_KEY = 'grillgrain-app-settings-v1'

type SettingsRow = {
  id: string
  kitchen_name: string
  manager_name: string
  role_label: string
  shift_label: string
  compact_tables: boolean
  confirm_before_clear: boolean
  day_cutoff?: string | null
}

function rowToSettings(row: SettingsRow): AppSettings {
  return {
    kitchenName: row.kitchen_name,
    managerName: row.manager_name,
    role: row.role_label,
    shiftLabel: row.shift_label,
    compactTables: row.compact_tables,
    confirmBeforeClear: row.confirm_before_clear,
    dayCutoff: row.day_cutoff || '01:30',
  }
}

function settingsToRow(s: Partial<AppSettings>) {
  const row: Partial<Omit<SettingsRow, 'id'>> = {}
  if (s.kitchenName !== undefined) row.kitchen_name = s.kitchenName
  if (s.managerName !== undefined) row.manager_name = s.managerName
  if (s.role !== undefined) row.role_label = s.role
  if (s.shiftLabel !== undefined) row.shift_label = s.shiftLabel
  if (s.compactTables !== undefined) row.compact_tables = s.compactTables
  if (s.confirmBeforeClear !== undefined) row.confirm_before_clear = s.confirmBeforeClear
  if (s.dayCutoff !== undefined) row.day_cutoff = s.dayCutoff
  return row
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function cache(next: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* optional */
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const rowId = useRef<string | null>(null)

  const refetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('kitchen_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      reportSyncError(error)
      return
    }
    if (!data) return
    rowId.current = (data as SettingsRow).id
    const next = rowToSettings(data as SettingsRow)
    setSettings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    cache(next)
  }, [])

  useRealtimeRefetch('settings', ['kitchen_settings'], isAuthenticated, () => void refetch())

  const write = useCallback(async (patch: Partial<AppSettings>) => {
    const row = settingsToRow(patch)
    const res = rowId.current
      ? await supabase.from('kitchen_settings').update(row).eq('id', rowId.current)
      : await supabase.from('kitchen_settings').insert(row)
    if (res.error) reportSyncError(res.error)
  }, [])

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        cache(next)
        return next
      })
      void write(patch)
    },
    [write],
  )

  const resetSettings = useCallback(() => {
    cache(DEFAULT_SETTINGS)
    setSettings({ ...DEFAULT_SETTINGS })
    void write(DEFAULT_SETTINGS)
  }, [write])

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
