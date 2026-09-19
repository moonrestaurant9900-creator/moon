import { useEffect, useMemo, useState } from 'react'
import { Search, CheckCircle2 } from 'lucide-react'
import { useMenuStore } from '../store/menuStore'
import { useCartStore } from '../store/cartStore'
import { useSettingsStore } from '../store/settingsStore'
import CategorySidebar from '../components/CategorySidebar'
import FoodCard from '../components/FoodCard'
import CartPanel from '../components/CartPanel'
import type { ItemSize, MenuItemDTO } from '../../../shared/types'

interface PosCard {
  cardKey: string
  menuItemId: string
  size: ItemSize | null
  displayItem: MenuItemDTO & { price: number }
}

// A Half & Full item isn't one card — it's two, each with its own resolved price.
// A Normal item is still exactly one card, unchanged.
function buildCards(items: MenuItemDTO[]): PosCard[] {
  const cards: PosCard[] = []
  for (const item of items) {
    if (item.sizeMode === 'HALF_FULL') {
      cards.push({
        cardKey: `${item.id}:HALF`,
        menuItemId: item.id,
        size: 'HALF',
        displayItem: { ...item, name: `${item.name} (Half)`, price: item.halfPrice ?? 0 }
      })
      cards.push({
        cardKey: `${item.id}:FULL`,
        menuItemId: item.id,
        size: 'FULL',
        displayItem: { ...item, name: `${item.name} (Full)`, price: item.fullPrice ?? 0 }
      })
    } else {
      cards.push({
        cardKey: item.id,
        menuItemId: item.id,
        size: null,
        displayItem: { ...item, price: item.price ?? 0 }
      })
    }
  }
  return cards
}

export default function PosPage(): JSX.Element {
  const { categories, items, loaded, refresh } = useMenuStore()
  const addItem = useCartStore((s) => s.addItem)
  const printedTokenCount = useCartStore((s) => s.printedLineKeys.length)
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'Rs.')

  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loaded) refresh()
  }, [loaded])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory && item.categoryId !== activeCategory) return false
      if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      return item.active
    })
  }, [items, activeCategory, search])

  const cards = useMemo(() => buildCards(filteredItems), [filteredItems])

  return (
    <div className="flex h-full">
      <CategorySidebar categories={categories} activeId={activeCategory} onSelect={setActiveCategory} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-4 py-3 border-b border-ink-200 bg-white flex items-center gap-3">
          <div className="relative max-w-md flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-full rounded-md border border-ink-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink-900/10 focus:border-ink-400"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-success-50 border border-success-100 text-success-700 shrink-0">
            <CheckCircle2 size={13} />
            <span className="text-[11px] font-semibold whitespace-nowrap">Tokens Printed: {printedTokenCount}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="grid grid-cols-4 gap-3">
            {cards.map((card) => (
              <FoodCard
                key={card.cardKey}
                item={card.displayItem}
                currency={currency}
                onClick={() =>
                  addItem({
                    id: card.menuItemId,
                    name: card.displayItem.name,
                    price: card.displayItem.price,
                    size: card.size
                  })
                }
              />
            ))}
          </div>
          {cards.length === 0 && <div className="text-center text-ink-400 text-sm py-20">No items found.</div>}
        </div>
      </div>

      <CartPanel />
    </div>
  )
}
