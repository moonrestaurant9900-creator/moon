import type { Prisma, PrismaClient } from '@prisma/client'
import { getPrisma } from '../db'
import { getCurrentUser } from '../session'

type Client = PrismaClient | Prisma.TransactionClient

export async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
  client?: Client
): Promise<void> {
  const prisma = client ?? getPrisma()
  const user = getCurrentUser()
  await prisma.auditLog.create({
    data: {
      userId: user?.id ?? null,
      action,
      entityType,
      entityId,
      details: JSON.stringify(details)
    }
  })
}
