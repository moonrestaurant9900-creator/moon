import { create } from 'zustand'
import type { ItemSize, OrderDTO } from '../../../shared/types'

function makeKey(menuItemId: string, size: ItemSize | null): string {
  return `${menuItemId}:${size ?? ''}`
}

export interface CartLine {
  key: string // menuItemId + size — a Half and a Full of the same item are separate lines
  menuItemId: string
  size: ItemSize | null
  name: string
  price: number
  quantity: number
  // Populated once this line has been persisted / token-printed.
  orderItemId?: string
  tokenNumber?: number
}

interface CartState {
  lines: CartLine[]
  editingOrderId: string | null
  editingOrderNumber: string | null
  discount: number
  // Snapshot of {lineKey: quantity} for ACTIVE lines as they existed when an
  // existing bill was loaded for editing. null for a brand-new (unsaved) order —
  // in that case every line counts as new. Used to detect exactly which lines
  // changed (new item / quantity changed) so only those need a fresh token.
  originalSnapshot: Record<string, number> | null
  // line keys whose token has already been printed/reprinted during THIS edit
  // session, so the per-line PRINT TOKEN button doesn't linger after it's done.
  printedInSession: string[]
  // line keys whose token has SUCCESSFULLY printed (physical print, not just a
  // token number being assigned) — backs the "Tokens Printed" POS indicator.
  // A token can be assigned in the DB even when the physical print failed, so
  // this is tracked separately from CartLine.tokenNumber.
  printedLineKeys: string[]
  addItem: (item: { id: string; name: string; price: number; size?: ItemSize | null }) => void
  incQty: (key: string) => void
  decQty: (key: string) => void
  setQuantity: (key: string, qty: number) => void
  removeItem: (key: string) => void
  setDiscount: (amount: number) => void
  clear: () => void
  loadFromOrder: (order: OrderDTO) => void
  syncFromOrder: (order: OrderDTO) => void
  setLineToken: (key: string, tokenNumber: number) => void
  markPrintedInSession: (key: string) => void
  markLinePrinted: (key: string) => void
  subtotal: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  editingOrderId: null,
  editingOrderNumber: null,
  discount: 0,
  originalSnapshot: null,
  printedInSession: [],
  printedLineKeys: [],

  addItem: (item) =>
    set((state) => {
      const size = item.size ?? null
      const key = makeKey(item.id, size)
      const existing = state.lines.find((l) => l.key === key)
      if (existing) {
        return {
          lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
        }
      }
      return {
        lines: [
          ...state.lines,
          { key, menuItemId: item.id, size, name: item.name, price: item.price, quantity: 1 }
        ]
      }
    }),

  incQty: (key) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
    })),

  decQty: (key) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l))
    })),

  setQuantity: (key, qty) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, qty) } : l))
    })),

  removeItem: (key) => set((state) => ({ lines: state.lines.filter((l) => l.key !== key) })),

  setDiscount: (amount) => set({ discount: Math.max(0, amount) }),

  clear: () =>
    set({
      lines: [],
      editingOrderId: null,
      editingOrderNumber: null,
      discount: 0,
      originalSnapshot: null,
      printedInSession: [],
      printedLineKeys: []
    }),

  loadFromOrder: (order) => {
    const activeItems = order.items.filter((it) => it.status === 'ACTIVE')
    const snapshot: Record<string, number> = {}
    for (const it of activeItems) {
      if (it.menuItemId) snapshot[makeKey(it.menuItemId, it.variant)] = it.quantity
    }
    // Best-effort signal for previously-loaded bills: a line with an existing
    // token number was already printed in an earlier session.
    const alreadyPrinted = activeItems
      .filter((it) => it.tokenNumber != null && it.menuItemId)
      .map((it) => makeKey(it.menuItemId!, it.variant))
    set({
      editingOrderId: order.id,
      editingOrderNumber: order.orderNumber,
      discount: order.discount,
      originalSnapshot: snapshot,
      printedInSession: [],
      printedLineKeys: alreadyPrinted,
      lines: activeItems.map((it) => ({
        key: makeKey(it.menuItemId ?? it.id, it.variant),
        menuItemId: it.menuItemId ?? it.id,
        size: it.variant,
        name: it.nameSnapshot,
        price: it.priceSnapshot,
        quantity: it.quantity,
        orderItemId: it.id,
        tokenNumber: it.tokenNumber ?? undefined
      }))
    })
  },

  // After a submitOrder() call, stamp each cart line with its persisted orderItemId
  // and any existing token info, without disturbing quantities the cashier is still editing.
  syncFromOrder: (order) =>
    set((state) => {
      const byKey = new Map(
        order.items
          .filter((it) => it.status === 'ACTIVE' && it.menuItemId)
          .map((it) => [makeKey(it.menuItemId!, it.variant), it])
      )
      return {
        editingOrderId: order.id,
        editingOrderNumber: order.orderNumber,
        lines: state.lines.map((l) => {
          const match = byKey.get(l.key)
          if (!match) return l
          return {
            ...l,
            orderItemId: match.id,
            tokenNumber: match.tokenNumber ?? l.tokenNumber
          }
        })
      }
    }),

  setLineToken: (key, tokenNumber) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.key === key ? { ...l, tokenNumber } : l))
    })),

  markPrintedInSession: (key) =>
    set((state) => (state.printedInSession.includes(key) ? state : { printedInSession: [...state.printedInSession, key] })),

  markLinePrinted: (key) =>
    set((state) => (state.printedLineKeys.includes(key) ? state : { printedLineKeys: [...state.printedLineKeys, key] })),

  subtotal: () => get().lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
}))
