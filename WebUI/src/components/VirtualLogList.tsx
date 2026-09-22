// VirtualLogList.tsx
// 使用虚拟滚动优化的日志事件列表（支持动态行高）
//
// Created by Sun on 2025/12/06.
// Copyright © 2025 Sun. All rights reserved.
//

import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEvent, LogLevel } from '@/types'
import { formatSmartTime, getLogLevelClass } from '@/utils/format'
import { useResizableColumns, ColumnResizeHandle, ColumnDivider, type ColumnConfig } from '@/hooks/useResizableColumns'
import { useNewItemHighlight } from '@/hooks/useNewItemHighlight'
import clsx from 'clsx'
import { LogIcon } from './icons'
import { Checkbox } from './Checkbox'
import { LoadMoreButton } from './LoadMoreButton'

// 最小行高度（像素）
const MIN_ROW_HEIGHT = 36

// 判定"停在顶部"的容差（像素）
const TOP_THRESHOLD = 10

// 程序触发的滚动多久没有新的 scroll 事件即视为结束（毫秒）
const PROGRAMMATIC_SCROLL_SETTLE_MS = 150

// Log 表格列配置
const LOG_COLUMNS: ColumnConfig[] = [
  { id: 'indicator', label: '', defaultWidth: 4, minWidth: 4, maxWidth: 4, resizable: false },
  { id: 'index', label: '#', defaultWidth: 48, minWidth: 40, maxWidth: 80, resizable: false },
  { id: 'time', label: '时间', defaultWidth: 112, minWidth: 80, maxWidth: 180, resizable: true },
  { id: 'level', label: '级别', defaultWidth: 80, minWidth: 60, maxWidth: 100, resizable: true },
  { id: 'category', label: '分类', defaultWidth: 128, minWidth: 80, maxWidth: 200, resizable: true },
  { id: 'message', label: '消息内容', flex: true, minWidth: 150, resizable: true },
]

// 滚动控制回调接口
export interface LogScrollControls {
  scrollToTop: () => void
  scrollToBottom: () => void
  isAtTop: boolean
  isAtBottom: boolean
}

interface Props {
  events: LogEvent[]
  autoScroll: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onDoubleClick?: (event: LogEvent) => void
  isSelectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  // 加载更多
  onLoadMore?: () => void
  hasMore?: boolean
  isLoading?: boolean
  loadedCount?: number
  totalCount?: number
  /** 滚动控制回调，用于暴露滚动功能给父组件 */
  onScrollControlsReady?: (controls: LogScrollControls) => void
}

const levelLabels: Record<LogLevel, string> = {
  verbose: 'VERBOSE',
  debug: 'DEBUG',
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
}

export function VirtualLogList({
  events,
  autoScroll,
  selectedId,
  onSelect,
  onDoubleClick,
  isSelectMode = false,
  selectedIds = new Set(),
  onToggleSelect,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  loadedCount = 0,
  totalCount = 0,
  onScrollControlsReady,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const lastFirstItemRef = useRef<string | null>(null)
  // 是否跟随最新日志：只有视口停在顶部才跟随，用户往下翻看历史即暂停
  const followLatestRef = useRef(true)
  // 程序触发的滚动（跟随、顶部/底部按钮）不能被误判成用户翻看历史
  const programmaticScrollRef = useRef(false)
  const programmaticTimerRef = useRef<number | null>(null)
  // 暂停跟随时的锚点：视口顶部那条日志的 id，以及它相对视口顶边的偏移
  const anchorRef = useRef<{ id: string; offset: number } | null>(null)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isAtBottom, setIsAtBottom] = useState(false)

  // 可调整列宽
  const { getColumnStyle, isResizing, startResize } = useResizableColumns({
    storageKey: 'log-table',
    columns: LOG_COLUMNS,
  })

  // 跟踪新增项高亮
  const { isNewItem } = useNewItemHighlight(events)

  // 虚拟滚动器 - 使用动态大小
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MIN_ROW_HEIGHT, // 预估大小
    overscan: 5,
    getItemKey: useCallback((index: number) => events[index]?.id ?? `item-${index}`, [events]),
  })

  const virtualItems = virtualizer.getVirtualItems()

  // 记录视口顶部那条日志，作为暂停跟随时的位置锚点
  const captureAnchor = useCallback(() => {
    const scrollElement = parentRef.current
    if (!scrollElement) return
    const scrollTop = scrollElement.scrollTop
    const items = virtualizer.getVirtualItems()
    const anchorItem = items.find((item) => item.end > scrollTop) ?? items[0]
    anchorRef.current = anchorItem
      ? { id: String(anchorItem.key), offset: anchorItem.start - scrollTop }
      : null
  }, [virtualizer])

  // 按当前滚动位置刷新跟随状态：停在顶部才跟随最新，否则记锚点
  const syncFollowState = useCallback(() => {
    const scrollElement = parentRef.current
    if (!scrollElement) return
    const atTop = scrollElement.scrollTop <= TOP_THRESHOLD
    followLatestRef.current = atTop
    if (atTop) {
      anchorRef.current = null
    } else {
      captureAnchor()
    }
  }, [captureAnchor])

  // 标记接下来的滚动由程序触发，滚动停下来后再按落点刷新跟随状态
  const markProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true
  }, [])

  // 滚动位置监听
  useEffect(() => {
    const scrollElement = parentRef.current
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      const atTop = scrollTop <= TOP_THRESHOLD
      const atBottom = scrollTop + clientHeight >= scrollHeight - 10
      setIsAtTop(atTop)
      setIsAtBottom(atBottom)

      // 程序滚动期间不改跟随状态，等滚动停下来再按落点判定
      if (programmaticScrollRef.current) {
        if (programmaticTimerRef.current !== null) {
          window.clearTimeout(programmaticTimerRef.current)
        }
        programmaticTimerRef.current = window.setTimeout(() => {
          programmaticTimerRef.current = null
          programmaticScrollRef.current = false
          syncFollowState()
        }, PROGRAMMATIC_SCROLL_SETTLE_MS)
        return
      }

      syncFollowState()
    }

    // 初始状态
    handleScroll()

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
      if (programmaticTimerRef.current !== null) {
        window.clearTimeout(programmaticTimerRef.current)
        programmaticTimerRef.current = null
      }
    }
  }, [syncFollowState])

  // 滚动控制函数
  const scrollToTop = useCallback(() => {
    // 用户主动回到顶部 = 要求重新跟随最新日志
    followLatestRef.current = true
    anchorRef.current = null
    markProgrammaticScroll()
    virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
  }, [virtualizer, markProgrammaticScroll])

  const scrollToBottom = useCallback(() => {
    if (events.length > 0) {
      followLatestRef.current = false
      markProgrammaticScroll()
      virtualizer.scrollToIndex(events.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [virtualizer, events.length, markProgrammaticScroll])

  // 暴露滚动控制给父组件
  useEffect(() => {
    if (onScrollControlsReady) {
      onScrollControlsReady({
        scrollToTop,
        scrollToBottom,
        isAtTop,
        isAtBottom,
      })
    }
  }, [onScrollControlsReady, scrollToTop, scrollToBottom, isAtTop, isAtBottom])

  // 新事件插到列表头部后：跟随时滚回顶部，暂停跟随时把视口锚回用户正在看的那条
  useLayoutEffect(() => {
    const scrollElement = parentRef.current
    const firstId = events[0]?.id ?? null
    const previousFirstId = lastFirstItemRef.current
    const hasNewItem = firstId !== null && firstId !== previousFirstId
    lastFirstItemRef.current = firstId

    if (!scrollElement || !hasNewItem || previousFirstId === null) return

    if (autoScroll && followLatestRef.current) {
      markProgrammaticScroll()
      // 跟随用瞬时滚动：日志高频到达时 smooth 动画会互相打断
      virtualizer.scrollToIndex(0, { align: 'start' })
      return
    }

    // 用户正在翻看历史：头部插入的新日志会把视口内容顶下去，按锚点补偿回来
    const anchor = anchorRef.current
    if (!anchor) return
    const anchorIndex = events.findIndex((event) => event.id === anchor.id)
    if (anchorIndex < 0) return
    const anchorPlacement = virtualizer.getOffsetForIndex(anchorIndex, 'start')
    if (!anchorPlacement) return
    markProgrammaticScroll()
    scrollElement.scrollTop = anchorPlacement[0] - anchor.offset
  }, [events, autoScroll, virtualizer, markProgrammaticScroll])

  // 渲染行内容
  const renderRowContent = useCallback((event: LogEvent, index: number) => {
    const levelStyle = getLogLevelClass(event.level)
    const isChecked = selectedIds.has(event.id)
    const isSelected = !isSelectMode && selectedId === event.id
    // 使用后端返回的序号，保证删除数据后原有序号不变
    const rowNumber = event.seqNum
    // 检查是否为新增项
    const isNew = isNewItem(event.id)

    const handleClick = () => {
      if (isSelectMode) {
        onToggleSelect?.(event.id)
      } else {
        onSelect?.(event.id)
      }
    }

    const handleDoubleClick = () => {
      if (!isSelectMode) {
        onDoubleClick?.(event)
      }
    }

    return (
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={clsx(
          'flex items-start border-b border-border transition-all duration-150 cursor-pointer py-1.5 min-h-[36px]',
          // 选中状态（非批量选择模式）
          isSelected && 'bg-selected',
          // 批量选中
          !isSelected && isChecked && 'bg-primary/15',
          // 默认状态
          !isSelected && !isChecked && (index % 2 === 0 ? 'bg-bg-dark/20' : 'bg-transparent'),
          !isSelected && !isChecked && 'hover:bg-bg-light/60',
          // 新增项高亮动画
          isNew && !isSelected && 'animate-row-new'
        )}
      >
        {/* Level indicator bar */}
        <div style={getColumnStyle('indicator')} className={clsx('self-stretch', levelStyle.bg)} />

        {/* 序号列 */}
        <div style={getColumnStyle('index')} className={clsx(
          'px-2 whitespace-nowrap text-2xs font-mono text-center leading-5',
          isSelected ? 'text-selected-text-muted' : 'text-text-muted'
        )}>
          {rowNumber}
        </div>

        {/* Checkbox */}
        {isSelectMode && (
          <div className="w-10 px-2 flex-shrink-0 flex items-center h-5" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isChecked}
              onChange={() => onToggleSelect?.(event.id)}
            />
          </div>
        )}

        {/* Time */}
        <div style={getColumnStyle('time')} className={clsx(
          'px-2 whitespace-nowrap text-2xs leading-5',
          isSelected ? 'text-selected-text-secondary' : 'text-text-muted'
        )}>
          {formatSmartTime(event.timestamp)}
        </div>

        {/* Level Badge */}
        <div style={getColumnStyle('level')} className="px-2 leading-5">
          <span
            className={clsx(
              'inline-flex items-center justify-center px-1.5 py-0.5 rounded text-2xs font-bold',
              levelStyle.bg,
              levelStyle.color
            )}
          >
            {levelLabels[event.level]}
          </span>
        </div>

        {/* Category */}
        <div style={getColumnStyle('category')} className={clsx(
          'px-2 truncate text-2xs font-medium leading-5',
          isSelected ? 'text-selected-text-primary' : 'text-primary'
        )} title={event.category || event.subsystem || '-'}>
          {event.category || event.subsystem || '-'}
        </div>

        {/* Message - 完整显示，支持换行 */}
        <div style={getColumnStyle('message')} className={clsx(
          'px-2 text-2xs whitespace-pre-wrap break-words min-w-0 leading-5',
          isSelected ? 'text-selected-text-primary' : 'text-text-primary'
        )}>
          {event.message}
        </div>
      </div>
    )
  }, [selectedId, isSelectMode, selectedIds, onSelect, onToggleSelect, onDoubleClick, getColumnStyle, isNewItem])

  return (
    <div className={clsx('h-full flex flex-col overflow-hidden', isResizing && 'select-none')}>
      {/* Table Header */}
      <div className="flex-shrink-0 bg-bg-medium border-b border-border">
        <div className="flex items-center text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {/* Level indicator placeholder */}
          <div style={getColumnStyle('indicator')} className="relative">
            <ColumnDivider />
          </div>
          {/* 序号列 */}
          <div style={getColumnStyle('index')} className="relative px-2 py-1.5 text-center">
            #
            <ColumnDivider />
          </div>
          {isSelectMode && (
            <div className="relative w-10 px-2 py-1.5 flex-shrink-0">
              <span className="sr-only">选择</span>
              <ColumnDivider />
            </div>
          )}
          <div style={getColumnStyle('time')} className="relative px-2 py-1.5">
            时间
            <ColumnResizeHandle onMouseDown={(e) => startResize('time', e.clientX)} isResizing={isResizing} />
          </div>
          <div style={getColumnStyle('level')} className="relative px-2 py-1.5">
            级别
            <ColumnResizeHandle onMouseDown={(e) => startResize('level', e.clientX)} isResizing={isResizing} />
          </div>
          <div style={getColumnStyle('category')} className="relative px-2 py-1.5">
            分类
            <ColumnResizeHandle onMouseDown={(e) => startResize('category', e.clientX)} isResizing={isResizing} />
          </div>
          <div style={getColumnStyle('message')} className="relative px-2 py-1.5 min-w-0">
            消息内容
            <ColumnResizeHandle onMouseDown={(e) => startResize('message', e.clientX)} isResizing={isResizing} />
          </div>
        </div>
      </div>

      {/* Virtual List */}
      <div ref={parentRef} className="flex-1 overflow-auto font-mono text-sm">
        {events.length > 0 ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize() + (onLoadMore ? 60 : 0)}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const event = events[virtualItem.index]
              return (
                <div
                  // key 只用 id：带上 index 会让头部插入新日志时整屏行重建，行高缓存随之作废
                  key={event.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderRowContent(event, virtualItem.index)}
                </div>
              )
            })}

            {/* 加载更多按钮 - 定位在虚拟列表内容底部 */}
            {onLoadMore && (
              <div
                style={{
                  position: 'absolute',
                  top: `${virtualizer.getTotalSize()}px`,
                  left: 0,
                  width: '100%',
                }}
              >
                <LoadMoreButton
                  onClick={onLoadMore}
                  hasMore={hasMore}
                  isLoading={isLoading}
                  loadedCount={loadedCount}
                  totalCount={totalCount}
                />
              </div>
            )}
          </div>
        ) : (
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
