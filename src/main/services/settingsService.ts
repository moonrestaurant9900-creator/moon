import { getPrisma } from '../db'
import { requireAdmin } from '../session'
import { writeAuditLog } from './auditService'
import type { SettingsDTO } from '../../shared/types'

const DEFAULTS: SettingsDTO = {
  shopName: 'MOON RESTAURANT',
  address: '',
  phone: '',
  currency: 'Rs.',
  taxRatePercent: 0,
  discountEnabled: true,
  billWidthMm: 80
}

export async function getSettings(): Promise<SettingsDTO> {
  const prisma = getPrisma()
  const rows = await prisma.settings.findMany()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    shopName: map.get('shopName') ?? DEFAULTS.shopName,
    address: map.get('address') ?? DEFAULTS.address,
    phone: map.get('phone') ?? DEFAULTS.phone,
    currency: map.get('currency') ?? DEFAULTS.currency,
    taxRatePercent: Number(map.get('taxRatePercent') ?? DEFAULTS.taxRatePercent),
    discountEnabled: (map.get('discountEnabled') ?? 'true') === 'true',
    billWidthMm: Number(map.get('billWidthMm') ?? DEFAULTS.billWidthMm)
  }
}

// Settings is a free-form key/value table, so nothing at the DB layer stops an
// unexpected key or an out-of-range number from being written — enforce both here.
const ALLOWED_KEYS = new Set<keyof SettingsDTO>([
  'shopName',
  'address',
  'phone',
  'currency',
  'taxRatePercent',
  'discountEnabled',
  'billWidthMm'
])

function validateSettingValue(key: keyof SettingsDTO, value: unknown): void {
  if (key === 'shopName' && !String(value).trim()) {
    throw new Error('Shop name is required')
  }
  if (key === 'taxRatePercent') {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Tax rate must be between 0 and 100')
  }
  if (key === 'billWidthMm') {
    const n = Number(value)
    if (n !== 58 && n !== 80) throw new Error('Bill width must be 58 or 80mm')
  }
}

export async function updateSettings(partial: Partial<SettingsDTO>): Promise<SettingsDTO> {
  requireAdmin()
  const prisma = getPrisma()
  const entries = Object.entries(partial) as [keyof SettingsDTO, unknown][]
  for (const [key, value] of entries) {
    if (!ALLOWED_KEYS.has(key)) continue
    validateSettingValue(key, value)
    await prisma.settings.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) }
    })
  }
  await writeAuditLog('UPDATE', 'Settings', 'global', partial)
  return getSettings()
}
