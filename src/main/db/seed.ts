import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const CATEGORIES = [
  'Breakfast',
  'Soups',
  'Pakistani',
  'BBQ',
  'Fish',
  'Tandoor',
  'Fast Food',
  'Rice',
  'Chinese',
  'Drinks',
  'Refreshments',
  'Sweets',
  'Desserts',
  'Other'
]

// Items with a single price. Half & Full items live in HALF_FULL_ITEMS instead.
const MENU_ITEMS: Array<{ name: string; price: number; category: string }> = [
  { name: 'Omelette', price: 150, category: 'Breakfast' },
  { name: 'Paratha', price: 80, category: 'Breakfast' },
  { name: 'Halwa Puri', price: 200, category: 'Breakfast' },
  { name: 'Hot & Sour Soup', price: 250, category: 'Soups' },
  { name: 'Chicken Corn Soup', price: 280, category: 'Soups' },
  { name: 'Mutton Karahi', price: 1200, category: 'Pakistani' },
  { name: 'Daal Chawal', price: 200, category: 'Pakistani' },
  { name: 'Chicken Tikka', price: 450, category: 'BBQ' },
  { name: 'Seekh Kebab', price: 400, category: 'BBQ' },
  { name: 'Chicken Malai Boti', price: 500, category: 'BBQ' },
  { name: 'Fried Fish', price: 600, category: 'Fish' },
  { name: 'Fish Tikka', price: 650, category: 'Fish' },
  { name: 'Naan', price: 40, category: 'Tandoor' },
  { name: 'Roti', price: 25, category: 'Tandoor' },
  { name: 'Garlic Naan', price: 60, category: 'Tandoor' },
  { name: 'Zinger Burger', price: 350, category: 'Fast Food' },
  { name: 'Beef Burger', price: 380, category: 'Fast Food' },
  { name: 'French Fries', price: 200, category: 'Fast Food' },
  { name: 'Chicken Wings', price: 450, category: 'Fast Food' },
  { name: 'Chicken Biryani', price: 350, category: 'Rice' },
  { name: 'Mutton Biryani', price: 500, category: 'Rice' },
  { name: 'Pulao', price: 250, category: 'Rice' },
  { name: 'Chicken Manchurian', price: 450, category: 'Chinese' },
  { name: 'Chowmein', price: 350, category: 'Chinese' },
  { name: 'Cold Drink', price: 120, category: 'Drinks' },
  { name: 'Mineral Water', price: 60, category: 'Drinks' },
  { name: 'Fresh Juice', price: 200, category: 'Drinks' },
  { name: 'Lassi', price: 150, category: 'Refreshments' },
  { name: 'Mint Margarita', price: 180, category: 'Refreshments' },
  { name: 'Gulab Jamun', price: 150, category: 'Sweets' },
  { name: 'Kheer', price: 180, category: 'Sweets' },
  { name: 'Ice Cream', price: 200, category: 'Desserts' },
  { name: 'Kulfi', price: 150, category: 'Desserts' },
  { name: 'Extra Raita', price: 50, category: 'Other' },
  { name: 'Salad', price: 100, category: 'Other' }
]

// Items sold in Half & Full sizes — each becomes two cards in the POS grid.
const HALF_FULL_ITEMS: Array<{ name: string; halfPrice: number; fullPrice: number; category: string }> = [
  { name: 'Chicken Karahi', halfPrice: 500, fullPrice: 900, category: 'Pakistani' }
]

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const userCount = await prisma.user.count()
  if (userCount > 0) return

  await prisma.user.create({
    data: {
      name: 'Administrator',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'ADMIN'
    }
  })
  await prisma.user.create({
    data: {
      name: 'Cashier',
      username: 'cashier',
      passwordHash: bcrypt.hashSync('cashier123', 10),
      role: 'CASHIER'
    }
  })

  const categoryRecords = await Promise.all(
    CATEGORIES.map((name, i) => prisma.category.create({ data: { name, sortOrder: i } }))
  )
  const categoryMap = new Map(categoryRecords.map((c) => [c.name, c.id]))

  for (const item of MENU_ITEMS) {
    await prisma.menuItem.create({
      data: {
        name: item.name,
        sizeMode: 'NORMAL',
        price: item.price,
        categoryId: categoryMap.get(item.category)!
      }
    })
  }

  for (const item of HALF_FULL_ITEMS) {
    await prisma.menuItem.create({
      data: {
        name: item.name,
        sizeMode: 'HALF_FULL',
        halfPrice: item.halfPrice,
        fullPrice: item.fullPrice,
        categoryId: categoryMap.get(item.category)!
      }
    })
  }

  await prisma.counter.createMany({
    data: [
      { name: 'orderNumber', value: 1000 },
      { name: 'tokenNumber', value: 0 }
    ]
  })

  await prisma.settings.createMany({
    data: [
      { key: 'shopName', value: 'MOON RESTAURANT' },
      { key: 'currency', value: 'Rs.' },
      { key: 'taxRatePercent', value: '0' },
      { key: 'discountEnabled', value: 'true' },
      { key: 'billWidthMm', value: '80' }
    ]
  })
}
