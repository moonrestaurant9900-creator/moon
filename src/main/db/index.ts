import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { PrismaClient } from '@prisma/client'
import { MIGRATIONS } from './schemaSql'
import { seedDatabase } from './seed'

function resolveDbPath(): string {
  const userDataDir = app.getPath('userData')
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true })
  return path.join(userDataDir, 'moon-pos.db')
}

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

let prisma: PrismaClient | null = null
export let dbPath = ''

/**
 * Applies any embedded migration that hasn't run against this database file yet —
 * both for a brand-new database (every migration runs, in order) and for an existing
 * one that predates a given change (only the missing migrations run). No bundled
 * Prisma CLI/migration engine is needed at runtime.
 */
async function runMigrations(client: PrismaClient): Promise<void> {
  await client.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  )

  const appliedRows = await client.$queryRawUnsafe<Array<{ name: string }>>('SELECT name FROM _migrations')
  const applied = new Set(appliedRows.map((r) => r.name))

  // A database created before migration tracking existed already has the tables the
  // first migration would create. Baseline it (mark that migration applied without
  // re-running its CREATE TABLE statements) instead of failing on "table already exists".
  if (applied.size === 0 && MIGRATIONS.length > 0) {
    const legacyTables = await client.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='User'"
    )
    if (legacyTables.length > 0) {
      const baseline = MIGRATIONS[0].name
      await client.$executeRawUnsafe(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        baseline,
        new Date().toISOString()
      )
      applied.add(baseline)
    }
  }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue
    const statements = splitStatements(migration.sql)
    // A migration with several DDL statements must apply as a single unit — if the
    // process dies partway through (e.g. statement 2 of 3), an un-transacted loop
    // would leave the DB half-migrated AND unmarked, so the next launch retries from
    // statement 1 and immediately fails with "table already exists", bricking startup.
    // SQLite supports transactional DDL, so wrap the whole migration (including the
    // bookkeeping insert) in one transaction: either all of it lands, or none of it does.
    try {
      await client.$executeRawUnsafe('BEGIN')
      for (const statement of statements) {
        await client.$executeRawUnsafe(statement)
      }
      await client.$executeRawUnsafe(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        migration.name,
        new Date().toISOString()
      )
      await client.$executeRawUnsafe('COMMIT')
    } catch (err) {
      await client.$executeRawUnsafe('ROLLBACK').catch(() => {})
      throw err
    }
  }
}

export async function initDatabase(): Promise<PrismaClient> {
  if (prisma) return prisma

  dbPath = resolveDbPath()
  process.env.DATABASE_URL = `file:${dbPath}`

  const client = new PrismaClient()

  await runMigrations(client)
  await seedDatabase(client)

  prisma = client
  return prisma
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized — call initDatabase() first')
  }
  return prisma
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = null
  }
}

export function backupDatabasePath(): string {
  return dbPath
}
