import { EscPosBuilder, charsPerLine, rasterWidthPx } from './commands'
import { buildLogoCommand } from './logoRaster'
import type { OrderDTO } from '../../../shared/types'

export async function buildReceipt(
  order: OrderDTO,
  opts: { shopName: string; address?: string; phone?: string; currency: string; widthMm: number }
): Promise<Buffer> {
  const width = charsPerLine(opts.widthMm)
  const activeItems = order.items.filter((i) => i.status === 'ACTIVE')
  const statusLabel = order.status === 'PAID' ? 'PAID' : order.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'
  const logoCommand = await buildLogoCommand(rasterWidthPx(opts.widthMm))

  const b = new EscPosBuilder()
  b.init()

  b.align('center')
  if (logoCommand) {
    b.raw(logoCommand)
    b.newline()
  }
  b.bold(true).doubleSize(true)
  b.line(opts.shopName)
  b.doubleSize(false).bold(false)
  if (opts.address?.trim()) b.line(opts.address.trim())
  if (opts.phone?.trim()) b.line(opts.phone.trim())
  b.line(`Order: ${order.orderNumber}`)
  b.line(new Date(order.createdAt).toLocaleString())
  b.divider(width, '-')

  b.align('left')
  for (const item of activeItems) {
    b.line(item.nameSnapshot)
    b.twoColumns(`  ${item.quantity} x ${opts.currency}${item.priceSnapshot.toFixed(0)}`, item.lineTotal.toFixed(0), width)
  }
  b.divider(width, '-')

  b.twoColumns('Subtotal', `${opts.currency}${order.subtotal.toFixed(0)}`, width)
  if (order.discount > 0) {
    b.twoColumns('Discount', `-${opts.currency}${order.discount.toFixed(0)}`, width)
  }
  if (order.tax > 0) {
    b.twoColumns('Tax', `${opts.currency}${order.tax.toFixed(0)}`, width)
  }
  b.bold(true)
  b.twoColumns('GRAND TOTAL', `${opts.currency}${order.total.toFixed(0)}`, width)
  b.bold(false)

  b.divider(width, '-')
  if (order.paymentMethod) {
    b.line(`Payment: ${order.paymentMethod}`)
  }
  b.align('center')
  b.bold(true)
  b.line(`STATUS: ${statusLabel}`)
  b.bold(false)
  b.line('Thank you for visiting!')
  b.line('Software by Moon')

  b.feed(3)
  b.cut(true)

  return b.build()
}
