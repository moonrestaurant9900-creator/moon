import { dialog } from 'electron'
import fs from 'fs'
import ExcelJS from 'exceljs'
import { getPrisma } from '../db'
import { requireAdmin } from '../session'
import { getSettings } from './settingsService'

export interface ExportMonthResult {
  ok: boolean
  path?: string
  error?: string
}

function isCompletedMonth(year: number, month: number): boolean {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12
  return year < currentYear || (year === currentYear && month < currentMonth)
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Excel number-format literal text must be double-quoted and can't itself
// contain a double quote — strip any so a stray character in the currency
// setting can never produce a malformed format string.
function moneyFormat(currency: string): string {
  const safeCurrency = currency.replace(/"/g, '')
  return `"${safeCurrency}"#,##0`
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
  right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.border = THIN_BORDER
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 20
}

function addTitleRows(sheet: ExcelJS.Worksheet, columnCount: number, shopName: string, subtitle: string): void {
  const titleRow = sheet.addRow([shopName])
  sheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount)
  titleRow.getCell(1).font = { bold: true, size: 14 }
  titleRow.getCell(1).alignment = { horizontal: 'center' }

  const subtitleRow = sheet.addRow([subtitle])
  sheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, columnCount)
  subtitleRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF6B7280' } }
  subtitleRow.getCell(1).alignment = { horizontal: 'center' }

  sheet.addRow([])
}

/**
 * Generates a month-end Excel report (Daily Summary + Order Details) from
 * SQLite and lets the admin save it via Electron's native Save dialog. Only
 * PAID, non-deleted orders are read — nothing is written back to the
 * database, so the export never changes existing data.
 */
export async function exportMonthEndExcel(year: number, month: number): Promise<ExportMonthResult> {
  requireAdmin()

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: 'Invalid month' }
  }
  if (!isCompletedMonth(year, month)) {
    return { ok: false, error: 'Only a completed (past) month can be exported' }
  }

  const prisma = getPrisma()
  const settings = await getSettings()

  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

  const orders = await prisma.order.findMany({
    where: { status: 'PAID', isDeleted: false, paidAt: { gte: monthStart, lte: monthEnd } },
    include: { items: true, cashier: true, tokens: true },
    orderBy: { paidAt: 'asc' }
  })

  const dayCount = daysInMonth(year, month)
  const daily = Array.from({ length: dayCount }, (_, i) => ({ day: i + 1, sales: 0, orders: 0, tokens: 0 }))

  let monthlySales = 0
  let monthlyOrders = 0
  let monthlyTokens = 0

  for (const order of orders) {
    const bucket = daily[order.paidAt!.getDate() - 1]
    bucket.sales += order.total
    bucket.orders += 1
    bucket.tokens += order.tokens.length
    monthlySales += order.total
    monthlyOrders += 1
    monthlyTokens += order.tokens.length
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = settings.shopName
  workbook.created = new Date()

  const label = monthLabel(year, month)
  const money = moneyFormat(settings.currency)

  // ---- Sheet 1: Daily Summary ----
  // Column widths only — NOT `header`, since exceljs's `columns` setter writes
  // header text straight into row 1, which would collide with the title rows
  // added below (row 1 = shop name, not the column headers).
  const summary = workbook.addWorksheet('Daily Summary', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  summary.columns = [{ width: 16 }, { width: 16 }, { width: 16 }, { width: 22 }]
  addTitleRows(summary, 4, settings.shopName, `Month-End Sales Report — ${label}`)

  const summaryHeaderRow = summary.addRow(['Date', 'Total Sales', 'Total Orders', 'Total Production Tokens'])
  styleHeaderRow(summaryHeaderRow)
  summary.views = [{ state: 'frozen', ySplit: summaryHeaderRow.number }]

  for (const d of daily) {
    const row = summary.addRow([new Date(year, month - 1, d.day), d.sales, d.orders, d.tokens])
    row.getCell(1).numFmt = 'yyyy-mm-dd'
    row.getCell(2).numFmt = money
    row.getCell(3).numFmt = '#,##0'
    row.getCell(4).numFmt = '#,##0'
    row.eachCell((cell) => (cell.border = THIN_BORDER))
  }

  summary.addRow([])
  const summaryTotalRow = summary.addRow(['MONTHLY TOTAL', monthlySales, monthlyOrders, monthlyTokens])
  summaryTotalRow.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = TOTAL_FILL
    cell.border = THIN_BORDER
  })
  summaryTotalRow.getCell(2).numFmt = money
  summaryTotalRow.getCell(3).numFmt = '#,##0'
  summaryTotalRow.getCell(4).numFmt = '#,##0'

  // ---- Sheet 2: Order Details ----
  const details = workbook.addWorksheet('Order Details', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  details.columns = [
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 28 },
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 }
  ]
  addTitleRows(details, 10, settings.shopName, `Order Details — ${label}`)

  const detailsHeaderRow = details.addRow([
    'Order #',
    'Date',
    'Time',
    'Cashier',
    'Item',
    'Qty',
    'Unit Price',
    'Line Total',
    'Payment Method',
    'Order Total'
  ])
  styleHeaderRow(detailsHeaderRow)
  details.views = [{ state: 'frozen', ySplit: detailsHeaderRow.number }]

  for (const order of orders) {
    const activeItems = order.items.filter((it) => it.status === 'ACTIVE')
    for (const item of activeItems) {
      const row = details.addRow([
        order.orderNumber,
        order.paidAt,
        order.paidAt,
        order.cashier?.name ?? '',
        item.nameSnapshot,
        item.quantity,
        item.priceSnapshot,
        item.lineTotal,
        order.paymentMethod ?? '',
        order.total
      ])
      row.getCell(2).numFmt = 'yyyy-mm-dd'
      row.getCell(3).numFmt = 'hh:mm AM/PM'
      row.getCell(7).numFmt = money
      row.getCell(8).numFmt = money
      row.getCell(10).numFmt = money
      row.eachCell((cell) => (cell.border = THIN_BORDER))
    }
  }

  if (orders.length === 0) {
    const emptyRow = details.addRow(['No paid orders in this month'])
    details.mergeCells(emptyRow.number, 1, emptyRow.number, 10)
    emptyRow.getCell(1).alignment = { horizontal: 'center' }
    emptyRow.getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' } }
  }

  const buffer = await workbook.xlsx.writeBuffer()

  const defaultName = `${settings.shopName.replace(/[^\w -]/g, '')}-MonthEnd-${year}-${String(month).padStart(2, '0')}.xlsx`
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return { ok: false, error: 'cancelled' }

  fs.writeFileSync(filePath, Buffer.from(buffer))
  return { ok: true, path: filePath }
}
