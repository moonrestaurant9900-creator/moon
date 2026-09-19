import { getPrisma } from '../db'
import { getSettings } from '../services/settingsService'
import { markTokenPrinted } from '../services/tokenService'
import { sendRaw, getDefaultSystemPrinterName } from './rawPrinterTransport'
import { buildReceipt } from './escpos/receiptBuilder'
import { buildToken } from './escpos/tokenBuilder'
import type { OrderDTO, ProductionTokenDTO } from '../../shared/types'

export interface PrintWarning {
  target: string
  message: string
}

const NO_DEFAULT_PRINTER_MESSAGE =
  'No Windows default printer found. Set a default printer in Windows Settings and try again.'

export async function printOrderBill(order: OrderDTO): Promise<PrintWarning[]> {
  const warnings: PrintWarning[] = []
  const settings = await getSettings()
  const prisma = getPrisma()

  const printerName = await getDefaultSystemPrinterName()
  if (!printerName) {
    warnings.push({ target: 'Customer Bill', message: NO_DEFAULT_PRINTER_MESSAGE })
    return warnings
  }

  try {
    const buffer = await buildReceipt(order, {
      shopName: settings.shopName,
      address: settings.address,
      phone: settings.phone,
      currency: settings.currency,
      widthMm: settings.billWidthMm
    })
    await sendRaw(buffer, printerName)
    await prisma.order.update({
      where: { id: order.id },
      data: { billPrintCount: { increment: 1 }, billPrintedAt: new Date() }
    })
  } catch (err) {
    warnings.push({ target: 'Customer Bill', message: (err as Error).message })
  }
  return warnings
}

export async function printSingleToken(token: ProductionTokenDTO): Promise<PrintWarning | null> {
  const settings = await getSettings()

  const printerName = await getDefaultSystemPrinterName()
  if (!printerName) {
    return { target: `Token #${String(token.tokenNumber).padStart(3, '0')}`, message: NO_DEFAULT_PRINTER_MESSAGE }
  }

  const buffer = buildToken(token, { shopName: settings.shopName, currency: settings.currency })

  try {
    await sendRaw(buffer, printerName)
    await markTokenPrinted(token.id)
    return null
  } catch (err) {
    return { target: `Token #${String(token.tokenNumber).padStart(3, '0')}`, message: (err as Error).message }
  }
}
