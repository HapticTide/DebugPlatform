// 日志监控前端插件
// 使用 VirtualLogList 组件和 logStore

import React, { useEffect, useCallback, useState } from 'react'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
    BuiltinPluginId,
} from '../types'
import { LogIcon, TrashIcon, FilterIcon, ArrowUpIcon, ArrowDownIcon } from '@/components/icons'
import { useLogStore } from '@/stores/logStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToastStore } from '@/stores/toastStore'
import { VirtualLogList, type LogScrollControls } from '@/components/VirtualLogList'
import { LogFilters } from '@/components/LogFilters'
import { ListLoadingOverlay } from '@/components/ListLoadingOverlay'
import { Toggle } from '@/components/Toggle'
import { Checkbox } from '@/components/Checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LogDetailModal } from '@/components/LogDetailModal'
import { DynamicSearchInput } from '@/components/DynamicSearchInput'
import { deleteAllLogs } from '@/services/api'
import { LogEvent } from '@/types'
import clsx from 'clsx'

// 插件实现类
class LogPluginImpl implements FrontendPlugin {
    metadata: PluginMetadata = {
        pluginId: BuiltinPluginId.LOG,
        displayName: 'Log',
        version: '1.0.0',
        description: '应用日志监控',
        icon: <LogIcon size={16} />,
    }

    state: PluginState = 'uninitialized'
    isEnabled = true

    private pluginContext: PluginContext | null = null
    private unsubscribe: (() => void) | null = null

    async initialize(context: PluginContext): Promise<void> {
        this.pluginContext = context
        this.state = 'loading'

        // 注意：日志事件由 DevicePluginView 统一处理并添加到 logStore
        // 不需要在这里重复订阅，避免重复添加事件

        this.state = 'ready'
    }

    render(props: PluginRenderProps): React.ReactNode {
        return <LogPluginView {...props} />
    }

    onActivate(): void {
        console.log('[LogPlugin] Activated')
    }

    onDeactivate(): void {
        console.log('[LogPlugin] Deactivated')
    }

    onEvent(_event: PluginEvent): void {
        // 事件由 DevicePluginView 统一处理
    }

    destroy(): void {
        this.unsubscribe?.()
        this.pluginContext = null
        this.state = 'uninitialized'
    }

    get context(): PluginContext | null {
        return this.pluginContext
    }
}

// 插件视图组件
function LogPluginView({ context, isActive }: PluginRenderProps) {
    const deviceId = context.deviceId

    // 从 logStore 获取状态
    const {
        events,
        filteredEvents,
        total,
        isLoading,
        autoScroll,
        selectedId,
        selectedIds,
        isSelectMode,
        filters,
        subsystems,
        categories,
        fetchEvents,
        fetchFilterOptions,
        clearEvents,
        setAutoScroll,
        setFilter,
        setMinLevel,
        setSearchQuery,
        selectEvent,
        toggleSelectMode,
        toggleSelectId,
        selectAll,
        clearSelectedIds,
        batchDelete,
        loadMore,
        hasMore,
        // 清屏相关
        showCurrentSessionOnly,
        setShowCurrentSessionOnly,
        clearScreen,
    } = useLogStore()

    const { isConnected } = useConnectionStore()
    const toast = useToastStore()

    // 确认对话框状态
    const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [showMoreMenu, setShowMoreMenu] = useState(false)
    const [scrollControls, setScrollControls] = useState<LogScrollControls | null>(null)
    const [isClearingAll, setIsClearingAll] = useState(false)
    // 日志详情弹窗状态
    const [detailEvent, setDetailEvent] = useState<LogEvent | null>(null)

    // 初始加载
    useEffect(() => {
        if (isActive && deviceId) {
            // 确保 sessionStartTimestamp 已设置（用于"仅本次启动"过滤）
            const logStore = useLogStore.getState()
            if (!logStore.sessionStartTimestamp) {
                logStore.setSessionStartTimestamp(new Date().toISOString())
            }
            fetchEvents(deviceId)
            fetchFilterOptions(deviceId)
        }
    }, [isActive, deviceId, fetchEvents, fetchFilterOptions])

    // 刷新
    const handleRefresh = useCallback(() => {
        if (!deviceId) return
        fetchEvents(deviceId)
    }, [deviceId, fetchEvents])

    // 清除全部日志
    const handleClearAll = useCallback(async () => {
        if (!deviceId) return
        setIsClearingAll(true)
        try {
            const result = await deleteAllLogs(deviceId)
            clearEvents()
            toast.show('success', `已清除 ${result.deleted} 条日志`)
            setShowClearAllConfirm(false)
        } catch (error) {
            toast.show('error', '清除失败')
        } finally {
            setIsClearingAll(false)
        }
    }, [deviceId, clearEvents, toast])

    // 批量删除
    const handleBatchDelete = useCallback(async () => {
        if (!deviceId || selectedIds.size === 0) return
        await batchDelete(deviceId)
        setShowDeleteConfirm(false)
        toggleSelectMode()
        toast.show('success', `已删除 ${selectedIds.size} 条日志`)
    }, [deviceId, selectedIds.size, batchDelete, toggleSelectMode, toast])

    // 处理选择
    const handleSelect = useCallback((id: string | null) => {
        selectEvent(id)
    }, [selectEvent])

    // 处理双击显示详情
    const handleDoubleClick = useCallback((event: LogEvent) => {
        setDetailEvent(event)
    }, [])

    if (!isActive) {
        return null
    }

    return (
        <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* 刷新按钮 */}
                    <button
                        onClick={handleRefresh}
                        className="btn btn-secondary text-xs px-2.5 py-1.5"
                        title="刷新"
                        disabled={isLoading}
                    >
                        刷新
                    </button>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 批量选择按钮 */}
                    <button
                        onClick={toggleSelectMode}
                        className={clsx(
                            'btn text-xs px-2.5 py-1.5 flex-shrink-0',
                            isSelectMode ? 'btn-primary' : 'btn-secondary'
                        )}
                        title={isSelectMode ? '退出选择' : '批量选择'}
                    >
                        {isSelectMode ? '取消选择' : '批量选择'}
                    </button>

                    {/* 搜索输入框 */}
                    <DynamicSearchInput
                        value={filters.searchQuery || ''}
                        onChange={(value) => setSearchQuery(value)}
                        placeholder="搜索日志..."
                        minWidth={160}
                        maxWidthMultiplier={3}
                    />

                    {/* 过滤器按钮 */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors flex-shrink-0',
                            (showFilters || filters.minLevel !== 'verbose' || filters.subsystem || filters.category || filters.text)
                                ? 'bg-primary/15 text-primary border-primary hover:bg-primary/20'
                                : 'bg-bg-light text-text-secondary border-border hover:text-text-primary hover:border-text-muted'
                        )}
                        title="过滤器"
                    >
                        <FilterIcon size={14} />
                        过滤器
                    </button>

                    {isSelectMode && (
                        <>
                            <button
                                onClick={selectAll}
                                className="btn btn-secondary text-xs px-2 py-1.5"
                            >
                                全选
                            </button>
                            <button
                                onClick={clearSelectedIds}
                                className="btn btn-secondary text-xs px-2 py-1.5"
                            >
                                清除选择
                            </button>
                            {selectedIds.size > 0 && (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="btn text-xs px-2 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 flex items-center gap-1"
                                >
                                    <TrashIcon size={12} />
                                    删除 ({selectedIds.size})
                                </button>
                            )}
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {/* 清屏按钮 */}
                    {filteredEvents.length > 0 && (
                        <button
                            onClick={() => clearScreen()}
                            className="btn btn-secondary text-xs px-2 py-1.5 flex-shrink-0"
                            title="清屏（清除当前显示的数据，刷新不恢复）"
                        >
                            清屏
                        </button>
                    )}

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 自动滚动 */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-text-muted">自动滚动</span>
                        <Toggle
                            checked={autoScroll}
                            onChange={(checked) => setAutoScroll(checked)}
                        />
                    </div>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 更多菜单 */}
                    <div className="relative flex-shrink-0">
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className="btn btn-secondary text-xs px-2 py-1.5"
                            title="更多选项"
                        >
                            更多 ▾
                        </button>
                        {showMoreMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-[100]"
                                    onClick={() => setShowMoreMenu(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-48 bg-bg-dark border border-border rounded-lg shadow-lg z-[101] py-1">
                                    {/* 仅显示本次启动 */}
                                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-text-secondary cursor-pointer hover:bg-bg-light border-b border-border">
                                        <Checkbox
                                            checked={showCurrentSessionOnly}
                                            onChange={(checked) => setShowCurrentSessionOnly(checked)}
                                        />
                                        仅显示本次启动
                                    </label>

                                    {/* 清空全部（从数据库删除） */}
                                    {filteredEvents.length > 0 && (
                                        <button
                                            onClick={() => {
                                                setShowMoreMenu(false)
                                                setShowClearAllConfirm(true)
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                                            disabled={isClearingAll}
                                        >
                                            <TrashIcon size={14} />
                                            清空全部（从数据库删除）
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 连接状态 */}
                    <span className={clsx(
                        'px-2 py-0.5 rounded text-xs',
                        isConnected ? 'bg-status-success-bg text-status-success' : 'bg-red-500/20 text-red-400'
                    )}>
                        {isConnected ? '已连接' : '已断开'}
                    </span>

                    {/* 日志计数 */}
                    <span className="text-xs text-text-secondary">
                        共 {total} 条
                        {events.length < total && (
                            <span className="text-text-muted">（已加载 {events.length}）</span>
                        )}
                    </span>
                </div>
            </div>

            {/* 过滤器面板 */}
            {showFilters && (
                <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium">
                    <LogFilters
                        minLevel={filters.minLevel}
                        subsystems={subsystems}
                        categories={categories}
                        selectedSubsystem={filters.subsystem}
                        selectedCategory={filters.category}
                        searchText={filters.text}
                        searchQuery={filters.searchQuery}
                        onMinLevelChange={setMinLevel}
                        onSubsystemChange={(value) => setFilter('subsystem', value)}
                        onCategoryChange={(value) => setFilter('category', value)}
                        onSearchChange={(value) => setFilter('text', value)}
                        onSearchQueryChange={setSearchQuery}
                    />
                </div>
            )}

            {/* 日志列表 */}
            <div className="flex-1 overflow-hidden relative">
                <VirtualLogList
                    events={filteredEvents}
                    autoScroll={autoScroll}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    onDoubleClick={handleDoubleClick}
                    isSelectMode={isSelectMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelectId}
                    onLoadMore={() => deviceId && loadMore(deviceId)}
                    hasMore={hasMore()}
                    isLoading={isLoading}
                    loadedCount={events.length}
                    totalCount={total}
                    onScrollControlsReady={setScrollControls}
                />
                <ListLoadingOverlay isLoading={isLoading} />

                {/* 悬浮滚动按钮 */}
                {scrollControls && (
                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
                        <button
                            onClick={() => scrollControls.scrollToTop()}
                            disabled={scrollControls.isAtTop}
                            className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg",
                                scrollControls.isAtTop
                                    ? "bg-primary/30 text-white/30 cursor-not-allowed"
                                    : "bg-primary text-white hover:bg-primary/80"
                            )}
                            title="滚动到顶部"
                        >
                            <ArrowUpIcon size={16} />
                        </button>
                        <button
                            onClick={() => scrollControls.scrollToBottom()}
                            disabled={scrollControls.isAtBottom}
                            className={clsx(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg",
                                scrollControls.isAtBottom
                                    ? "bg-primary/30 text-white/30 cursor-not-allowed"
                                    : "bg-primary text-white hover:bg-primary/80"
                            )}
                            title="滚动到底部"
                        >
                            <ArrowDownIcon size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* 清除全部确认对话框 */}
            <ConfirmDialog
                isOpen={showClearAllConfirm}
                onClose={() => setShowClearAllConfirm(false)}
                onConfirm={handleClearAll}
                title="清除全部日志"
                message={`确定要清除该设备的全部日志记录吗？\n\n此操作将从数据库永久删除所有日志数据，且不可恢复。`}
                confirmText="确认清除"
                cancelText="取消"
                type="danger"
                loading={isClearingAll}
            />

            {/* 删除确认对话框 */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleBatchDelete}
                title="删除日志"
                message={`确定要删除选中的 ${selectedIds.size} 条日志吗？\n\n此操作不可恢复。`}
                confirmText="确认删除"
                cancelText="取消"
                type="danger"
            />

            {/* 日志详情弹窗 */}
            {detailEvent && (
                <LogDetailModal
                    event={detailEvent}
                    onClose={() => setDetailEvent(null)}
                />
            )}
        </div>
    )
}

export const LogPlugin = new LogPluginImpl()
