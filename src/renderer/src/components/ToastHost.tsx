import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../store/toastStore'

const CONFIG: Record<string, { icon: typeof CheckCircle2; border: string; iconColor: string }> = {
  success: { icon: CheckCircle2, border: 'border-l-success-500', iconColor: 'text-success-600' },
  error: { icon: XCircle, border: 'border-l-danger-500', iconColor: 'text-danger-600' },
  info: { icon: Info, border: 'border-l-ink-400', iconColor: 'text-ink-500' }
}

export default function ToastHost(): JSX.Element {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96">
      {toasts.map((t) => {
        const cfg = CONFIG[t.kind]
        const Icon = cfg.icon
        return (
          <div
            key={t.id}
            className={`bg-white border border-ink-200 border-l-[3px] ${cfg.border} rounded-md shadow-popover px-3.5 py-3 text-[13px] flex items-start gap-2.5`}
          >
            <Icon size={16} className={`${cfg.iconColor} shrink-0 mt-0.5`} />
            <span className="text-ink-700 flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-ink-300 hover:text-ink-600 shrink-0">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
