import { contextBridge, ipcRenderer } from 'electron'
import type {
  CategoryDTO,
  DashboardStats,
  DateSalesRow,
  MenuItemDTO,
  OrderDTO,
  PrintItemTokenResult,
  Role,
  SessionUser,
  SettingsDTO,
  SizeMode,
  SubmitOrderInput,
  SubmitOrderResult,
  UserDTO,
  LoginResult
} from '../shared/types'

const api = {
  auth: {
    login: (username: string, password: string): Promise<LoginResult> =>
      ipcRenderer.invoke('auth:login', username, password),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
    currentUser: (): Promise<SessionUser | null> => ipcRenderer.invoke('auth:currentUser')
  },
  menu: {
    listCategories: (includeInactive?: boolean): Promise<CategoryDTO[]> =>
      ipcRenderer.invoke('menu:listCategories', includeInactive),
    createCategory: (name: string): Promise<CategoryDTO> => ipcRenderer.invoke('menu:createCategory', name),
    updateCategory: (id: string, data: Partial<CategoryDTO>): Promise<CategoryDTO> =>
      ipcRenderer.invoke('menu:updateCategory', id, data),

    listItems: (includeInactive?: boolean): Promise<MenuItemDTO[]> =>
      ipcRenderer.invoke('menu:listItems', includeInactive),
    createItem: (data: {
      name: string
      categoryId: string
      sizeMode: SizeMode
      price?: number | null
      halfPrice?: number | null
      fullPrice?: number | null
      imagePath?: string | null
    }): Promise<MenuItemDTO> => ipcRenderer.invoke('menu:createItem', data),
    updateItem: (id: string, data: Partial<MenuItemDTO>): Promise<MenuItemDTO> =>
      ipcRenderer.invoke('menu:updateItem', id, data),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke('menu:pickImage')
  },
  orders: {
    submit: (input: SubmitOrderInput): Promise<SubmitOrderResult> => ipcRenderer.invoke('orders:submit', input),
    get: (orderId: string): Promise<OrderDTO | null> => ipcRenderer.invoke('orders:get', orderId),
    cancel: (orderId: string): Promise<OrderDTO> => ipcRenderer.invoke('orders:cancel', orderId),
    delete: (orderId: string): Promise<void> => ipcRenderer.invoke('orders:delete', orderId),
    listPaid: (from?: string, to?: string): Promise<OrderDTO[]> =>
      ipcRenderer.invoke('orders:listPaid', from, to),
    listAll: (): Promise<OrderDTO[]> => ipcRenderer.invoke('orders:listAll'),
    reprintBill: (orderId: string): Promise<{ warnings: { target: string; message: string }[] }> =>
      ipcRenderer.invoke('orders:reprintBill', orderId),
    printItemToken: (orderItemId: string): Promise<PrintItemTokenResult> =>
      ipcRenderer.invoke('orders:printItemToken', orderItemId)
  },
  dashboard: {
    stats: (): Promise<DashboardStats> => ipcRenderer.invoke('dashboard:stats'),
    salesByDate: (from?: string, to?: string): Promise<DateSalesRow[]> =>
      ipcRenderer.invoke('dashboard:salesByDate', from, to)
  },
  settings: {
    get: (): Promise<SettingsDTO> => ipcRenderer.invoke('settings:get'),
    update: (partial: Partial<SettingsDTO>): Promise<SettingsDTO> => ipcRenderer.invoke('settings:update', partial)
  },
  users: {
    list: (): Promise<UserDTO[]> => ipcRenderer.invoke('users:list'),
    create: (data: { name: string; username: string; password: string; role: Role }): Promise<UserDTO> =>
      ipcRenderer.invoke('users:create', data),
    update: (
      id: string,
      data: Partial<{ name: string; active: boolean; role: Role; password: string }>
    ): Promise<UserDTO> => ipcRenderer.invoke('users:update', id, data)
  },
  backup: {
    create: (): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('backup:create'),
    restore: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('backup:restore')
  },
  export: {
    monthEnd: (year: number, month: number): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('export:monthEnd', year, month)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
