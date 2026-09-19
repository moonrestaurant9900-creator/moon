import { useEffect, useState } from 'react'
import { Wallet, Ticket, Receipt, Percent } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import type { DashboardStats, PeriodSalesStats } from '../../../shared/types'

const METRICS: Array<{
  key: keyof PeriodSalesStats
  label: string
  money?: boolean
  icon: typeof Wallet
  tone: 'success' | 'neutral'
}> = [
  { key: 'totalSales', label: 'Total Sales', money: true, icon: Wallet, tone: 'success' },
  { key: 'totalOrders', label: 'Total Orders', icon: Receipt, tone: 'neutral' },
  { key: 'totalTokens', label: 'Production Tokens', icon: Ticket, tone: 'neutral' },
  { key: 'totalDiscount', label: 'Total Discount', money: true, icon: Percent, tone: 'neutral' }
]

const TONE_STYLE: Record<string, string> = {
  success: 'text-success-600 bg-success-50',
  neutral: 'text-ink-600 bg-ink-100'
}

const SECTIONS: Array<{ key: keyof DashboardStats; title: string; subtitle: string }> = [
  { key: 'today', title: 'Today', subtitle: '12:00 AM – 11:59:59 PM' },
  { key: 'thisMonth', title: 'This Month', subtitle: 'Current calendar month' },
  { key: 'allTime', title: 'All Time', subtitle: 'Since system start' }
]

function SalesSection({
  title,
  subtitle,
  stats,
  currency
}: {
  title: string
  subtitle: string
  stats: PeriodSalesStats | null
  currency: string
}): JSX.Element {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
        <span className="text-[11px] text-ink-400">{subtitle}</span>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {METRICS.map((metric) => {
          const Icon = metric.icon
          return (
            <div key={metric.key} className="bg-white rounded-lg border border-ink-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-medium text-ink-500">{metric.label}</span>
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${TONE_STYLE[metric.tone]}`}>
                  <Icon size={14} />
                </div>
              </div>
              <div className="text-2xl font-semibold text-ink-900 tabular-nums">
                {stats ? (metric.money ? `${currency}${stats[metric.key].toLocaleString()}` : stats[metric.key]) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function DashboardPage(): JSX.Element {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')

  useEffect(() => {
    const load = (): void => {
      window.api.dashboard.stats().then(setStats)
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h1 className="text-lg font-semibold text-ink-900 mb-5">Dashboard</h1>
      <div className="space-y-6 max-w-4xl">
        {SECTIONS.map((section) => (
          <SalesSection
            key={section.key}
            title={section.title}
            subtitle={section.subtitle}
            stats={stats ? stats[section.key] : null}
            currency={currency}
          />
        ))}
      </div>
    </div>
  )
}
