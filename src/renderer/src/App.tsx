import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import LoginPage from './pages/LoginPage'
import PosPage from './pages/PosPage'
import DashboardPage from './pages/DashboardPage'
import MenuManagementPage from './pages/MenuManagementPage'
import SettingsPage from './pages/SettingsPage'
import SalesHistoryPage from './pages/SalesHistoryPage'
import AppShell from './components/AppShell'
import ToastHost from './components/ToastHost'

function RequireAuth({ children, adminOnly }: { children: JSX.Element; adminOnly?: boolean }): JSX.Element {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'ADMIN') return <Navigate to="/pos" replace />
  return children
}

export default function App(): JSX.Element {
  const { user, setUser, setLoading } = useAuthStore()
  const refreshSettings = useSettingsStore((s) => s.refresh)

  useEffect(() => {
    window.api.auth
      .currentUser()
      .then((u) => setUser(u))
      .finally(() => setLoading(false))
    refreshSettings()
  }, [])

  return (
    <>
      <ToastHost />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/pos" replace /> : <LoginPage />} />
        <Route
          path="/pos"
          element={
            <RequireAuth>
              <AppShell>
                <PosPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth adminOnly>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/menu"
          element={
            <RequireAuth>
              <AppShell>
                <MenuManagementPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/sales"
          element={
            <RequireAuth adminOnly>
              <AppShell>
                <SalesHistoryPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth adminOnly>
              <AppShell>
                <SettingsPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={user ? '/pos' : '/login'} replace />} />
      </Routes>
    </>
  )
}
