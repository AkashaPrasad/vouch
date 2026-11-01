import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { ApiKey, Settings } from '../../lib/types'
import { relTime } from '../../lib/format'
import { Empty, PageHead, Toggle } from '../../components/app/ui'
import { useToast } from '../../components/Toast'
import { useTitle } from '../../lib/useTitle'

const TABS = ['profile', 'preferences', 'notifications', 'api', 'privacy'] as const
const LABEL: Record<typeof TABS[number], string> = { profile: 'Profile', preferences: 'Preferences', notifications: 'Notifications', api: 'API keys', privacy: 'Data & privacy' }
const DEFAULTS: Required<Settings> = { preferences: { country: 'IN', language: 'en', deep_agent: true, auto_research: false, theme: 'light' }, notifications: { final_verdict: true, watch_trigger: true, weekly_digest: false } }
const LS = 'vouch_settings'
const applyTheme = (t?: string) => { document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light'; try { localStorage.setItem('vouch_theme_v2', t === 'dark' ? 'dark' : 'light') } catch { /* ignore */ } }

export default function SettingsPage() {
  useTitle('Settings')
  const { user, signOut, token } = useAuth()
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? (sp.get('tab') as typeof TABS[number]) : 'profile'
  const [s, setS] = useState<Required<Settings>>(DEFAULTS)
  const [synced, setSynced] = useState<boolean | null>(null)
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [keysErr, setKeysErr] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyName, setKeyName] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    let local: Settings = {}
    try { local = JSON.parse(localStorage.getItem(LS) || '{}') } catch { /* ignore */ }
    const merged = (x: Settings): Required<Settings> => ({ preferences: { ...DEFAULTS.preferences, ...(x.preferences ?? {}) }, notifications: { ...DEFAULTS.notifications, ...(x.notifications ?? {}) } })
    setS(merged(local))
    if (token) api.settings().then((r) => { const m2 = merged(r); setS(m2); setSynced(true) }).catch(() => setSynced(false))
    else setSynced(false)
  }, [token])
  useEffect(() => { if (tab === 'api' && token) api.apiKeys().then((r) => setKeys(r.items ?? [])).catch((e) => { setKeys([]); if (!(e instanceof ApiError && e.status === 404)) setKeysErr(e.message) }) }, [tab, token])

  async function save(next: Required<Settings>) {
    setS(next); applyTheme(next.preferences.theme)
    try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* ignore */ }
    if (token) { try { await api.saveSettings(next); setSynced(true) } catch { setSynced(false) } }
  }
  const pref = <K extends keyof Required<Settings>['preferences']>(k: K, v: Required<Settings>['preferences'][K]) => save({ ...s, preferences: { ...s.preferences, [k]: v } })
  const notif = (k: keyof Required<Settings>['notifications'], v: boolean) => save({ ...s, notifications: { ...s.notifications, [k]: v } })

  async function createKey() {
    try { const k = await api.createApiKey(keyName || 'default'); setNewKey(k.key); setKeys((x) => [...(x ?? []), k]); setKeyName('') } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not create key', 'error') }
  }
  async function revoke(id: string) {
    try { await api.revokeApiKey(id); setKeys((x) => (x ?? []).filter((k) => k.id !== id)); toast.show('Key revoked', 'success') } catch (e) { toast.show(e instanceof Error ? e.message : 'Could not revoke', 'error') }
  }
  async function exportData() {
    try { const d = await api.exportData(); const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vouch-export.json'; a.click() } catch (e) { toast.show(e instanceof Error ? e.message : 'Export unavailable', 'error') }
  }
  async function deleteMe() {
    try { await api.deleteMe(); toast.show('Your data was deleted', 'success'); signOut() } catch (e) { toast.show(e instanceof Error ? e.message : 'Delete unavailable', 'error') }
  }
  const sel = 'h-10 border border-border-strong bg-bg px-2 font-mono text-xs text-text'
  return (
    <div className="max-w-3xl">
      <PageHead label="Account" title="Settings" sub={synced === false ? (token ? 'Saved on this device; sync to the server was not available.' : 'Guest: settings stay on this device. Sign in to sync.') : synced ? 'Synced to your account.' : undefined} />
      <div role="tablist" className="mt-4 flex gap-5 overflow-x-auto border-b border-border">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { const n = new URLSearchParams(sp); n.set('tab', t); setSp(n) }} className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-1 font-mono text-xs uppercase tracking-[0.08em] ${tab === t ? 'border-accent text-text' : 'border-transparent text-faint hover:text-muted'}`}>{LABEL[t]}</button>)}
      </div>
      <div className="mt-5">
        {tab === 'profile' && (user ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-16 w-16 border border-border-strong" /> : <span className="grid h-16 w-16 place-items-center border border-border-strong bg-surface-2 font-mono text-xl">{(user.name || user.email)[0]?.toUpperCase()}</span>}
            <dl className="flex-1 divide-y divide-border"><div className="flex gap-4 py-2"><dt className="label w-20">Name</dt><dd className="text-sm">{user.name}</dd></div><div className="flex gap-4 py-2"><dt className="label w-20">Email</dt><dd className="font-mono text-sm">{user.email}</dd></div><div className="flex gap-4 py-2"><dt className="label w-20">Provider</dt><dd className="text-sm text-muted">Google</dd></div></dl>
            <button onClick={signOut} className="btn-secondary">Sign out</button>
          </div>
        ) : <Empty title="You are a guest" body="Sign in from the sidebar to set up a profile." />)}
        {tab === 'preferences' && (
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="label">Default country</span><select value={s.preferences.country} onChange={(e) => pref('country', e.target.value)} className={sel}><option value="IN">India (IN)</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AE">UAE</option></select></label>
              <label className="flex flex-col gap-1"><span className="label">Language</span><select value={s.preferences.language} onChange={(e) => pref('language', e.target.value)} className={sel}><option value="en">English</option><option value="hi">Hindi</option><option value="kn">Kannada</option><option value="ta">Tamil</option></select></label>
            </div>
            <div className="mt-4">
              <Toggle label="Run deep agent checks" hint="TinyFish Agent visits cybercrime.gov.in, MCA and careers portals (slower, more evidence)." checked={!!s.preferences.deep_agent} onChange={(v) => pref('deep_agent', v)} />
              <Toggle label="Auto-run deep research" hint="Start a research dossier after every final verdict." checked={!!s.preferences.auto_research} onChange={(v) => pref('auto_research', v)} />
              <Toggle label="Dark theme" hint="Switches Vouch to the dark palette. Light is the default." checked={s.preferences.theme === 'dark'} onChange={(v) => pref('theme', v ? 'dark' : 'light')} />
            </div>
          </div>
        )}
        {tab === 'notifications' && (
          <div>
            <Toggle label="Email me the final verdict" hint="When a check finishes after the preliminary verdict." checked={!!s.notifications.final_verdict} onChange={(v) => notif('final_verdict', v)} />
            <Toggle label="Watch triggers" hint="When a watched role appears or disappears." checked={!!s.notifications.watch_trigger} onChange={(v) => notif('watch_trigger', v)} />
            <Toggle label="Weekly digest" hint="A summary of your checks and new scam patterns." checked={!!s.notifications.weekly_digest} onChange={(v) => notif('weekly_digest', v)} />
          </div>
        )}
        {tab === 'api' && (!user ? <Empty title="Sign in to manage API keys" /> : (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row"><input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name (e.g. placement-cell-bot)" aria-label="Key name" className="input h-10 font-mono text-sm" /><button onClick={createKey} className="btn-primary h-10 min-h-0 whitespace-nowrap px-4">Create key</button></div>
            {newKey && <div className="mt-3 border border-accent p-3"><p className="label">Copy now. It is shown once.</p><div className="mt-2 flex items-center gap-2"><code className="flex-1 break-all font-mono text-sm">{newKey}</code><button onClick={() => { navigator.clipboard.writeText(newKey).then(() => toast.show('Copied', 'success')).catch(() => toast.show('Copy failed', 'error')) }} className="btn-secondary h-9 min-h-0 px-2" aria-label="Copy key"><Copy className="h-4 w-4" strokeWidth={1.5} /></button></div></div>}
            {keysErr && <p className="mt-3 text-sm text-red">{keysErr}</p>}
            <div className="mt-4">{keys == null ? <span className="skeleton block h-4 w-40" /> : !keys.length ? <Empty title="No API keys" body="Create one to call POST /api/checks from your own tools." /> : (
              <table className="ledger-table"><thead><tr><th scope="col" className="pl-0">Name</th><th scope="col">Prefix</th><th scope="col">Created</th><th scope="col" className="pr-0 text-right"></th></tr></thead>
                <tbody>{keys.map((k) => <tr key={k.id}><td className="pl-0">{k.name}</td><td className="font-mono text-xs text-muted">{k.prefix ?? '…'}</td><td className="font-mono text-[11px] text-faint">{relTime(k.created_at)}</td><td className="pr-0 text-right"><button onClick={() => revoke(k.id)} className="inline-flex min-h-[36px] items-center gap-1 font-mono text-[11px] uppercase text-red" aria-label={`Revoke ${k.name}`}><Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />Revoke</button></td></tr>)}</tbody></table>
            )}</div>
          </div>
        ))}
        {tab === 'privacy' && (
          <div>
            <div className="border border-border p-4"><p className="label">Export</p><p className="mt-1 text-sm text-muted">Download every check on your account as JSON, including signals and receipts.</p><button onClick={exportData} disabled={!user} className="btn-secondary mt-3">Export my checks</button></div>
            <div className="mt-4 border border-red p-4"><p className="label text-red">Danger zone</p><p className="mt-1 text-sm text-muted">Deletes your account, checks, watches and API keys. Type <span className="font-mono text-text">DELETE</span> to confirm.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" className="input h-10 font-mono text-sm sm:max-w-xs" placeholder="DELETE" /><button onClick={deleteMe} disabled={confirm !== 'DELETE' || !user} className="btn h-10 min-h-0 border border-red px-4 text-red disabled:opacity-40">Delete my data</button></div></div>
          </div>
        )}
      </div>
    </div>
  )
}
