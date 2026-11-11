import { supabase, CLIENT_ID } from './supabase'
import { MENU_ITEMS, type MenuItem, type NightEntry } from '../data'
import { nightToPayload } from './nights'

/**
 * One-time upload of data that older versions of the app kept only in this
 * browser's localStorage. Runs only when the database is still fresh (no saved
 * nights and no working draft), so a second device can never overwrite live data.
 *
 * The snapshot is taken at module load, before providers overwrite the cache.
 */
const FLAG = 'grillgrain-cloud-migrated-v1'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const snapshot = {
  history: read<NightEntry[]>('grillgrain-history-slsh-v6'),
  menu: read<MenuItem[]>('grillgrain-menu-catalog-v1'),
  settings: read<Record<string, unknown>>('grillgrain-app-settings-v1'),
  draft: read<Record<string, unknown>>('grillgrain-night-draft-v1'),
  expenses: read<Record<string, unknown>>('grillgrain-expenses-v2'),
}

let running: Promise<void> | null = null

export function migrateLocalDataOnce() {
  if (running) return running
  running = run().catch((err) => {
    console.warn('[migrate] skipped:', err)
    running = null
  })
  return running
}

async function run() {
  if (localStorage.getItem(FLAG)) return
  const hasLocal =
    (snapshot.history?.length ?? 0) > 0 ||
    (snapshot.menu?.length ?? 0) > 0 ||
    Boolean(snapshot.settings) ||
    Boolean(snapshot.draft)
  if (!hasLocal) {
    localStorage.setItem(FLAG, '1')
    return
  }

  const [nightsRes, draftRes] = await Promise.all([
    supabase.from('nights').select('id', { count: 'exact', head: true }),
    supabase.from('night_drafts').select('draft').eq('id', 'current').maybeSingle(),
  ])
  if (nightsRes.error) throw nightsRes.error
  if (draftRes.error) throw draftRes.error
  const remoteDraft = (draftRes.data?.draft ?? {}) as Record<string, unknown>
  const dbFresh = (nightsRes.count ?? 0) === 0 && Object.keys(remoteDraft).length === 0
  if (!dbFresh) {
    localStorage.setItem(FLAG, '1')
    return
  }

  // Menu (only if it was customised)
  const menu = snapshot.menu?.filter((m) => m && m.id && m.name) ?? []
  const isDefaultMenu =
    menu.length === MENU_ITEMS.length &&
    menu.every((m, i) => m.id === MENU_ITEMS[i].id && m.name === MENU_ITEMS[i].name && m.price === MENU_ITEMS[i].price)
  if (menu.length && !isDefaultMenu) {
    const rows = menu.map((m, i) => ({
      id: m.id,
      name: m.name,
      price: Math.max(0, Number(m.price) || 0),
      category: m.category,
      icon: m.icon || 'star',
      is_active: true,
      sort_order: i + 1,
    }))
    const { error } = await supabase.from('menu_items').upsert(rows)
    if (error) throw error
    const keep = rows.map((r) => r.id)
    const { error: delErr } = await supabase
      .from('menu_items')
      .delete()
      .not('id', 'in', `(${keep.map((id) => `"${id}"`).join(',')})`)
    if (delErr) throw delErr
  }

  // Kitchen settings
  if (snapshot.settings) {
    const s = snapshot.settings
    const { data } = await supabase.from('kitchen_settings').select('id').limit(1).maybeSingle()
    if (data?.id) {
      await supabase
        .from('kitchen_settings')
        .update({
          kitchen_name: s.kitchenName ?? undefined,
          manager_name: s.managerName ?? undefined,
          role_label: s.role ?? undefined,
          shift_label: s.shiftLabel ?? undefined,
          compact_tables: s.compactTables ?? undefined,
          confirm_before_clear: s.confirmBeforeClear ?? undefined,
        })
        .eq('id', data.id)
    }
  }

  // History — oldest first so created_at ordering matches
  const history = [...(snapshot.history ?? [])].reverse()
  for (const entry of history) {
    const { error } = await supabase.rpc('save_night', { p: nightToPayload(entry) })
    if (error) throw error
  }

  // Working draft
  if (snapshot.draft || snapshot.expenses) {
    const { error } = await supabase.from('night_drafts').upsert({
      id: 'current',
      draft: snapshot.draft ?? {},
      expenses: snapshot.expenses ?? {},
      client_id: `migration-${CLIENT_ID}`,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  localStorage.setItem(FLAG, '1')
}
