import { useEffect, useState } from 'react'
import { DatabaseBackup, Upload } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import type { Role, SettingsDTO, UserDTO } from '../../../shared/types'

type Tab = 'general' | 'users' | 'backup'

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'users', label: 'Users' },
  { key: 'backup', label: 'Backup' }
]

const inputClass =
  'w-full rounded-md border border-ink-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400'

function FieldLabel({ children }: { children: string }): JSX.Element {
  return <label className="block text-[11px] font-semibold text-ink-600 mb-1 uppercase tracking-wide">{children}</label>
}

export default function SettingsPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-4">Settings</h1>
      <div className="flex gap-1 mb-5 border-b border-ink-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'backup' && <BackupTab />}
    </div>
  )
}

function GeneralTab(): JSX.Element {
  const { settings, refresh } = useSettingsStore()
  const push = useToastStore((s) => s.push)
  const [form, setForm] = useState<SettingsDTO | null>(settings)

  useEffect(() => {
    refresh()
  }, [])
  useEffect(() => setForm(settings), [settings])

  if (!form) return <div className="text-ink-400 text-sm">Loading…</div>

  async function save(): Promise<void> {
    if (!form) return
    await window.api.settings.update(form)
    await refresh()
    push('success', 'Settings saved')
  }

  return (
    <div className="bg-white rounded-lg border border-ink-200 p-5 max-w-md space-y-3.5">
      <div>
        <FieldLabel>Shop Name</FieldLabel>
        <input value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} className={inputClass} />
      </div>
      <div>
        <FieldLabel>Address (optional)</FieldLabel>
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Printed on the bill if set"
          className={inputClass}
        />
      </div>
      <div>
        <FieldLabel>Phone (optional)</FieldLabel>
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Printed on the bill if set"
          className={inputClass}
        />
      </div>
      <div>
        <FieldLabel>Currency Symbol</FieldLabel>
        <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass} />
      </div>
      <div>
        <FieldLabel>Tax Rate (%)</FieldLabel>
        <input
          type="number"
          value={form.taxRatePercent}
          onChange={(e) => setForm({ ...form, taxRatePercent: Number(e.target.value) || 0 })}
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-[12px] font-medium text-ink-600">
        <input
          type="checkbox"
          checked={form.discountEnabled}
          onChange={(e) => setForm({ ...form, discountEnabled: e.target.checked })}
          className="accent-ink-900"
        />
        Allow discounts at checkout
      </label>
      <div>
        <FieldLabel>Bill Width</FieldLabel>
        <select
          value={form.billWidthMm}
          onChange={(e) => setForm({ ...form, billWidthMm: Number(e.target.value) })}
          className={inputClass}
        >
          <option value={58}>58mm</option>
          <option value={80}>80mm</option>
        </select>
      </div>
      <p className="text-[11px] text-ink-400 leading-relaxed">
        Bills and tokens always print to the Windows default printer — set your printer as default in Windows
        Settings to choose which one is used.
      </p>
      <button onClick={save} className="w-full py-2.5 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white">
        Save Settings
      </button>
    </div>
  )
}

function UsersTab(): JSX.Element {
  const [users, setUsers] = useState<UserDTO[]>([])
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('CASHIER')
  const push = useToastStore((s) => s.push)

  async function load(): Promise<void> {
    setUsers(await window.api.users.list())
  }
  useEffect(() => {
    load()
  }, [])

  async function addUser(): Promise<void> {
    if (!name.trim() || !username.trim() || !password) return
    await window.api.users.create({ name, username, password, role })
    setName('')
    setUsername('')
    setPassword('')
    load()
    push('success', 'User created')
  }

  async function toggleActive(u: UserDTO): Promise<void> {
    await window.api.users.update(u.id, { active: !u.active })
    load()
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="bg-white rounded-lg border border-ink-200 p-4">
        <h2 className="font-semibold text-ink-800 text-[13px] mb-3">Add User</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputClass} />
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className={inputClass} />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={inputClass}
          />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            <option value="CASHIER">Cashier</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button onClick={addUser} className="mt-3 w-full py-2 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white">
          Add User
        </button>
      </div>

      <div className="bg-white rounded-lg border border-ink-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Username</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-900">{u.name}</td>
                <td className="px-4 py-2.5 text-ink-500">{u.username}</td>
                <td className="px-4 py-2.5 text-ink-500">{u.role}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`text-[11px] font-semibold px-2 py-1 rounded border ${
                      u.active ? 'bg-success-50 text-success-700 border-success-100' : 'bg-ink-100 text-ink-500 border-ink-200'
                    }`}
                  >
                    {u.active ? 'Active' : 'Disabled'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BackupTab(): JSX.Element {
  const push = useToastStore((s) => s.push)
  const [busy, setBusy] = useState(false)

  async function backup(): Promise<void> {
    setBusy(true)
    try {
      const result = await window.api.backup.create()
      if (result.ok) push('success', `Backup saved to ${result.path}`)
      else if (result.error !== 'cancelled') push('error', result.error ?? 'Backup failed')
    } finally {
      setBusy(false)
    }
  }

  async function restore(): Promise<void> {
    if (!window.confirm('Restoring will replace the current database. Continue?')) return
    setBusy(true)
    try {
      const result = await window.api.backup.restore()
      if (result.ok) push('success', 'Database restored. Please restart the app.')
      else if (result.error !== 'cancelled') push('error', result.error ?? 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-ink-200 p-5 max-w-md space-y-3.5">
      <p className="text-ink-500 text-[13px] leading-relaxed">
        Back up the full SQLite database (orders, menu, users, settings) to a file, or restore from a previous
        backup.
      </p>
      <button
        disabled={busy}
        onClick={backup}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white disabled:opacity-50"
      >
        <DatabaseBackup size={15} />
        Backup Now
      </button>
      <button
        disabled={busy}
        onClick={restore}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-medium text-[13px] border border-ink-200 hover:bg-ink-100 text-ink-700 disabled:opacity-50"
      >
        <Upload size={15} />
        Restore From Backup
      </button>
    </div>
  )
}
