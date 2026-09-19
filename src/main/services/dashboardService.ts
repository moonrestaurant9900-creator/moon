import { getPrisma } from '../db'
import type { DashboardStats, DateSalesRow, PeriodSalesStats } from '../../shared/types'

// Business date = local midnight (12:00 AM) through 11:59:59.999 PM of the same day.
function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(): Date {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Business date = local midnight (12:00 AM) through 11:59:59.999 PM of the same day.
// Parsing without a "Z" suffix keeps the boundary anchored to local time, not UTC,
// so sales are never blended across dates in any timezone.
function dayBounds(dateStr: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStr}T00:00:00`),
    end: new Date(`${dateStr}T23:59:59.999`)
  }
}

// Sales, orders and tokens for [start, now] — or unbounded when start is omitted
// (All Time). The dashboard is a sales summary, so every figure — including the
// token count — only reflects orders that were actually completed and paid;
// abandoned/unpaid draft orders never appear here.
async function periodStats(start?: Date): Promise<PeriodSalesStats> {
  const prisma = getPrisma()
  const paidWhere = start
    ? { status: 'PAID', isDeleted: false, paidAt: { gte: start } }
    : { status: 'PAID', isDeleted: false }
  const tokenWhere = start
    ? { createdAt: { gte: start }, order: { status: 'PAID' as const, isDeleted: false } }
    : { order: { status: 'PAID' as const, isDeleted: false } }

  const [paid, orders, tokens] = await Promise.all([
    prisma.order.aggregate({ _sum: { total: true, discount: true }, where: paidWhere }),
    prisma.order.count({ where: paidWhere }),
    prisma.productionToken.count({ where: tokenWhere })
  ])

  return {
    totalSales: paid._sum.total ?? 0,
    totalOrders: orders,
    totalTokens: tokens,
    totalDiscount: paid._sum.discount ?? 0
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [today, thisMonth, allTime] = await Promise.all([
    periodStats(startOfToday()),
    periodStats(startOfMonth()),
    periodStats(undefined)
  ])
  return { today, thisMonth, allTime }
}

/**
 * Per-business-date sales breakdown for the inclusive [fromDateStr, toDateStr] range
 * (YYYY-MM-DD, local dates). Each row is computed from its own midnight-to-midnight
 * window, so figures are never mixed between dates. Most recent date first.
 */
export async function getSalesByDate(fromDateStr: string, toDateStr: string): Promise<DateSalesRow[]> {
  const prisma = getPrisma()

  const cursor = new Date(`${fromDateStr}T00:00:00`)
  const endCursor = new Date(`${toDateStr}T00:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(endCursor.getTime()) || cursor > endCursor) {
    throw new Error('Invalid date range')
  }
  // A caller-supplied range this wide is never a real business need and would fan
  // out into thousands of parallel per-day queries — cap it defensively rather
  // than trusting the renderer's date pickers to always stay reasonable.
  const MAX_RANGE_DAYS = 366
  if ((endCursor.getTime() - cursor.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    throw new Error(`Date range too large — maximum ${MAX_RANGE_DAYS} days`)
  }

  const dates: string[] = []
  while (cursor <= endCursor) {
    dates.push(formatDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const rows = await Promise.all(
    dates.map(async (dateStr): Promise<DateSalesRow> => {
      const { start, end } = dayBounds(dateStr)
      const [paid, orders, tokens] = await Promise.all([
        prisma.order.aggregate({
          _sum: { total: true },
          where: { status: 'PAID', isDeleted: false, paidAt: { gte: start, lte: end } }
        }),
        prisma.order.count({ where: { isDeleted: false, createdAt: { gte: start, lte: end } } }),
        prisma.productionToken.count({ where: { createdAt: { gte: start, lte: end } } })
      ])
      return {
        date: dateStr,
        paidSales: paid._sum.total ?? 0,
        orders,
        tokens
      }
    })
  )

  return rows.reverse()
}
