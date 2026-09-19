// Shared between main, preload and renderer processes.

export type Role = 'ADMIN' | 'CASHIER'
export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED'
export type TokenStatus = 'QUEUED' | 'PRINTED' | 'CANCELLED'
export type PaymentMethod = 'CASH' | 'ONLINE' | 'OTHER'
export type SizeMode = 'NORMAL' | 'HALF_FULL'
export type ItemSize = 'HALF' | 'FULL'

export interface SessionUser {
  id: string
  name: string
  username: string
  role: Role
}

export interface CategoryDTO {
  id: string
  name: string
  sortOrder: number
  active: boolean
}

export interface MenuItemDTO {
  id: string
  name: string
  sizeMode: SizeMode
  price: number | null
  halfPrice: number | null
  fullPrice: number | null
  imagePath: string | null
  available: boolean
  active: boolean
  categoryId: string
  categoryName?: string
}

export interface CartLineInput {
  menuItemId: string
  quantity: number
  size?: ItemSize | null
}

export interface SubmitOrderInput {
  orderId?: string | null
  lines: CartLineInput[]
  discount?: number
  markPaidNow?: boolean
  paymentMethod?: PaymentMethod
  clientRequestId: string
}

export interface OrderItemDTO {
  id: string
  menuItemId: string | null
  nameSnapshot: string
  priceSnapshot: number
  variant: ItemSize | null
  quantity: number
  lineTotal: number
  status: 'ACTIVE' | 'REMOVED'
  tokenNumber?: number | null
  tokenStatus?: TokenStatus | null
}

export interface OrderDTO {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: PaymentMethod | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  cashierName?: string
  items: OrderItemDTO[]
}

export interface ProductionTokenDTO {
  id: string
  tokenNumber: number
  orderId: string
  orderNumber: string
  itemName: string
  quantity: number
  unitPrice: number
  status: TokenStatus
  printCount: number
  createdAt: string
}

export interface PrintWarningDTO {
  target: string
  message: string
}

export interface SubmitOrderResult {
  order: OrderDTO
}

export interface PrintItemTokenResult {
  token: ProductionTokenDTO
  isNew: boolean
  warning?: PrintWarningDTO
}

// One paid-orders-only summary for a date range (or unbounded, for All Time).
export interface PeriodSalesStats {
  totalSales: number
  totalOrders: number
  totalTokens: number
  totalDiscount: number
}

export interface DashboardStats {
  today: PeriodSalesStats
  thisMonth: PeriodSalesStats
  allTime: PeriodSalesStats
}

// One row per business date (local midnight to 11:59:59.999 PM) — never blended together.
export interface DateSalesRow {
  date: string // YYYY-MM-DD, local business date
  paidSales: number
  orders: number
  tokens: number
}

export interface SettingsDTO {
  shopName: string
  address: string
  phone: string
  currency: string
  taxRatePercent: number
  discountEnabled: boolean
  billWidthMm: number
}

// Internal to the main process (rawPrinterTransport) — never exposed to the
// renderer, since the POS never asks the cashier to pick a printer.
export interface SystemPrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface UserDTO {
  id: string
  name: string
  username: string
  role: Role
  active: boolean
}

export interface LoginResult {
  ok: boolean
  error?: string
  user?: SessionUser
}
