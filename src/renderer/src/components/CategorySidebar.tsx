import { LayoutGrid } from 'lucide-react'
import type { CategoryDTO } from '../../../shared/types'

export default function CategorySidebar({
  categories,
  activeId,
  onSelect
}: {
  categories: CategoryDTO[]
  activeId: string | null
  onSelect: (id: string | null) => void
}): JSX.Element {
  return (
    <div className="w-52 shrink-0 bg-white border-r border-ink-200 overflow-y-auto py-2 px-2">
      <div className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide px-2.5 py-2">Categories</div>
      <div className="space-y-0.5">
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-md font-medium text-[13px] transition-colors ${
            activeId === null ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'
          }`}
        >
          <LayoutGrid size={15} strokeWidth={2} className={activeId === null ? 'text-white' : 'text-ink-400'} />
          All Items
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-2.5 py-2 pl-[34px] rounded-md font-medium text-[13px] transition-colors ${
              activeId === c.id ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )
}
