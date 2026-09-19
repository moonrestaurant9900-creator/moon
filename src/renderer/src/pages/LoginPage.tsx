import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import logo from '../assets/logo.jpg'

export default function LoginPage(): JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await window.api.auth.login(username, password)
      if (!result.ok || !result.user) {
        setError(result.error ?? 'Login failed')
        return
      }
      setUser(result.user)
      navigate(result.user.role === 'ADMIN' ? '/dashboard' : '/pos')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-ink-100">
      <form onSubmit={handleSubmit} className="bg-white border border-ink-200 rounded-lg shadow-card w-[380px] p-9">
        <div className="text-center mb-8">
          <img
            src={logo}
            alt="Moon Restaurant"
            className="w-16 h-16 mx-auto mb-4 rounded-full object-cover border border-ink-200 shadow-xs"
          />
          <h1 className="text-lg font-semibold text-ink-900 tracking-tight">MOON RESTAURANT</h1>
          <p className="text-ink-500 text-sm mt-1">Point of Sale</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-danger-50 text-danger-700 text-sm px-3 py-2.5 font-medium border border-danger-100">
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold text-ink-600 mb-1.5 uppercase tracking-wide">Username</label>
        <div className="relative mb-4">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-ink-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400"
            placeholder="admin"
          />
        </div>

        <label className="block text-xs font-semibold text-ink-600 mb-1.5 uppercase tracking-wide">Password</label>
        <div className="relative mb-6">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-ink-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-ink-900 hover:bg-ink-950 disabled:opacity-50 text-white font-semibold text-sm rounded-md py-2.5 transition-colors"
        >
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
