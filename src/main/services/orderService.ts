import { getPrisma } from '../db'
import { requireUser } from '../session'
import { writeAuditLog } from './auditService'
import type { OrderDTO, OrderItemDTO, PaymentMethod, SubmitOrderInput, SubmitOrderResult } from '../../shared/types'

// Idempotency guard against double-submits (e.g. rapid double-click on PRINT BILL).
const recentRequests = new Map<string, SubmitOrderResult>()
const RECENT_REQUEST_TTL_MS = 60_000

function rememberRequest(id: string, result: SubmitOrderResult): void {
  recentRequests.set(id, result)
  setTimeout(() => recentRequests.delete(id), RECENT_REQUEST_TTL_MS)
}

async function nextCounter(tx: any, name: string): Promise<number> {
  const row = await tx.counter.update({ where: { name }, data: { value: { increment: 1 } } })
  return row.value
}

function mapOrder(row: any): OrderDTO {
  const items: OrderItemDTO[] = row.items.map((it: any) => ({
    id: it.id,
    menuItemId: it.menuItemId,
    nameSnapshot: it.nameSnapshot,
    priceSnapshot: it.priceSnapshot,
    variant: it.variant ?? null,
    quantity: it.quantity,
    lineTotal: it.lineTotal,
    status: it.status,
    tokenNumber: it.token?.tokenNumber ?? null,
    tokenStatus: it.token?.status ?? null
  }))
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    subtotal: row.subtotal,
    discount: row.discount,
    tax: row.tax,
    total: row.total,
    paymentMethod: row.paymentMethod,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cashierName: row.cashier?.name,
    items
  }
}

const ORDER_INCLUDE = {
  items: { include: { token: true } },
  cashier: true
} as const

// A cart line is identified by menu item + size, since a Half/Full item can appear
// as two independent lines (one Half, one Full) in the same order.
function lineKey(menuItemId: string, size: string | null | undefined): string {
  return `${menuItemId}:${size ?? ''}`
}

function displayName(menuItemName: string, size: string | null | undefined): string {
  if (!size) return menuItemName
  return `${menuItemName} (${size === 'HALF' ? 'Half' : 'Full'})`
}

// Resolves the correct unit price for a line against its menu item, validating that
// the requested size actually matches how the item is configured.
function resolveUnitPrice(menuItem: any, size: string | null | undefined): number {
  if (size) {
    if (menuItem.sizeMode !== 'HALF_FULL') {
      throw new Error(`${menuItem.name} does not support Half/Full — remove the size selection`)
    }
    const price = size === 'HALF' ? menuItem.halfPrice : menuItem.fullPrice
    if (!(price > 0)) throw new Error(`${menuItem.name} (${size === 'HALF' ? 'Half' : 'Full'}) has no price set`)
    return price
  }
  if (menuItem.sizeMode === 'HALF_FULL') {
    throw new Error(`${menuItem.name} requires a Half or Full selection`)
  }
  if (!(menuItem.price > 0)) throw new Error(`${menuItem.name} has no price set`)
  return menuItem.price
}

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const cached = recentRequests.get(input.clientRequestId)
  if (cached) return cached

  const user = requireUser()
  const prisma = getPrisma()

  if (!input.lines || input.lines.length === 0) {
    throw new Error('Cart is empty')
  }
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) {
      throw new Error('Invalid quantity')
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    let existingItems: any[] = []
    let order: any

    if (input.orderId) {
      order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { items: { include: { token: true } } }
      })
      if (!order || order.isDeleted) throw new Error('Order not found')
      if (order.status === 'CANCELLED') throw new Error('Cancelled bills cannot be edited')
      existingItems = order.items.filter((it: any) => it.status === 'ACTIVE')
    } else {
      const counterValue = await nextCounter(tx, 'orderNumber')
      order = await tx.order.create({
        data: {
          orderNumber: `ORD-${counterValue}`,
          status: 'PENDING',
          cashierId: user.id
        },
        include: { items: { include: { token: true } } }
      })
    }
    const orderId: string = order.id

    const menuItemIds = [...new Set(input.lines.map((l) => l.menuItemId))]
    const menuItems = await tx.menuItem.findMany({ where: { id: { in: menuItemIds } } })
    const menuItemMap = new Map(menuItems.map((m: any) => [m.id, m]))
    for (const line of input.lines) {
      if (!menuItemMap.has(line.menuItemId)) throw new Error('Menu item not found')
    }

    const existingByKey = new Map(existingItems.map((it: any) => [lineKey(it.menuItemId, it.variant), it]))

    // Structured diff for the audit trail — what actually changed in this save, not just the raw input.
    const diff = {
      added: [] as Array<{ name: string; quantity: number }>,
      quantityChanged: [] as Array<{ name: string; from: number; to: number }>,
      removed: [] as Array<{ name: string; quantity: number }>
    }

    for (const line of input.lines) {
      const menuItem = menuItemMap.get(line.menuItemId)!
      const size = line.size ?? null
      const unitPrice = resolveUnitPrice(menuItem, size)
      const name = displayName(menuItem.name, size)
      const key = lineKey(line.menuItemId, size)
      const existing = existingByKey.get(key)
      const lineTotal = unitPrice * line.quantity

      if (existing) {
        existingByKey.delete(key)
        if (existing.quantity !== line.quantity || existing.lineTotal !== lineTotal) {
          await tx.orderItem.update({
            where: { id: existing.id },
            data: { quantity: line.quantity, lineTotal }
          })
          // Keep an already-printed token's quantity in sync — this is NOT a new token,
          // and does not print anything by itself (printing is a separate, explicit action).
          if (existing.token) {
            await tx.productionToken.update({
              where: { id: existing.token.id },
              data: { quantity: line.quantity }
            })
          }
          if (existing.quantity !== line.quantity) {
            diff.quantityChanged.push({ name, from: existing.quantity, to: line.quantity })
          }
        }
      } else {
        // New cart line: just persist it. No token is created here — the cashier
        // must explicitly click PRINT TOKEN for this line when one is needed.
        await tx.orderItem.create({
          data: {
            orderId,
            menuItemId: menuItem.id,
            nameSnapshot: name,
            priceSnapshot: unitPrice,
            variant: size,
            quantity: line.quantity,
            lineTotal,
            status: 'ACTIVE'
          }
        })
        diff.added.push({ name, quantity: line.quantity })
      }
    }

    // Anything left in existingByKey was removed by the cashier during editing.
    for (const removed of existingByKey.values()) {
      await tx.orderItem.update({ where: { id: removed.id }, data: { status: 'REMOVED', lineTotal: 0 } })
      if (removed.token) {
        await tx.productionToken.update({ where: { id: removed.token.id }, data: { status: 'CANCELLED' } })
      }
      await writeAuditLog('ITEM_REMOVED', 'OrderItem', removed.id, { orderId }, tx)
      diff.removed.push({ name: removed.nameSnapshot, quantity: removed.quantity })
    }

    const activeItems = await tx.orderItem.findMany({ where: { orderId, status: 'ACTIVE' } })
    const subtotal = activeItems.reduce((sum: number, it: any) => sum + it.lineTotal, 0)
    const discount = Math.min(Math.max(input.discount ?? order.discount ?? 0, 0), subtotal)
    const tax = order.tax ?? 0
    const total = Math.max(subtotal - discount + tax, 0)

    const updateData: any = { subtotal, discount, tax, total }
    if (input.markPaidNow) {
      updateData.status = 'PAID'
      updateData.paidAt = new Date()
      updateData.paymentMethod = input.paymentMethod ?? 'CASH'
    }

    const finalOrder = await tx.order.update({
      where: { id: orderId },
      data: updateData,
      include: ORDER_INCLUDE
    })

    await writeAuditLog(
      input.orderId ? 'ORDER_EDITED' : 'ORDER_CREATED',
      'Order',
      orderId,
      input.orderId ? diff : { lines: input.lines },
      tx
    )

    return finalOrder
  })

  const dto: SubmitOrderResult = { order: mapOrder(result) }
  rememberRequest(input.clientRequestId, dto)
  return dto
}

export async function getOrder(orderId: string): Promise<OrderDTO | null> {
  const prisma = getPrisma()
  const row = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE })
  return row ? mapOrder(row) : null
}

// Internal service-layer primitive only — deliberately NOT exposed over IPC.
// The cashier-facing path is always submitOrder({ markPaidNow: true }), which
// enforces the token-printed gate and clientRequestId idempotency; this raw
// status flip has neither, so it must never be reachable from the renderer.
export async function markOrderPaid(orderId: string, paymentMethod: PaymentMethod): Promise<OrderDTO> {
  const user = requireUser()
  const prisma = getPrisma()
  const row = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'PAID', paidAt: new Date(), paymentMethod },
    include: ORDER_INCLUDE
  })
  await writeAuditLog('MARK_PAID', 'Order', orderId, { paymentMethod, cashier: user.name })
  return mapOrder(row)
}

export async function cancelOrder(orderId: string): Promise<OrderDTO> {
  const prisma = getPrisma()
  const row = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED' },
    include: ORDER_INCLUDE
  })
  await prisma.productionToken.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } })
  await writeAuditLog('ORDER_CANCELLED', 'Order', orderId, {})
  return mapOrder(row)
}

// Permanent deletion, not soft delete — the bill, its OrderItems and its
// ProductionTokens are all removed from SQLite in one transaction (child rows
// first, to satisfy foreign keys), so either everything is gone or nothing is.
// The audit log entry survives independently (AuditLog has no FK to Order),
// preserving a record that the deletion happened without keeping the bill itself.
export async function deleteOrder(orderId: string): Promise<void> {
  const user = requireUser()
  if (user.role !== 'ADMIN') throw new Error('Admin privileges required')
  const prisma = getPrisma()
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  await prisma.$transaction([
    prisma.productionToken.deleteMany({ where: { orderId } }),
    prisma.orderItem.deleteMany({ where: { orderId } }),
    prisma.order.delete({ where: { id: orderId } })
  ])
  await writeAuditLog('ORDER_DELETED', 'Order', orderId, { orderNumber: order.orderNumber })
}

// Bill History: paid and cancelled bills only. A PENDING order is an unsaved
// draft still live in the cashier's cart (tokens may already be printed for
// it) and must never appear as a "saved" bill until PAY NOW completes it.
export async function listAllBills(): Promise<OrderDTO[]> {
  const prisma = getPrisma()
  const rows = await prisma.order.findMany({
    where: { isDeleted: false, status: { not: 'PENDING' } },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: 'desc' }
  })
  return rows.map(mapOrder)
}

export async function listPaidOrders(fromDate?: Date, toDate?: Date): Promise<OrderDTO[]> {
  const prisma = getPrisma()
  const rows = await prisma.order.findMany({
    where: {
      status: 'PAID',
      isDeleted: false,
      ...(fromDate || toDate
        ? { paidAt: { gte: fromDate, lte: toDate } }
        : {})
    },
    include: ORDER_INCLUDE,
    orderBy: { paidAt: 'desc' }
  })
  return rows.map(mapOrder)
}
