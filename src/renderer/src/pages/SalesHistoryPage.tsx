import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Pencil, Printer, Trash2, X, FileSpreadsheet } from 'lucide-react'
import { useCartStore } from '../store/cartStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import ConfirmDialog from '../components/ConfirmDialog'
import type { DateSalesRow, OrderDTO, OrderStatus } from '../../../shared/types'

type Tab = 'bills' | 'byDate' | 'monthEnd'

const TABS: { key: Tab; label: string }[] = [
  { key: 'bills', label: 'Bill History' },
  { key: 'byDate', label: 'Date-wise Sales' },
  { key: 'monthEnd', label: 'Month-End Export' }
]

export default function SalesHistoryPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('bills')

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-4">Bill History</h1>
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

      {tab === 'bills' && <BillsTab />}
      {tab === 'byDate' && <DateWiseSalesTab />}
      {tab === 'monthEnd' && <MonthEndExportTab />}
    </div>
  )
}

// The current calendar month is never a valid export target — only a month
// that has fully finished. This bounds the native month picker and is
// re-validated in the main process before anything is generated.
function lastCompletedMonthValue(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function MonthEndExportTab(): JSX.Element {
  const maxMonth = lastCompletedMonthValue()
  const [month, setMonth] = useState(maxMonth)
  const [exporting, setExporting] = useState(false)
  const push = useToastStore((s) => s.push)

  function monthLabel(value: string): string {
    const [y, m] = value.split('-').map(Number)
    if (!y || !m) return ''
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  async function exportExcel(): Promise<void> {
    const [yearStr, monthStr] = month.split('-')
    const year = Number(yearStr)
    const monthNum = Number(monthStr)
    if (!year || !monthNum) return
    setExporting(true)
    try {
      const result = await window.api.export.monthEnd(year, monthNum)
      if (result.ok) push('success', `Exported to ${result.path}`)
      else if (result.error !== 'cancelled') push('error', result.error ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-ink-200 p-5 max-w-md space-y-4">
      <p className="text-ink-500 text-[13px] leading-relaxed">
        Export a complete month&apos;s daily sales, orders and production tokens — plus full order/bill details —
        to a formatted Excel workbook. Only a finished (past) month can be exported; the current month becomes
        available once it ends.
      </p>
      <div>
        <label className="block text-[11px] font-semibold text-ink-600 mb-1 uppercase tracking-wide">Month</label>
        <input
          type="month"
          value={month}
          max={maxMonth}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-ink-200 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400"
        />
        {month && <p className="text-[11px] text-ink-400 mt-1">{monthLabel(month)}</p>}
      </div>
      <button
        onClick={exportExcel}
        disabled={exporting || !month || month > maxMonth}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white disabled:opacity-50"
      >
        <FileSpreadsheet size={15} />
        {exporting ? 'Exporting…' : 'EXPORT MONTH TO EXCEL'}
      </button>
    </div>
  )
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-pending-50 text-pending-700 border-pending-100',
  PAID: 'bg-success-50 text-success-700 border-success-100',
  CANCELLED: 'bg-ink-100 text-ink-500 border-ink-200'
}

function BillsTab(): JSX.Element {
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [deleteTarget, setDeleteTarget] = useState<OrderDTO | null>(null)
  const [viewTarget, setViewTarget] = useState<OrderDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')
  const push = useToastStore((s) => s.push)
  const navigate = useNavigate()
  const loadFromOrder = useCartStore((s) => s.loadFromOrder)
  const clearCart = useCartStore((s) => s.clear)
  const editingOrderId = useCartStore((s) => s.editingOrderId)

  async function load(): Promise<void> {
    const rows = await window.api.orders.listAll()
    setOrders(rows)
  }

  useEffect(() => {
    load()
  }, [])

  function handleEdit(order: OrderDTO): void {
    if (editingOrderId && editingOrderId !== order.id) {
      const confirmed = window.confirm('You have an unsaved bill in the cart. Discard it and edit this bill instead?')
      if (!confirmed) return
    }
    clearCart()
    loadFromOrder(order)
    navigate('/pos')
  }

  async function reprint(orderId: string): Promise<void> {
    setBusyId(orderId)
    try {
      const { warnings } = await window.api.orders.reprintBill(orderId)
      if (warnings.length) push('error', `Print issue: ${warnings.map((w) => w.message).join('; ')}`)
      else push('success', 'Bill printed')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    await window.api.orders.delete(deleteTarget.id)
    push('success', `${deleteTarget.orderNumber} deleted`)
    setDeleteTarget(null)
    load()
  }

  const totalPaid = orders.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.total, 0)

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <div className="text-right">
          <div className="text-[11px] font-medium text-ink-400">Total Paid</div>
          <div className="text-lg font-semibold text-success-700">
            {currency}
            {totalPaid.toFixed(0)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-ink-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order #</th>
              <th className="px-4 py-2.5 font-medium">Created</th>
              <th className="px-4 py-2.5 font-medium">Cashier</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Total</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-2.5 font-semibold text-ink-900 whitespace-nowrap">{o.orderNumber}</td>
                  <td className="px-4 py-2.5 text-ink-500 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-500">{o.cashierName}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${STATUS_STYLE[o.status]}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ink-900 whitespace-nowrap">
                    {currency}
                    {o.total.toFixed(0)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <button
                        onClick={() => setViewTarget(o)}
                        title="View"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-ink-600 hover:bg-ink-100 font-medium text-[12px]"
                      >
                        <Eye size={13} />
                        View
                      </button>
                      {o.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleEdit(o)}
                          title="Edit"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-ink-600 hover:bg-ink-100 font-medium text-[12px]"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                      )}
                      {o.status !== 'CANCELLED' && (
                        <button
                          disabled={busyId === o.id}
                          onClick={() => reprint(o.id)}
                          title="Print Bill"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-ink-600 hover:bg-ink-100 font-medium text-[12px] disabled:opacity-50"
                        >
                          <Printer size={13} />
                          Print Bill
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(o)}
                        title="Delete"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-danger-600 hover:bg-danger-50 font-medium text-[12px]"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div className="text-center text-ink-400 text-sm py-16">No bills yet.</div>}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Permanently delete this bill?"
        message={`Are you sure you want to permanently delete ${deleteTarget?.orderNumber}? This removes the bill and its items and tokens from the database and cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {viewTarget && <BillDetailModal order={viewTarget} currency={currency} onClose={() => setViewTarget(null)} />}
    </div>
  )
}

function BillDetailModal({
  order,
  currency,
  onClose
}: {
  order: OrderDTO
  currency: string
  onClose: () => void
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40">
      <div className="bg-white rounded-lg shadow-popover border border-ink-200 w-[460px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-ink-900">{order.orderNumber}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={16} />
          </button>
        </div>
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border mb-4 ${STATUS_STYLE[order.status]}`}
        >
          {order.status}
        </span>

        <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
          <div>
            <div className="text-ink-400">Created</div>
            <div className="text-ink-800 font-medium">{new Date(order.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-ink-400">Cashier</div>
            <div className="text-ink-800 font-medium">{order.cashierName ?? '—'}</div>
          </div>
          <div>
            <div className="text-ink-400">Paid At</div>
            <div className="text-ink-800 font-medium">{order.paidAt ? new Date(order.paidAt).toLocaleString() : '—'}</div>
          </div>
          <div>
            <div className="text-ink-400">Payment</div>
            <div className="text-ink-800 font-medium">{order.paymentMethod ?? '—'}</div>
          </div>
        </div>

        <div className="border border-ink-200 rounded-md overflow-hidden mb-4">
          <table className="w-full text-[12px]">
            <thead className="bg-ink-50 text-ink-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {order.items.map((it) => (
                <tr key={it.id} className={it.status === 'REMOVED' ? 'opacity-50' : ''}>
                  <td className="px-3 py-1.5 text-ink-800">
                    {it.nameSnapshot}
                    {it.status === 'REMOVED' && <span className="text-danger-500 text-[10px] ml-1">(removed)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-ink-600 tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-1.5 text-right text-ink-800 tabular-nums">
                    {currency}
                    {it.lineTotal.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 text-[13px]">
          <div className="flex justify-between text-ink-500">
            <span>Subtotal</span>
            <span>
              {currency}
              {order.subtotal.toFixed(0)}
            </span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-ink-500">
              <span>Discount</span>
              <span>
                -{currency}
                {order.discount.toFixed(0)}
              </span>
            </div>
          )}
          <div className="flex justify-between font-bold text-ink-900 text-base pt-1 border-t border-ink-200">
            <span>Total</span>
            <span>
              {currency}
              {order.total.toFixed(0)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 rounded-md font-medium text-[13px] border border-ink-200 text-ink-600 hover:bg-ink-100"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function DateWiseSalesTab(): JSX.Element {
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')
  const [from, setFrom] = useState(daysAgoStr(13))
  const [to, setTo] = useState(todayStr())
  const [rows, setRows] = useState<DateSalesRow[]>([])
  const [loading, setLoading] = useState(false)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.api.dashboard.salesByDate(from, to)
      setRows(result)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPaid = rows.reduce((sum, r) => sum + r.paidSales, 0)
  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0)
  const totalTokens = rows.reduce((sum, r) => sum + r.tokens, 0)

  function formatDate(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div>
      <div className="flex items-end gap-3 mb-4 bg-white rounded-lg border border-ink-200 p-3.5">
        <div>
          <label className="block text-[11px] font-semibold text-ink-600 mb-1 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-ink-600 mb-1 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 rounded-md font-medium text-[13px] bg-ink-900 hover:bg-ink-950 text-white disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <SummaryTile label="Total Paid Sales" value={`${currency}${totalPaid.toFixed(0)}`} tone="success" />
        <SummaryTile label="Total Orders" value={String(totalOrders)} tone="neutral" />
        <SummaryTile label="Total Tokens" value={String(totalTokens)} tone="neutral" />
      </div>

      <div className="bg-white rounded-lg border border-ink-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-50 text-ink-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium text-right">Paid Sales</th>
              <th className="px-4 py-2.5 font-medium text-right">Orders</th>
              <th className="px-4 py-2.5 font-medium text-right">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((r) => (
              <tr key={r.date} className="hover:bg-ink-50/60">
                <td className="px-4 py-2.5 font-medium text-ink-900">{formatDate(r.date)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-success-700">
                  {currency}
                  {r.paidSales.toFixed(0)}
                </td>
                <td className="px-4 py-2.5 text-right text-ink-600 tabular-nums">{r.orders}</td>
                <td className="px-4 py-2.5 text-right text-ink-600 tabular-nums">{r.tokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <div className="text-center text-ink-400 text-sm py-16">No data for this range.</div>
        )}
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'success' | 'pending' | 'neutral'
}): JSX.Element {
  const toneClass =
    tone === 'success' ? 'text-success-700' : tone === 'pending' ? 'text-pending-600' : 'text-ink-900'
  return (
    <div className="bg-white rounded-lg border border-ink-200 p-3.5">
      <div className="text-[11px] font-medium text-ink-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}
