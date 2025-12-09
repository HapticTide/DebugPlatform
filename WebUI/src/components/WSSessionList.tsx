import { useEffect, useRef, memo, useState, useMemo } from 'react'
import type { WSSessionSummary } from '@/types'
import { formatSmartTime, extractDomain, formatDuration } from '@/utils/format'
import clsx from 'clsx'
import { WebSocketIcon, ChevronDownIcon, ChevronRightIcon } from './icons'

// 分组数据结构
interface SessionGroup {
  url: string
  domain: string
  sessions: WSSessionSummary[]
  hasActiveSession: boolean
}

interface WSSessionListProps {
  sessions: WSSessionSummary[]
  selectedId: string | null
  onSelect: (sessionId: string) => void
  loading?: boolean
  autoScroll?: boolean
  // 批量选择相关
  isSelectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

// 按 URL 分组会话
function groupSessionsByUrl(sessions: WSSessionSummary[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>()

  for (const session of sessions) {
    const url = session.url
    if (!groups.has(url)) {
      groups.set(url, {
        url,
        domain: extractDomain(url),
        sessions: [],
        hasActiveSession: false,
      })
    }
    const group = groups.get(url)!
    group.sessions.push(session)
    if (session.isOpen) {
      group.hasActiveSession = true
    }
  }

  // 每组内的 session 按连接时间降序排列（最新的在前）
  for (const group of groups.values()) {
    group.sessions.sort(
      (a, b) => new Date(b.connectTime).getTime() - new Date(a.connectTime).getTime()
    )
  }

  // 组按照最新 session 的时间降序排列，活跃的优先
  return Array.from(groups.values()).sort((a, b) => {
    // 活跃组优先
    if (a.hasActiveSession !== b.hasActiveSession) {
      return a.hasActiveSession ? -1 : 1
    }
    // 然后按最新连接时间
    const aTime = new Date(a.sessions[0].connectTime).getTime()
    const bTime = new Date(b.sessions[0].connectTime).getTime()
    return bTime - aTime
  })
}

export function WSSessionList({
  sessions,
  selectedId,
  onSelect,
  loading,
  autoScroll,
  isSelectMode = false,
  selectedIds = new Set(),
  onToggleSelect,
}: WSSessionListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const prevFirstIdRef = useRef<string | null>(null)

  // 分组数据
  const groups = useMemo(() => groupSessionsByUrl(sessions), [sessions])

  // 展开状态：默认全部展开
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // 初始化时展开所有组
  useEffect(() => {
    setExpandedGroups(new Set(groups.map((g) => g.url)))
  }, [groups.length]) // 只在组数量变化时更新

  // 自动滚动逻辑：新会话到达时滚动到顶部
  useEffect(() => {
    if (!autoScroll || sessions.length === 0) return

    const firstId = sessions[0]?.id
    if (firstId && firstId !== prevFirstIdRef.current && containerRef.current) {
      containerRef.current.scrollTop = 0
    }
    prevFirstIdRef.current = firstId
  }, [sessions, autoScroll])

  // 切换组展开状态
  const toggleGroup = (url: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(url)) {
        next.delete(url)
      } else {
        next.add(url)
      }
      return next
    })
  }

  if (sessions.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
        <WebSocketIcon size={36} className="mb-3 opacity-50" />
        <p className="text-sm">暂无 WebSocket 会话</p>
        <p className="text-xs mt-1 text-text-muted">当设备建立 WebSocket 连接时会显示在这里</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="overflow-auto h-full">
      {/* 分组会话列表 */}
      <div className="divide-y divide-border/50">
        {groups.map((group) => (
          <SessionGroupItem
            key={group.url}
            group={group}
            isExpanded={expandedGroups.has(group.url)}
            onToggleExpand={() => toggleGroup(group.url)}
            selectedId={selectedId}
            onSelect={onSelect}
            isSelectMode={isSelectMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>

      {/* 加载指示器 */}
      {loading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}

// 会话组组件
const SessionGroupItem = memo(function SessionGroupItem({
  group,
  isExpanded,
  onToggleExpand,
  selectedId,
  onSelect,
  isSelectMode,
  selectedIds,
  onToggleSelect,
}: {
  group: SessionGroup
  isExpanded: boolean
  onToggleExpand: () => void
  selectedId: string | null
  onSelect: (sessionId: string) => void
  isSelectMode: boolean
  selectedIds: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  const sessionCount = group.sessions.length
  const isMultiple = sessionCount > 1

  // 如果只有一个 session，直接显示完整信息
  if (!isMultiple) {
    return (
      <SessionItem
        session={group.sessions[0]}
        isSelected={selectedId === group.sessions[0].id}
        isChecked={selectedIds.has(group.sessions[0].id)}
        isSelectMode={isSelectMode}
        onSelect={onSelect}
        onToggleSelect={onToggleSelect}
        isGrouped={false}
      />
    )
  }

  return (
    <div>
      {/* 组头部 */}
      <div
        onClick={onToggleExpand}
        className="px-4 py-3 cursor-pointer hover:bg-bg-light/50 transition-colors flex items-center gap-2"
      >
        {/* 展开/折叠图标 */}
        <span className="text-text-muted w-4 h-4 flex items-center justify-center">
          {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </span>

        {/* 状态指示器 */}
        <StatusIndicator isOpen={group.hasActiveSession} />

        {/* 域名 */}
        <span className="font-mono text-sm truncate flex-1 text-text-primary">{group.domain}</span>

        {/* 连接数量 */}
        <span className="text-xs text-text-muted bg-bg-light px-2 py-0.5 rounded-full">
          {sessionCount} 个连接
        </span>
      </div>

      {/* 子 session 列表 */}
      {isExpanded && (
        <div className="bg-bg-base/50">
          {group.sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isSelected={selectedId === session.id}
              isChecked={selectedIds.has(session.id)}
              isSelectMode={isSelectMode}
              onSelect={onSelect}
              onToggleSelect={onToggleSelect}
              isGrouped={true}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// 单个会话项组件
const SessionItem = memo(function SessionItem({
  session,
  isSelected,
  isChecked,
  isSelectMode,
  onSelect,
  onToggleSelect,
  isGrouped,
}: {
  session: WSSessionSummary
  isSelected: boolean
  isChecked: boolean
  isSelectMode: boolean
  onSelect: (sessionId: string) => void
  onToggleSelect?: (id: string) => void
  isGrouped: boolean
}) {
  const duration = session.disconnectTime
    ? formatDuration(new Date(session.connectTime), new Date(session.disconnectTime))
    : null

  const handleClick = () => {
    if (isSelectMode && onToggleSelect) {
      onToggleSelect(session.id)
    } else {
      onSelect(session.id)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'cursor-pointer transition-all',
        // 分组时缩进
        isGrouped ? 'px-4 py-2 pl-10' : 'px-4 py-3',
        // 选中状态 - 底色块样式
        isSelected && !isSelectMode && 'bg-selected',
        // 批量选中模式下的选中
        isSelectMode && isChecked && 'bg-primary/15',
        // 默认悬停
        !isSelected && !isChecked && 'hover:bg-bg-light/50',
        // 分组内的边框
        isGrouped && 'border-b border-border/30 last:border-0'
      )}
    >
      {/* 第一行：选择框/状态、时间、连接状态 */}
      <div className="flex items-center gap-2 mb-1">
        {isSelectMode ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleSelect?.(session.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-border bg-bg-light text-primary focus:ring-primary/50 cursor-pointer"
          />
        ) : (
          <StatusIndicator isOpen={session.isOpen} isSelectedRow={isSelected && !isSelectMode} />
        )}

        {/* 分组模式下显示连接时间作为主要信息 */}
        {isGrouped ? (
          <>
            <span
              className={clsx(
                'text-sm flex-1',
                isSelected && !isSelectMode ? 'text-white' : 'text-text-primary'
              )}
            >
              {formatSmartTime(session.connectTime)}
            </span>
            {/* 状态标签 */}
            {session.isOpen ? (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                  isSelected && !isSelectMode
                    ? 'text-green-500 bg-green-500/20'
                    : 'text-green-400 bg-green-500/10'
                )}
              >
                <span
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full animate-pulse',
                    isSelected && !isSelectMode ? 'bg-green-500' : 'bg-green-400'
                  )}
                />
                活跃
              </span>
            ) : (
              <span
                className={clsx(
                  'text-xs px-2 py-0.5 rounded-full',
                  isSelected && !isSelectMode
                    ? 'text-white/70 bg-white/10'
                    : 'text-text-muted bg-bg-light'
                )}
              >
                已断开{session.closeCode ? ` (${session.closeCode})` : ''}
              </span>
            )}
          </>
        ) : (
          <>
            {/* 非分组模式：显示域名 */}
            <span
              className={clsx(
                'font-mono text-sm truncate flex-1',
                isSelected && !isSelectMode ? 'text-white font-medium' : 'text-text-primary'
              )}
            >
              {extractDomain(session.url)}
            </span>
            <span
              className={clsx(
                'text-xs',
                isSelected && !isSelectMode ? 'text-white/70' : 'text-text-muted'
              )}
            >
              {formatSmartTime(session.connectTime)}
            </span>
          </>
        )}
      </div>

      {/* 非分组模式：第二行显示完整 URL */}
      {!isGrouped && (
        <div
          className={clsx(
            'text-xs truncate font-mono ml-5',
            isSelected && !isSelectMode ? 'text-white/70' : 'text-text-muted'
          )}
        >
          {session.url}
        </div>
      )}

      {/* 分组模式：显示持续时间 */}
      {isGrouped && !session.isOpen && duration && (
        <div
          className={clsx(
            'text-xs ml-5',
            isSelected && !isSelectMode ? 'text-white/60' : 'text-text-muted'
          )}
        >
          持续 {duration}
        </div>
      )}

      {/* 非分组模式：第三行状态信息 */}
      {!isGrouped && (
        <div className="flex items-center gap-3 mt-1.5 ml-5">
          {session.isOpen ? (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-xs',
                isSelected && !isSelectMode ? 'text-green-500' : 'text-green-400'
              )}
            >
              <span
                className={clsx(
                  'w-1.5 h-1.5 rounded-full animate-pulse',
                  isSelected && !isSelectMode ? 'bg-green-500' : 'bg-green-400'
                )}
              />
              连接中
            </span>
          ) : (
            <>
              <span
                className={clsx(
                  'text-xs',
                  isSelected && !isSelectMode ? 'text-white/70' : 'text-text-muted'
                )}
              >
                已关闭{session.closeCode ? ` (${session.closeCode})` : ''}
              </span>
              {duration && (
                <span
                  className={clsx(
                    'text-xs',
                    isSelected && !isSelectMode ? 'text-white/70' : 'text-text-muted'
                  )}
                >
                  持续 {duration}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
})

function StatusIndicator({ isOpen, isSelectedRow }: { isOpen: boolean; isSelectedRow?: boolean }) {
  return (
    <span
      className={clsx(
        'w-3 h-3 rounded-full flex-shrink-0',
        isOpen
          ? 'bg-green-500 shadow-green-500/50 shadow-sm'
          : isSelectedRow
            ? 'bg-gray-400'
            : 'bg-gray-500'
      )}
    />
  )
}
