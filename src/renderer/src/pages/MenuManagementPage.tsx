import { useEffect, useState } from 'react'
import { Plus, X, ImagePlus, Trash2 } from 'lucide-react'
import { useMenuStore } from '../store/menuStore'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import ConfirmDialog from '../components/ConfirmDialog'
import type { MenuItemDTO, SizeMode } from '../../../shared/types'

type Tab = 'items' | 'categories'

export default function MenuManagementPage(): JSX.Element {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN')
  const tabs: { key: Tab; label: string }[] = isAdmin
    ? [
        { key: 'items', label: 'Items' },
        { key: 'categories', label: 'Categories' }
      ]
    : [{ key: 'items', label: 'Items' }]
  const [tab, setTab] = useState<Tab>('items')
  const { categories, items, refresh } = useMenuStore()
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')
  const push = useToastStore((s) => s.push)

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-4">Menu Management</h1>
      <div className="flex gap-1 mb-5 border-b border-ink-200">
        {tabs.map((t) => (
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

      {tab === 'items' && (
        <ItemsTab
          items={items}
          categories={categories}
          currency={currency}
          onChanged={refresh}
          notify={(m) => push('success', m)}
        />
      )}
      {tab === 'categories' && isAdmin && <CategoriesTab categories={categories} onChanged={refresh} />}
    </div>
  )
}

function formatPrice(currency: string, item: MenuItemDTO): string {
  if (item.sizeMode === 'HALF_FULL') {
    return `Half ${currency}${(item.halfPrice ?? 0).toFixed(0)} / Full ${currency}${(item.fullPrice ?? 0).toFixed(0)}`
  }
  return `${currency}${(item.price ?? 0).toFixed(0)}`
}

function ItemsTab({
  items,
  categories,
  currency,
  onChanged,
  notify
}: {
  items: MenuItemDTO[]
  categories: { id: string; name: string }[]
  currency: string
  onChanged: () => void
  notify: (m: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState<MenuItemDTO | 'new' | null>(null)

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md font-medium text-[13px] bg-ink-900 text-white hover:bg-ink-950"
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>
      <div className="bg-white rounded-lg border border-ink-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Price</th>
              <th className="px-4 py-2.5 font-medium">Available</th>
              <th className="px-4 py-2.5 font-medium">Active</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-900">{item.name}</td>
                <td className="px-4 py-2.5 text-ink-500">{item.categoryName}</td>
                <td className="px-4 py-2.5 text-ink-500 tabular-nums whitespace-nowrap">
                  {formatPrice(currency, item)}
                </td>
                <td className="px-4 py-2.5">
                  <StatusDot active={item.available} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusDot active={item.active} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setEditing(item)} className="text-ink-600 hover:text-ink-900 font-medium text-[12px] underline underline-offset-2">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ItemFormModal
          item={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            onChanged()
            notify('Menu item saved')
          }}
          onDeleted={() => {
            setEditing(null)
            onChanged()
            notify('Item deleted')
          }}
        />
      )}
    </div>
  )
}

function StatusDot({ active }: { active: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
        active ? 'text-success-700' : 'text-ink-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-success-500' : 'bg-ink-300'}`} />
      {active ? 'Yes' : 'No'}
    </span>
  )
}

function FieldLabel({ children }: { children: string }): JSX.Element {
  return <label className="block text-[11px] font-semibold text-ink-600 mb-1 uppercase tracking-wide">{children}</label>
}

const inputClass =
  'w-full rounded-md border border-ink-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400'

function ItemFormModal({
  item,
  categories,
  onClose,
  onSaved,
  onDeleted
}: {
  item: MenuItemDTO | null
  categories: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}): JSX.Element {
  const [name, setName] = useState(item?.name ?? '')
  const [sizeMode, setSizeMode] = useState<SizeMode>(item?.sizeMode ?? 'NORMAL')
  const [price, setPrice] = useState(item?.price ?? 0)
  const [halfPrice, setHalfPrice] = useState(item?.halfPrice ?? 0)
  const [fullPrice, setFullPrice] = useState(item?.fullPrice ?? 0)
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? '')
  const [imagePath, setImagePath] = useState<string | null>(item?.imagePath ?? null)
  const [available, setAvailable] = useState(item?.available ?? true)
  const [active, setActive] = useState(item?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function pickImage(): Promise<void> {
    const path = await window.api.menu.pickImage()
    if (path) setImagePath(path)
  }

  const canSave =
    name.trim() &&
    categoryId &&
    (sizeMode === 'NORMAL' ? price > 0 : halfPrice > 0 && fullPrice > 0)

  async function save(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        name,
        categoryId,
        sizeMode,
        price: sizeMode === 'NORMAL' ? price : null,
        halfPrice: sizeMode === 'HALF_FULL' ? halfPrice : null,
        fullPrice: sizeMode === 'HALF_FULL' ? fullPrice : null,
        imagePath
      }
      if (item) {
        await window.api.menu.updateItem(item.id, { ...payload, available, active })
      } else {
        await window.api.menu.createItem(payload)
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  // "Delete" disables the item — it stops appearing on the POS/menu but is
  // never removed from the database, so old bills/history that reference it
  // (via snapshot fields, not a live lookup) are completely unaffected.
  async function deleteItem(): Promise<void> {
    if (!item) return
    setDeleting(true)
    try {
      await window.api.menu.updateItem(item.id, { active: false })
      onDeleted()
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40">
      <div className="bg-white rounded-lg shadow-popover border border-ink-200 w-[420px] p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink-900">{item ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>

        <FieldLabel>Name</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mb-3`} />

        <FieldLabel>Size</FieldLabel>
        <div className="flex gap-1.5 mb-3">
          {(['NORMAL', 'HALF_FULL'] as SizeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSizeMode(mode)}
              className={`flex-1 py-2 rounded-md text-[12px] font-semibold border transition-colors ${
                sizeMode === mode
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'border-ink-200 text-ink-600 hover:bg-ink-100'
              }`}
            >
              {mode === 'NORMAL' ? 'Normal' : 'Half & Full'}
            </button>
          ))}
        </div>

        {sizeMode === 'NORMAL' ? (
          <>
            <FieldLabel>Price</FieldLabel>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className={`${inputClass} mb-3`}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <FieldLabel>Half Price</FieldLabel>
              <input
                type="number"
                value={halfPrice}
                onChange={(e) => setHalfPrice(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Full Price</FieldLabel>
              <input
                type="number"
                value={fullPrice}
                onChange={(e) => setFullPrice(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <FieldLabel>Category</FieldLabel>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} mb-3`}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <FieldLabel>Image</FieldLabel>
        <div className="flex items-center gap-2.5 mb-4">
          {imagePath ? (
            <img src={`app-image://${imagePath}`} className="w-11 h-11 rounded-md object-cover border border-ink-200" />
          ) : (
            <div className="w-11 h-11 rounded-md border border-dashed border-ink-300 flex items-center justify-center text-ink-300">
              <ImagePlus size={16} />
            </div>
          )}
          <button
            onClick={pickImage}
            className="px-3 py-1.5 rounded-md border border-ink-200 hover:bg-ink-100 font-medium text-[12px] text-ink-700"
          >
            Choose Image
          </button>
        </div>

        <div className="flex gap-4 mb-5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-ink-600">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} className="accent-ink-900" />
            Available
          </label>
          <label className="flex items-center gap-2 text-[12px] font-medium text-ink-600">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-ink-900" />
            Active
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          {item ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md font-medium text-[13px] text-danger-600 hover:bg-danger-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleting ? 'Deleting…' : 'Delete Item'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md font-medium text-[13px] text-ink-600 border border-ink-200 hover:bg-ink-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !canSave}
              className="px-4 py-2 rounded-md font-medium text-[13px] text-white bg-ink-900 hover:bg-ink-950 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete item?"
        message="Are you sure you want to delete this item? It will be removed from the menu and POS, but existing bills and history that already include it are not affected."
        confirmLabel="Delete"
        danger
        onConfirm={deleteItem}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function CategoriesTab({
  categories,
  onChanged
}: {
  categories: { id: string; name: string; active: boolean }[]
  onChanged: () => void
}): JSX.Element {
  const [name, setName] = useState('')

  async function add(): Promise<void> {
    if (!name.trim()) return
    await window.api.menu.createCategory(name.trim())
    setName('')
    onChanged()
  }

  async function toggle(id: string, active: boolean): Promise<void> {
    await window.api.menu.updateCategory(id, { active: !active })
    onChanged()
  }

  return (
    <div className="bg-white rounded-lg border border-ink-200 p-4 max-w-lg">
      <div className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className={inputClass}
        />
        <button onClick={add} className="px-4 py-2 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white whitespace-nowrap">
          Add
        </button>
      </div>
      <div className="divide-y divide-ink-100">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2.5">
            <span className="font-medium text-ink-800 text-[13px]">{c.name}</span>
            <button
              onClick={() => toggle(c.id, c.active)}
              className={`text-[11px] font-semibold px-2 py-1 rounded border ${
                c.active ? 'bg-success-50 text-success-700 border-success-100' : 'bg-ink-100 text-ink-500 border-ink-200'
              }`}
            >
              {c.active ? 'Active' : 'Disabled'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
