import { useEffect, useRef } from 'react'
import type { LogEvent, LogLevel } from '@/types'
import { formatSmartTime, getLogLevelClass } from '@/utils/format'
import clsx from 'clsx'
import { LogIcon } from './icons'

interface Props {
  events: LogEvent[]
  autoScroll: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  isSelectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

const levelLabels: Record<LogLevel, string> = {
  verbose: 'VERBOSE',
  debug: 'DEBUG',
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
}

export function LogList({
  events,
  autoScroll,
  selectedId,
  onSelect,
  isSelectMode = false,
  selectedIds = new Set(),
  onToggleSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && containerRef.current && events.length > 0) {
      containerRef.current.scrollTop = 0
    }
  }, [events.length, autoScroll])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table Header */}
      <div className="flex-shrink-0 bg-bg-medium border-b border-border">
        <div className="flex items-center text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {isSelectMode && (
            <div className="w-10 px-3 py-2.5 flex-shrink-0">
              <span className="sr-only">选择</span>
            </div>
          )}
          <div className="w-32 px-4 py-2.5">时间</div>
          <div className="w-24 px-4 py-2.5">级别</div>
          <div className="w-36 px-4 py-2.5">分类</div>
          <div className="flex-1 px-4 py-2.5">消息内容</div>
        </div>
      </div>

      {/* Table Body */}
      <div ref={containerRef} className="flex-1 overflow-auto font-mono text-sm">
        {events.map((event, index) => {
          const levelStyle = getLogLevelClass(event.level)
          const isChecked = selectedIds.has(event.id)
          const isSelected = !isSelectMode && selectedId === event.id

          // 处理点击
          const handleClick = () => {
            if (isSelectMode) {
              onToggleSelect?.(event.id)
            } else {
              onSelect?.(event.id)
            }
          }

          return (
            <div
              key={event.id}
              onClick={handleClick}
              className={clsx(
                'flex items-start border-l-2 transition-all duration-150 cursor-pointer',
                levelStyle.border,
                // 选中状态（非批量选择模式）
                isSelected && 'bg-selected',
                // 批量选中
                !isSelected && isChecked && 'bg-primary/15',
                // 默认状态
                !isSelected && !isChecked && (index % 2 === 0 ? 'bg-bg-dark/20' : 'bg-transparent'),
                !isSelected && !isChecked && 'hover:bg-bg-light/60'
              )}
              style={{ animationDelay: `${Math.min(index * 10, 300)}ms` }}
            >
              {/* Checkbox */}
              {isSelectMode && (
                <div className="w-10 px-3 py-3 flex-shrink-0 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelect?.(event.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                </div>
              )}
              {/* Time */}
              <div className={clsx(
                'w-32 px-4 py-3 whitespace-nowrap flex-shrink-0 text-xs',
                isSelected ? 'text-white' : 'text-text-muted'
              )}>
                {formatSmartTime(event.timestamp)}
              </div>

              {/* Level Badge */}
              <div className="w-24 px-4 py-2.5 flex-shrink-0">
                <span
                  className={clsx(
                    'inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-2xs font-bold shadow-sm',
                    levelStyle.bg,
                    levelStyle.color
                  )}
                >
                  {levelLabels[event.level]}
                </span>
              </div>

              {/* Category */}
              <div className={clsx(
                'w-36 px-4 py-3 truncate flex-shrink-0 text-xs font-medium',
                isSelected ? 'text-white' : 'text-primary'
              )} title={event.category || event.subsystem || '-'}>
                {event.category || event.subsystem || '-'}
              </div>

              {/* Message */}
              <div className={clsx(
                'flex-1 px-4 py-3 break-all whitespace-pre-wrap leading-relaxed text-xs',
                isSelected ? 'text-white' : 'text-text-primary'
              )}>
                {event.message}
              </div>
            </div>
          )
        })}

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted py-20">
            <div className="w-16 h-16 rounded-2xl bg-bg-light/50 flex items-center justify-center mb-4">
              <LogIcon size={32} className="opacity-60" />
            </div>
            <p className="text-sm font-medium text-text-secondary mb-1">暂无日志</p>
            <p className="text-xs text-text-muted">等待日志事件到达...</p>
          </div>
        )}
      </div>
    </div>
  )
}
