import { UtensilsCrossed } from 'lucide-react'
import type { MenuItemDTO } from '../../../shared/types'

export default function FoodCard({
  item,
  currency,
  onClick
}: {
  item: Omit<MenuItemDTO, 'price'> & { price: number }
  currency: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={!item.available}
      className="group flex flex-col bg-white rounded-md border border-ink-200 overflow-hidden hover:border-ink-400 hover:shadow-xs active:bg-ink-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
    >
      <div className="h-32 w-full bg-ink-100 flex items-center justify-center overflow-hidden border-b border-ink-200">
        {item.imagePath ? (
          <img src={`app-image://${item.imagePath}`} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed size={28} strokeWidth={1.5} className="text-ink-300" />
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="text-[12px] text-ink-900 truncate">
          <span className="font-semibold">{item.name}</span>
          <span className="text-ink-400"> — </span>
          <span className="font-semibold text-ink-700">
            {currency}
            {item.price.toFixed(0)}
          </span>
        </div>
        {!item.available && <span className="text-[10px] font-medium text-danger-600">Unavailable</span>}
      </div>
    </button>
  )
}
