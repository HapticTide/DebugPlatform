import { useNavigate } from 'react-router-dom'
import type { DeviceListItem } from '@/types'
import { formatRelativeTime } from '@/utils/format'
import { useDeviceStore } from '@/stores/deviceStore'
import clsx from 'clsx'
import type { CSSProperties } from 'react'

interface Props {
  device: DeviceListItem
  style?: CSSProperties
}

const platformIcons: Record<string, string> = {
  iOS: '🍎',
  iPadOS: '📱',
  macOS: '💻',
  watchOS: '⌚',
  tvOS: '📺',
}

export function DeviceCard({ device, style }: Props) {
  const navigate = useNavigate()
  const { favoriteDeviceIds, toggleFavorite } = useDeviceStore()
  const isFavorite = favoriteDeviceIds.has(device.deviceId)

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(device.deviceId)
  }

  return (
    <div
      onClick={() => navigate(`/device/${device.deviceId}`)}
      className={clsx(
        'glass-card p-5 cursor-pointer transition-all group animate-fadeIn card-interactive',
        device.isOnline ? 'hover:border-primary' : 'opacity-75'
      )}
      style={style}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          {/* Platform Icon */}
          <div className={clsx(
            'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
            'bg-gradient-to-br',
            device.isOnline
              ? 'from-primary/20 to-accent-blue/20 border border-primary/20'
              : 'from-bg-light to-bg-medium border border-border'
          )}>
            {platformIcons[device.platform] || '📱'}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors line-clamp-1">
              {device.deviceName}
            </h3>
            <p className="text-xs text-text-muted line-clamp-1">
              {device.platform} {device.systemVersion}
            </p>
          </div>
        </div>

        {/* Status & Favorite */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleFavorite}
            className={clsx(
              'p-1.5 rounded transition-all',
              isFavorite
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-yellow-400'
            )}
            title={isFavorite ? '取消收藏' : '收藏设备'}
          >
            {isFavorite ? '⭐' : '☆'}
          </button>
          <span
            className={clsx(
              'badge',
              device.isOnline ? 'badge-success' : 'badge-danger'
            )}
          >
            <span className={clsx(
              'w-1.5 h-1.5 rounded-full mr-1.5',
              device.isOnline ? 'bg-green-400 status-dot-online' : 'bg-red-400'
            )} />
            {device.isOnline ? '在线' : '离线'}
          </span>
        </div>
      </div>

      {/* App Info */}
      <div className="mb-4 p-3 bg-bg-medium/50 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">📦</span>
          <span className="text-sm font-medium text-text-primary line-clamp-1">
            {device.appName}
          </span>
        </div>
        <p className="text-xs text-text-muted pl-6">
          版本 {device.appVersion} ({device.buildNumber})
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span>⏱️</span>
          <span>最后活动: {formatRelativeTime(device.lastSeenAt)}</span>
        </span>
        <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          查看详情 →
        </span>
      </div>
    </div>
  )
}
