// GroupedHTTPEventList.tsx
// 按域名/路径分组的 HTTP 事件列表
//
// Created by Sun on 2025/12/06.
// Copyright © 2025 Sun. All rights reserved.
//

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HTTPEventSummary, TrafficRule } from '@/types'
import { useRuleStore } from '@/stores/ruleStore'
import { useRedirectChain } from '@/hooks/useRedirectChain'
import {
    formatSmartTime,
    formatDuration,
    getDurationClass,
    getDurationBarClass,
    getStatusClass,
    getMethodClass,
    extractDomain,
} from '@/utils/format'
import { isHTTPEventError } from '@/utils/httpEvent'
import clsx from 'clsx'
import {
    ChevronDownIcon,
    ChevronRightIcon,
    StarIcon,
    TagIcon,
    MockIcon,
    GlobeIcon,
    HighlightIcon,
    RefreshIcon,
    LinkIcon,
    ArrowRightIcon
} from './icons'
import { Checkbox } from './Checkbox'

// 分组模式
export type GroupMode = 'none' | 'domain' | 'path'

// 分组数据结构
interface EventGroup {
    key: string
    label: string
    count: number
    events: HTTPEventSummary[]
    expanded: boolean
    // 统计信息
    avgDuration: number
    errorCount: number
    mockedCount: number
}

// 虚拟列表项类型
type VirtualItem =
    | { type: 'group-header'; group: EventGroup; index: number }
    | { type: 'event'; event: HTTPEventSummary; groupKey: string; eventIndex: number }

interface Props {
    events: HTTPEventSummary[]
    groupMode: GroupMode
    selectedId: string | null
    onSelect: (id: string) => void
    /** 当前设备 ID，用于获取设备特定的规则 */
    deviceId?: string
    // 批量选择
    isSelectMode?: boolean
    selectedIds?: Set<string>
    onToggleSelect?: (id: string) => void
    /** 是否显示已隐藏请求（默认 false，即隐藏被规则过滤的请求） */
    showBlacklisted?: boolean
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

        return false
    })
}

// 按域名分组
function groupByDomain(events: HTTPEventSummary[]): Map<string, HTTPEventSummary[]> {
    const groups = new Map<string, HTTPEventSummary[]>()

    for (const event of events) {
        const domain = extractDomain(event.url) || 'unknown'
        if (!groups.has(domain)) {
            groups.set(domain, [])
        }
        groups.get(domain)!.push(event)
    }

    return groups
}

// 按路径前缀分组
function groupByPath(events: HTTPEventSummary[]): Map<string, HTTPEventSummary[]> {
    const groups = new Map<string, HTTPEventSummary[]>()

    for (const event of events) {
        try {
            const url = new URL(event.url)
            // 取前两级路径
            const pathParts = url.pathname.split('/').filter(Boolean)
            const prefix = pathParts.length > 0
                ? `${url.hostname}/${pathParts.slice(0, 2).join('/')}`
                : url.hostname

            if (!groups.has(prefix)) {
                groups.set(prefix, [])
            }
            groups.get(prefix)!.push(event)
        } catch {
            const key = 'invalid-url'
            if (!groups.has(key)) {
                groups.set(key, [])
            }
            groups.get(key)!.push(event)
        }
    }

    return groups
}

// 计算分组统计
function createEventGroups(
    events: HTTPEventSummary[],
    groupMode: GroupMode,
    expandedKeys: Set<string>
): EventGroup[] {
    if (groupMode === 'none') {
        return []
    }

    const grouped = groupMode === 'domain'
        ? groupByDomain(events)
        : groupByPath(events)

    const groups: EventGroup[] = []

    for (const [key, groupEvents] of grouped) {
        const durations = groupEvents
            .filter(e => e.duration !== null)
            .map(e => e.duration!)

        groups.push({
            key,
            label: key,
            count: groupEvents.length,
            events: groupEvents,
            expanded: expandedKeys.has(key),
            avgDuration: durations.length > 0
                ? durations.reduce((a, b) => a + b, 0) / durations.length
                : 0,
            errorCount: groupEvents.filter(e => isHTTPEventError(e.statusCode, e.error, e.errorDescription)).length,
            mockedCount: groupEvents.filter(e => e.isMocked).length,
        })
    }

    // 按请求数量排序
    groups.sort((a, b) => b.count - a.count)

    return groups
}

// 构建虚拟列表项
function buildVirtualItems(groups: EventGroup[]): VirtualItem[] {
    const items: VirtualItem[] = []

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        items.push({ type: 'group-header', group, index: i })

        if (group.expanded) {
            group.events.forEach((event, eventIndex) => {
                items.push({ type: 'event', event, groupKey: group.key, eventIndex: eventIndex + 1 })
            })
        }
    }

    return items
}

// 行高
const GROUP_HEADER_HEIGHT = 48
const EVENT_ROW_HEIGHT = 56

export function GroupedHTTPEventList({
    events,
    groupMode,
    selectedId,
    onSelect,
    deviceId,
    isSelectMode = false,
    selectedIds = new Set(),
    onToggleSelect,
    showBlacklisted = false,
}: Props) {
    const parentRef = useRef<HTMLDivElement>(null)
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
    const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)

    // 追踪有新请求的分组，用于高亮效果
    const [highlightedGroups, setHighlightedGroups] = useState<Set<string>>(new Set())
    const prevGroupCountsRef = useRef<Record<string, number>>({})

    // 获取规则
    const { deviceRules, rules, fetchDeviceRules, fetchRules } = useRuleStore()

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

    // 应用规则过滤（隐藏匹配 'hide' 规则的事件）
    // 当 showBlacklisted 为 true 时，显示所有事件（包括黑名单）
    const filteredEvents = useMemo(() => {
        if (showBlacklisted || applicableRules.length === 0) {
            return events
        }

        return events.filter(event => {
            const rule = matchEventRule(event, applicableRules)
            return !rule || rule.action !== 'hide'
        })
    }, [events, applicableRules, showBlacklisted])

    const maxDurationMs = useMemo(() => {
        let max = 0
        for (const event of filteredEvents) {
            if (typeof event.duration === 'number') {
                const value = event.duration * 1000
                if (value > max) max = value
            }
        }
        return max
    }, [filteredEvents])

    const { chainMap, redirectNextMap } = useRedirectChain(filteredEvents)

    // 计算分组
    const groups = useMemo(
        () => createEventGroups(filteredEvents, groupMode, expandedKeys),
        [filteredEvents, groupMode, expandedKeys]
    )

    // 追踪分组数量变化，为有新请求的分组添加高亮
    useEffect(() => {
        if (groupMode === 'none' || groups.length === 0) {
            prevGroupCountsRef.current = {}
            return
        }

        const currentCounts: Record<string, number> = {}
        groups.forEach(({ key, count }) => {
            currentCounts[key] = count
        })

        const newHighlights = new Set<string>()
        for (const [key, count] of Object.entries(currentCounts)) {
            const prevCount = prevGroupCountsRef.current[key] || 0
            if (count > prevCount && prevCount > 0) {
                // 只有当之前存在且数量增加时才高亮（避免初始加载时全部高亮）
                newHighlights.add(key)
            }
        }

        if (newHighlights.size > 0) {
            setHighlightedGroups(prev => new Set([...prev, ...newHighlights]))

            // 1.5 秒后移除高亮
            setTimeout(() => {
                setHighlightedGroups(prev => {
                    const next = new Set(prev)
                    newHighlights.forEach(key => next.delete(key))
                    return next
                })
            }, 1500)
        }

        prevGroupCountsRef.current = currentCounts
    }, [groups, groupMode])

    // 构建虚拟列表项
    const virtualItems = useMemo(
        () => buildVirtualItems(groups),
        [groups]
    )

    // 虚拟滚动器
    const virtualizer = useVirtualizer({
        count: virtualItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            const item = virtualItems[index]
            return item.type === 'group-header' ? GROUP_HEADER_HEIGHT : EVENT_ROW_HEIGHT
        },
        overscan: 10,
    })

    const jumpToEvent = useCallback((eventId: string) => {
        if (!eventId) return
        const targetGroup = groups.find(group => group.events.some(event => event.id === eventId))
        if (targetGroup && !targetGroup.expanded) {
            setExpandedKeys(prev => {
                const next = new Set(prev)
                next.add(targetGroup.key)
                return next
            })
        }
        setPendingScrollId(eventId)
        onSelect(eventId)
    }, [groups, onSelect])

    useEffect(() => {
        if (!pendingScrollId) return
        const existsInGroups = groups.some(group => group.events.some(event => event.id === pendingScrollId))
        if (!existsInGroups) {
            setPendingScrollId(null)
            return
        }
        const index = virtualItems.findIndex(
            item => item.type === 'event' && item.event.id === pendingScrollId
        )
        if (index >= 0) {
            virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
            setPendingScrollId(null)
        }
    }, [pendingScrollId, virtualItems, virtualizer, groups])

    // 切换分组展开
    const toggleGroup = useCallback((key: string) => {
        setExpandedKeys(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }, [])

    // 展开/收起所有
    const expandAll = useCallback(() => {
        setExpandedKeys(new Set(groups.map(g => g.key)))
    }, [groups])

    const collapseAll = useCallback(() => {
        setExpandedKeys(new Set())
    }, [])

    // 如果没有分组模式，返回 null（由父组件处理）
    if (groupMode === 'none') {
        return null
    }

    const handleRowClick = (event: HTTPEventSummary, e: React.MouseEvent) => {
        if (isSelectMode && onToggleSelect) {
            e.preventDefault()
            onToggleSelect(event.id)
        } else {
            onSelect(event.id)
        }
    }

    const renderGroupHeader = (group: EventGroup, style: React.CSSProperties) => {
        const isHighlighted = highlightedGroups.has(group.key)

        return (
            <div
                key={`group-${group.key}`}
                style={style}
                className={clsx(
                    "flex items-center px-4 py-2 bg-bg-light border-b border-border cursor-pointer hover:bg-bg-lighter",
                    isHighlighted && "animate-domain-highlight"
                )}
                onClick={() => toggleGroup(group.key)}
            >
                <span className="mr-2 text-text-secondary">
                    {group.expanded ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
                </span>
                <span className="font-medium text-text-primary flex-1 truncate">{group.label}</span>
                <div className="flex items-center gap-3 text-xs">
                    <span className={clsx(
                        "px-2 py-1 bg-bg-medium rounded text-text-secondary",
                        isHighlighted && "animate-count-pop"
                    )}>
                        {group.count} 请求
                    </span>
                    <span className="px-2 py-1 bg-bg-medium rounded text-text-muted">
                        平均 {formatDuration(group.avgDuration)}
                    </span>
                    {group.errorCount > 0 && (
                        <span className="px-2 py-1 bg-red-500/20 rounded text-red-400">
                            {group.errorCount} 错误
                        </span>
                    )}
                    {group.mockedCount > 0 && (
                        <span className="px-2 py-1 bg-purple-500/20 rounded text-purple-400">
                            {group.mockedCount} Mock
                        </span>
                    )}
                </div>
            </div>
        )
    }

    const renderEventRow = (event: HTTPEventSummary, style: React.CSSProperties, rowNumber: number) => {
        const isError = isHTTPEventError(event.statusCode, event.error, event.errorDescription)
        const isSelected = event.id === selectedId
        const isChecked = selectedIds.has(event.id)
        const redirectNextId = redirectNextMap.get(event.id)
        const chainMeta = chainMap.get(event.id)
        const chainLabel = chainMeta && chainMeta.total > 1
            ? `R${chainMeta.index}/${chainMeta.total}`
            : null

        // 直接使用 event.isMocked 状态，不需要检查规则是否仍然存在
        const isMocked = event.isMocked

        // 检查是否匹配规则（用于高亮/标记）
        const matchedRule = matchEventRule(event, applicableRules)
        const isHighlighted = matchedRule?.action === 'highlight'
        const isMarked = matchedRule?.action === 'mark'
        // 标记规则默认使用蓝色（与规则列表的 badge-info 一致）
        const ruleColor = matchedRule?.color || (isMarked ? '#60a5fa' : undefined)

        return (
            <div
                key={event.id}
                style={isMarked && ruleColor && !isSelected ? { ...style, borderLeftColor: ruleColor } : style}
                onClick={(e) => handleRowClick(event, e)}
                className={clsx(
                    'flex items-center cursor-pointer transition-all duration-150 group border-b border-border-light pl-8',
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
                    !isSelected && !isChecked && !isHighlighted && !isError && 'hover:bg-bg-light/60'
                )}
            >
                {/* 序号列 */}
                <div className={clsx(
                    'w-10 flex-shrink-0 flex items-center justify-center text-xs font-mono',
                    isSelected ? 'text-selected-text-muted' : 'text-text-muted'
                )}>
                    {rowNumber}
                </div>

                {/* 标记图标区域 - 始终保留宽度以确保列对齐 */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center">
                    {isHighlighted && <HighlightIcon size={12} filled className="text-yellow-500" />}
                    {isMarked && !isHighlighted && <TagIcon size={12} style={{ color: ruleColor }} />}
                </div>

                {/* Checkbox */}
                {isSelectMode && (
                    <div className="px-3 py-3.5 w-10 flex-shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                            checked={isChecked}
                            onChange={() => onToggleSelect?.(event.id)}
                        />
                    </div>
                )}

                {/* Time */}
                <div className={clsx(
                    'px-3 py-3.5 w-[90px] flex-shrink-0',
                    isSelected ? 'text-selected-text-secondary' : 'text-text-muted'
                )}>
                    <span className="text-sm font-mono">{formatSmartTime(event.startTime)}</span>
                </div>

                {/* Method */}
                <div className="px-3 py-3.5 w-[80px] flex-shrink-0">
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
                <div className="px-3 py-3.5 w-[70px] flex-shrink-0">
                    <span
                        className={clsx(
                            'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider min-w-[44px]',
                            getStatusClass(event.statusCode)
                        )}
                    >
                        {event.statusCode ?? 'ERR'}
                    </span>
                </div>

                {/* Path */}
                <div className="px-3 py-3.5 flex-1 min-w-0 overflow-hidden">
                    <span className={clsx(
                        'text-sm truncate',
                        isSelected ? 'text-selected-text-primary font-medium' : 'text-text-primary'
                    )} title={event.url}>
                        {(() => {
                            try {
                                return new URL(event.url).pathname
                            } catch {
                                return event.url
                            }
                        })()}
                    </span>
                </div>

                {/* Duration */}
                <div className="relative px-3 py-3.5 w-[90px] flex-shrink-0">
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
                            <div className="absolute left-3 right-3 bottom-2 h-0.5 bg-bg-light/40 rounded-full overflow-hidden pointer-events-none">
                                <div
                                    className={clsx('h-full rounded-full', getDurationBarClass(event.duration))}
                                    style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                                />
                            </div>
                        )
                    })()}
                </div>

                {/* Tags */}
                <div className="px-3 py-3.5 w-[60px] flex-shrink-0 flex items-center justify-center gap-1">
                    {chainLabel && (
                        <span className="text-2xs font-mono text-cyan-400" title={`重定向 ${chainMeta?.index}/${chainMeta?.total}`}>
                            {chainLabel}
                        </span>
                    )}
                    {event.redirectFromId && (
                        <button
                            className="text-cyan-400 hover:text-cyan-300 transition-colors"
                            title="跳转到重定向来源"
                            onClick={(e) => {
                                e.stopPropagation()
                                const redirectFromId = event.redirectFromId
                                if (!redirectFromId) return
                                jumpToEvent(redirectFromId)
                            }}
                        >
                            <LinkIcon size={14} />
                        </button>
                    )}
                    {!event.redirectFromId && redirectNextId && (
                        <button
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="跳转到重定向下一跳"
                            onClick={(e) => {
                                e.stopPropagation()
                                jumpToEvent(redirectNextId)
                            }}
                        >
                            <ArrowRightIcon size={14} />
                        </button>
                    )}
                    {!event.redirectFromId && !redirectNextId && event.redirectToUrl && (
                        <span className="text-cyan-400" title="已重定向">
                            <LinkIcon size={14} />
                        </span>
                    )}
                    {event.isReplay && (
                        <span className="text-blue-400" title="重放请求"><RefreshIcon size={14} /></span>
                    )}
                    {isMocked && (
                        <span className="text-purple-400" title="已 Mock"><MockIcon size={14} /></span>
                    )}
                    {event.isFavorite && (
                        <span title="已收藏"><StarIcon size={14} filled className="text-accent-yellow" /></span>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-bg-medium border-b border-border">
                <span className="text-sm text-text-secondary">
                    {groups.length} 个分组，{events.length} 个请求
                </span>
                <div className="flex gap-2">
                    <button
                        onClick={expandAll}
                        className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-bg-light rounded"
                    >
                        展开全部
                    </button>
                    <button
                        onClick={collapseAll}
                        className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-bg-light rounded"
                    >
                        收起全部
                    </button>
                </div>
            </div>

            {/* 虚拟列表 */}
            <div ref={parentRef} className="flex-1 overflow-auto">
                {virtualItems.length > 0 ? (
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative',
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                            const item = virtualItems[virtualItem.index]
                            const style: React.CSSProperties = {
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                            }

                            if (item.type === 'group-header') {
                                return renderGroupHeader(item.group, style)
                            } else {
                                return renderEventRow(item.event, style, item.eventIndex)
                            }
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted py-20">
                        <div className="w-16 h-16 rounded-2xl bg-bg-light/50 flex items-center justify-center mb-4">
                            <GlobeIcon size={32} className="opacity-60" />
                        </div>
                        <p className="text-sm font-medium text-text-secondary mb-1">暂无 HTTP 请求</p>
                        <p className="text-xs text-text-muted">等待网络请求被捕获...</p>
                    </div>
                )}
            </div>
        </div>
    )
}
