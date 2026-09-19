import { ipcMain } from 'electron'
import * as orderService from '../services/orderService'
import * as tokenService from '../services/tokenService'
import { printOrderBill, printSingleToken } from '../printing/printDispatcher'
import type { SubmitOrderInput } from '../../shared/types'

export function registerOrderIpc(): void {
  // Pure persistence — creates/updates the order and its line items only.
  // No printing happens here: bill printing and token printing are separate,
  // explicit actions the cashier triggers from the UI.
  ipcMain.handle('orders:submit', async (_e, input: SubmitOrderInput) => {
    return orderService.submitOrder(input)
  })

  ipcMain.handle('orders:get', async (_e, orderId: string) => orderService.getOrder(orderId))
  ipcMain.handle('orders:cancel', async (_e, orderId: string) => orderService.cancelOrder(orderId))
  ipcMain.handle('orders:delete', async (_e, orderId: string) => orderService.deleteOrder(orderId))
  ipcMain.handle('orders:listPaid', async (_e, from?: string, to?: string) =>
    orderService.listPaidOrders(from ? new Date(from) : undefined, to ? new Date(to) : undefined)
  )
  ipcMain.handle('orders:listAll', async () => orderService.listAllBills())

  ipcMain.handle('orders:reprintBill', async (_e, orderId: string) => {
    const order = await orderService.getOrder(orderId)
    if (!order) throw new Error('Order not found')
    const warnings = await printOrderBill(order)
    return { warnings }
  })

  // PRINT TOKEN / REPRINT TOKEN for a single cart line. Creates the token the first
  // time (PRINT TOKEN); every later call reuses the same token number (REPRINT TOKEN).
  ipcMain.handle('orders:printItemToken', async (_e, orderItemId: string) => {
    const { token, isNew } = await tokenService.ensureTokenForOrderItem(orderItemId)
    const warning = await printSingleToken(token)
    return { token, isNew, warning: warning ?? undefined }
  })
}
