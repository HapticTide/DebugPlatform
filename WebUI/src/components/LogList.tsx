import { useEffect, useRef } from 'react'
import type { LogEvent, LogLevel } from '@/types'
import { formatSmartTime, getLogLevelClass } from '@/utils/format'
import clsx from 'clsx'

interface Props {
  events: LogEvent[]
  autoScroll: boolean
}

const levelLabels: Record<LogLevel, string> = {
  verbose: 'VERBOSE',
  debug: 'DEBUG',
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
}

export function LogList({ events, autoScroll }: Props) {
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
          <div className="w-32 px-4 py-3.5">时间</div>
          <div className="w-24 px-4 py-3.5">级别</div>
          <div className="w-36 px-4 py-3.5">分类</div>
          <div className="flex-1 px-4 py-3.5">消息内容</div>
        </div>
      </div>

      {/* Table Body */}
      <div ref={containerRef} className="flex-1 overflow-auto font-mono text-sm">
        {events.map((event, index) => {
          const levelStyle = getLogLevelClass(event.level)

          return (
            <div
              key={event.id}
              className={clsx(
                'flex items-start border-l-2 transition-all duration-150 hover:bg-bg-light/60',
                levelStyle.border,
                index % 2 === 0 ? 'bg-bg-dark/20' : 'bg-transparent'
              )}
              style={{ animationDelay: `${Math.min(index * 10, 300)}ms` }}
            >
              {/* Time */}
              <div className="w-32 px-4 py-3 text-text-muted whitespace-nowrap flex-shrink-0 text-xs">
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
              <div className="w-36 px-4 py-3 text-primary truncate flex-shrink-0 text-xs font-medium" title={event.category || event.subsystem || '-'}>
                {event.category || event.subsystem || '-'}
              </div>

              {/* Message */}
              <div className="flex-1 px-4 py-3 text-text-primary break-all whitespace-pre-wrap leading-relaxed text-xs">
                {event.message}
              </div>
            </div>
          )
        })}

        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted py-20">
            <div className="w-16 h-16 rounded-2xl bg-bg-light/50 flex items-center justify-center mb-4">
              <span className="text-3xl opacity-60">📝</span>
            </div>
            <p className="text-sm font-medium text-text-secondary mb-1">暂无日志</p>
            <p className="text-xs text-text-muted">等待日志事件到达...</p>
          </div>
        )}
      </div>
    </div>
  )
}
