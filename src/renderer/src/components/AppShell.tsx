import { ReactNode, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, History, UtensilsCrossed, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import ConfirmDialog from './ConfirmDialog'
import logo from '../assets/logo.jpg'
import type { DashboardStats } from '../../../shared/types'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true },
  { to: '/pos', label: 'POS', icon: ShoppingCart, adminOnly: false },
  { to: '/sales', label: 'Bill History', icon: History, adminOnly: true },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, adminOnly: false },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true }
]

export default function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    const loadStats = (): void => {
      window.api.dashboard.stats().then(setStats)
    }
    loadStats()
    const interval = setInterval(loadStats, 8000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout(): Promise<void> {
    await window.api.auth.logout()
    setUser(null)
    navigate('/login')
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-ink-50">
      <header className="h-14 shrink-0 bg-white border-b border-ink-200 flex items-center px-4 gap-1">
        <div className="flex items-center gap-2 pr-4 mr-2 border-r border-ink-200">
          <img src={logo} alt="Moon Restaurant" className="w-7 h-7 rounded-full object-cover" />
          <span className="font-semibold text-ink-900 text-sm tracking-tight whitespace-nowrap">
            MOON RESTAURANT
          </span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.filter((l) => !l.adminOnly || user?.role === 'ADMIN').map((link) => {
            const Icon = link.icon
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-[13px] transition-colors ${
                    isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
                  }`
                }
              >
                <Icon size={15} strokeWidth={2} />
                {link.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="flex-1" />

        {stats && (
          <div className="text-right pr-4 mr-3">
            <div className="text-[10px] font-medium text-ink-400 uppercase tracking-wide leading-none">
              Today&apos;s Sales
            </div>
            <div className="text-sm font-semibold text-success-700 leading-tight mt-0.5">
              {currency}
              {stats.today.totalSales.toLocaleString()}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 pl-3 border-l border-ink-200">
          <div className="text-right leading-tight">
            <div className="text-[13px] font-semibold text-ink-900">{user?.name}</div>
            <div className="text-[11px] text-ink-400">{user?.role}</div>
          </div>
          <button
            onClick={() => setConfirmLogout(true)}
            title="Logout"
            className="w-8 h-8 flex items-center justify-center rounded-md text-ink-500 hover:bg-danger-50 hover:text-danger-600 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">{children}</main>

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        danger
        onConfirm={() => {
          setConfirmLogout(false)
          handleLogout()
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  )
}
