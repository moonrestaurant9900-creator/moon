import type { SessionUser } from '../shared/types'

let currentUser: SessionUser | null = null

export function setCurrentUser(user: SessionUser | null): void {
  currentUser = user
}

export function getCurrentUser(): SessionUser | null {
  return currentUser
}

export function requireUser(): SessionUser {
  if (!currentUser) throw new Error('Not authenticated')
  return currentUser
}

export function requireAdmin(): SessionUser {
  const user = requireUser()
  if (user.role !== 'ADMIN') throw new Error('Admin privileges required')
  return user
}
