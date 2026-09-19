import { getPrisma } from '../db'
import { writeAuditLog } from './auditService'
import type { ProductionTokenDTO } from '../../shared/types'

function mapToken(row: any, unitPrice: number): ProductionTokenDTO {
  return {
    id: row.id,
    tokenNumber: row.tokenNumber,
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    itemName: row.itemName,
    quantity: row.quantity,
    unitPrice,
    status: row.status,
    printCount: row.printCount,
    createdAt: row.createdAt.toISOString()
  }
}

export async function markTokenPrinted(id: string): Promise<void> {
  const prisma = getPrisma()
  await prisma.productionToken.update({
    where: { id },
    data: {
      printCount: { increment: 1 },
      printedAt: new Date(),
      status: 'PRINTED'
    }
  })
}

/**
 * Print-time entry point for a single cart/order line. Creates the token the first
 * time it's called for a given order item (PRINT TOKEN); every subsequent call finds
 * the same token and reuses its number (REPRINT TOKEN) — it never creates a second one.
 */
export async function ensureTokenForOrderItem(
  orderItemId: string
): Promise<{ token: ProductionTokenDTO; isNew: boolean }> {
  const prisma = getPrisma()
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { token: true, order: true }
  })
  if (!orderItem) throw new Error('Order item not found')
  if (orderItem.status !== 'ACTIVE') throw new Error('Cannot print a token for a removed item')

  if (orderItem.token) {
    const current =
      orderItem.token.quantity === orderItem.quantity
        ? orderItem.token
        : await prisma.productionToken.update({
            where: { id: orderItem.token.id },
            data: { quantity: orderItem.quantity }
          })
    return { token: mapToken({ ...current, order: orderItem.order }, orderItem.priceSnapshot), isNew: false }
  }

  const counter = await prisma.counter.update({
    where: { name: 'tokenNumber' },
    data: { value: { increment: 1 } }
  })

  try {
    const created = await prisma.productionToken.create({
      data: {
        tokenNumber: counter.value,
        orderId: orderItem.orderId,
        orderItemId: orderItem.id,
        itemName: orderItem.nameSnapshot,
        quantity: orderItem.quantity,
        status: 'QUEUED'
      }
    })
    await writeAuditLog('TOKEN_CREATED', 'ProductionToken', created.id, {
      orderItemId,
      tokenNumber: created.tokenNumber
    })
    return { token: mapToken({ ...created, order: orderItem.order }, orderItem.priceSnapshot), isNew: true }
  } catch (err: any) {
    // Unique-constraint race from a rapid double-click: another call already created
    // the token for this order item. Fetch and reuse it instead of failing.
    if (err?.code === 'P2002') {
      const existing = await prisma.productionToken.findUnique({
        where: { orderItemId },
        include: { order: true }
      })
      if (existing) return { token: mapToken(existing, orderItem.priceSnapshot), isNew: false }
    }
    throw err
  }
}
