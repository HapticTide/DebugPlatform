import clsx from 'clsx'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const typeConfig = {
    danger: {
      icon: '⚠️',
      iconBg: 'bg-red-500/20',
      headerBg: 'bg-red-500/5',
      titleColor: 'text-red-400',
      confirmBg: 'bg-red-500 hover:bg-red-600',
    },
    warning: {
      icon: '⚡',
      iconBg: 'bg-yellow-500/20',
      headerBg: 'bg-yellow-500/5',
      titleColor: 'text-yellow-400',
      confirmBg: 'bg-yellow-500 hover:bg-yellow-600',
    },
    info: {
      icon: 'ℹ️',
      iconBg: 'bg-blue-500/20',
      headerBg: 'bg-blue-500/5',
      titleColor: 'text-blue-400',
      confirmBg: 'bg-blue-500 hover:bg-blue-600',
    },
  }

  const config = typeConfig[type]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-dark border border-border rounded-2xl shadow-2xl w-[400px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b border-border', config.headerBg)}>
          <div className="flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', config.iconBg)}>
              <span className="text-xl">{config.icon}</span>
            </div>
            <h3 className={clsx('text-lg font-bold', config.titleColor)}>{title}</h3>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-text-secondary whitespace-pre-line">{message}</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-bg-medium/30 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-light transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50',
              config.confirmBg
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                处理中...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
