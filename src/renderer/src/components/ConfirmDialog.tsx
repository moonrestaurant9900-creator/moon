import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel
}: Props): JSX.Element | null {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40">
      <div className="bg-white rounded-lg shadow-popover border border-ink-200 w-[380px] p-5">
        <div className="flex items-start gap-3 mb-4">
          {danger && (
            <div className="w-8 h-8 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-danger-600" />
            </div>
          )}
          <div>
            <h2 className="text-sm font-semibold text-ink-900 mb-1">{title}</h2>
            <p className="text-[13px] text-ink-500 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md font-medium text-[13px] text-ink-600 border border-ink-200 hover:bg-ink-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-md font-medium text-[13px] text-white ${
              danger ? 'bg-danger-600 hover:bg-danger-700' : 'bg-ink-900 hover:bg-ink-950'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
