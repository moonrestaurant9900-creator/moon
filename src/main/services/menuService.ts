import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { getPrisma } from '../db'
import { requireAdmin, requireUser } from '../session'
import { writeAuditLog } from './auditService'
import type { CategoryDTO, MenuItemDTO, SizeMode } from '../../shared/types'

export function imagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function listCategories(includeInactive = false): Promise<CategoryDTO[]> {
  const prisma = getPrisma()
  const rows = await prisma.category.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { sortOrder: 'asc' }
  })
  return rows
}

export async function createCategory(name: string): Promise<CategoryDTO> {
  requireAdmin()
  const trimmed = name?.trim() ?? ''
  if (!trimmed) throw new Error('Category name is required')

  const prisma = getPrisma()
  const count = await prisma.category.count()
  let row
  try {
    row = await prisma.category.create({ data: { name: trimmed, sortOrder: count } })
  } catch (err: any) {
    if (err?.code === 'P2002') throw new Error('A category with that name already exists')
    throw err
  }
  await writeAuditLog('CREATE', 'Category', row.id, { name: trimmed })
  return row
}

export async function updateCategory(
  id: string,
  data: { name?: string; active?: boolean; sortOrder?: number }
): Promise<CategoryDTO> {
  requireAdmin()
  if (data.name !== undefined && !data.name.trim()) throw new Error('Category name is required')

  const prisma = getPrisma()
  let row
  try {
    row = await prisma.category.update({ where: { id }, data })
  } catch (err: any) {
    if (err?.code === 'P2002') throw new Error('A category with that name already exists')
    throw err
  }
  await writeAuditLog('UPDATE', 'Category', id, data)
  return row
}

function mapMenuItem(r: any): MenuItemDTO {
  return {
    id: r.id,
    name: r.name,
    sizeMode: r.sizeMode,
    price: r.price,
    halfPrice: r.halfPrice,
    fullPrice: r.fullPrice,
    imagePath: r.imagePath,
    available: r.available,
    active: r.active,
    categoryId: r.categoryId,
    categoryName: r.category.name
  }
}

interface PricingInput {
  sizeMode?: SizeMode
  price?: number | null
  halfPrice?: number | null
  fullPrice?: number | null
}

// Validates that a NORMAL item has a single positive price, and a HALF_FULL item has
// both a positive half and full price. Only checks fields the caller actually sent.
function validatePricing(data: PricingInput): void {
  if (data.sizeMode === undefined) return
  if (data.sizeMode === 'HALF_FULL') {
    if (!(data.halfPrice! > 0) || !(data.fullPrice! > 0)) {
      throw new Error('Half & Full items require both a Half Price and a Full Price greater than 0')
    }
  } else if (data.sizeMode === 'NORMAL') {
    if (!(data.price! > 0)) {
      throw new Error('This item requires a price greater than 0')
    }
  } else {
    throw new Error('Invalid size mode')
  }
}

export async function listMenuItems(includeInactive = false): Promise<MenuItemDTO[]> {
  const prisma = getPrisma()
  const rows = await prisma.menuItem.findMany({
    where: includeInactive ? {} : { active: true },
    include: { category: true },
    orderBy: { name: 'asc' }
  })
  return rows.map(mapMenuItem)
}

export async function createMenuItem(data: {
  name: string
  categoryId: string
  sizeMode: SizeMode
  price?: number | null
  halfPrice?: number | null
  fullPrice?: number | null
  imagePath?: string | null
}): Promise<MenuItemDTO> {
  requireUser()
  if (!data.name?.trim()) throw new Error('Item name is required')
  if (!data.categoryId) throw new Error('Category is required')
  validatePricing(data)
  const prisma = getPrisma()
  const row = await prisma.menuItem.create({
    data: {
      name: data.name.trim(),
      categoryId: data.categoryId,
      sizeMode: data.sizeMode,
      price: data.sizeMode === 'NORMAL' ? data.price ?? null : null,
      halfPrice: data.sizeMode === 'HALF_FULL' ? data.halfPrice ?? null : null,
      fullPrice: data.sizeMode === 'HALF_FULL' ? data.fullPrice ?? null : null,
      imagePath: data.imagePath || null
    },
    include: { category: true }
  })
  await writeAuditLog('CREATE', 'MenuItem', row.id, data)
  return mapMenuItem(row)
}

export async function updateMenuItem(
  id: string,
  data: Partial<{
    name: string
    categoryId: string
    sizeMode: SizeMode
    price: number | null
    halfPrice: number | null
    fullPrice: number | null
    imagePath: string | null
    available: boolean
    active: boolean
  }>
): Promise<MenuItemDTO> {
  requireUser()
  if (data.name !== undefined && !data.name.trim()) throw new Error('Item name is required')
  validatePricing(data)
  const prisma = getPrisma()
  const updateData: Record<string, unknown> = { ...data }
  // Switching size mode clears out the fields that no longer apply, so stale
  // pricing from the previous mode can never leak into an order.
  if (data.sizeMode === 'NORMAL') {
    updateData.halfPrice = null
    updateData.fullPrice = null
  } else if (data.sizeMode === 'HALF_FULL') {
    updateData.price = null
  }
  const row = await prisma.menuItem.update({
    where: { id },
    data: updateData,
    include: { category: true }
  })
  await writeAuditLog('UPDATE', 'MenuItem', id, data)
  return mapMenuItem(row)
}

export async function saveMenuItemImage(sourcePath: string): Promise<string> {
  requireUser()
  const ext = path.extname(sourcePath) || '.jpg'
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const destPath = path.join(imagesDir(), fileName)
  fs.copyFileSync(sourcePath, destPath)
  return fileName
}
