import { useNavigate } from 'react-router-dom'
import type { DeviceListItem } from '@/types'
import { formatRelativeTime } from '@/utils/format'
import { useDeviceStore } from '@/stores/deviceStore'
import { getPlatformIcon } from '@/utils/deviceIcons'
import { DeviceIdPopover } from '@/components/DeviceIdPopover'
import { StarIcon, PackageIcon, CheckIcon } from '@/components/icons'
import clsx from 'clsx'
import { type CSSProperties } from 'react'

interface Props {
  device: DeviceListItem
  style?: CSSProperties
  isSelectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}

export function DeviceCard({ device, style, isSelectMode, isSelected, onToggleSelect }: Props) {
  const navigate = useNavigate()
  const { favoriteDeviceIds, toggleFavorite } = useDeviceStore()
  const isFavorite = favoriteDeviceIds.has(device.deviceId)
  const isOffline = !device.isOnline

  // 是否设置了别名
  const hasAlias = !!device.deviceAlias

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleFavorite(device.deviceId)
  }

  const handleClick = () => {
    if (isSelectMode) {
      // 选择模式下，只有离线设备可选中
      if (isOffline) {
        onToggleSelect?.()
      }
    } else {
      navigate(`/device/${device.deviceId}`)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'glass-card p-2.5 cursor-pointer transition-all group animate-fadeIn card-interactive',
        device.isOnline ? 'hover:border-primary' : 'opacity-60 hover:opacity-80',
        isSelectMode && isOffline && 'cursor-pointer',
        isSelectMode && !isOffline && 'cursor-not-allowed opacity-40',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
      style={style}
    >
      {/* 主要布局：设备图标 + 信息 + 收藏 */}
      <div className="flex items-start gap-2.5">
        {/* 选择模式下的复选框 */}
        {isSelectMode && (
          <div className={clsx(
            'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-2.5',
            isSelected ? 'bg-primary border-primary' : 'border-border',
            !isOffline && 'opacity-30'
          )}>
            {isSelected && <CheckIcon size={12} className="text-white" />}
          </div>
        )}

        {/* 设备图标和模拟器标记 */}
        <div className="flex flex-col items-center flex-shrink-0 gap-1">
          <div className="relative">
            <div className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center border border-border',
              device.isOnline ? 'bg-primary/20' : 'bg-bg-medium/50'
            )}>
              {getPlatformIcon(device.platform, 24, undefined, device.isSimulator)}
            </div>
            {/* 状态指示点 - 右下角 */}
            <span className={clsx(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-bg-dark rounded-full',
              device.isOnline ? 'bg-green-500 status-dot-online' : 'bg-gray-500'
            )} />
          </div>
          {/* 模拟器标记 - 图标下方 */}
          {device.isSimulator && (
            <span className="text-2xs px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 whitespace-nowrap">
              模拟器
            </span>
          )}
        </div>

        {/* 设备 + 应用信息 */}
        <div className="flex-1 min-w-0">
          {/* 设备名称区域：两行展示 */}
          <div className="min-h-[36px]">
            {/* 第一行：别名或设备名 + ID 标识 */}
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm text-text-primary group-hover:text-primary transition-colors truncate">
                {hasAlias ? device.deviceAlias : device.deviceName}
              </h3>
              {/* 设备 ID 后 4 位 - 点击弹出完整 ID */}
              <DeviceIdPopover deviceId={device.deviceId}>
                <span className="text-2xs px-1 py-0.5 rounded bg-bg-light text-text-muted font-mono flex-shrink-0 hover:bg-primary/20 hover:text-primary transition-colors">
                  #{device.deviceId.slice(-4).toUpperCase()}
                </span>
              </DeviceIdPopover>
              {isOffline && (
                <span className="text-2xs px-1 py-0.5 rounded bg-gray-500/20 text-gray-400 flex-shrink-0">
                  离线
                </span>
              )}
            </div>
            {/* 第二行：如果有别名则显示原始设备名 */}
            {hasAlias && (
              <p className="text-xs text-text-muted truncate mt-0.5" title={device.deviceName}>
                {device.deviceName}
              </p>
            )}
          </div>

          {/* 设备型号信息 */}
          <p className="text-xs text-text-muted truncate mt-0.5">
            {device.deviceModel} · {device.platform} {device.systemVersion}
          </p>

          {/* 应用信息 */}
          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border">
            {/* 应用图标 */}
            <div className="w-4 h-4 rounded overflow-hidden bg-bg-light flex items-center justify-center flex-shrink-0" title={device.appName}>
              {device.appIcon ? (
                <img
                  src={`data:image/png;base64,${device.appIcon}`}
                  alt={device.appName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <PackageIcon size={10} className="text-text-muted" />
              )}
            </div>
            <span className="text-xs text-text-secondary truncate" title={`${device.appName} ${device.appVersion}`}>
              {device.appName}
            </span>
            <span className="text-xs text-text-muted/60 truncate flex-shrink-0">
              {device.appVersion}
            </span>
            <span className="flex-1" />
            <span className="text-2xs text-text-muted/50 flex-shrink-0">
              {formatRelativeTime(device.lastSeenAt)}
            </span>
          </div>
        </div>

        {/* 操作按钮组 - 非选择模式下显示 */}
        {!isSelectMode && (
          <div className="flex items-center gap-0.5">
            {/* 收藏按钮 */}
            <button
              onClick={handleToggleFavorite}
              className={clsx(
                'p-1 rounded transition-all flex-shrink-0',
                isFavorite
                  ? 'text-yellow-400 hover:text-yellow-300'
                  : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-yellow-400'
              )}
              title={isFavorite ? '取消收藏' : '收藏设备'}
            >
              <StarIcon size={14} filled={isFavorite} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
