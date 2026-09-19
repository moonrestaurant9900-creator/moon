import bcrypt from 'bcryptjs'
import { getPrisma } from '../db'
import { requireAdmin } from '../session'
import { writeAuditLog } from './auditService'
import type { Role, UserDTO } from '../../shared/types'

function mapUser(row: any): UserDTO {
  return { id: row.id, name: row.name, username: row.username, role: row.role, active: row.active }
}

export async function listUsers(): Promise<UserDTO[]> {
  requireAdmin()
  const prisma = getPrisma()
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(mapUser)
}

const VALID_ROLES: Role[] = ['ADMIN', 'CASHIER']

export async function createUser(data: {
  name: string
  username: string
  password: string
  role: Role
}): Promise<UserDTO> {
  requireAdmin()
  const name = data.name?.trim() ?? ''
  const username = data.username?.trim() ?? ''
  if (!name) throw new Error('Name is required')
  if (!username) throw new Error('Username is required')
  if (!data.password || data.password.length < 4) throw new Error('Password must be at least 4 characters')
  if (!VALID_ROLES.includes(data.role)) throw new Error('Invalid role')

  const prisma = getPrisma()
  let row
  try {
    row = await prisma.user.create({
      data: {
        name,
        username,
        passwordHash: bcrypt.hashSync(data.password, 10),
        role: data.role
      }
    })
  } catch (err: any) {
    if (err?.code === 'P2002') throw new Error('That username is already taken')
    throw err
  }
  await writeAuditLog('CREATE', 'User', row.id, { username, role: data.role })
  return mapUser(row)
}

export async function updateUser(
  id: string,
  data: Partial<{ name: string; active: boolean; role: Role; password: string }>
): Promise<UserDTO> {
  requireAdmin()
  if (data.name !== undefined && !data.name.trim()) throw new Error('Name is required')
  if (data.role !== undefined && !VALID_ROLES.includes(data.role)) throw new Error('Invalid role')
  if (data.password !== undefined && data.password.length < 4) {
    throw new Error('Password must be at least 4 characters')
  }

  const prisma = getPrisma()
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name.trim()
  if (data.active !== undefined) updateData.active = data.active
  if (data.role !== undefined) updateData.role = data.role
  if (data.password) updateData.passwordHash = bcrypt.hashSync(data.password, 10)
  const row = await prisma.user.update({ where: { id }, data: updateData })
  await writeAuditLog('UPDATE', 'User', id, { ...data, password: data.password ? '(changed)' : undefined })
  return mapUser(row)
}
