// VirtualHTTPEventTable.tsx
// 使用虚拟滚动优化的 HTTP 事件列表
//
// Created by Sun on 2025/12/06.
// Copyright © 2025 Sun. All rights reserved.
//

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HTTPEventSummary, TrafficRule, MockRule } from '@/types'
import { type ListItem, isSessionDivider } from '@/stores/httpStore'
import { useRuleStore } from '@/stores/ruleStore'
import { useFavoriteUrlStore } from '@/stores/favoriteUrlStore'
import { useResizableColumns, ColumnResizeHandle, ColumnDivider, type ColumnConfig } from '@/hooks/useResizableColumns'
import { useNewItemHighlight } from '@/hooks/useNewItemHighlight'
import { useRedirectChain } from '@/hooks/useRedirectChain'
import {
    formatSmartTime,
    formatDuration,
    getDurationClass,
    getStatusClass,
    getMethodClass,
    getDurationBarClass,
    truncateUrl,
    extractDomain,
} from '@/utils/format'
import { isHTTPEventError } from '@/utils/httpEvent'
import clsx from 'clsx'
import { MockIcon, StarIcon, HttpIcon, TagIcon, HighlightIcon, RefreshIcon, LinkIcon, ArrowRightIcon } from './icons'
import { MockRulePopover } from './MockRulePopover'
import { Checkbox } from './Checkbox'
import { LoadMoreButton } from './LoadMoreButton'

// 行高度（像素）
const ROW_HEIGHT = 44

// HTTP 表格列配置
const HTTP_COLUMNS: ColumnConfig[] = [
    { id: 'index', label: '#', defaultWidth: 48, minWidth: 40, maxWidth: 80, resizable: false },
    { id: 'marker', label: '', defaultWidth: 24, minWidth: 24, maxWidth: 24, resizable: false },
    { id: 'time', label: '时间', defaultWidth: 100, minWidth: 80, maxWidth: 160, resizable: true },
    { id: 'method', label: '方法', defaultWidth: 90, minWidth: 70, maxWidth: 120, resizable: true },
    { id: 'status', label: '状态', defaultWidth: 80, minWidth: 60, maxWidth: 100, resizable: true },
    { id: 'url', label: 'URL / 域名', flex: true, minWidth: 150, resizable: true },
    { id: 'duration', label: '耗时', defaultWidth: 90, minWidth: 60, maxWidth: 120, resizable: true },
    { id: 'tags', label: '标记', defaultWidth: 80, minWidth: 60, maxWidth: 120, resizable: false },
]

// 滚动控制回调接口
export interface ScrollControls {
    scrollToTop: () => void
    scrollToBottom: () => void
    isAtTop: boolean
    isAtBottom: boolean
}

interface Props {
    items: ListItem[]
    selectedId: string | null
    onSelect: (id: string) => void
    autoScroll: boolean
    /** 当前设备 ID，用于获取设备特定的规则 */
    deviceId?: string
    // 批量选择
    isSelectMode?: boolean
    selectedIds?: Set<string>
    onToggleSelect?: (id: string) => void
    /** Mock 规则列表，用于点击 Mock 标记时显示匹配的规则 */
    mockRules?: MockRule[]
    /** 点击编辑 Mock 规则 */
    onEditMockRule?: (rule: MockRule) => void
    /** 是否显示已隐藏请求（默认 false，即隐藏被规则过滤的请求） */
    showBlacklisted?: boolean
    // 加载更多
    onLoadMore?: () => void
    hasMore?: boolean
    isLoading?: boolean
    loadedCount?: number
    totalCount?: number
    /** 滚动控制回调，用于暴露滚动功能给父组件 */
    onScrollControlsReady?: (controls: ScrollControls) => void
}

/**
 * 匹配事件对应的规则
 */
function matchEventRule(event: HTTPEventSummary, rules: TrafficRule[]): TrafficRule | undefined {
    return rules.find(rule => {
        if (!rule.isEnabled) return false

        if (rule.matchType === 'domain') {
            try {
                const url = new URL(event.url)
                return url.hostname === rule.matchValue || url.hostname.endsWith('.' + rule.matchValue)
            } catch {
                return false
            }
        }

        if (rule.matchType === 'urlRegex') {
            try {
                const regex = new RegExp(rule.matchValue)
                return regex.test(event.url)
            } catch {
                return false
            }
        }

        // header 类型需要详细数据，在 summary 列表中跳过
        return false
    })
}

export function VirtualHTTPEventTable({
    items,
    selectedId,
    onSelect,
    autoScroll,
    deviceId,
    isSelectMode = false,
    selectedIds = new Set(),
    onToggleSelect,
    mockRules = [],
    onEditMockRule,
    showBlacklisted = false,
    onLoadMore,
    hasMore = false,
    isLoading = false,
    loadedCount = 0,
    totalCount = 0,
    onScrollControlsReady,
}: Props) {
    const parentRef = useRef<HTMLDivElement>(null)
    const lastFirstItemRef = useRef<string | null>(null)
    const [isAtTop, setIsAtTop] = useState(true)
    const [isAtBottom, setIsAtBottom] = useState(false)

    // 可调整列宽
    const { getColumnStyle, isResizing, startResize } = useResizableColumns({
        storageKey: 'http-table',
        columns: HTTP_COLUMNS,
    })

    // 获取规则
    const { deviceRules, rules, fetchDeviceRules, fetchRules } = useRuleStore()

    // 获取 URL 级别收藏状态
    const { isFavorite: isUrlFavorite } = useFavoriteUrlStore()

    // 加载规则
    useEffect(() => {
        if (deviceId) {
            fetchDeviceRules(deviceId)
        } else {
            fetchRules()
        }
    }, [deviceId, fetchDeviceRules, fetchRules])

    // 当前适用的规则列表
    const applicableRules = useMemo(() => {
        return deviceId ? deviceRules : rules
    }, [deviceId, deviceRules, rules])

    // 过滤掉会话分隔符，只保留 HTTP 事件
    const rawHttpEvents = useMemo(() => {
        return items.filter((item) => !isSessionDivider(item)) as HTTPEventSummary[]
    }, [items])

    // 应用规则过滤（隐藏匹配 'hide' 规则的事件）
    // 当 showBlacklisted 为 true 时，显示所有事件（包括黑名单）
    const httpEvents = useMemo(() => {
        if (showBlacklisted || applicableRules.length === 0) {
            return rawHttpEvents
        }

        return rawHttpEvents.filter(event => {
            const rule = matchEventRule(event, applicableRules)
            // 如果匹配到 hide 规则，则隐藏
            return !rule || rule.action !== 'hide'
        })
    }, [rawHttpEvents, applicableRules, showBlacklisted])

    const { chainMap, redirectNextMap } = useRedirectChain(httpEvents)

    const maxDurationMs = useMemo(() => {
        let max = 0
        for (const event of httpEvents) {
            if (typeof event.duration === 'number') {
                const value = event.duration * 1000
                if (value > max) max = value
            }
        }
        return max
    }, [httpEvents])

    // 跟踪新增项高亮
    const { isNewItem } = useNewItemHighlight(httpEvents)

    // 生成一个稳定的 key，当 httpEvents 数组内容变化时更新
    // 使用第一个事件的 ID 和数组长度来唯一标识当前数据状态
    const virtualizerKey = useMemo(() => {
        const firstId = httpEvents[0]?.id || 'empty'
        return `${firstId}-${httpEvents.length}`
    }, [httpEvents])

    // 虚拟滚动器
    const virtualizer = useVirtualizer({
        count: httpEvents.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 10, // 预渲染额外的行
        // 使用唯一 key 来区分每个项，避免数据变化后列表重叠
        getItemKey: useCallback((index: number) => httpEvents[index]?.id ?? `item-${index}`, [httpEvents]),
    })

    const virtualItems = virtualizer.getVirtualItems()

    // 滚动位置监听
    useEffect(() => {
        const scrollElement = parentRef.current
        if (!scrollElement) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = scrollElement
            const atTop = scrollTop <= 10
            const atBottom = scrollTop + clientHeight >= scrollHeight - 10
            setIsAtTop(atTop)
            setIsAtBottom(atBottom)
        }

        // 初始状态
        handleScroll()

        scrollElement.addEventListener('scroll', handleScroll, { passive: true })
        return () => scrollElement.removeEventListener('scroll', handleScroll)
    }, [])

    // 滚动控制函数
    const scrollToTop = useCallback(() => {
        virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
    }, [virtualizer])

    const scrollToBottom = useCallback(() => {
        if (httpEvents.length > 0) {
            virtualizer.scrollToIndex(httpEvents.length - 1, { align: 'end', behavior: 'smooth' })
        }
    }, [virtualizer, httpEvents.length])

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

    // 当数据变化时（特别是新事件添加到头部），强制重新计算
    useEffect(() => {
        // 清除所有缓存的测量值，从头开始
        virtualizer.measure()
    }, [virtualizerKey, virtualizer])

    // 当有新事件添加到列表头部时自动滚动到顶部
    useEffect(() => {
        const firstEvent = httpEvents[0]
        const firstId = firstEvent?.id ?? null
        const hasNewItem = firstId !== null && firstId !== lastFirstItemRef.current

        if (autoScroll && hasNewItem) {
            virtualizer.scrollToIndex(0, { align: 'start', behavior: 'smooth' })
        }

        lastFirstItemRef.current = firstId
    }, [httpEvents, autoScroll, virtualizer])

    const scrollToEventId = useCallback((eventId: string) => {
        const index = httpEvents.findIndex((event) => event.id === eventId)
        if (index >= 0) {
            virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
        }
    }, [httpEvents, virtualizer])

    const selectAndScroll = useCallback((eventId: string) => {
        onSelect(eventId)
        scrollToEventId(eventId)
    }, [onSelect, scrollToEventId])

    const handleRowClick = useCallback((event: HTTPEventSummary, e: React.MouseEvent) => {
        if (isSelectMode && onToggleSelect) {
            e.preventDefault()
            onToggleSelect(event.id)
        } else {
            // 如果已选中，再次点击则取消选中
            if (selectedId === event.id) {
                onSelect('')
            } else {
                onSelect(event.id)
            }
        }
    }, [isSelectMode, onToggleSelect, onSelect, selectedId])

    const renderEventRowContent = (event: HTTPEventSummary, _index: number) => {
        const isError = isHTTPEventError(event.statusCode, event.error, event.errorDescription)
        const isSelected = event.id === selectedId
        const isChecked = selectedIds.has(event.id)
        const redirectNextId = redirectNextMap.get(event.id)
        const chainMeta = chainMap.get(event.id)
        const chainLabel = chainMeta && chainMeta.total > 1
            ? `重定向 ${chainMeta.index}/${chainMeta.total}`
            : null
        // 使用后端返回的序号，保证删除数据后原有序号不变
        const rowNumber = event.seqNum

        // 使用 URL 级别的收藏状态（优先于请求级别的状态）
        const isFavorite = deviceId ? isUrlFavorite(deviceId, event.url) : event.isFavorite

        // 直接使用 event.isMocked 状态，不需要检查规则是否仍然存在
        // 即使规则被删除，已经被 Mock 的请求仍然应该显示 Mock 标记
        const isMocked = event.isMocked

        // 检查是否匹配规则（用于高亮/标记）
        const matchedRule = matchEventRule(event, applicableRules)
        const isHighlighted = matchedRule?.action === 'highlight'
        const isMarked = matchedRule?.action === 'mark'
        // 标记规则默认使用蓝色（与规则列表的 badge-info 一致）
        const ruleColor = matchedRule?.color || (isMarked ? '#60a5fa' : undefined)

        // 计算最终样式
        const rowStyle: React.CSSProperties = isMarked && ruleColor && !isSelected
            ? { borderLeftColor: ruleColor }
            : {}

        // 检查是否为新增项
        const isNew = isNewItem(event.id)

        return (
            <div
                style={rowStyle}
                onClick={(e) => handleRowClick(event, e)}
                className={clsx(
                    'flex items-center cursor-pointer transition-all duration-150 group border-b border-border h-full',
                    // 选中状态 - 底色块样式，使用主题绿色
                    isSelected && 'bg-selected',
                    // 批量选中（非选中状态）
                    !isSelected && isChecked && 'bg-primary/15',
                    // 高亮规则（非选中状态）- 只用底色，去掉左边框
                    !isSelected && !isChecked && isHighlighted && 'bg-yellow-500/10 hover:bg-yellow-500/20',
                    // 标记规则（非选中、非高亮状态）
                    !isSelected && !isChecked && !isHighlighted && isMarked && 'border-l-4',
                    // 错误状态（非选中、非高亮状态）
                    !isSelected && !isChecked && !isHighlighted && isError && 'bg-red-500/5 hover:bg-red-500/10',
                    // 默认悬停
                    !isSelected && !isChecked && !isHighlighted && !isError && 'hover:bg-bg-light/60',
                    // 新增项高亮动画
                    isNew && !isSelected && 'animate-row-new'
                )}
            >
                {/* 序号列 */}
                <div style={getColumnStyle('index')} className={clsx(
                    'flex items-center justify-center text-xs font-mono',
                    isSelected ? 'text-selected-text-muted' : 'text-text-muted'
                )}>
                    {rowNumber}
                </div>

                {/* 标记图标区域 - 始终保留宽度以确保列对齐 */}
                <div style={getColumnStyle('marker')} className="flex items-center justify-center">
                    {isHighlighted && <HighlightIcon size={12} filled className="text-yellow-500" />}
                    {isMarked && !isHighlighted && <TagIcon size={12} style={{ color: ruleColor }} />}
                </div>

                {/* Checkbox */}
                {isSelectMode && (
                    <div className="w-10 flex-shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={isChecked}
                            onChange={() => onToggleSelect?.(event.id)}
                        />
                    </div>
                )}

                {/* Time */}
                <div style={getColumnStyle('time')} className={clsx(
                    'px-3 py-2.5',
                    isSelected ? 'text-selected-text-secondary' : 'text-text-muted'
                )}>
                    <span className="text-xs font-mono">{formatSmartTime(event.startTime)}</span>
                </div>

                {/* Method */}
                <div style={getColumnStyle('method')} className="px-3 py-2.5">
                    <span
                        className={clsx(
                            'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider min-w-[52px]',
                            getMethodClass(event.method)
                        )}
                    >
                        {event.method}
                    </span>
                </div>

                {/* Status */}
                <div style={getColumnStyle('status')} className="px-3 py-2.5">
                    <span
                        className={clsx(
                            'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider min-w-[44px]',
                            getStatusClass(event.statusCode)
                        )}
                    >
                        {event.statusCode ?? 'ERR'}
                    </span>
                </div>

                {/* URL */}
                <div style={getColumnStyle('url')} className="px-3 py-2.5 min-w-0 overflow-hidden">
                    <div className="flex flex-col">
                        <span className={clsx(
                            'text-xs truncate transition-colors',
                            isSelected ? 'text-selected-text-primary font-medium' : 'text-text-primary'
                        )} title={event.url}>
                            {truncateUrl(event.url)}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={clsx(
                                'text-2xs truncate font-mono',
                                isSelected ? 'text-selected-text-muted' : 'text-text-muted'
                            )}>
                                {extractDomain(event.url)}
                            </span>
                            {chainLabel && (
                                <span
                                    className="text-2xs font-mono text-cyan-400 shrink-0"
                                    title={chainLabel}
                                >
                                    {chainLabel}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Duration */}
                <div style={getColumnStyle('duration')} className="relative px-3 py-2.5">
                    <span
                        className={clsx(
                            'text-xs font-mono font-semibold',
                            getDurationClass(event.duration)
                        )}
                    >
                        {formatDuration(event.duration)}
                    </span>
                    {(() => {
                        if (typeof event.duration !== 'number' || maxDurationMs <= 0) return null
                        const durationMs = event.duration * 1000
                        const ratio = durationMs / maxDurationMs
                        const showBar = durationMs >= 100 && ratio >= 0.03
                        if (!showBar) return null
                        return (
                            <div className="absolute left-3 right-3 bottom-1 h-0.5 bg-bg-light/40 rounded-full overflow-hidden pointer-events-none">
                                <div
                                    className={clsx('h-full rounded-full', getDurationBarClass(event.duration))}
                                    style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                                />
                            </div>
                        )
                    })()}
                </div>

                {/* Tags */}
                <div style={getColumnStyle('tags')} className="px-3 py-2.5 flex items-center justify-center gap-1.5">
                    {event.redirectFromId && (
                        <button
                            className="inline-flex items-center justify-center w-5 h-5 text-cyan-400 hover:text-cyan-300 transition-colors"
                            title="跳转到重定向来源"
                            onClick={(e) => {
                                e.stopPropagation()
                                const redirectFromId = event.redirectFromId
                                if (!redirectFromId) return
                                selectAndScroll(redirectFromId)
                            }}
                        >
                            <LinkIcon size={12} />
                        </button>
                    )}
                    {!event.redirectFromId && redirectNextId && (
                        <button
                            className="inline-flex items-center justify-center w-5 h-5 text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="跳转到重定向下一跳"
                            onClick={(e) => {
                                e.stopPropagation()
                                selectAndScroll(redirectNextId)
                            }}
                        >
                            <ArrowRightIcon size={12} />
                        </button>
                    )}
                    {!event.redirectFromId && !redirectNextId && event.redirectToUrl && (
                        <span className="inline-flex items-center justify-center w-5 h-5 text-cyan-400" title="已重定向">
                            <LinkIcon size={12} />
                        </span>
                    )}
                    {event.isReplay && (
                        <span className="inline-flex items-center justify-center w-5 h-5 text-blue-400" title="重放请求">
                            <RefreshIcon size={12} />
                        </span>
                    )}
                    {isMocked && (
                        <MockRulePopover
                            url={event.url}
                            mockRuleId={event.mockRuleId}
                            rules={mockRules}
                            onEditRule={onEditMockRule}
                        >
                            <span className="inline-flex items-center justify-center w-5 h-5 text-purple-400 hover:text-purple-300 transition-colors cursor-pointer" title="已 Mock - 点击查看规则">
                                <MockIcon size={12} />
                            </span>
                        </MockRulePopover>
                    )}
                    {isFavorite && (
                        <span className="badge-favorite text-sm" title="已收藏">
                            <StarIcon size={12} filled />
                        </span>
                    )}
                    {!isMocked && !isFavorite && !event.isReplay && !event.redirectFromId && !event.redirectToUrl && !redirectNextId && (
                        <span className="w-5 h-5" />
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className={clsx('h-full flex flex-col', isResizing && 'select-none')}>
            {/* Header */}
            <div className="flex items-center bg-bg-medium border-b border-border text-text-secondary sticky top-0 z-10 flex-shrink-0">
                {/* 序号列 */}
                <div style={getColumnStyle('index')} className="relative px-2 py-1.5 font-semibold text-xs uppercase tracking-wider text-center">
                    #
                    <ColumnDivider />
                </div>
                {/* 标记图标区域占位 */}
                <div style={getColumnStyle('marker')} className="relative">
                    <ColumnDivider />
                </div>
                {isSelectMode && (
                    <div className="relative px-2 py-1.5 w-10 flex-shrink-0">
                        <span className="sr-only">选择</span>
                        <ColumnDivider />
                    </div>
                )}
                <div style={getColumnStyle('time')} className="relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wider">
                    时间
                    <ColumnResizeHandle onMouseDown={(e) => startResize('time', e.clientX)} isResizing={isResizing} />
                </div>
                <div style={getColumnStyle('method')} className="relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wider">
                    方法
                    <ColumnResizeHandle onMouseDown={(e) => startResize('method', e.clientX)} isResizing={isResizing} />
                </div>
                <div style={getColumnStyle('status')} className="relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wider">
                    状态
                    <ColumnResizeHandle onMouseDown={(e) => startResize('status', e.clientX)} isResizing={isResizing} />
                </div>
                <div style={getColumnStyle('url')} className="relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wider min-w-0">
                    URL / 域名
                    <ColumnResizeHandle onMouseDown={(e) => startResize('url', e.clientX)} isResizing={isResizing} />
                </div>
                <div style={getColumnStyle('duration')} className="relative px-3 py-1.5 font-semibold text-xs uppercase tracking-wider">
                    耗时
                    <ColumnResizeHandle onMouseDown={(e) => startResize('duration', e.clientX)} isResizing={isResizing} />
                </div>
                <div style={getColumnStyle('tags')} className="px-3 py-1.5 font-semibold text-xs uppercase tracking-wider text-center">标记</div>
            </div>

            {/* Virtual List */}
            <div ref={parentRef} className="flex-1 overflow-auto">
                {httpEvents.length > 0 ? (
                    <div
                        key={virtualizerKey}
                        style={{
                            height: `${virtualizer.getTotalSize() + (onLoadMore ? 60 : 0)}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const event = httpEvents[virtualItem.index]
                            // 使用 event.id 和 index 组合作为 key，确保唯一性
                            const rowKey = `${event.id}-${virtualItem.index}`
                            return (
                                <div
                                    key={rowKey}
                                    style={{
                                        position: 'absolute',
                                        top: `${virtualItem.start}px`,
                                        left: 0,
                                        width: '100%',
                                        height: `${ROW_HEIGHT}px`,
                                    }}
                                >
                                    {renderEventRowContent(event, virtualItem.index)}
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
                        <div className="w-16 h-16 rounded-lg bg-bg-light flex items-center justify-center mb-4 border border-border">
                            <HttpIcon size={32} className="opacity-60" />
                        </div>
                        <p className="text-sm font-medium text-text-secondary mb-1">暂无 HTTP 请求</p>
                        <p className="text-xs text-text-muted">等待网络请求被捕获...</p>
                    </div>
                )}
            </div>
        </div>
    )
}
