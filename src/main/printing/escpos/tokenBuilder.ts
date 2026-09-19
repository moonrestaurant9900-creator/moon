import { EscPosBuilder } from './commands'
import type { ProductionTokenDTO } from '../../../shared/types'

// As short and compact as practically possible: Font B (condensed) throughout,
// no divider, no blank lines, minimal feed before cut. Exactly the required
// fields and nothing else — restaurant name, token #, date/time, item, qty, price.
export function buildToken(token: ProductionTokenDTO, opts: { shopName: string; currency: string }): Buffer {
  const printedAt = new Date().toLocaleString()

  const b = new EscPosBuilder()
  b.init()
  b.font('B')
  b.align('center')

  b.bold(true)
  b.line(opts.shopName)
  b.line(`TOKEN #${String(token.tokenNumber).padStart(3, '0')}`)
  b.bold(false)
  b.line(printedAt)

  b.align('left')
  b.bold(true)
  b.line(token.itemName)
  b.bold(false)
  b.line(`Qty: ${token.quantity}   Price: ${opts.currency}${token.unitPrice.toFixed(0)}`)

  b.feed(1)
  b.cut(true)

  return b.build()
}
