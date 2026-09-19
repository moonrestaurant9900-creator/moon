import { useState } from 'react'
import { Minus, Plus, Trash2, ShoppingCart, Ticket, CheckCircle2, Save, Wallet, Printer, RefreshCw } from 'lucide-react'
import { useCartStore, type CartLine } from '../store/cartStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import ConfirmDialog from './ConfirmDialog'
import type { OrderDTO, PaymentMethod } from '../../../shared/types'

export default function CartPanel(): JSX.Element {
  const cart = useCartStore()
  const settings = useSettingsStore((s) => s.settings)
  const push = useToastStore((s) => s.push)

  const [confirmClear, setConfirmClear] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tokensBusy, setTokensBusy] = useState(false)
  const [reprintBusy, setReprintBusy] = useState(false)
  const [lineTokenBusy, setLineTokenBusy] = useState<string | null>(null)
  const [showPaymentPicker, setShowPaymentPicker] = useState(false)

  const currency = settings?.currency ?? 'Rs.'
  const subtotal = cart.subtotal()
  const discount = Math.min(cart.discount, subtotal)
  const total = Math.max(subtotal - discount, 0)
  const isEditing = Boolean(cart.editingOrderId)
  // Editing a previously saved bill (loaded via Bill History EDIT) — as opposed to a
  // brand-new order that just happens to have been auto-saved already.
  const isEditingExisting = cart.originalSnapshot !== null
  const allTokensPrinted = cart.lines.length > 0 && cart.lines.every((l) => l.tokenNumber != null)
  const anyTokenPrinted = cart.lines.some((l) => l.tokenNumber != null)

  function lineNeedsToken(line: CartLine): boolean {
    if (!cart.originalSnapshot) return true
    const originalQty = cart.originalSnapshot[line.key]
    if (originalQty === undefined) return true // new item added during this edit
    return originalQty !== line.quantity // quantity (or anything else) changed
  }
  function lineHandledInSession(line: CartLine): boolean {
    return cart.printedInSession.includes(line.key)
  }
  const changedLines = cart.lines.filter(lineNeedsToken)
  const allChangesPrinted = changedLines.length === 0 || changedLines.every(lineHandledInSession)

  function findOrderItem(order: OrderDTO, line: CartLine) {
    return order.items.find(
      (i) => i.menuItemId === line.menuItemId && (i.variant ?? null) === line.size && i.status === 'ACTIVE'
    )
  }

  async function persistCart(): Promise<OrderDTO> {
    const result = await window.api.orders.submit({
      orderId: cart.editingOrderId,
      lines: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, size: l.size })),
      discount,
      clientRequestId: crypto.randomUUID()
    })
    cart.syncFromOrder(result.order)
    return result.order
  }

  // Prints a token only for lines that don't have one yet — never re-sends
  // an already-printed token (that's Reprint All's job).
  async function handleAllTokens(): Promise<void> {
    if (cart.lines.length === 0 || allTokensPrinted) return
    setTokensBusy(true)
    try {
      const order = await persistCart()
      const errors: string[] = []
      for (const line of cart.lines) {
        if (line.tokenNumber != null) continue
        const orderItem = findOrderItem(order, line)
        if (!orderItem) continue
        const result = await window.api.orders.printItemToken(orderItem.id)
        cart.setLineToken(line.key, result.token.tokenNumber)
        if (result.warning) errors.push(`${result.warning.target}: ${result.warning.message}`)
        else cart.markLinePrinted(line.key)
      }
      for (const e of errors) push('error', e)
    } catch (err) {
      push('error', (err as Error).message)
    } finally {
      setTokensBusy(false)
    }
  }

  // Reprints tokens that already exist. Never persists the cart, never creates
  // a new order, and never creates a new token number — a pure resend.
  async function handleReprintAll(): Promise<void> {
    const printedLines = cart.lines.filter((l) => l.tokenNumber != null && l.orderItemId)
    if (printedLines.length === 0) return
    setReprintBusy(true)
    try {
      const errors: string[] = []
      for (const line of printedLines) {
        const result = await window.api.orders.printItemToken(line.orderItemId!)
        cart.setLineToken(line.key, result.token.tokenNumber)
        if (result.warning) errors.push(`${result.warning.target}: ${result.warning.message}`)
        else cart.markLinePrinted(line.key)
      }
      if (errors.length) {
        for (const e of errors) push('error', e)
      } else {
        push('success', 'All tokens reprinted')
      }
    } catch (err) {
      push('error', (err as Error).message)
    } finally {
      setReprintBusy(false)
    }
  }

  async function handlePrintLineToken(line: CartLine): Promise<void> {
    setLineTokenBusy(line.key)
    try {
      const order = await persistCart()
      const orderItem = findOrderItem(order, line)
      if (!orderItem) throw new Error('Item not found in saved order')
      const result = await window.api.orders.printItemToken(orderItem.id)
      cart.setLineToken(line.key, result.token.tokenNumber)
      cart.markPrintedInSession(line.key)
      if (result.warning) push('error', `${result.warning.target}: ${result.warning.message}`)
      else cart.markLinePrinted(line.key)
    } catch (err) {
      push('error', (err as Error).message)
    } finally {
      setLineTokenBusy(null)
    }
  }

  async function handlePayNow(method: PaymentMethod): Promise<void> {
    if (cart.lines.length === 0 || !allTokensPrinted) return
    setSubmitting(true)
    try {
      const result = await window.api.orders.submit({
        orderId: cart.editingOrderId,
        lines: cart.lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, size: l.size })),
        discount,
        markPaidNow: true,
        paymentMethod: method,
        clientRequestId: crypto.randomUUID()
      })
      push('success', `✓ ${result.order.orderNumber} paid via ${method}`)
      cart.clear()
      setShowPaymentPicker(false)
    } catch (err) {
      push('error', (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveChanges(): Promise<void> {
    if (cart.lines.length === 0 || !allChangesPrinted) return
    setSubmitting(true)
    try {
      const order = await persistCart()
      push('success', `${order.orderNumber} updated`)
      cart.clear()
    } catch (err) {
      push('error', (err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-80 shrink-0 bg-white border-l border-ink-200 flex flex-col h-full">
      {isEditing && (
        <div className="bg-pending-50 text-pending-700 border-b border-pending-100 px-3 py-2 font-semibold text-[11px] flex items-center justify-between">
          <span>EDITING BILL {cart.editingOrderNumber}</span>
          <button onClick={() => cart.clear()} className="text-[11px] font-medium underline underline-offset-2">
            Cancel
          </button>
        </div>
      )}

      <div className="px-3 py-2.5 border-b border-ink-200 flex items-center gap-2">
        <ShoppingCart size={14} className="text-ink-500" />
        <span className="font-semibold text-ink-900 text-[13px]">Current Order</span>
        {cart.lines.length > 0 && (
          <span className="text-[11px] font-medium text-ink-400">{cart.lines.length}</span>
        )}
        <button
          onClick={() => setConfirmClear(true)}
          disabled={cart.lines.length === 0}
          title="Clear cart"
          className="ml-auto flex items-center gap-1 text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:cursor-not-allowed px-1.5 py-1 rounded-md"
        >
          <Trash2 size={12} />
          <span className="text-[10px] font-semibold">Clear</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-ink-100">
        {cart.lines.length === 0 && (
          <div className="text-ink-400 text-sm text-center py-16 px-4">Cart is empty. Select an item to begin.</div>
        )}
        {cart.lines.map((line) => {
          const showLineToken = isEditingExisting && lineNeedsToken(line) && !lineHandledInSession(line)
          return (
            <div key={line.key} className="px-3 py-2 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-ink-900 text-[16px] leading-tight truncate">{line.name}</div>
                  {line.tokenNumber != null && !showLineToken && (
                    <div className="flex items-center gap-1 text-[10px] text-success-600 mt-0.5 font-medium">
                      <CheckCircle2 size={11} />#{String(line.tokenNumber).padStart(3, '0')}
                    </div>
                  )}
                  {showLineToken && (
                    <div className="text-[10px] text-pending-600 mt-0.5 font-semibold">
                      {cart.originalSnapshot && cart.originalSnapshot[line.key] === undefined
                        ? 'New — needs token'
                        : 'Qty changed — needs token'}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-ink-900 text-[13px]">
                    {currency}
                    {(line.price * line.quantity).toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5 border border-ink-200 rounded-md shrink-0">
                  <button
                    onClick={() => cart.decQty(line.key)}
                    className="w-6 h-6 flex items-center justify-center text-ink-600 hover:bg-ink-100 rounded-l-md"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center font-semibold text-[12px] text-ink-900">{line.quantity}</span>
                  <button
                    onClick={() => cart.incQty(line.key)}
                    className="w-6 h-6 flex items-center justify-center text-ink-600 hover:bg-ink-100 rounded-r-md"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {showLineToken && (
                  <button
                    onClick={() => handlePrintLineToken(line)}
                    disabled={lineTokenBusy === line.key}
                    className="flex items-center gap-1 px-1.5 py-1 rounded font-semibold text-[10px] bg-ink-900 text-white hover:bg-ink-950 disabled:opacity-50 shrink-0"
                  >
                    <Ticket size={10} />
                    {lineTokenBusy === line.key ? '…' : 'TOKEN'}
                  </button>
                )}

                <button
                  onClick={() => cart.removeItem(line.key)}
                  title="Remove"
                  className="flex items-center justify-center text-danger-600 hover:bg-danger-50 p-1 rounded-md shrink-0 ml-auto"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-ink-200 p-3 space-y-2">
        {settings?.discountEnabled && (
          <div className="flex justify-between items-center text-ink-500 text-[12px] font-medium">
            <span>Discount</span>
            <input
              type="number"
              min={0}
              value={cart.discount}
              onChange={(e) => cart.setDiscount(Number(e.target.value) || 0)}
              className="w-16 text-right border border-ink-200 rounded-md px-1.5 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-ink-900/10"
            />
          </div>
        )}

        <div className="flex justify-between items-center py-1">
          <span className="font-semibold text-ink-900 text-[13px]">GRAND TOTAL</span>
          <span className="font-bold text-ink-900 text-xl">
            {currency}
            {total.toFixed(0)}
          </span>
        </div>

        {isEditingExisting ? (
          <div className="space-y-1.5">
            <button
              onClick={handleSaveChanges}
              disabled={!allChangesPrinted || submitting || cart.lines.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-md font-semibold text-[13px] bg-ink-900 hover:bg-ink-950 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              {submitting ? 'Saving…' : 'SAVE CHANGES'}
            </button>
            {!allChangesPrinted && (
              <p className="text-[11px] text-ink-400 text-center">
                Print the token for each changed/new item before saving
              </p>
            )}
          </div>
        ) : showPaymentPicker ? (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-ink-600 text-center">Select payment method</div>
            <div className="flex gap-1.5">
              {(['CASH', 'ONLINE', 'OTHER'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handlePayNow(m)}
                  disabled={submitting}
                  className="flex-1 py-2 rounded-md text-[11px] font-bold bg-success-600 hover:bg-success-700 text-white disabled:opacity-50"
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPaymentPicker(false)}
              disabled={submitting}
              className="w-full text-[11px] text-ink-400 hover:text-ink-600 underline underline-offset-2"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-stretch gap-1">
              <button
                onClick={handleAllTokens}
                disabled={cart.lines.length === 0 || tokensBusy || allTokensPrinted}
                title={allTokensPrinted ? 'All Tokens Printed' : 'Print all unprinted tokens'}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-md font-semibold text-[11px] disabled:cursor-not-allowed ${
                  allTokensPrinted
                    ? 'bg-success-50 text-success-700 border border-success-100 opacity-90'
                    : 'bg-ink-900 hover:bg-ink-950 text-white disabled:opacity-40'
                }`}
              >
                {allTokensPrinted ? <CheckCircle2 size={13} /> : <Printer size={13} />}
                {tokensBusy ? '…' : allTokensPrinted ? 'All Printed' : 'All Tokens'}
              </button>
              <button
                onClick={handleReprintAll}
                disabled={!anyTokenPrinted || reprintBusy}
                title="Reprint existing tokens"
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md border border-ink-200 text-ink-600 hover:bg-ink-100 font-semibold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw size={13} />
                {reprintBusy ? '…' : 'Reprint All'}
              </button>
              <button
                onClick={() => setShowPaymentPicker(true)}
                disabled={cart.lines.length === 0 || !allTokensPrinted}
                title="Pay Now"
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-md font-semibold text-[11px] bg-success-600 hover:bg-success-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Wallet size={13} />
                Pay Now
              </button>
            </div>

            {!allTokensPrinted && cart.lines.length > 0 && (
              <p className="text-[11px] text-ink-400 text-center">Print all tokens before payment</p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear cart?"
        message={
          isEditing
            ? 'This bill has already been saved (and may have printed tokens). Clearing only closes this cart — the bill stays in Bill History.'
            : 'This will discard the current unsaved order. No order, token, or sale will be created.'
        }
        confirmLabel="Clear Cart"
        danger
        onConfirm={() => {
          cart.clear()
          setConfirmClear(false)
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
