import { initDatabase, getPrisma } from '../src/main/db'
import { setCurrentUser } from '../src/main/session'
import { submitOrder, getOrder, markOrderPaid, cancelOrder, listAllBills, deleteOrder } from '../src/main/services/orderService'
import { ensureTokenForOrderItem } from '../src/main/services/tokenService'
import { getDashboardStats, getSalesByDate } from '../src/main/services/dashboardService'
import { createCategory, createMenuItem } from '../src/main/services/menuService'
import { createUser } from '../src/main/services/userService'
import { updateSettings } from '../src/main/services/settingsService'

let passed = 0
let failed = 0

function assert(condition: unknown, message: string): void {
  if (condition) {
    passed++
    console.log(`  ok  - ${message}`)
  } else {
    failed++
    console.error(`FAIL  - ${message}`)
  }
}

async function main(): Promise<void> {
  await initDatabase()
  const prisma = getPrisma()

  const cashier = await prisma.user.findUniqueOrThrow({ where: { username: 'cashier' } })
  setCurrentUser({ id: cashier.id, name: cashier.name, username: cashier.username, role: 'CASHIER' as const })

  const menuItem = (name: string) => prisma.menuItem.findFirstOrThrow({ where: { name } })
  const karahi = await menuItem('Chicken Karahi') // sizeMode HALF_FULL: halfPrice 500, fullPrice 900
  const karahiPrice = karahi.fullPrice!
  const tikka = await menuItem('Chicken Tikka')
  const naan = await menuItem('Naan')
  const coldDrink = await menuItem('Cold Drink')
  const fries = await menuItem('French Fries')

  console.log('\n== Step 1: add items to cart, PRINT BILL not clicked yet — no sections anywhere ==')
  const create = await submitOrder({
    lines: [
      { menuItemId: karahi.id, quantity: 2, size: 'FULL' },
      { menuItemId: tikka.id, quantity: 3 },
      { menuItemId: naan.id, quantity: 5 },
      { menuItemId: coldDrink.id, quantity: 2 }
    ],
    clientRequestId: 'test-create-1'
  })

  assert(create.order.orderNumber === 'ORD-1001', `order number is ORD-1001 (got ${create.order.orderNumber})`)
  assert(create.order.status === 'PENDING', 'new order is PENDING')
  assert(create.order.items.length === 4, `order has exactly 4 order items (got ${create.order.items.length})`)
  assert(
    create.order.items.every((i) => !('sectionSnapshot' in i)),
    'order items carry no section field at all'
  )

  const tokenCountAfterCreate = await prisma.productionToken.count()
  assert(tokenCountAfterCreate === 0, `NO tokens were auto-created just by adding items to the order (got ${tokenCountAfterCreate})`)

  const naanItemId = create.order.items.find((i) => i.nameSnapshot === 'Naan')!.id
  const tikkaItemId = create.order.items.find((i) => i.nameSnapshot === 'Chicken Tikka')!.id

  console.log('\n== Step 2: PRINT TOKEN for the Naan line only ==')
  const naanToken1 = await ensureTokenForOrderItem(naanItemId)
  assert(naanToken1.isNew === true, 'first PRINT TOKEN click creates a new token')
  assert(naanToken1.token.tokenNumber === 1, `first token is #001 (got #${naanToken1.token.tokenNumber})`)
  assert((await prisma.productionToken.count()) === 1, 'exactly 1 token exists after printing just the Naan line')

  console.log('\n== Step 3: PRINT TOKEN for the Tikka line ==')
  const tikkaToken1 = await ensureTokenForOrderItem(tikkaItemId)
  assert(tikkaToken1.isNew === true, 'PRINT TOKEN on a second line also creates a new token')
  assert(tikkaToken1.token.tokenNumber === 2, `second token is #002 (got #${tikkaToken1.token.tokenNumber})`)
  assert((await prisma.productionToken.count()) === 2, 'exactly 2 tokens exist now')

  console.log('\n== Step 4: REPRINT TOKEN for Naan — must reuse the same number ==')
  const naanToken2 = await ensureTokenForOrderItem(naanItemId)
  assert(naanToken2.isNew === false, 'clicking the button again is a REPRINT, not a new token')
  assert(naanToken2.token.tokenNumber === naanToken1.token.tokenNumber, 'reprinted token number is identical to the original')
  assert((await prisma.productionToken.count()) === 2, 'token count unchanged after a reprint')

  console.log('\n== Step 5: edit — bump Naan 5->8 (no new token), add Fries (no auto token), remove Cold Drink (never had a token) ==')
  const edit = await submitOrder({
    orderId: create.order.id,
    lines: [
      { menuItemId: karahi.id, quantity: 2, size: 'FULL' },
      { menuItemId: tikka.id, quantity: 3 },
      { menuItemId: naan.id, quantity: 8 },
      { menuItemId: fries.id, quantity: 2 }
      // coldDrink omitted => removed
    ],
    clientRequestId: 'test-edit-1'
  })

  assert((await prisma.productionToken.count()) === 2, 'editing quantities/adding a line creates NO new tokens by itself')

  const naanTokenRow = await prisma.productionToken.findUnique({ where: { orderItemId: naanItemId } })
  assert(naanTokenRow?.quantity === 8, `Naan's already-printed token quantity silently synced to 8 (got ${naanTokenRow?.quantity})`)
  assert(naanTokenRow?.tokenNumber === naanToken1.token.tokenNumber, 'Naan token number did not change when quantity changed')

  const friesItem = edit.order.items.find((i) => i.nameSnapshot === 'French Fries' && i.status === 'ACTIVE')!
  assert(friesItem.tokenNumber == null, 'newly added Fries line has NO token yet — must be explicitly printed')

  const removedDrink = edit.order.items.find((i) => i.nameSnapshot === 'Cold Drink')!
  assert(removedDrink.status === 'REMOVED', 'Cold Drink line marked REMOVED, not deleted')

  console.log('\n== Step 6: PRINT TOKEN for the newly added Fries line ==')
  const friesToken = await ensureTokenForOrderItem(friesItem.id)
  assert(friesToken.isNew === true, 'Fries gets its own new token when explicitly printed')
  assert(friesToken.token.tokenNumber === 3, `Fries token is #003 (got #${friesToken.token.tokenNumber})`)
  assert((await prisma.productionToken.count()) === 3, 'exactly 3 tokens exist now')

  console.log('\n== Step 7: remove an item that DOES have a printed token (Tikka) ==')
  const edit2 = await submitOrder({
    orderId: create.order.id,
    lines: [
      { menuItemId: karahi.id, quantity: 2, size: 'FULL' },
      { menuItemId: naan.id, quantity: 8 },
      { menuItemId: fries.id, quantity: 2 }
      // tikka removed this time
    ],
    clientRequestId: 'test-edit-2'
  })
  const removedTikka = edit2.order.items.find((i) => i.nameSnapshot === 'Chicken Tikka')!
  assert(removedTikka.status === 'REMOVED', 'Tikka line marked REMOVED')
  const tikkaTokenRow = await prisma.productionToken.findUnique({ where: { orderItemId: tikkaItemId } })
  assert(tikkaTokenRow?.status === 'CANCELLED', 'Tikka token marked CANCELLED, kept for audit history (not deleted)')
  assert((await prisma.productionToken.count()) === 3, 'removing an item never deletes or creates tokens — still 3 total')

  const expectedTotal = 2 * karahiPrice + 8 * naan.price + 2 * fries.price
  assert(edit2.order.total === expectedTotal, `recalculated total is correct (${edit2.order.total} === ${expectedTotal})`)

  console.log('\n== Step 8: PRINT BILL is purely a bill fetch — creates/prints no tokens ==')
  const beforeBillTokenCount = await prisma.productionToken.count()
  const billOrder = await getOrder(create.order.id)
  assert(billOrder!.orderNumber === 'ORD-1001', 'bill fetch returns the same order, same number')
  assert((await prisma.productionToken.count()) === beforeBillTokenCount, 'fetching the bill does not touch tokens at all')

  console.log('\n== Step 9: mark paid ==')
  const paid = await markOrderPaid(create.order.id, 'CASH')
  assert(paid.status === 'PAID', 'order status is PAID')
  assert(paid.paymentMethod === 'CASH', 'payment method recorded as CASH')
  assert(paid.paidAt !== null, 'paidAt timestamp set')

  console.log('\n== Step 10: reprint bill/order does not create new order/tokens ==')
  const orderCountFinal = await prisma.order.count()
  assert(orderCountFinal === 1, `still exactly 1 order in DB (got ${orderCountFinal})`)
  const tokenCountFinal = await prisma.productionToken.count()
  assert(tokenCountFinal === 3, `still exactly 3 tokens in DB (got ${tokenCountFinal})`)

  console.log('\n== Step 11: dashboard reflects paid sale ==')
  const stats = await getDashboardStats()
  assert(
    stats.today.totalSales === expectedTotal,
    `today's paid sales equals ${expectedTotal} (got ${stats.today.totalSales})`
  )
  assert(stats.today.totalOrders === 1, `today's total orders is 1 (got ${stats.today.totalOrders})`)
  assert(
    stats.thisMonth.totalSales >= stats.today.totalSales,
    'this month sales include at least today\'s sales'
  )
  assert(
    stats.allTime.totalSales >= stats.thisMonth.totalSales,
    'all-time sales include at least this month\'s sales'
  )

  console.log('\n== Step 11b: date-wise sales — today matches dashboard, never blended with other dates ==')
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  const byDate = await getSalesByDate(yesterdayStr, todayStr)
  assert(byDate.length === 2, `date range returns exactly 2 rows (got ${byDate.length})`)
  assert(byDate[0].date === todayStr, 'most recent date (today) is first')
  const todayRow = byDate.find((r) => r.date === todayStr)!
  const yesterdayRow = byDate.find((r) => r.date === yesterdayStr)!
  assert(
    todayRow.paidSales === stats.today.totalSales,
    `date-wise paid sales for today matches dashboard (${todayRow.paidSales})`
  )
  assert(todayRow.tokens === 3, `date-wise token count for today is 3 (got ${todayRow.tokens})`)
  assert(yesterdayRow.paidSales === 0 && yesterdayRow.orders === 0, "yesterday's row is zero — today's activity is not blended into it")

  console.log('\n== Step 12: duplicate-submit protection (same clientRequestId) ==')
  const dup = await submitOrder({
    lines: [{ menuItemId: karahi.id, quantity: 999, size: 'FULL' }], // deliberately different — must be ignored
    clientRequestId: 'test-create-1'
  })
  assert(dup.order.id === create.order.id, 'repeated clientRequestId returns the cached original result, no new order')

  console.log('\n== Step 13: new customer, fresh token sequence continues globally ==')
  const second = await submitOrder({
    lines: [{ menuItemId: naan.id, quantity: 1 }],
    clientRequestId: 'test-create-2'
  })
  assert(second.order.orderNumber === 'ORD-1002', `second order is ORD-1002 (got ${second.order.orderNumber})`)
  const secondItemId = second.order.items[0].id
  const secondToken = await ensureTokenForOrderItem(secondItemId)
  assert(secondToken.token.tokenNumber === 4, `next token is #004 (got #${secondToken.token.tokenNumber})`)

  console.log('\n== Step 13b: PAY NOW — the Cart\'s atomic submit(markPaidNow) path, no separate Pending Bills step ==')
  const payNowOrder = await submitOrder({
    lines: [{ menuItemId: fries.id, quantity: 2 }],
    clientRequestId: 'test-paynow-1'
  })
  const payNowItemId = payNowOrder.order.items[0].id
  const payNowToken = await ensureTokenForOrderItem(payNowItemId)
  assert(payNowToken.isNew === true, 'PAY NOW flow still requires a token to be printed first')

  const paidDirectly = await submitOrder({
    orderId: payNowOrder.order.id,
    lines: [{ menuItemId: fries.id, quantity: 2 }],
    markPaidNow: true,
    paymentMethod: 'OTHER',
    clientRequestId: 'test-paynow-2'
  })
  assert(paidDirectly.order.status === 'PAID', 'PAY NOW marks the order PAID in the same submit call')
  assert(paidDirectly.order.paymentMethod === 'OTHER', 'payment method recorded as OTHER')
  assert(paidDirectly.order.orderNumber === payNowOrder.order.orderNumber, 'still the same order — no duplicate created by PAY NOW')
  const billsAfterPayNow = await listAllBills()
  assert(
    billsAfterPayNow.some((b) => b.id === payNowOrder.order.id && b.status === 'PAID'),
    'the paid bill is immediately visible in Bill History'
  )

  console.log('\n== Step 14: editing an already-PAID bill is now allowed ==')
  const secondPaid = await markOrderPaid(second.order.id, 'ONLINE')
  assert(secondPaid.status === 'PAID', 'second order marked PAID for this test')

  const editPaid = await submitOrder({
    orderId: second.order.id,
    lines: [
      { menuItemId: naan.id, quantity: 3 }, // quantity changed 1 -> 3
      { menuItemId: karahi.id, quantity: 1, size: 'FULL' } // new item added to an already-PAID bill
    ],
    clientRequestId: 'test-edit-paid-1'
  })
  assert(editPaid.order.status === 'PAID', 'editing a paid bill does not silently revert its status')
  assert(editPaid.order.orderNumber === 'ORD-1002', 'same order number preserved after editing a paid bill')
  const naanAfterPaidEdit = editPaid.order.items.find((i) => i.nameSnapshot === 'Naan' && i.status === 'ACTIVE')!
  assert(naanAfterPaidEdit.quantity === 3, `Naan quantity updated to 3 on the paid bill (got ${naanAfterPaidEdit.quantity})`)
  assert(naanAfterPaidEdit.tokenNumber === secondToken.token.tokenNumber, 'Naan keeps its original token number even after editing a paid bill')
  const karahiOnPaidBill = editPaid.order.items.find((i) => i.nameSnapshot === 'Chicken Karahi (Full)' && i.status === 'ACTIVE')!
  assert(karahiOnPaidBill.tokenNumber == null, 'the newly added item on the paid bill has NO token yet — must be explicitly printed')

  const orderCountAfterPaidEdit = await prisma.order.count()
  assert(orderCountAfterPaidEdit === 3, `editing a paid bill did not create a new order — still 3 total (got ${orderCountAfterPaidEdit})`)

  console.log('\n== Step 15: audit log records a structured diff, not just the raw payload ==')
  const auditRow = await prisma.auditLog.findFirst({
    where: { entityId: second.order.id, action: 'ORDER_EDITED' },
    orderBy: { createdAt: 'desc' }
  })
  const auditDetails = JSON.parse(auditRow?.details ?? '{}')
  assert(
    Array.isArray(auditDetails.added) && auditDetails.added.some((a: any) => a.name === 'Chicken Karahi (Full)' && a.quantity === 1),
    'audit diff records the added Chicken Karahi (Full) line'
  )
  assert(
    Array.isArray(auditDetails.quantityChanged) &&
      auditDetails.quantityChanged.some((c: any) => c.name === 'Naan' && c.from === 1 && c.to === 3),
    'audit diff records Naan quantity change from 1 to 3'
  )

  console.log('\n== Step 16: cancelled bills still cannot be edited ==')
  const toCancel = await submitOrder({
    lines: [{ menuItemId: naan.id, quantity: 1 }],
    clientRequestId: 'test-cancel-1'
  })
  await cancelOrder(toCancel.order.id)
  let threwOnCancelledEdit = false
  try {
    await submitOrder({
      orderId: toCancel.order.id,
      lines: [{ menuItemId: naan.id, quantity: 2 }],
      clientRequestId: 'test-edit-cancelled-1'
    })
  } catch {
    threwOnCancelledEdit = true
  }
  assert(threwOnCancelledEdit, 'editing a CANCELLED bill still throws')

  console.log('\n== Step 17: listAllBills (Bill History) returns paid and cancelled bills only ==')
  const allBills = await listAllBills()
  assert(allBills.some((b) => b.id === editPaid.order.id), 'listAllBills includes the paid, edited bill')
  assert(allBills.some((b) => b.id === toCancel.order.id), 'listAllBills includes the cancelled bill')
  assert(allBills.every((b) => b.orderNumber), 'every returned bill has an order number')
  assert(allBills.every((b) => b.status !== 'PENDING'), 'listAllBills never includes an unpaid (PENDING) draft order')

  console.log('\n== Step 18: Half and Full of the same item are separate lines/tokens ==')
  const halfFullOrder = await submitOrder({
    lines: [
      { menuItemId: karahi.id, quantity: 1, size: 'HALF' },
      { menuItemId: karahi.id, quantity: 1, size: 'FULL' }
    ],
    clientRequestId: 'test-halffull-1'
  })
  assert(halfFullOrder.order.items.length === 2, `Half and Full create 2 distinct order items (got ${halfFullOrder.order.items.length})`)
  const halfLine = halfFullOrder.order.items.find((i) => i.variant === 'HALF')!
  const fullLine = halfFullOrder.order.items.find((i) => i.variant === 'FULL')!
  assert(halfLine.nameSnapshot === 'Chicken Karahi (Half)', `Half line name is correct (got "${halfLine.nameSnapshot}")`)
  assert(fullLine.nameSnapshot === 'Chicken Karahi (Full)', `Full line name is correct (got "${fullLine.nameSnapshot}")`)
  assert(halfLine.priceSnapshot === karahi.halfPrice, `Half line priced at halfPrice (got ${halfLine.priceSnapshot})`)
  assert(fullLine.priceSnapshot === karahi.fullPrice, `Full line priced at fullPrice (got ${fullLine.priceSnapshot})`)

  const halfToken = await ensureTokenForOrderItem(halfLine.id)
  const fullToken = await ensureTokenForOrderItem(fullLine.id)
  assert(halfToken.isNew && fullToken.isNew, 'Half and Full each get their own new token')
  assert(halfToken.token.tokenNumber !== fullToken.token.tokenNumber, 'Half and Full tokens have different numbers')

  // Bump the Half line's quantity — must not disturb the Full line or create a new token.
  const halfFullEdited = await submitOrder({
    orderId: halfFullOrder.order.id,
    lines: [
      { menuItemId: karahi.id, quantity: 3, size: 'HALF' },
      { menuItemId: karahi.id, quantity: 1, size: 'FULL' }
    ],
    clientRequestId: 'test-halffull-2'
  })
  const halfAfterEdit = halfFullEdited.order.items.find((i) => i.variant === 'HALF' && i.status === 'ACTIVE')!
  assert(halfAfterEdit.quantity === 3, `Half line quantity updated to 3 (got ${halfAfterEdit.quantity})`)
  assert(halfAfterEdit.tokenNumber === halfToken.token.tokenNumber, 'Half line kept its original token number after a quantity change')

  console.log('\n== Step 18b: an unpaid order with printed tokens must not appear in Bill History ==')
  const billsWithUnpaidDraft = await listAllBills()
  assert(
    !billsWithUnpaidDraft.some((b) => b.id === halfFullOrder.order.id),
    'unpaid (PENDING) order is excluded from Bill History even though tokens were already printed for it'
  )

  console.log('\n== Step 19: size validation — a Half/Full item requires a size, a Normal item rejects one ==')
  let threwWithoutSize = false
  try {
    await submitOrder({
      lines: [{ menuItemId: karahi.id, quantity: 1 }], // no size on a HALF_FULL item
      clientRequestId: 'test-validate-1'
    })
  } catch {
    threwWithoutSize = true
  }
  assert(threwWithoutSize, 'ordering a Half/Full item with no size selection throws')

  let threwWithSizeOnNormal = false
  try {
    await submitOrder({
      lines: [{ menuItemId: naan.id, quantity: 1, size: 'HALF' }], // Naan is a Normal item
      clientRequestId: 'test-validate-2'
    })
  } catch {
    threwWithSizeOnNormal = true
  }
  assert(threwWithSizeOnNormal, 'putting a size on a Normal item throws')

  console.log('\n== Step 20: DELETE is a permanent, transactional hard-delete — not a soft delete ==')
  let threwOnCashierDelete = false
  try {
    await deleteOrder(create.order.id)
  } catch {
    threwOnCashierDelete = true
  }
  assert(threwOnCashierDelete, 'a non-admin cashier cannot delete a bill')

  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })
  setCurrentUser({ id: admin.id, name: admin.name, username: admin.username, role: 'ADMIN' as const })

  const toDelete = await submitOrder({
    lines: [{ menuItemId: naan.id, quantity: 2 }],
    clientRequestId: 'test-delete-1'
  })
  const naanItemOnToDelete = toDelete.order.items.find((i) => i.nameSnapshot === 'Naan')!
  await ensureTokenForOrderItem(naanItemOnToDelete.id)
  const otherOrderCountBefore = await prisma.order.count()
  const otherOrderItemCountBefore = await prisma.orderItem.count()
  const otherTokenCountBefore = await prisma.productionToken.count()

  await deleteOrder(toDelete.order.id)

  assert((await getOrder(toDelete.order.id)) === null, 'deleted order no longer exists at all (hard delete, not soft delete)')
  const remainingItemsForDeleted = await prisma.orderItem.count({ where: { orderId: toDelete.order.id } })
  assert(remainingItemsForDeleted === 0, 'deleted order leaves no orphan OrderItem rows')
  const remainingTokensForDeleted = await prisma.productionToken.count({ where: { orderId: toDelete.order.id } })
  assert(remainingTokensForDeleted === 0, 'deleted order leaves no orphan ProductionToken rows')

  assert(
    (await prisma.order.count()) === otherOrderCountBefore - 1,
    'exactly one order removed — no other orders affected'
  )
  assert(
    (await prisma.orderItem.count()) === otherOrderItemCountBefore - 1,
    'exactly the deleted order\'s items removed — no other order items affected'
  )
  assert(
    (await prisma.productionToken.count()) === otherTokenCountBefore - 1,
    'exactly the deleted order\'s token removed — no other tokens affected'
  )

  const billsAfterDelete = await listAllBills()
  assert(!billsAfterDelete.some((b) => b.id === toDelete.order.id), 'deleted bill is immediately gone from Bill History')

  const untouchedOrder = await getOrder(create.order.id)
  assert(untouchedOrder !== null && untouchedOrder.items.length > 0, 'an unrelated bill (ORD-1001) is completely untouched by deleting a different bill')

  console.log('\n== Step 21: dashboard Total Discount reflects saved discount on paid orders ==')
  const statsBeforeDiscount = await getDashboardStats()
  const discountOrder = await submitOrder({
    lines: [{ menuItemId: naan.id, quantity: 2 }],
    discount: 15,
    markPaidNow: true,
    paymentMethod: 'CASH',
    clientRequestId: 'test-discount-1'
  })
  assert(discountOrder.order.discount === 15, `order saved with discount 15 (got ${discountOrder.order.discount})`)
  const statsAfterDiscount = await getDashboardStats()
  assert(
    statsAfterDiscount.today.totalDiscount === statsBeforeDiscount.today.totalDiscount + 15,
    `today's total discount increased by exactly 15 (got ${statsAfterDiscount.today.totalDiscount})`
  )
  assert(
    statsAfterDiscount.thisMonth.totalDiscount === statsBeforeDiscount.thisMonth.totalDiscount + 15,
    `this month's total discount increased by exactly 15 (got ${statsAfterDiscount.thisMonth.totalDiscount})`
  )
  assert(
    statsAfterDiscount.allTime.totalDiscount === statsBeforeDiscount.allTime.totalDiscount + 15,
    `all-time total discount increased by exactly 15 (got ${statsAfterDiscount.allTime.totalDiscount})`
  )

  console.log('\n== Step 22: input validation hardening (never trust frontend) ==')

  let threwOnBigQty = false
  try {
    await submitOrder({ lines: [{ menuItemId: naan.id, quantity: 1000 }], clientRequestId: 'test-qty-1' })
  } catch {
    threwOnBigQty = true
  }
  assert(threwOnBigQty, 'a quantity above the sane upper bound is rejected')

  let threwOnHugeRange = false
  try {
    await getSalesByDate('2000-01-01', '2026-12-31')
  } catch {
    threwOnHugeRange = true
  }
  assert(threwOnHugeRange, 'an absurdly large date range is rejected rather than fanning out into thousands of queries')

  let threwOnEmptyCategory = false
  try {
    await createCategory('   ')
  } catch {
    threwOnEmptyCategory = true
  }
  assert(threwOnEmptyCategory, 'an empty/whitespace-only category name is rejected')

  const existingCategory = await prisma.category.findFirstOrThrow()
  let threwOnDuplicateCategory = false
  try {
    await createCategory(existingCategory.name)
  } catch (err: any) {
    threwOnDuplicateCategory = /already exists/i.test(err.message)
  }
  assert(threwOnDuplicateCategory, 'a duplicate category name gets a clean, friendly error (not a raw Prisma error)')

  let threwOnEmptyItemName = false
  try {
    await createMenuItem({ name: '  ', categoryId: existingCategory.id, sizeMode: 'NORMAL', price: 100 })
  } catch {
    threwOnEmptyItemName = true
  }
  assert(threwOnEmptyItemName, 'an empty menu item name is rejected')

  let threwOnShortPassword = false
  try {
    await createUser({ name: 'Test User', username: 'testuser1', password: '12', role: 'CASHIER' })
  } catch {
    threwOnShortPassword = true
  }
  assert(threwOnShortPassword, 'a too-short password is rejected on user creation')

  const newUser = await createUser({ name: 'Test User', username: 'testuser1', password: 'validpass', role: 'CASHIER' })
  assert(newUser.username === 'testuser1', 'a valid new user is created successfully')

  let threwOnDuplicateUsername = false
  try {
    await createUser({ name: 'Another', username: 'testuser1', password: 'validpass', role: 'CASHIER' })
  } catch (err: any) {
    threwOnDuplicateUsername = /already taken/i.test(err.message)
  }
  assert(threwOnDuplicateUsername, 'a duplicate username gets a clean, friendly error (not a raw Prisma error)')

  let threwOnBadTaxRate = false
  try {
    await updateSettings({ taxRatePercent: 150 })
  } catch {
    threwOnBadTaxRate = true
  }
  assert(threwOnBadTaxRate, 'an out-of-range tax rate is rejected')

  let threwOnBadBillWidth = false
  try {
    await updateSettings({ billWidthMm: 999 })
  } catch {
    threwOnBadBillWidth = true
  }
  assert(threwOnBadBillWidth, 'an invalid bill width is rejected')

  const settingsAfterValidUpdate = await updateSettings({ taxRatePercent: 5 })
  assert(settingsAfterValidUpdate.taxRatePercent === 5, 'a valid settings update still succeeds')

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('TEST SCRIPT CRASHED:', err)
  process.exit(1)
})
