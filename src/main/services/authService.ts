import bcrypt from 'bcryptjs'
import { getPrisma } from '../db'
import { setCurrentUser, getCurrentUser } from '../session'
import { writeAuditLog } from './auditService'
import type { LoginResult, SessionUser } from '../../shared/types'

export async function login(username: string, password: string): Promise<LoginResult> {
  const prisma = getPrisma()
  const user = await prisma.user.findUnique({ where: { username: username.trim() } })
  if (!user || !user.active) {
    return { ok: false, error: 'Invalid username or password' }
  }
  const matches = bcrypt.compareSync(password, user.passwordHash)
  if (!matches) {
    return { ok: false, error: 'Invalid username or password' }
  }
  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role as SessionUser['role']
  }
  setCurrentUser(sessionUser)
  await writeAuditLog('LOGIN', 'User', user.id, {})
  return { ok: true, user: sessionUser }
}

export async function logout(): Promise<void> {
  const user = getCurrentUser()
  if (user) await writeAuditLog('LOGOUT', 'User', user.id, {})
  setCurrentUser(null)
}

export function currentSession(): SessionUser | null {
  return getCurrentUser()
}
