// 性能监控前端插件
// 实时展示 CPU、内存、FPS 等性能指标

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
} from '../types'
import { PerformanceIcon, CPUIcon, MemoryIcon, FPSIcon, SettingsIcon, AlertIcon, TrashIcon, ClockIcon, SummaryIcon, ListIcon, DistributionIcon } from '@/components/icons'
import { Checkbox } from '@/components/Checkbox'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
    usePerformanceStore,
    formatBytes,
    formatDuration,
    getMemoryPressureColor,
    getCPUUsageColor,
    getFPSColor,
    getSeverityColor,
    getSeverityBgColor,
    getMetricTypeLabel,
    getConditionLabel,
    getPageTimingColor,
    getPageTimingBgColor,
    formatPageTiming,
    type PerformanceMetrics,
    type JankEvent,
    type Alert,
    type AlertRule,
    type AlertSeverity,
    type AppLaunchHistoryItem,
    type AppLaunchStats,
    type PageTimingEvent,
    type PageTimingSummary,
} from '@/stores/performanceStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { useToastStore } from '@/stores/toastStore'
import clsx from 'clsx'
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Area,
    AreaChart,
    ReferenceLine,
    BarChart,
    Bar,
    Cell,
} from 'recharts'
import type { PageTimingQueryParams } from '@/stores/performanceStore'

// 格式化时间，包含毫秒
function formatTimeWithMs(dateString: string): string {
    const date = new Date(dateString)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
}

// 格式化日期时间，包含毫秒
function formatDateTimeWithMs(dateString: string): string {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day} ${formatTimeWithMs(dateString)}`
}

// 插件 ID
const PERFORMANCE_PLUGIN_ID = 'performance'

// 插件实现类
class PerformancePluginImpl implements FrontendPlugin {
    metadata: PluginMetadata = {
        pluginId: PERFORMANCE_PLUGIN_ID,
        displayName: 'Performance',
        version: '1.0.0',
        description: 'App 性能监控',
        icon: <PerformanceIcon size={16} />,
    }

    state: PluginState = 'uninitialized'
    isEnabled = true

    private pluginContext: PluginContext | null = null
    private unsubscribe: (() => void) | null = null

    async initialize(context: PluginContext): Promise<void> {
        this.pluginContext = context
        this.state = 'loading'

        // 订阅性能事件
        this.unsubscribe = context.subscribeToEvents(
            ['performance_metrics', 'jank_event', 'performance_alert', 'alert_resolved', 'page_timing'],
            this.handleEvent.bind(this)
        )

        this.state = 'ready'
    }

    render(props: PluginRenderProps): React.ReactNode {
        return <PerformancePluginView {...props} />
    }

    onActivate(): void {
        console.log('[PerformancePlugin] Activated')
    }

    onDeactivate(): void {
        console.log('[PerformancePlugin] Deactivated')
    }

    private handleEvent(event: PluginEvent): void {
        const store = usePerformanceStore.getState()

        if (event.eventType === 'performance_metrics') {
            const data = event.payload as { metrics: PerformanceMetrics[] } | PerformanceMetrics[]
            const metrics = Array.isArray(data) ? data : data.metrics
            if (metrics && metrics.length > 0) {
                store.addRealtimeMetrics(metrics)
            }
        } else if (event.eventType === 'jank_event') {
            const jankEvent = event.payload as JankEvent
            if (jankEvent) {
                store.addJankEvent(jankEvent)
            }
        } else if (event.eventType === 'performance_alert') {
            const alert = event.payload as Alert
            if (alert) {
                store.addAlert(alert)
            }
        } else if (event.eventType === 'alert_resolved') {
            const alert = event.payload as Alert
            if (alert) {
                store.updateAlert(alert)
            }
        } else if (event.eventType === 'page_timing') {
            const pageTimingEvent = event.payload as PageTimingEvent
            if (pageTimingEvent) {
                store.addPageTimingEvent(pageTimingEvent)
            }
        }
    }

    onEvent(event: PluginEvent): void {
        this.handleEvent(event)
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
function PerformancePluginView({ context, isActive }: PluginRenderProps) {
    const deviceId = context.deviceId ?? ''

    // Stores
    const store = usePerformanceStore()
    const deviceStore = useDeviceStore()
    const toast = useToastStore()

    // 获取设备在线状态
    const isDeviceOnline = useMemo(() => {
        if (!deviceId) return false
        const device = deviceStore.devices.find(d => d.deviceId === deviceId)
        return device?.isOnline ?? false
    }, [deviceId, deviceStore.devices])

    // UI 状态
    const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'janks' | 'alerts' | 'pageTiming'>('overview')
    const [showSettings, setShowSettings] = useState(false)
    const [showClearConfirm, setShowClearConfirm] = useState(false)
    const [isClearing, setIsClearing] = useState(false)
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5) // 默认 5 秒（备用）
    const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(false) // 默认关闭（WebSocket 推送）

    // 初始化：加载数据
    useEffect(() => {
        if (!deviceId || !isActive) return

        store.fetchRealtimeMetrics(deviceId)
        store.fetchStatus(deviceId)
        store.fetchAlerts(deviceId)
        store.fetchJankEvents(deviceId)
        store.fetchTrends(deviceId, 60)
        store.fetchPageTimingEvents(deviceId)
        store.fetchPageTimingSummary(deviceId)
        store.fetchAppLaunchData(deviceId)
    }, [deviceId, isActive])

    // 自动刷新定时器
    useEffect(() => {
        if (!deviceId || !isActive || !isAutoRefreshEnabled || autoRefreshInterval <= 0) return

        const intervalMs = autoRefreshInterval * 1000
        const timer = setInterval(() => {
            store.fetchRealtimeMetrics(deviceId)
            store.fetchStatus(deviceId)
        }, intervalMs)

        return () => clearInterval(timer)
    }, [deviceId, isActive, isAutoRefreshEnabled, autoRefreshInterval])

    // 刷新所有 tab 数据
    const handleRefresh = useCallback(() => {
        if (deviceId) {
            store.fetchRealtimeMetrics(deviceId)
            store.fetchStatus(deviceId)
            store.fetchJankEvents(deviceId)
            store.fetchTrends(deviceId, 60)
            store.fetchAlerts(deviceId)
            store.fetchPageTimingEvents(deviceId)
            store.fetchPageTimingSummary(deviceId)
        }
    }, [deviceId])

    // 清除数据（包含页面耗时）
    const handleClear = useCallback(async () => {
        if (deviceId) {
            setIsClearing(true)
            try {
                await Promise.all([
                    store.clearMetrics(deviceId),
                    store.clearPageTimingEvents(deviceId),
                ])
                toast.show('success', '已清除性能数据')
                setShowClearConfirm(false)
            } finally {
                setIsClearing(false)
            }
        }
    }, [deviceId, toast])

    // 时间范围选项（显示范围）
    const timeRangeOptions = [
        { label: '最近 1 分钟', value: 60 },
        { label: '最近 5 分钟', value: 300 },
        { label: '最近 15 分钟', value: 900 },
        { label: '最近 30 分钟', value: 1800 },
    ]

    if (!isActive) {
        return null
    }

    return (
        <div className="flex flex-col h-full">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* 刷新 - 放在最左边 */}
                    <button
                        onClick={handleRefresh}
                        className="btn btn-secondary text-xs px-2.5 py-1.5"
                        title="刷新"
                    >
                        刷新
                    </button>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* Tab 切换 */}
                    <div className="flex bg-bg-light rounded-lg p-0.5">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                activeTab === 'overview'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            概览
                        </button>
                        <button
                            onClick={() => setActiveTab('trends')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                activeTab === 'trends'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            趋势
                        </button>
                        <button
                            onClick={() => setActiveTab('pageTiming')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                activeTab === 'pageTiming'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            页面耗时 ({store.pageTimingTotal})
                        </button>
                        <button
                            onClick={() => setActiveTab('janks')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                activeTab === 'janks'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            卡顿 ({store.jankTotal})
                        </button>
                        <button
                            onClick={() => setActiveTab('alerts')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors relative',
                                activeTab === 'alerts'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            告警
                            {store.activeAlertCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                    {store.activeAlertCount > 9 ? '9+' : store.activeAlertCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 时间范围 */}
                    <select
                        value={store.timeRange}
                        onChange={(e) => store.setTimeRange(Number(e.target.value))}
                        className="bg-bg-light text-xs text-text-primary rounded px-2.5 py-1.5 border border-border focus:outline-none focus:border-primary"
                    >
                        {timeRangeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {/* 监控状态：设备在线时显示监控中 */}
                    <span
                        className={clsx(
                            'px-2 py-0.5 rounded text-xs',
                            isDeviceOnline
                                ? 'bg-status-success-bg text-status-success'
                                : 'bg-bg-light text-text-muted'
                        )}
                    >
                        {isDeviceOnline ? '监控中' : '未监控'}
                    </span>

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 自动刷新 */}
                    <div className="flex items-center gap-2">
                        <Checkbox
                            checked={isAutoRefreshEnabled}
                            onChange={setIsAutoRefreshEnabled}
                        />
                        <span className="text-xs text-text-muted">自动刷新</span>
                        {isAutoRefreshEnabled && (
                            <select
                                value={autoRefreshInterval}
                                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                                className="bg-bg-light text-xs text-text-primary rounded px-1.5 py-0.5 border border-border focus:outline-none focus:border-primary"
                            >
                                <option value={1}>1秒</option>
                                <option value={2}>2秒</option>
                                <option value={5}>5秒</option>
                                <option value={10}>10秒</option>
                            </select>
                        )}
                    </div>

                    {/* 清除数据（包含页面耗时） */}
                    {(store.realtimeMetrics.length > 0 || store.jankEvents.length > 0 || store.pageTimingTotal > 0) && (
                        <>
                            <div className="h-5 w-px bg-border flex-shrink-0" />
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="btn btn-ghost text-red-400 hover:bg-red-500/10 text-xs px-2 py-1.5 flex items-center"
                                title="清除数据"
                                disabled={isClearing}
                            >
                                <TrashIcon size={14} className="mr-1" />
                                清空
                            </button>
                        </>
                    )}

                    {/* 设置 */}
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={clsx(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors',
                            showSettings
                                ? 'bg-primary/15 text-primary border-primary hover:bg-primary/20'
                                : 'bg-bg-light text-text-secondary border-border hover:text-text-primary hover:border-text-muted'
                        )}
                        title="设置"
                    >
                        <SettingsIcon size={14} />
                        设置
                    </button>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'overview' ? (
                    <OverviewContent
                        metrics={store.realtimeMetrics}
                        lastMetrics={store.lastMetrics}
                        isLoading={store.isLoading}
                        appLaunchMetrics={store.appLaunchMetrics}
                        appLaunchHistory={store.appLaunchHistory}
                        appLaunchStats={store.appLaunchStats}
                        isLoadingAppLaunch={store.isLoadingAppLaunch}
                    />
                ) : activeTab === 'trends' ? (
                    <TrendsContent
                        metrics={store.realtimeMetrics}
                        trends={store.trends}
                        isLoading={store.isLoadingTrends}
                    />
                ) : activeTab === 'janks' ? (
                    <JanksContent
                        events={store.jankEvents}
                        total={store.jankTotal}
                        page={store.jankPage}
                        pageSize={store.jankPageSize}
                        isLoading={store.isLoadingJanks}
                        onPageChange={(page) => store.fetchJankEvents(deviceId, page)}
                    />
                ) : activeTab === 'alerts' ? (
                    <AlertsContent
                        deviceId={deviceId}
                        alerts={store.alerts}
                        alertRules={store.alertRules}
                        alertConfig={store.alertConfig}
                        isLoading={store.isLoadingAlerts}
                        onResolve={(alertId) => store.resolveAlert(deviceId, alertId)}
                    />
                ) : (
                    <PageTimingContent
                        deviceId={deviceId}
                        events={store.pageTimingEvents}
                        summary={store.pageTimingSummary}
                        total={store.pageTimingTotal}
                        page={store.pageTimingPage}
                        pageSize={store.pageTimingPageSize}
                        isLoading={store.isLoadingPageTiming}
                        isLoadingSummary={store.isLoadingPageTimingSummary}
                        selectedEvent={store.selectedPageTimingEvent}
                        onFetch={(params) => store.fetchPageTimingEvents(deviceId, params)}
                        onFetchSummary={(from, to, pageName) => store.fetchPageTimingSummary(deviceId, from, to, pageName)}
                        onSelectEvent={(event) => store.setSelectedPageTimingEvent(event)}
                    />
                )}
            </div>

            {/* 设置面板 */}
            {showSettings && (
                <SettingsPanel
                    config={store.config}
                    onUpdate={(config) => store.updateConfig(deviceId, config)}
                    onClose={() => setShowSettings(false)}
                />
            )}

            {/* 清除数据确认对话框 */}
            <ConfirmDialog
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClear}
                title="清除性能数据"
                message={`确定要清除该设备的全部性能监控数据吗？\n\n此操作将清除所有性能指标、卡顿事件和告警数据，且不可恢复。`}
                confirmText="确认清除"
                cancelText="取消"
                type="danger"
                loading={isClearing}
            />
        </div>
    )
}

// App 启动历史趋势图表组件
function AppLaunchHistoryChart({ history }: { history: AppLaunchHistoryItem[] }) {
    // 准备图表数据，按时间正序排列
    const chartData = useMemo(() => {
        return [...history]
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map((item, index) => ({
                index: index + 1,
                time: new Date(item.timestamp).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
                total: item.totalTime,
                preMain: item.preMainTime ?? 0,
                mainToLaunch: item.mainToLaunchTime ?? 0,
                launchToFirstFrame: item.launchToFirstFrameTime ?? 0,
            }))
    }, [history])

    // 自定义 Tooltip
    const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-bg-darkest border border-border rounded-lg p-2 text-xs shadow-lg">
                    <p className="text-text-tertiary mb-1">{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} style={{ color: entry.color }}>
                            {entry.name}: {entry.value.toFixed(0)}ms
                        </p>
                    ))}
                </div>
            )
        }
        return null
    }

    return (
        <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <defs>
                        <linearGradient id="launchTotalGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: '#888' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#888' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}ms`}
                        width={50}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="total"
                        name="总耗时"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="url(#launchTotalGradient)"
                        dot={{ r: 3, fill: '#8b5cf6' }}
                        activeDot={{ r: 5, fill: '#8b5cf6' }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}

// 概览内容
function OverviewContent({
    metrics,
    lastMetrics,
    isLoading,
    appLaunchMetrics,
    appLaunchHistory,
    appLaunchStats,
    isLoadingAppLaunch: _isLoadingAppLaunch,
}: {
    metrics: PerformanceMetrics[]
    lastMetrics: PerformanceMetrics | null
    isLoading: boolean
    appLaunchMetrics: {
        totalTime: number
        preMainTime?: number
        mainToLaunchTime?: number
        launchToFirstFrameTime?: number
        timestamp: string
    } | null
    appLaunchHistory: AppLaunchHistoryItem[]
    appLaunchStats: AppLaunchStats | null
    isLoadingAppLaunch: boolean
}) {
    // 最新指标
    const latest = lastMetrics ?? metrics[metrics.length - 1]

    // 计算统计数据
    const stats = useMemo(() => {
        if (metrics.length === 0) return null

        const cpuUsages = metrics.map((m) => m.cpu?.usage ?? 0).filter((v) => v > 0)
        const memoryUsed = metrics.map((m) => m.memory?.usedMemory ?? 0).filter((v) => v > 0)
        const fpsValues = metrics.map((m) => m.fps?.fps ?? 0).filter((v) => v > 0)

        // 网络流量统计
        const networkMetrics = metrics.filter((m) => m.network)
        const totalReceived = networkMetrics.reduce((sum, m) => sum + (m.network?.bytesReceived ?? 0), 0)
        const totalSent = networkMetrics.reduce((sum, m) => sum + (m.network?.bytesSent ?? 0), 0)
        const avgDownloadRate = networkMetrics.length > 0
            ? networkMetrics.reduce((sum, m) => sum + (m.network?.downloadRate ?? 0), 0) / networkMetrics.length
            : 0
        const avgUploadRate = networkMetrics.length > 0
            ? networkMetrics.reduce((sum, m) => sum + (m.network?.uploadRate ?? 0), 0) / networkMetrics.length
            : 0

        // 磁盘 I/O 统计
        const diskMetrics = metrics.filter((m) => m.diskIO)
        const totalRead = diskMetrics.reduce((sum, m) => sum + (m.diskIO?.readBytes ?? 0), 0)
        const totalWrite = diskMetrics.reduce((sum, m) => sum + (m.diskIO?.writeBytes ?? 0), 0)

        return {
            avgCPU: cpuUsages.length > 0 ? cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length : 0,
            maxCPU: Math.max(...cpuUsages, 0),
            avgMemory: memoryUsed.length > 0 ? memoryUsed.reduce((a, b) => a + b, 0) / memoryUsed.length : 0,
            maxMemory: Math.max(...memoryUsed, 0),
            avgFPS: fpsValues.length > 0 ? fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length : 0,
            minFPS: fpsValues.length > 0 ? Math.min(...fpsValues) : 0,
            totalDropped: metrics.reduce((sum, m) => sum + (m.fps?.droppedFrames ?? 0), 0),
            totalJanks: metrics.reduce((sum, m) => sum + (m.fps?.jankCount ?? 0), 0),
            // 网络
            totalReceived,
            totalSent,
            avgDownloadRate,
            avgUploadRate,
            // 磁盘
            totalRead,
            totalWrite,
        }
    }, [metrics])

    if (isLoading && metrics.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-text-muted">
                加载中...
            </div>
        )
    }

    if (!latest) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
                <PerformanceIcon size={48} className="opacity-30" />
                <span>暂无性能数据</span>
            </div>
        )
    }

    return (
        <div className="p-4 space-y-4">
            {/* 应用启动时间 - 重新设计的版块 */}
            {(appLaunchMetrics || appLaunchHistory.length > 0) && (
                <div className="bg-gradient-to-r from-purple-100/80 to-indigo-100/80 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-lg p-4 border border-purple-200 dark:border-purple-500/20">
                    <h3 className="text-sm font-medium text-purple-600 dark:text-purple-300 mb-4">🚀 应用启动时间</h3>

                    <div className="flex gap-6">
                        {/* 左侧：最新启动数据 */}
                        <div className="flex-shrink-0 w-[280px]">
                            {/* 优先使用 appLaunchMetrics，如果没有则从历史数据取最新一条 */}
                            {(() => {
                                const latestLaunch = appLaunchMetrics ?? (appLaunchHistory.length > 0 ? {
                                    totalTime: appLaunchHistory[0].totalTime,
                                    preMainTime: appLaunchHistory[0].preMainTime,
                                    mainToLaunchTime: appLaunchHistory[0].mainToLaunchTime,
                                    launchToFirstFrameTime: appLaunchHistory[0].launchToFirstFrameTime,
                                    timestamp: appLaunchHistory[0].timestamp,
                                } : null)

                                if (!latestLaunch) {
                                    return <div className="text-text-muted text-sm">暂无启动数据</div>
                                }

                                return (
                                    <>
                                        {/* 总启动时间 */}
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="text-text-muted text-xs">总耗时:</span>
                                            <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                                                {latestLaunch.totalTime > 0 ? `${latestLaunch.totalTime.toFixed(0)}ms` : '--'}
                                            </span>
                                        </div>
                                        {/* 分阶段详情 */}
                                        <div className="grid grid-cols-3 gap-3 text-xs">
                                            <div>
                                                <div className="text-text-muted">PreMain</div>
                                                <div className="text-base font-semibold text-purple-600 dark:text-purple-400">
                                                    {latestLaunch.preMainTime != null ? `${latestLaunch.preMainTime.toFixed(0)}ms` : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-text-muted">Main→Launch</div>
                                                <div className="text-base font-semibold text-indigo-600 dark:text-indigo-400">
                                                    {latestLaunch.mainToLaunchTime != null ? `${latestLaunch.mainToLaunchTime.toFixed(0)}ms` : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-text-muted">Launch→首帧</div>
                                                <div className="text-base font-semibold text-blue-600 dark:text-blue-400">
                                                    {latestLaunch.launchToFirstFrameTime != null ? `${latestLaunch.launchToFirstFrameTime.toFixed(0)}ms` : '--'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-3 text-[10px] text-text-muted">
                                            记录于: {latestLaunch.timestamp ? new Date(latestLaunch.timestamp).toLocaleString() : '--'}
                                        </div>
                                    </>
                                )
                            })()}
                        </div>

                        {/* 右侧：历史趋势图表 */}
                        <div className="flex-1 min-w-0">
                            {appLaunchHistory.length > 0 ? (
                                <AppLaunchHistoryChart history={appLaunchHistory} />
                            ) : (
                                <div className="h-[140px] flex items-center justify-center text-text-muted text-xs">
                                    暂无历史数据
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 底部统计数据 */}
                    {appLaunchStats && (
                        <div className="mt-4 pt-3 border-t border-purple-200/50 dark:border-purple-500/20">
                            <div className="grid grid-cols-7 gap-3 text-xs">
                                <div>
                                    <div className="text-text-muted">启动次数</div>
                                    <div className="font-semibold text-text-primary">{appLaunchStats.count}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted">平均</div>
                                    <div className="font-semibold text-purple-600 dark:text-purple-400">
                                        {appLaunchStats.avgTotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted">最小</div>
                                    <div className="font-semibold text-status-success">
                                        {appLaunchStats.minTotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted">最大</div>
                                    <div className="font-semibold text-red-500">
                                        {appLaunchStats.maxTotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted">P50</div>
                                    <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                                        {appLaunchStats.p50TotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted">P90</div>
                                    <div className="font-semibold text-orange-500">
                                        {appLaunchStats.p90TotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted">P95</div>
                                    <div className="font-semibold text-red-500">
                                        {appLaunchStats.p95TotalTime.toFixed(0)}ms
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 基础指标卡片 */}
            <div className="grid grid-cols-4 gap-4">
                {/* CPU */}
                <MetricCard
                    icon={<CPUIcon size={20} />}
                    title="CPU"
                    value={latest.cpu?.usage?.toFixed(1) ?? '--'}
                    unit="%"
                    colorClass={getCPUUsageColor(latest.cpu?.usage ?? 0)}
                    subtitle={`线程: ${latest.cpu?.threadCount ?? '--'}`}
                    tooltip={`CPU 使用率表示当前进程占用的 CPU 资源百分比。

• 绿色 (<30%): 正常
• 黄色 (30-60%): 偏高
• 橙色 (60-80%): 较高
• 红色 (>80%): 过高，可能导致卡顿`}
                />

                {/* 内存 */}
                <MetricCard
                    icon={<MemoryIcon size={20} />}
                    title="内存"
                    value={latest.memory ? formatBytes(latest.memory.usedMemory) : '--'}
                    colorClass={getMemoryPressureColor(latest.memory?.memoryPressure ?? 'low')}
                    subtitle={`峰值: ${latest.memory ? formatBytes(latest.memory.peakMemory) : '--'}`}
                    tooltip={`当前应用占用的物理内存大小。

• 峰值: 运行期间的最高内存占用
• 建议保持在设备可用内存的 50% 以下
• 内存过高可能导致应用被系统终止`}
                />

                {/* FPS */}
                <MetricCard
                    icon={<FPSIcon size={20} />}
                    title="FPS"
                    value={latest.fps?.fps?.toFixed(0) ?? '--'}
                    colorClass={getFPSColor(latest.fps?.fps ?? 60)}
                    subtitle={`丢帧: ${latest.fps?.droppedFrames ?? 0}`}
                    tooltip={`每秒渲染帧数 (Frames Per Second)。

• 60 FPS: 流畅体验
• 45-59 FPS: 轻微卡顿
• 30-44 FPS: 明显卡顿
• <30 FPS: 严重卡顿

丢帧数表示未能按时渲染的帧`}
                />

                {/* 内存压力 */}
                <MetricCard
                    icon={<MemoryIcon size={20} />}
                    title="内存压力"
                    value={latest.memory?.memoryPressure ?? '--'}
                    colorClass={getMemoryPressureColor(latest.memory?.memoryPressure ?? 'low')}
                    subtitle={`占用: ${((latest.memory?.footprintRatio ?? 0) * 100).toFixed(1)}%`}
                    tooltip={`系统内存压力等级，反映整体内存紧张程度。

• low: 内存充足
• medium: 内存偏紧
• high: 内存紧张
• critical: 内存严重不足

高压力时系统可能会终止后台应用`}
                />
            </div>

            {/* 网络流量和磁盘 I/O 卡片 */}
            <div className="grid grid-cols-2 gap-4">
                {/* 网络流量 */}
                <NetworkIOCard
                    title="网络流量"
                    icon="📡"
                    tooltip={`应用的网络使用情况统计。

• 下载速率: 每秒接收的数据量
• 上传速率: 每秒发送的数据量
• 总计: 累计传输的数据量

适用于监控网络请求、流媒体等场景`}
                    hasData={!!latest?.network}
                    leftLabel="下载速率"
                    leftValue={latest?.network ? `${formatBytes(latest.network.downloadRate)}/s` : '--'}
                    leftSubtitle={latest?.network ? `总计: ${formatBytes(latest.network.bytesReceived)}` : ''}
                    leftColor="text-cyan-400"
                    rightLabel="上传速率"
                    rightValue={latest?.network ? `${formatBytes(latest.network.uploadRate)}/s` : '--'}
                    rightSubtitle={latest?.network ? `总计: ${formatBytes(latest.network.bytesSent)}` : ''}
                    rightColor="text-status-success"
                />

                {/* 磁盘 I/O */}
                <NetworkIOCard
                    title="磁盘 I/O"
                    icon="💾"
                    tooltip={`应用的磁盘读写统计。

• 读取速率: 每秒从磁盘读取的数据量
• 写入速率: 每秒写入磁盘的数据量

注意: iOS 设备上为估算值，基于页面错误和目录大小变化`}
                    hasData={!!latest?.diskIO}
                    leftLabel="读取速率"
                    leftValue={latest?.diskIO ? `${formatBytes(latest.diskIO.readRate)}/s` : '--'}
                    leftSubtitle={latest?.diskIO ? `总计: ${formatBytes(latest.diskIO.readBytes)}` : ''}
                    leftColor="text-amber-400"
                    rightLabel="写入速率"
                    rightValue={latest?.diskIO ? `${formatBytes(latest.diskIO.writeRate)}/s` : '--'}
                    rightSubtitle={latest?.diskIO ? `总计: ${formatBytes(latest.diskIO.writeBytes)}` : ''}
                    rightColor="text-orange-400"
                />
            </div>

            {/* 统计信息 */}
            {stats && (
                <div className="bg-bg-medium rounded-lg p-4">
                    <h3 className="text-sm font-medium text-text-secondary mb-3">统计概览</h3>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                        <div>
                            <div className="text-text-muted">平均 CPU</div>
                            <div className={getCPUUsageColor(stats.avgCPU)}>{stats.avgCPU.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div className="text-text-muted">最高 CPU</div>
                            <div className={getCPUUsageColor(stats.maxCPU)}>{stats.maxCPU.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div className="text-text-muted">平均内存</div>
                            <div className="text-text-secondary">{formatBytes(stats.avgMemory)}</div>
                        </div>
                        <div>
                            <div className="text-text-muted">峰值内存</div>
                            <div className="text-text-secondary">{formatBytes(stats.maxMemory)}</div>
                        </div>
                        <div>
                            <div className="text-text-muted">平均 FPS</div>
                            <div className={getFPSColor(stats.avgFPS)}>{stats.avgFPS.toFixed(1)}</div>
                        </div>
                        <div>
                            <div className="text-text-muted">最低 FPS</div>
                            <div className={getFPSColor(stats.minFPS)}>{stats.minFPS.toFixed(1)}</div>
                        </div>
                        <div>
                            <div className="text-text-muted">总丢帧</div>
                            <div className="text-orange-400">{stats.totalDropped}</div>
                        </div>
                        <div>
                            <div className="text-text-muted">卡顿次数</div>
                            <div className="text-red-400">{stats.totalJanks}</div>
                        </div>
                    </div>
                    {/* 网络和磁盘统计 */}
                    {(stats.totalReceived > 0 || stats.totalSent > 0 || stats.totalRead > 0 || stats.totalWrite > 0) && (
                        <>
                            <div className="border-t border-border my-3" />
                            <div className="grid grid-cols-4 gap-4 text-xs">
                                <div>
                                    <div className="text-text-muted">总下载</div>
                                    <div className="text-cyan-400">{formatBytes(stats.totalReceived)}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted">总上传</div>
                                    <div className="text-status-success">{formatBytes(stats.totalSent)}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted">总读取</div>
                                    <div className="text-amber-400">{formatBytes(stats.totalRead)}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted">总写入</div>
                                    <div className="text-orange-400">{formatBytes(stats.totalWrite)}</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

// 性能趋势图表组件 - 使用 recharts
function PerformanceCharts({ metrics }: { metrics: PerformanceMetrics[] }) {
    // 格式化时间戳为 HH:mm:ss
    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp)
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    // 准备图表数据
    const chartData = useMemo(() => {
        return metrics.map((m) => ({
            time: formatTime(m.timestamp),
            timestamp: new Date(m.timestamp).getTime(),
            cpu: m.cpu?.usage ?? 0,
            memory: (m.memory?.usedMemory ?? 0) / (1024 * 1024), // 转换为 MB
            fps: m.fps?.fps ?? 0,
            droppedFrames: m.fps?.droppedFrames ?? 0,
            downloadRate: (m.network?.downloadRate ?? 0) / 1024, // KB/s
            uploadRate: (m.network?.uploadRate ?? 0) / 1024, // KB/s
        }))
    }, [metrics])

    // 自定义 Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-bg-darkest border border-border rounded-lg p-2 text-xs shadow-lg">
                    <p className="text-text-tertiary mb-1">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} style={{ color: entry.color }}>
                            {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
                            {entry.name === 'CPU' && '%'}
                            {entry.name === '内存' && ' MB'}
                            {entry.name === 'FPS' && ' fps'}
                            {entry.name.includes('速率') && ' KB/s'}
                        </p>
                    ))}
                </div>
            )
        }
        return null
    }

    if (chartData.length < 2) {
        return (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
                数据收集中，至少需要 2 个数据点...
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* CPU 使用率图表 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-tertiary">CPU 使用率 (%)</span>
                    <span className="text-xs text-blue-400">
                        当前: {chartData[chartData.length - 1]?.cpu.toFixed(1)}%
                    </span>
                </div>
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="time"
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                domain={[0, 100]}
                                tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={80} stroke="#EF4444" strokeDasharray="3 3" label="" />
                            <ReferenceLine y={60} stroke="#F59E0B" strokeDasharray="3 3" label="" />
                            <Area
                                type="monotone"
                                dataKey="cpu"
                                name="CPU"
                                stroke="#3B82F6"
                                fill="url(#cpuGradient)"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 内存使用图表 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-tertiary">内存使用 (MB)</span>
                    <span className="text-xs text-emerald-400">
                        当前: {chartData[chartData.length - 1]?.memory.toFixed(1)} MB
                    </span>
                </div>
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="time"
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                tickFormatter={(v) => `${v}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="memory"
                                name="内存"
                                stroke="#10B981"
                                fill="url(#memoryGradient)"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* FPS 图表 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-tertiary">帧率 (FPS)</span>
                    <span className="text-xs text-amber-400">
                        当前: {chartData[chartData.length - 1]?.fps.toFixed(0)} fps
                    </span>
                </div>
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="time"
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                stroke="#6B7280"
                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                domain={[0, 65]}
                                tickFormatter={(v) => `${v}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine y={60} stroke="#22C55E" strokeDasharray="3 3" />
                            <ReferenceLine y={30} stroke="#EF4444" strokeDasharray="3 3" />
                            <Line
                                type="monotone"
                                dataKey="fps"
                                name="FPS"
                                stroke="#F59E0B"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 网络流量图表 - 仅在有数据时显示 */}
            {chartData.some((d) => d.downloadRate > 0 || d.uploadRate > 0) && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-tertiary">网络流量 (KB/s)</span>
                        <div className="flex items-center gap-3 text-xs">
                            <span className="text-cyan-400">
                                ↓ {chartData[chartData.length - 1]?.downloadRate.toFixed(1)} KB/s
                            </span>
                            <span className="text-status-success">
                                ↑ {chartData[chartData.length - 1]?.uploadRate.toFixed(1)} KB/s
                            </span>
                        </div>
                    </div>
                    <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis
                                    dataKey="time"
                                    stroke="#6B7280"
                                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    stroke="#6B7280"
                                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ fontSize: '10px' }}
                                    formatter={(value) => <span className="text-text-tertiary">{value}</span>}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="downloadRate"
                                    name="下载速率"
                                    stroke="#22D3EE"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="uploadRate"
                                    name="上传速率"
                                    stroke="#22C55E"
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    )
}

// 指标卡片
function MetricCard({
    icon,
    title,
    value,
    unit,
    colorClass,
    subtitle,
    tooltip,
}: {
    icon: React.ReactNode
    title: string
    value: string
    unit?: string
    colorClass: string
    subtitle?: string
    tooltip?: string
}) {
    const [showTooltip, setShowTooltip] = useState(false)

    return (
        <div className="bg-bg-medium rounded-lg p-3 relative">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-text-tertiary">{icon}</span>
                <span className="text-xs text-text-muted">{title}</span>
                {tooltip && (
                    <button
                        onClick={() => setShowTooltip(!showTooltip)}
                        className="text-text-muted hover:text-text-secondary transition-colors"
                        title="查看说明"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <circle cx="12" cy="17" r="1" fill="currentColor" />
                        </svg>
                    </button>
                )}
            </div>
            <div className={clsx('text-2xl font-semibold', colorClass)}>
                {value}
                {unit && <span className="text-sm ml-1">{unit}</span>}
            </div>
            {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}

            {/* Tooltip */}
            {showTooltip && tooltip && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowTooltip(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-bg-medium border border-border rounded-lg p-3 shadow-xl max-w-xs">
                        <div className="text-xs text-text-secondary whitespace-pre-line">{tooltip}</div>
                        <button
                            onClick={() => setShowTooltip(false)}
                            className="absolute top-1 right-1 text-text-tertiary hover:text-text-primary"
                        >
                            ✕
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

// 网络/磁盘 I/O 卡片（带 tooltip）
function NetworkIOCard({
    title,
    icon,
    tooltip,
    hasData,
    leftLabel,
    leftValue,
    leftSubtitle,
    leftColor,
    rightLabel,
    rightValue,
    rightSubtitle,
    rightColor,
}: {
    title: string
    icon: string
    tooltip: string
    hasData: boolean
    leftLabel: string
    leftValue: string
    leftSubtitle: string
    leftColor: string
    rightLabel: string
    rightValue: string
    rightSubtitle: string
    rightColor: string
}) {
    const [showTooltip, setShowTooltip] = useState(false)

    return (
        <div className="bg-bg-medium rounded-lg p-3 relative">
            <div className="flex items-center gap-2 mb-2">
                <span className={leftColor}>{icon}</span>
                <span className="text-xs text-text-muted">{title}</span>
                <button
                    onClick={() => setShowTooltip(!showTooltip)}
                    className="text-text-muted hover:text-text-secondary transition-colors"
                    title="查看说明"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <circle cx="12" cy="17" r="1" fill="currentColor" />
                    </svg>
                </button>
            </div>
            {hasData ? (
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <div className="text-xs text-text-muted">{leftLabel}</div>
                        <div className={clsx('text-lg font-semibold', leftColor)}>{leftValue}</div>
                        {leftSubtitle && <div className="text-xs text-text-muted mt-1">{leftSubtitle}</div>}
                    </div>
                    <div>
                        <div className="text-xs text-text-muted">{rightLabel}</div>
                        <div className={clsx('text-lg font-semibold', rightColor)}>{rightValue}</div>
                        {rightSubtitle && <div className="text-xs text-text-muted mt-1">{rightSubtitle}</div>}
                    </div>
                </div>
            ) : (
                <div className="text-sm text-text-muted">暂无数据</div>
            )}

            {/* Tooltip */}
            {showTooltip && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowTooltip(false)}
                    />
                    <div className="absolute top-full left-0 mt-1 z-20 bg-bg-medium border border-border rounded-lg p-3 shadow-xl max-w-xs">
                        <div className="text-xs text-text-secondary whitespace-pre-line">{tooltip}</div>
                        <button
                            onClick={() => setShowTooltip(false)}
                            className="absolute top-1 right-1 text-text-tertiary hover:text-text-primary"
                        >
                            ✕
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

// 卡顿事件列表
function JanksContent({
    events,
    total,
    page,
    pageSize,
    isLoading,
    onPageChange,
}: {
    events: JankEvent[]
    total: number
    page: number
    pageSize: number
    isLoading: boolean
    onPageChange: (page: number) => void
}) {
    const totalPages = Math.ceil(total / pageSize)
    const [selectedJank, setSelectedJank] = useState<JankEvent | null>(null)

    // 列宽状态
    const [columnWidths, setColumnWidths] = useState({
        index: 50,
        time: 120,
        duration: 100,
        droppedFrames: 80,
        // stackTrace 弹性宽度
    })
    const [isResizing, setIsResizing] = useState(false)
    const resizeState = useRef<{ columnKey: string; startX: number; startWidth: number } | null>(null)

    // 开始调整列宽
    const startColumnResize = useCallback((e: React.MouseEvent, columnKey: string) => {
        e.preventDefault()
        e.stopPropagation()
        const startWidth = columnWidths[columnKey as keyof typeof columnWidths] || 100
        resizeState.current = { columnKey, startX: e.clientX, startWidth }
        setIsResizing(true)
    }, [columnWidths])

    // 列宽调整的鼠标移动和抬起事件
    useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeState.current) return
            const { columnKey, startX, startWidth } = resizeState.current
            const delta = e.clientX - startX
            const newWidth = Math.max(60, Math.min(400, startWidth + delta))
            setColumnWidths(prev => ({ ...prev, [columnKey]: newWidth }))
        }

        const handleMouseUp = () => {
            setIsResizing(false)
            resizeState.current = null
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing])

    if (isLoading && events.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-text-muted">
                加载中...
            </div>
        )
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
                <PerformanceIcon size={48} className="opacity-30" />
                <span>暂无卡顿事件</span>
            </div>
        )
    }

    // 列分割线组件
    const ColumnDivider = ({ columnKey }: { columnKey?: string }) => (
        <div
            className={clsx(
                'absolute right-0 top-0 bottom-0 w-px bg-border',
                columnKey && 'cursor-col-resize hover:bg-primary/50 transition-colors',
                isResizing && resizeState.current?.columnKey === columnKey && 'bg-primary w-0.5'
            )}
            onMouseDown={columnKey ? (e) => startColumnResize(e, columnKey) : undefined}
        >
            {columnKey && <div className="absolute -left-1.5 -right-1.5 top-0 bottom-0" />}
        </div>
    )

    return (
        <div className="flex flex-col h-full">
            {/* 列表 */}
            <div className={clsx('flex-1 overflow-auto', isResizing && 'select-none')}>
                <table className="text-sm table-fixed" style={{ minWidth: '100%' }}>
                    <thead className="bg-bg-medium sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left text-text-tertiary font-medium relative" style={{ width: columnWidths.index }}>
                                #
                                <ColumnDivider columnKey="index" />
                            </th>
                            <th className="px-3 py-2 text-left text-text-tertiary font-medium relative" style={{ width: columnWidths.time }}>
                                时间
                                <ColumnDivider columnKey="time" />
                            </th>
                            <th className="px-3 py-2 text-left text-text-tertiary font-medium relative" style={{ width: columnWidths.duration }}>
                                持续时间
                                <ColumnDivider columnKey="duration" />
                            </th>
                            <th className="px-3 py-2 text-left text-text-tertiary font-medium relative" style={{ width: columnWidths.droppedFrames }}>
                                丢帧数
                                <ColumnDivider columnKey="droppedFrames" />
                            </th>
                            <th className="px-3 py-2 text-left text-text-tertiary font-medium">
                                <span className="flex items-center gap-1">
                                    调用栈
                                    <span className="text-text-muted text-[10px]" title="需要 SDK 配置启用 captureStackTrace">(可选)</span>
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event, idx) => (
                            <tr
                                key={event.id}
                                className="border-b border-border hover:bg-bg-medium cursor-pointer select-none transition-colors"
                                onDoubleClick={() => setSelectedJank(event)}
                                title="双击查看完整详情"
                            >
                                <td className="px-3 py-2 text-text-muted text-center whitespace-nowrap border-r border-border" style={{ width: columnWidths.index }}>
                                    {(page - 1) * pageSize + idx + 1}
                                </td>
                                <td className="px-3 py-2 text-text-secondary whitespace-nowrap border-r border-border" style={{ width: columnWidths.time }}>
                                    {formatTimeWithMs(event.timestamp)}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap border-r border-border" style={{ width: columnWidths.duration }}>
                                    <span
                                        className={clsx(
                                            'px-2 py-0.5 rounded text-xs font-medium',
                                            event.duration > 500
                                                ? 'bg-status-error-bg text-status-error'
                                                : event.duration > 200
                                                    ? 'bg-status-warning-bg text-status-warning'
                                                    : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                        )}
                                    >
                                        {formatDuration(event.duration)}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-text-secondary text-center whitespace-nowrap border-r border-border" style={{ width: columnWidths.droppedFrames }}>{event.droppedFrames}</td>
                                <td className="px-3 py-2 text-text-muted">
                                    {event.stackTrace ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-text-secondary truncate max-w-md" title="双击查看完整调用栈">
                                                {event.stackTrace.split('\n')[0] || event.stackTrace.substring(0, 60)}
                                            </span>
                                            {event.stackTrace.includes('\n') && (
                                                <span className="text-[10px] text-text-tertiary whitespace-nowrap">
                                                    +{event.stackTrace.split('\n').length - 1} 帧
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-text-muted italic">未启用</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border">
                    <span className="text-xs text-text-muted">
                        共 {total} 条，双击查看详情
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="px-2 py-1 text-xs rounded bg-bg-medium text-text-secondary disabled:opacity-50"
                        >
                            上一页
                        </button>
                        <span className="text-xs text-text-tertiary px-2">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="px-2 py-1 text-xs rounded bg-bg-medium text-text-secondary disabled:opacity-50"
                        >
                            下一页
                        </button>
                    </div>
                </div>
            )}

            {/* 卡顿详情弹窗 */}
            {selectedJank && (
                <JankDetailModal
                    jank={selectedJank}
                    onClose={() => setSelectedJank(null)}
                />
            )}
        </div>
    )
}

// 卡顿详情弹窗
function JankDetailModal({
    jank,
    onClose,
}: {
    jank: JankEvent
    onClose: () => void
}) {
    // 解析调用栈为结构化数据
    const stackFrames = useMemo(() => {
        if (!jank.stackTrace) return []
        // 按换行符分割调用栈
        return jank.stackTrace.split('\n').filter(line => line.trim())
    }, [jank.stackTrace])

    // 关闭快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 弹窗内容 */}
            <div className="relative bg-bg-dark border border-border rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <PerformanceIcon size={20} />
                        卡顿事件详情
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-bg-light transition-colors text-text-muted hover:text-text-primary"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 基本信息 */}
                <div className="px-6 py-4 border-b border-border bg-bg-medium/50">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <span className="text-text-muted text-xs block mb-1">发生时间</span>
                            <span className="text-text-primary font-medium">
                                {formatDateTimeWithMs(jank.timestamp)}
                            </span>
                        </div>
                        <div>
                            <span className="text-text-muted text-xs block mb-1">持续时间</span>
                            <span
                                className={clsx(
                                    'px-2 py-0.5 rounded text-sm font-medium inline-block',
                                    jank.duration > 500
                                        ? 'bg-status-error-bg text-status-error'
                                        : jank.duration > 200
                                            ? 'bg-status-warning-bg text-status-warning'
                                            : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                )}
                            >
                                {formatDuration(jank.duration)}
                            </span>
                        </div>
                        <div>
                            <span className="text-text-muted text-xs block mb-1">丢帧数</span>
                            <span className="text-text-primary font-medium">
                                {jank.droppedFrames} 帧
                            </span>
                        </div>
                    </div>
                </div>

                {/* 调用栈 */}
                <div className="flex-1 overflow-auto px-6 py-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-text-muted text-xs font-medium">
                            调用栈 ({stackFrames.length} 帧)
                        </span>
                        {jank.stackTrace && (
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(jank.stackTrace || '')
                                }}
                                className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors"
                            >
                                复制调用栈
                            </button>
                        )}
                    </div>

                    {stackFrames.length > 0 ? (
                        <div className="bg-bg-darkest rounded-lg border border-border overflow-hidden">
                            <div className="overflow-auto max-h-[40vh]">
                                <pre className="text-xs text-text-secondary p-4 font-mono whitespace-pre-wrap break-all">
                                    {stackFrames.map((frame, index) => (
                                        <div
                                            key={index}
                                            className={clsx(
                                                'py-0.5',
                                                index === 0 && 'text-accent-primary font-medium'
                                            )}
                                        >
                                            <span className="text-text-muted mr-2 select-none">
                                                {String(index).padStart(2, '0')}
                                            </span>
                                            {frame}
                                        </div>
                                    ))}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-bg-darkest rounded-lg border border-border p-8 text-center">
                            <span className="text-text-muted text-sm">
                                未捕获调用栈
                            </span>
                            <p className="text-text-tertiary text-xs mt-2">
                                需要在 SDK 配置中启用 captureStackTrace 选项
                            </p>
                        </div>
                    )}
                </div>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg bg-bg-light hover:bg-bg-medium text-text-secondary transition-colors"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    )
}

// 趋势内容
function TrendsContent({
    metrics,
    trends,
    isLoading,
}: {
    metrics: PerformanceMetrics[]
    trends: import('@/stores/performanceStore').PerformanceTrends | null
    isLoading: boolean
}) {
    const [showTrendHelp, setShowTrendHelp] = useState(false)

    const getTrendColor = (trend: 'improving' | 'stable' | 'degrading') => {
        switch (trend) {
            case 'improving':
                return 'text-status-success'
            case 'stable':
                return 'text-text-tertiary'
            case 'degrading':
                return 'text-red-400'
        }
    }

    const getTrendBgColor = (trend: 'improving' | 'stable' | 'degrading') => {
        switch (trend) {
            case 'improving':
                return 'bg-status-success-bg'
            case 'stable':
                return 'bg-bg-light'
            case 'degrading':
                return 'bg-red-400/10'
        }
    }

    const getTrendLabel = (trend: 'improving' | 'stable' | 'degrading') => {
        switch (trend) {
            case 'improving':
                return '改善中'
            case 'stable':
                return '稳定'
            case 'degrading':
                return '恶化中'
        }
    }

    if (isLoading && !trends) {
        return (
            <div className="flex items-center justify-center h-full text-text-muted">
                加载中...
            </div>
        )
    }

    if (!trends) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
                <PerformanceIcon size={48} className="opacity-30" />
                <span>暂无趋势数据</span>
                <span className="text-xs">需要至少 1 分钟的监控数据</span>
            </div>
        )
    }

    return (
        <div className="p-4 space-y-4">
            {/* 整体趋势 */}
            <div className="bg-bg-medium rounded-lg p-4 relative">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowTrendHelp(!showTrendHelp)}
                            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
                            title="点击查看趋势说明"
                        >
                            整体趋势
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                <circle cx="12" cy="17" r="1" fill="currentColor" />
                            </svg>
                        </button>
                    </div>
                    <span className={clsx(
                        'text-sm font-medium px-2 py-0.5 rounded',
                        getTrendColor(trends.overall),
                        getTrendBgColor(trends.overall)
                    )}>
                        {getTrendLabel(trends.overall)}
                    </span>
                </div>
                <div className="text-xs text-text-muted">
                    分析范围: 最近 {trends.analysisMinutes} 分钟 ({trends.dataPoints} 个数据点)
                </div>

                {/* 趋势说明弹窗 */}
                {showTrendHelp && (
                    <>
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowTrendHelp(false)}
                        />
                        <div className="absolute top-full left-0 mt-1 z-20 bg-bg-medium border border-border rounded-lg p-3 shadow-xl max-w-sm">
                            <div className="text-xs text-text-secondary space-y-2">
                                <div className="font-medium mb-2">趋势颜色说明</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-status-success bg-status-success-bg px-2 py-0.5 rounded">改善中</span>
                                    <span className="text-text-tertiary">指标向好的方向变化</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-text-tertiary bg-bg-light px-2 py-0.5 rounded">稳定</span>
                                    <span className="text-text-tertiary">指标变化幅度在 5% 以内</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded">恶化中</span>
                                    <span className="text-text-tertiary">指标向差的方向变化</span>
                                </div>
                                <div className="border-t border-border pt-2 mt-2 text-text-muted">
                                    <div>• CPU/内存: 上升为恶化，下降为改善</div>
                                    <div>• FPS: 下降为恶化，上升为改善</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowTrendHelp(false)}
                                className="absolute top-1 right-1 text-text-tertiary hover:text-text-primary"
                            >
                                ✕
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* 各指标趋势 */}
            <div className="grid grid-cols-3 gap-4">
                {/* CPU 趋势 */}
                {trends.cpu && (
                    <div className="bg-bg-medium rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">CPU 趋势</span>
                            <span className={clsx(
                                'text-xs px-2 py-0.5 rounded',
                                getTrendColor(trends.cpu.trend),
                                getTrendBgColor(trends.cpu.trend)
                            )}>
                                {getTrendLabel(trends.cpu.trend)}
                            </span>
                        </div>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                                <span className="text-text-muted">前半段均值</span>
                                <span className="text-text-secondary">{trends.cpu.firstHalfAverage.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">后半段均值</span>
                                <span className="text-text-secondary">{trends.cpu.secondHalfAverage.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">变化幅度</span>
                                <span className={trends.cpu.changePercent > 0 ? 'text-red-400' : 'text-status-success'}>
                                    {trends.cpu.changePercent > 0 ? '+' : ''}{trends.cpu.changePercent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">范围</span>
                                <span className="text-text-secondary">
                                    {trends.cpu.minValue.toFixed(1)}% - {trends.cpu.maxValue.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 内存趋势 */}
                {trends.memory && (
                    <div className="bg-bg-medium rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">内存趋势</span>
                            <span className={clsx(
                                'text-xs px-2 py-0.5 rounded',
                                getTrendColor(trends.memory.trend),
                                getTrendBgColor(trends.memory.trend)
                            )}>
                                {getTrendLabel(trends.memory.trend)}
                            </span>
                        </div>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                                <span className="text-text-muted">前半段均值</span>
                                <span className="text-text-secondary">{trends.memory.firstHalfAverage.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">后半段均值</span>
                                <span className="text-text-secondary">{trends.memory.secondHalfAverage.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">变化幅度</span>
                                <span className={trends.memory.changePercent > 0 ? 'text-red-400' : 'text-status-success'}>
                                    {trends.memory.changePercent > 0 ? '+' : ''}{trends.memory.changePercent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">范围</span>
                                <span className="text-text-secondary">
                                    {trends.memory.minValue.toFixed(1)}% - {trends.memory.maxValue.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* FPS 趋势 */}
                {trends.fps && (
                    <div className="bg-bg-medium rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">FPS 趋势</span>
                            <span className={clsx(
                                'text-xs px-2 py-0.5 rounded',
                                getTrendColor(trends.fps.trend),
                                getTrendBgColor(trends.fps.trend)
                            )}>
                                {getTrendLabel(trends.fps.trend)}
                            </span>
                        </div>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                                <span className="text-text-muted">前半段均值</span>
                                <span className="text-text-secondary">{trends.fps.firstHalfAverage.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">后半段均值</span>
                                <span className="text-text-secondary">{trends.fps.secondHalfAverage.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">变化幅度</span>
                                <span className={trends.fps.changePercent < 0 ? 'text-red-400' : 'text-status-success'}>
                                    {trends.fps.changePercent > 0 ? '+' : ''}{trends.fps.changePercent.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-muted">范围</span>
                                <span className="text-text-secondary">
                                    {trends.fps.minValue.toFixed(0)} - {trends.fps.maxValue.toFixed(0)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 趋势图表 - 使用 recharts */}
            <div className="bg-bg-medium rounded-lg p-4">
                <h3 className="text-sm font-medium text-text-secondary mb-3">📈 趋势图</h3>
                <PerformanceCharts metrics={metrics} />
            </div>

            {/* 建议 */}
            {trends.recommendations && trends.recommendations.length > 0 && (
                <div className="bg-bg-medium rounded-lg p-4">
                    <h3 className="text-sm font-medium text-text-secondary mb-3">💡 优化建议</h3>
                    <ul className="space-y-2">
                        {trends.recommendations.map((rec, index) => (
                            <li key={index} className="text-xs text-text-tertiary flex items-start gap-2">
                                <span className="text-primary">•</span>
                                <span>{rec}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

// 告警内容
function AlertsContent({
    deviceId,
    alerts,
    alertRules,
    isLoading,
    onResolve,
}: {
    deviceId: string
    alerts: Alert[]
    alertRules: AlertRule[]
    alertConfig: { cooldownSeconds: number; isEnabled: boolean }
    isLoading: boolean
    onResolve: (alertId: string) => void
}) {
    const [showRules, setShowRules] = useState(false)
    const [includeResolved, setIncludeResolved] = useState(false)
    const [showAddRule, setShowAddRule] = useState(false)
    const store = usePerformanceStore()

    // 过滤告警
    const filteredAlerts = useMemo(() => {
        if (includeResolved) return alerts
        return alerts.filter((a) => !a.isResolved)
    }, [alerts, includeResolved])

    // 按严重程度排序
    const sortedAlerts = useMemo(() => {
        const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
        return [...filteredAlerts].sort((a, b) => {
            // 未解决的优先
            if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1
            // 按严重程度
            return severityOrder[a.severity] - severityOrder[b.severity]
        })
    }, [filteredAlerts])

    const formatTimestamp = (ts: string) => {
        const date = new Date(ts)
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    return (
        <div className="flex flex-col h-full">
            {/* 顶部工具栏 */}
            <div className="flex-shrink-0 px-4 pt-4 pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-medium text-text-secondary">
                            告警列表
                            {store.activeAlertCount > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                                    {store.activeAlertCount} 活跃
                                </span>
                            )}
                        </h3>
                        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                            <Checkbox
                                checked={includeResolved}
                                onChange={(checked) => setIncludeResolved(checked)}
                            />
                            显示已解决
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowRules(!showRules)}
                            className="btn btn-secondary text-xs px-2 py-1"
                        >
                            {showRules ? '隐藏规则' : '告警规则'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 告警规则面板 */}
            {showRules && (
                <div className="flex-shrink-0 px-4 pb-3">
                    <div className="bg-bg-medium rounded-lg p-3 border border-border">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-text-secondary">告警规则</h4>
                            <button
                                onClick={() => setShowAddRule(true)}
                                className="btn btn-primary text-xs px-2 py-1"
                            >
                                + 添加规则
                            </button>
                        </div>
                        <div className="space-y-2">
                            {alertRules.length === 0 ? (
                                <div className="text-center py-4">
                                    <p className="text-xs text-text-muted mb-2">暂无告警规则</p>
                                    <p className="text-xs text-text-muted">点击上方"添加规则"按钮创建</p>
                                </div>
                            ) : (
                                alertRules.map((rule) => (
                                    <div
                                        key={rule.id}
                                        className={clsx(
                                            'flex items-center justify-between px-2 py-1.5 rounded text-xs',
                                            rule.isEnabled ? 'bg-bg-medium' : 'bg-bg-medium opacity-50'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={getSeverityColor(rule.severity)}>
                                                {rule.severity === 'critical' ? '🔴' : rule.severity === 'warning' ? '🟡' : '🔵'}
                                            </span>
                                            <span className="text-text-secondary">{getMetricTypeLabel(rule.metricType)}</span>
                                            <span className="text-text-muted">
                                                {getConditionLabel(rule.condition)} {rule.threshold}
                                                {rule.metricType === 'memory' || rule.metricType === 'cpu' ? '%' : ''}
                                            </span>
                                            {rule.durationSeconds > 0 && (
                                                <span className="text-text-muted">持续 {rule.durationSeconds}s</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() =>
                                                    store.updateAlertRule(deviceId, rule.id, { isEnabled: !rule.isEnabled })
                                                }
                                                className={clsx(
                                                    'px-1.5 py-0.5 rounded text-xs',
                                                    rule.isEnabled
                                                        ? 'bg-status-success-bg text-status-success'
                                                        : 'bg-bg-light text-text-tertiary'
                                                )}
                                            >
                                                {rule.isEnabled ? '启用' : '禁用'}
                                            </button>
                                            <button
                                                onClick={() => store.deleteAlertRule(deviceId, rule.id)}
                                                className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 hover:bg-red-900/70"
                                                title="删除规则"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 添加规则弹窗 */}
            {showAddRule && (
                <AddAlertRuleModal
                    onClose={() => setShowAddRule(false)}
                    onAdd={(rule) => {
                        store.addAlertRule(deviceId, rule)
                        setShowAddRule(false)
                    }}
                />
            )}

            {/* 告警列表 - 可滚动区域 */}
            <div className="flex-1 overflow-auto px-4 pb-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full text-text-muted">加载中...</div>
                ) : sortedAlerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3">
                        <AlertIcon size={48} className="opacity-30" />
                        <span>暂无告警</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {sortedAlerts.map((alert) => (
                            <div
                                key={alert.id}
                                className={clsx(
                                    'p-3 rounded-lg border transition-colors',
                                    alert.isResolved
                                        ? 'bg-bg-medium/30 border-border opacity-60'
                                        : getSeverityBgColor(alert.severity)
                                )}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={clsx('text-xs font-medium', getSeverityColor(alert.severity))}>
                                                {alert.severity === 'critical'
                                                    ? '严重'
                                                    : alert.severity === 'warning'
                                                        ? '警告'
                                                        : '提示'}
                                            </span>
                                            <span className="text-xs text-text-tertiary">{getMetricTypeLabel(alert.metricType)}</span>
                                            <span className="text-xs text-text-muted">{formatTimestamp(alert.timestamp)}</span>
                                            {alert.isResolved && (
                                                <span className="text-xs px-1.5 py-0.5 rounded bg-status-success-bg text-status-success">
                                                    已解决
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-text-primary">{alert.message}</p>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                            <span>当前: {alert.currentValue.toFixed(1)}</span>
                                            <span>阈值: {alert.threshold}</span>
                                        </div>
                                    </div>
                                    {!alert.isResolved && (
                                        <button
                                            onClick={() => onResolve(alert.id)}
                                            className="ml-2 px-2 py-1 text-xs rounded bg-green-600/80 text-white hover:bg-green-600 transition-colors"
                                        >
                                            解决
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// 设置面板 - 使用统一的弹窗样式
function SettingsPanel({
    config,
    onUpdate,
    onClose,
}: {
    config: {
        sampleInterval: number
        monitorFPS: boolean
        monitorCPU: boolean
        monitorMemory: boolean
        monitorNetwork: boolean
        monitorDiskIO: boolean
        smartSamplingEnabled: boolean
    }
    onUpdate: (config: any) => void
    onClose: () => void
}) {
    const [localConfig, setLocalConfig] = useState(config)

    const handleSave = () => {
        onUpdate(localConfig)
        onClose()
    }

    // ESC 键关闭弹窗
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-bg-dark border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-primary">监控设置</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-bg-light text-text-muted hover:text-text-primary transition-all"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4 max-h-96 overflow-y-auto">
                    {/* 采样间隔 */}
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-text-secondary">采样间隔</label>
                        <select
                            value={localConfig.sampleInterval}
                            onChange={(e) =>
                                setLocalConfig({ ...localConfig, sampleInterval: Number(e.target.value) })
                            }
                            className="select"
                            disabled={localConfig.smartSamplingEnabled}
                        >
                            <option value={0.5}>0.5 秒</option>
                            <option value={1}>1 秒</option>
                            <option value={2}>2 秒</option>
                            <option value={5}>5 秒</option>
                        </select>
                    </div>

                    {/* 智能采样 */}
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm text-text-secondary">智能采样</label>
                            <p className="text-xs text-text-muted mt-0.5">根据系统负载自动调整采样频率</p>
                        </div>
                        <Checkbox
                            checked={localConfig.smartSamplingEnabled}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, smartSamplingEnabled: checked })
                            }
                        />
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="text-xs text-text-muted mb-3">基础监控项</div>
                    </div>

                    {/* 监控项 */}
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-text-secondary">监控 CPU</label>
                        <Checkbox
                            checked={localConfig.monitorCPU}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, monitorCPU: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-sm text-text-secondary">监控内存</label>
                        <Checkbox
                            checked={localConfig.monitorMemory}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, monitorMemory: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <label className="text-sm text-text-secondary">监控 FPS</label>
                        <Checkbox
                            checked={localConfig.monitorFPS}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, monitorFPS: checked })
                            }
                        />
                    </div>

                    <div className="border-t border-border pt-4">
                        <div className="text-xs text-text-muted mb-3">高级监控项</div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm text-text-secondary">监控网络流量</label>
                            <p className="text-xs text-text-muted mt-0.5">追踪上传/下载速率和总流量</p>
                        </div>
                        <Checkbox
                            checked={localConfig.monitorNetwork}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, monitorNetwork: checked })
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm text-text-secondary">监控磁盘 I/O</label>
                            <p className="text-xs text-text-muted mt-0.5">追踪读写速率和总量</p>
                        </div>
                        <Checkbox
                            checked={localConfig.monitorDiskIO}
                            onChange={(checked) =>
                                setLocalConfig({ ...localConfig, monitorDiskIO: checked })
                            }
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary px-4 py-2 text-sm"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn btn-primary px-4 py-2 text-sm"
                    >
                        应用配置
                    </button>
                </div>
            </div>
        </div>
    )
}

// 添加告警规则弹窗
function AddAlertRuleModal({
    onClose,
    onAdd,
}: {
    onClose: () => void
    onAdd: (rule: {
        metricType: 'cpu' | 'memory' | 'fps' | 'jank'
        threshold: number
        condition: 'gt' | 'lt' | 'gte' | 'lte'
        durationSeconds: number
        severity: 'info' | 'warning' | 'critical'
    }) => void
}) {
    const [metricType, setMetricType] = useState<'cpu' | 'memory' | 'fps' | 'jank'>('cpu')
    const [threshold, setThreshold] = useState(80)
    const [condition, setCondition] = useState<'gt' | 'lt' | 'gte' | 'lte'>('gt')
    const [durationSeconds, setDurationSeconds] = useState(5)
    const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning')

    const handleSubmit = () => {
        onAdd({
            metricType,
            threshold,
            condition,
            durationSeconds,
            severity,
        })
    }

    // ESC 键关闭弹窗
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-bg-dark border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-primary">添加告警规则</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-bg-light text-text-muted hover:text-text-primary transition-all"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {/* 指标类型 */}
                    <div>
                        <label className="text-sm text-text-secondary block mb-1.5">监控指标</label>
                        <select
                            value={metricType}
                            onChange={(e) => setMetricType(e.target.value as typeof metricType)}
                            className="select w-full"
                        >
                            <option value="cpu">CPU 使用率</option>
                            <option value="memory">内存使用</option>
                            <option value="fps">FPS</option>
                            <option value="jank">卡顿次数</option>
                        </select>
                    </div>

                    {/* 条件 */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-text-secondary block mb-1.5">条件</label>
                            <select
                                value={condition}
                                onChange={(e) => setCondition(e.target.value as typeof condition)}
                                className="select w-full"
                            >
                                <option value="gt">大于</option>
                                <option value="gte">大于等于</option>
                                <option value="lt">小于</option>
                                <option value="lte">小于等于</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-text-secondary block mb-1.5">
                                阈值 {metricType === 'cpu' ? '(%)' : metricType === 'memory' ? '(MB)' : ''}
                            </label>
                            <input
                                type="number"
                                value={threshold}
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                className="input w-full"
                                min={0}
                            />
                        </div>
                    </div>

                    {/* 持续时间 */}
                    <div>
                        <label className="text-sm text-text-secondary block mb-1.5">持续时间 (秒)</label>
                        <input
                            type="number"
                            value={durationSeconds}
                            onChange={(e) => setDurationSeconds(Number(e.target.value))}
                            className="input w-full"
                            min={0}
                        />
                        <p className="text-xs text-text-muted mt-1">
                            指标持续达到阈值的时间才触发告警，0 表示立即触发
                        </p>
                    </div>

                    {/* 严重程度 */}
                    <div>
                        <label className="text-sm text-text-secondary block mb-1.5">严重程度</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSeverity('info')}
                                className={clsx(
                                    'flex-1 py-2 px-3 rounded text-xs font-medium transition-colors',
                                    severity === 'info'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500'
                                        : 'bg-bg-medium text-text-tertiary border border-transparent hover:bg-bg-light'
                                )}
                            >
                                🔵 提示
                            </button>
                            <button
                                onClick={() => setSeverity('warning')}
                                className={clsx(
                                    'flex-1 py-2 px-3 rounded text-xs font-medium transition-colors',
                                    severity === 'warning'
                                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500'
                                        : 'bg-bg-medium text-text-tertiary border border-transparent hover:bg-bg-light'
                                )}
                            >
                                🟡 警告
                            </button>
                            <button
                                onClick={() => setSeverity('critical')}
                                className={clsx(
                                    'flex-1 py-2 px-3 rounded text-xs font-medium transition-colors',
                                    severity === 'critical'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500'
                                        : 'bg-bg-medium text-text-tertiary border border-transparent hover:bg-bg-light'
                                )}
                            >
                                🔴 严重
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary px-4 py-2 text-sm"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="btn btn-primary px-4 py-2 text-sm"
                    >
                        添加规则
                    </button>
                </div>
            </div>
        </div>
    )
}

// =============================================
// 页面耗时内容组件
// =============================================

interface PageTimingContentProps {
    deviceId: string
    events: PageTimingEvent[]
    summary: PageTimingSummary[]
    total: number
    page: number
    pageSize: number
    isLoading: boolean
    isLoadingSummary: boolean
    selectedEvent: PageTimingEvent | null
    onFetch: (params: PageTimingQueryParams) => void
    onFetchSummary: (from?: Date, to?: Date, pageName?: string) => void
    onSelectEvent: (event: PageTimingEvent | null) => void
}

function PageTimingContent({
    events,
    summary,
    total,
    page,
    pageSize,
    isLoading,
    isLoadingSummary,
    selectedEvent,
    onFetch,
    onFetchSummary,
    onSelectEvent,
}: PageTimingContentProps) {
    // 视图模式: summary=汇总, list=列表, distribution=分布图
    const [viewMode, setViewMode] = useState<'summary' | 'list' | 'distribution'>('summary')
    const [showFilters, setShowFilters] = useState(false)

    // 排序状态
    type SummarySortKey = 'count' | 'avgDuration' | 'p50' | 'p90' | 'p95'
    type ListSortKey = 'time' | 'loadDuration' | 'appearDuration'
    const [summarySortKey, setSummarySortKey] = useState<SummarySortKey>('count')
    const [summarySortDesc, setSummarySortDesc] = useState(true)
    const [listSortKey, setListSortKey] = useState<ListSortKey>('time')
    const [listSortDesc, setListSortDesc] = useState(true)

    // 筛选状态
    const [filterPageName, setFilterPageName] = useState('')
    const [filterMinDuration, setFilterMinDuration] = useState<number | undefined>(undefined)
    const [filterTimeRange, setFilterTimeRange] = useState<'1h' | '6h' | '24h' | '7d' | 'all'>('all')

    const totalPages = Math.ceil(total / pageSize)

    // 计算时间范围
    const getTimeRange = useCallback(() => {
        const now = new Date()
        switch (filterTimeRange) {
            case '1h': return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now }
            case '6h': return { from: new Date(now.getTime() - 6 * 60 * 60 * 1000), to: now }
            case '24h': return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now }
            case '7d': return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now }
            default: return { from: undefined, to: undefined }
        }
    }, [filterTimeRange])

    // 应用筛选
    const applyFilters = useCallback((newPage?: number) => {
        const { from, to } = getTimeRange()
        onFetch({
            page: newPage ?? 1,
            pageName: filterPageName || undefined,
            minDuration: filterMinDuration,
            from,
            to,
        })
        onFetchSummary(from, to, filterPageName || undefined)
    }, [filterPageName, filterMinDuration, getTimeRange, onFetch, onFetchSummary])

    // 页码变化
    const handlePageChange = useCallback((newPage: number) => {
        applyFilters(newPage)
    }, [applyFilters])

    // 重置筛选
    const resetFilters = useCallback(() => {
        setFilterPageName('')
        setFilterMinDuration(undefined)
        setFilterTimeRange('all')
        onFetch({ page: 1 })
        onFetchSummary()
    }, [onFetch, onFetchSummary])

    // 检查是否有活跃筛选
    const hasActiveFilters = filterPageName || filterMinDuration || filterTimeRange !== 'all'

    // 汇总排序选项
    const summarySortOptions: { key: SummarySortKey; label: string }[] = [
        { key: 'count', label: '访问次数' },
        { key: 'avgDuration', label: '平均耗时' },
        { key: 'p50', label: 'P50' },
        { key: 'p90', label: 'P90' },
        { key: 'p95', label: 'P95' },
    ]

    // 列表排序选项
    const listSortOptions: { key: ListSortKey; label: string }[] = [
        { key: 'time', label: '时间' },
        { key: 'loadDuration', label: '加载耗时' },
        { key: 'appearDuration', label: '可见耗时' },
    ]

    // 切换汇总排序
    const handleSummarySortClick = useCallback((key: SummarySortKey) => {
        if (key === summarySortKey) {
            setSummarySortDesc(!summarySortDesc)
        } else {
            setSummarySortKey(key)
            setSummarySortDesc(true)
        }
    }, [summarySortKey, summarySortDesc])

    // 切换列表排序
    const handleListSortClick = useCallback((key: ListSortKey) => {
        if (key === listSortKey) {
            setListSortDesc(!listSortDesc)
        } else {
            setListSortKey(key)
            setListSortDesc(true)
        }
    }, [listSortKey, listSortDesc])

    return (
        <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* 视图切换 */}
                    <div className="flex bg-bg-light rounded p-0.5">
                        <button
                            onClick={() => setViewMode('summary')}
                            className={clsx(
                                'px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1',
                                viewMode === 'summary'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            <SummaryIcon size={12} />
                            汇总
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={clsx(
                                'px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1',
                                viewMode === 'list'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            <ListIcon size={12} />
                            列表
                        </button>
                        <button
                            onClick={() => setViewMode('distribution')}
                            className={clsx(
                                'px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1',
                                viewMode === 'distribution'
                                    ? 'bg-primary text-bg-darkest'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            <DistributionIcon size={12} />
                            分布
                        </button>
                    </div>

                    <div className="h-4 w-px bg-border flex-shrink-0" />

                    {/* 筛选按钮 */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={clsx(
                            'btn !text-2xs !px-2 !py-1',
                            (showFilters || hasActiveFilters) ? 'btn-primary' : 'btn-secondary'
                        )}
                    >
                        筛选
                        {hasActiveFilters && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white inline-block" />
                        )}
                    </button>

                    {/* 排序控件 - 汇总视图 */}
                    {viewMode === 'summary' && (
                        <>
                            <div className="h-4 w-px bg-border flex-shrink-0" />
                            <span className="text-xs text-text-muted">排序:</span>
                            <div className="flex gap-1">
                                {summarySortOptions.map((opt) => (
                                    <button
                                        key={opt.key}
                                        onClick={() => handleSummarySortClick(opt.key)}
                                        className={clsx(
                                            'px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5',
                                            summarySortKey === opt.key
                                                ? 'bg-primary text-bg-darkest'
                                                : 'bg-bg-light text-text-secondary hover:text-text-primary'
                                        )}
                                    >
                                        {opt.label}
                                        {summarySortKey === opt.key && (
                                            <span className="text-[10px]">{summarySortDesc ? '↓' : '↑'}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* 排序控件 - 列表视图 */}
                    {viewMode === 'list' && (
                        <>
                            <div className="h-4 w-px bg-border flex-shrink-0" />
                            <span className="text-xs text-text-muted">排序:</span>
                            <div className="flex gap-1">
                                {listSortOptions.map((opt) => (
                                    <button
                                        key={opt.key}
                                        onClick={() => handleListSortClick(opt.key)}
                                        className={clsx(
                                            'px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5',
                                            listSortKey === opt.key
                                                ? 'bg-primary text-bg-darkest'
                                                : 'bg-bg-light text-text-secondary hover:text-text-primary'
                                        )}
                                    >
                                        {opt.label}
                                        {listSortKey === opt.key && (
                                            <span className="text-[10px]">{listSortDesc ? '↓' : '↑'}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">
                        共 {total} 条记录
                    </span>
                </div>
            </div>

            {/* 筛选面板 */}
            {showFilters && (
                <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium">
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* 页面名称搜索 */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-text-muted">页面名称:</label>
                            <input
                                type="text"
                                value={filterPageName}
                                onChange={(e) => setFilterPageName(e.target.value)}
                                placeholder="搜索页面..."
                                className="bg-bg-medium text-xs text-text-primary rounded px-2 py-0.5 border border-border focus:outline-none focus:border-primary w-36"
                            />
                        </div>

                        {/* 最小耗时 */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-text-muted">最小耗时:</label>
                            <select
                                value={filterMinDuration ?? ''}
                                onChange={(e) => setFilterMinDuration(e.target.value ? Number(e.target.value) : undefined)}
                                className="bg-bg-medium text-xs text-text-primary rounded px-2 py-0.5 border border-border focus:outline-none focus:border-primary"
                            >
                                <option value="">全部</option>
                                <option value="100">&gt; 100ms</option>
                                <option value="300">&gt; 300ms</option>
                                <option value="500">&gt; 500ms</option>
                                <option value="1000">&gt; 1s</option>
                                <option value="2000">&gt; 2s</option>
                            </select>
                        </div>

                        {/* 时间范围 */}
                        <div className="flex items-center gap-1.5">
                            <label className="text-xs text-text-muted">时间范围:</label>
                            <select
                                value={filterTimeRange}
                                onChange={(e) => setFilterTimeRange(e.target.value as typeof filterTimeRange)}
                                className="bg-bg-medium text-xs text-text-primary rounded px-2 py-0.5 border border-border focus:outline-none focus:border-primary"
                            >
                                <option value="all">全部</option>
                                <option value="1h">最近 1 小时</option>
                                <option value="6h">最近 6 小时</option>
                                <option value="24h">最近 24 小时</option>
                                <option value="7d">最近 7 天</option>
                            </select>
                        </div>

                        {/* 应用按钮 - 紧跟在筛选项后面 */}
                        <button
                            onClick={() => applyFilters(1)}
                            className="btn btn-primary !px-2 !py-1 !text-2xs"
                        >
                            应用
                        </button>

                        {/* 重置按钮 */}
                        {hasActiveFilters && (
                            <button
                                onClick={resetFilters}
                                className="btn btn-secondary !px-2 !py-1 !text-2xs"
                            >
                                重置
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 内容区 */}
            <div className="flex-1 overflow-auto px-4 py-4">
                {viewMode === 'summary' ? (
                    <PageTimingSummaryView
                        summary={summary}
                        isLoading={isLoadingSummary}
                        sortKey={summarySortKey}
                        sortDesc={summarySortDesc}
                    />
                ) : viewMode === 'distribution' ? (
                    <PageTimingDistributionView
                        events={events}
                        summary={summary}
                        isLoading={isLoading || isLoadingSummary}
                    />
                ) : (
                    <PageTimingListView
                        events={events}
                        total={total}
                        page={page}
                        pageSize={pageSize}
                        totalPages={totalPages}
                        isLoading={isLoading}
                        onPageChange={handlePageChange}
                        onSelectEvent={onSelectEvent}
                        sortKey={listSortKey}
                        sortDesc={listSortDesc}
                    />
                )}
            </div>

            {/* 详情弹窗 */}
            {selectedEvent && (
                <PageTimingDetailModal
                    event={selectedEvent}
                    onClose={() => onSelectEvent(null)}
                />
            )}
        </div>
    )
}

// 汇总排序选项类型
type SummarySortKey = 'count' | 'avgDuration' | 'p50' | 'p90' | 'p95'

// 页面耗时汇总视图
function PageTimingSummaryView({
    summary,
    isLoading,
    sortKey,
    sortDesc,
}: {
    summary: PageTimingSummary[]
    isLoading: boolean
    sortKey: SummarySortKey
    sortDesc: boolean
}) {
    // 选中的详情项
    const [selectedItem, setSelectedItem] = useState<PageTimingSummary | null>(null)

    // 排序后的数据
    const sortedSummary = useMemo(() => {
        const sorted = [...summary]
        sorted.sort((a, b) => {
            let aVal: number, bVal: number
            switch (sortKey) {
                case 'count':
                    aVal = a.count
                    bVal = b.count
                    break
                case 'avgDuration':
                    aVal = a.avgAppearDuration ?? 0
                    bVal = b.avgAppearDuration ?? 0
                    break
                case 'p50':
                    aVal = a.p50AppearDuration ?? 0
                    bVal = b.p50AppearDuration ?? 0
                    break
                case 'p90':
                    aVal = a.p90AppearDuration ?? 0
                    bVal = b.p90AppearDuration ?? 0
                    break
                case 'p95':
                    aVal = a.p95AppearDuration ?? 0
                    bVal = b.p95AppearDuration ?? 0
                    break
                default:
                    return 0
            }
            return sortDesc ? bVal - aVal : aVal - bVal
        })
        return sorted
    }, [summary, sortKey, sortDesc])

    // ESC 关闭详情
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedItem) {
                setSelectedItem(null)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedItem])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-text-muted text-sm">加载中...</span>
            </div>
        )
    }

    if (summary.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <ClockIcon size={48} className="text-text-muted mb-4" />
                <span className="text-text-muted text-sm">暂无页面耗时数据</span>
            </div>
        )
    }

    return (
        <>
            {/* 紧凑列表视图 */}
            <div className="space-y-1">
                {/* 表头 */}
                <div className="grid grid-cols-[1fr_80px_70px_70px_70px_70px_60px] gap-2 px-3 py-1.5 text-xs text-text-muted border-b border-border">
                    <span>页面</span>
                    <span className="text-right">访问次数</span>
                    <span className="text-right">平均</span>
                    <span className="text-right">P50</span>
                    <span className="text-right">P90</span>
                    <span className="text-right">P95</span>
                    <span className="text-right">异常</span>
                </div>

                {/* 数据行 */}
                {sortedSummary.map((item, index) => (
                    <div
                        key={item.pageId}
                        onClick={() => setSelectedItem(item)}
                        className={clsx(
                            'grid grid-cols-[1fr_80px_70px_70px_70px_70px_60px] gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200',
                            'hover:bg-bg-light',
                            selectedItem?.pageId === item.pageId && 'bg-primary/10'
                        )}
                        style={{
                            animation: `fadeIn 0.3s ease-out ${index * 0.03}s both`
                        }}
                    >
                        {/* 页面名称 */}
                        <div className="min-w-0">
                            <p className="text-sm text-text-primary truncate" title={item.pageName}>
                                {item.pageName}
                            </p>
                            <p className="text-[10px] text-text-muted truncate" title={item.pageId}>
                                {item.pageId}
                            </p>
                        </div>

                        {/* 访问次数 */}
                        <span className="text-sm text-text-primary text-right font-medium tabular-nums">
                            {item.count}
                        </span>

                        {/* 平均耗时 */}
                        <span className={clsx('text-sm text-right tabular-nums', getPageTimingColor(item.avgAppearDuration))}>
                            {formatPageTiming(item.avgAppearDuration)}
                        </span>

                        {/* P50 */}
                        <span className={clsx('text-sm text-right tabular-nums', getPageTimingColor(item.p50AppearDuration))}>
                            {formatPageTiming(item.p50AppearDuration)}
                        </span>

                        {/* P90 */}
                        <span className={clsx('text-sm text-right tabular-nums', getPageTimingColor(item.p90AppearDuration))}>
                            {formatPageTiming(item.p90AppearDuration)}
                        </span>

                        {/* P95 */}
                        <span className={clsx('text-sm text-right tabular-nums', getPageTimingColor(item.p95AppearDuration))}>
                            {formatPageTiming(item.p95AppearDuration)}
                        </span>

                        {/* 异常率 */}
                        <span className={clsx(
                            'text-sm text-right tabular-nums',
                            item.errorRate && item.errorRate > 0 ? 'text-red-400' : 'text-text-muted'
                        )}>
                            {item.errorRate && item.errorRate > 0
                                ? `${(item.errorRate * 100).toFixed(0)}%`
                                : '-'
                            }
                        </span>
                    </div>
                ))}
            </div>

            {/* 详情弹窗 */}
            {selectedItem && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setSelectedItem(null)}
                >
                    <div
                        className="bg-bg-dark border border-border rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 弹窗头部 */}
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-medium text-text-primary truncate">
                                    {selectedItem.pageName}
                                </h3>
                                <p className="text-xs text-text-muted truncate">{selectedItem.pageId}</p>
                            </div>
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="text-text-muted hover:text-text-primary transition-colors ml-2 text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>

                        {/* 弹窗内容 */}
                        <div className="p-4 space-y-4">
                            {/* 访问统计 */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-text-muted">访问次数</span>
                                <span className="text-lg font-semibold text-text-primary">{selectedItem.count}</span>
                            </div>

                            {/* 耗时指标 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-bg-medium rounded-lg p-3">
                                    <span className="text-xs text-text-muted block mb-1">平均耗时</span>
                                    <span className={clsx('text-lg font-medium', getPageTimingColor(selectedItem.avgAppearDuration))}>
                                        {formatPageTiming(selectedItem.avgAppearDuration)}
                                    </span>
                                </div>
                                <div className="bg-bg-medium rounded-lg p-3">
                                    <span className="text-xs text-text-muted block mb-1">P50</span>
                                    <span className={clsx('text-lg font-medium', getPageTimingColor(selectedItem.p50AppearDuration))}>
                                        {formatPageTiming(selectedItem.p50AppearDuration)}
                                    </span>
                                </div>
                                <div className="bg-bg-medium rounded-lg p-3">
                                    <span className="text-xs text-text-muted block mb-1">P90</span>
                                    <span className={clsx('text-lg font-medium', getPageTimingColor(selectedItem.p90AppearDuration))}>
                                        {formatPageTiming(selectedItem.p90AppearDuration)}
                                    </span>
                                </div>
                                <div className="bg-bg-medium rounded-lg p-3">
                                    <span className="text-xs text-text-muted block mb-1">P95</span>
                                    <span className={clsx('text-lg font-medium', getPageTimingColor(selectedItem.p95AppearDuration))}>
                                        {formatPageTiming(selectedItem.p95AppearDuration)}
                                    </span>
                                </div>
                            </div>

                            {/* 范围 */}
                            <div className="bg-bg-medium rounded-lg p-3">
                                <span className="text-xs text-text-muted block mb-1">耗时范围</span>
                                <span className="text-sm text-text-primary">
                                    {formatPageTiming(selectedItem.minAppearDuration)} ~ {formatPageTiming(selectedItem.maxAppearDuration)}
                                </span>
                            </div>

                            {/* 异常率 */}
                            {selectedItem.errorRate !== undefined && selectedItem.errorRate > 0 && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <span className="text-xs text-red-400 block mb-1">异常率</span>
                                    <span className="text-lg font-medium text-red-400">
                                        {(selectedItem.errorRate * 100).toFixed(1)}%
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 弹窗底部 */}
                        <div className="px-4 py-3 border-t border-border flex justify-end">
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="btn btn-secondary text-xs px-3 py-1.5"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS 动画 */}
            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </>
    )
}

// 页面耗时分布视图
function PageTimingDistributionView({
    events,
    summary,
    isLoading,
}: {
    events: PageTimingEvent[]
    summary: PageTimingSummary[]
    isLoading: boolean
}) {
    // 计算耗时分布桶
    const distributionBuckets = useMemo(() => {
        const buckets = [
            { range: '0-100ms', min: 0, max: 100, count: 0, color: '#4ade80' },
            { range: '100-300ms', min: 100, max: 300, count: 0, color: '#a3e635' },
            { range: '300-500ms', min: 300, max: 500, count: 0, color: '#facc15' },
            { range: '500-1s', min: 500, max: 1000, count: 0, color: '#fb923c' },
            { range: '1-2s', min: 1000, max: 2000, count: 0, color: '#f87171' },
            { range: '>2s', min: 2000, max: Infinity, count: 0, color: '#ef4444' },
        ]

        events.forEach((event) => {
            const duration = event.appearDuration ?? 0
            const bucket = buckets.find((b) => duration >= b.min && duration < b.max)
            if (bucket) bucket.count++
        })

        return buckets
    }, [events])

    // Top 10 慢页面
    const slowestPages = useMemo(() => {
        return [...summary]
            .sort((a, b) => (b.avgAppearDuration ?? 0) - (a.avgAppearDuration ?? 0))
            .slice(0, 10)
    }, [summary])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-text-muted text-sm">加载中...</span>
            </div>
        )
    }

    if (events.length === 0 && summary.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <ClockIcon size={48} className="text-text-muted mb-4" />
                <span className="text-text-muted text-sm">暂无页面耗时数据</span>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* 耗时分布直方图 */}
            <div className="bg-bg-light rounded-lg p-4">
                <h3 className="text-sm font-medium text-text-primary mb-4">
                    ⏱️ 可见耗时分布
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={distributionBuckets} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis
                                dataKey="range"
                                tick={{ fontSize: 11, fill: '#9ca3af' }}
                                axisLine={{ stroke: '#4b5563' }}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: '#9ca3af' }}
                                axisLine={{ stroke: '#4b5563' }}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-bg-darkest)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    color: 'var(--color-text-primary)',
                                    boxShadow: 'var(--shadow-lg)',
                                }}
                                labelStyle={{ color: 'var(--color-text-primary)' }}
                                itemStyle={{ color: 'var(--color-text-primary)' }}
                                cursor={{ fill: 'rgba(0, 212, 170, 0.15)' }}
                                formatter={(value: number) => [`${value} 次`, '访问次数']}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {distributionBuckets.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 mt-4">
                    {distributionBuckets.map((bucket) => (
                        <div key={bucket.range} className="flex items-center gap-1.5">
                            <div
                                className="w-3 h-3 rounded"
                                style={{ backgroundColor: bucket.color }}
                            />
                            <span className="text-[10px] text-text-muted">{bucket.range}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top 10 慢页面 */}
            {slowestPages.length > 0 && (
                <div className="bg-bg-light rounded-lg p-4">
                    <h3 className="text-sm font-medium text-text-primary mb-4">
                        🐢 Top 10 慢页面 (按平均可见耗时)
                    </h3>
                    <div className="space-y-2">
                        {slowestPages.map((item, index) => (
                            <div
                                key={item.pageName}
                                className="flex items-center gap-3 p-2 rounded hover:bg-bg-medium transition-colors"
                            >
                                <span className={clsx(
                                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
                                    index < 3 ? 'bg-red-500/20 text-red-400' : 'bg-bg-medium text-text-muted'
                                )}>
                                    {index + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-text-primary truncate">
                                        {item.pageName}
                                    </p>
                                    <p className="text-[10px] text-text-muted">
                                        访问 {item.count} 次
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={clsx('text-xs font-bold', getPageTimingColor(item.avgAppearDuration))}>
                                        {formatPageTiming(item.avgAppearDuration)}
                                    </span>
                                    <p className="text-[10px] text-text-muted">
                                        最大 {formatPageTiming(item.maxAppearDuration)}
                                    </p>
                                </div>
                                {/* 进度条 */}
                                <div className="w-24 h-2 bg-bg-dark rounded overflow-hidden">
                                    <div
                                        className="h-full rounded"
                                        style={{
                                            width: `${Math.min(((item.avgAppearDuration ?? 0) / (slowestPages[0]?.avgAppearDuration || 1)) * 100, 100)}%`,
                                            backgroundColor: getPageTimingBarColor(item.avgAppearDuration ?? 0),
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// 获取进度条颜色
function getPageTimingBarColor(ms: number): string {
    if (ms < 100) return '#4ade80'
    if (ms < 300) return '#a3e635'
    if (ms < 500) return '#facc15'
    if (ms < 1000) return '#fb923c'
    if (ms < 2000) return '#f87171'
    return '#ef4444'
}

// 列表排序选项类型
type ListSortKey = 'time' | 'loadDuration' | 'appearDuration'

// 页面耗时列表视图
function PageTimingListView({
    events,
    total,
    page,
    totalPages,
    isLoading,
    onPageChange,
    onSelectEvent,
    sortKey,
    sortDesc,
}: {
    events: PageTimingEvent[]
    total: number
    page: number
    pageSize: number
    totalPages: number
    isLoading: boolean
    onPageChange: (page: number) => void
    onSelectEvent: (event: PageTimingEvent) => void
    sortKey: ListSortKey
    sortDesc: boolean
}) {
    // 排序后的数据（本地排序当前页）
    const sortedEvents = useMemo(() => {
        const sorted = [...events]
        sorted.sort((a, b) => {
            let aVal: number, bVal: number
            switch (sortKey) {
                case 'time':
                    aVal = new Date(a.startAt).getTime()
                    bVal = new Date(b.startAt).getTime()
                    break
                case 'loadDuration':
                    aVal = a.loadDuration ?? 0
                    bVal = b.loadDuration ?? 0
                    break
                case 'appearDuration':
                    aVal = a.appearDuration ?? 0
                    bVal = b.appearDuration ?? 0
                    break
                default:
                    return 0
            }
            return sortDesc ? bVal - aVal : aVal - bVal
        })
        return sorted
    }, [events, sortKey, sortDesc])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-text-muted text-sm">加载中...</span>
            </div>
        )
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <ClockIcon size={48} className="text-text-muted mb-4" />
                <span className="text-text-muted text-sm">暂无页面耗时数据</span>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-text-muted font-medium bg-bg-light rounded">
                <div className="col-span-3">页面</div>
                <div className="col-span-2">路由</div>
                <div className="col-span-2 text-center">加载耗时</div>
                <div className="col-span-2 text-center">可见耗时</div>
                <div className="col-span-2">时间</div>
                <div className="col-span-1 text-center">标记</div>
            </div>

            {/* 列表项 */}
            {sortedEvents.map((event) => (
                <div
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className={clsx(
                        'grid grid-cols-12 gap-2 px-3 py-2 rounded cursor-pointer transition-colors',
                        'hover:bg-bg-light border border-transparent hover:border-border',
                        getPageTimingBgColor(event.appearDuration)
                    )}
                >
                    <div className="col-span-3">
                        <p className="text-xs font-medium text-text-primary truncate">
                            {event.pageName}
                        </p>
                        <p className="text-[10px] text-text-muted truncate">
                            {event.pageId}
                        </p>
                    </div>
                    <div className="col-span-2 text-xs text-text-secondary truncate self-center">
                        {event.route || '--'}
                    </div>
                    <div className="col-span-2 text-center self-center">
                        <span className={clsx('text-xs font-medium', getPageTimingColor(event.loadDuration))}>
                            {formatPageTiming(event.loadDuration)}
                        </span>
                    </div>
                    <div className="col-span-2 text-center self-center">
                        <span className={clsx('text-xs font-medium', getPageTimingColor(event.appearDuration))}>
                            {formatPageTiming(event.appearDuration)}
                        </span>
                    </div>
                    <div className="col-span-2 text-xs text-text-muted self-center">
                        {formatTimeWithMs(event.startAt)}
                    </div>
                    <div className="col-span-1 text-center self-center">
                        {event.markers && event.markers.length > 0 ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-medium">
                                {event.markers.length}
                            </span>
                        ) : (
                            <span className="text-text-muted">--</span>
                        )}
                    </div>
                </div>
            ))}

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                    <span className="text-xs text-text-muted">
                        第 {page} / {totalPages} 页，共 {total} 条
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="btn btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                        >
                            上一页
                        </button>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="btn btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                        >
                            下一页
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// 页面耗时详情弹窗
function PageTimingDetailModal({
    event,
    onClose,
}: {
    event: PageTimingEvent
    onClose: () => void
}) {
    // ESC 键关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // 点击空白区域关闭
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }, [onClose])

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={handleBackdropClick}
        >
            <div className="bg-bg-dark border border-border rounded-lg w-[600px] max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-primary">页面耗时详情</h2>
                    <button
                        onClick={onClose}
                        className="text-text-muted hover:text-text-primary"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {/* 基本信息 */}
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">基本信息</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-xs text-text-muted">页面名称</span>
                                <p className="text-sm text-text-primary">{event.pageName}</p>
                            </div>
                            <div>
                                <span className="text-xs text-text-muted">页面标识</span>
                                <p className="text-sm text-text-primary font-mono">{event.pageId}</p>
                            </div>
                            <div>
                                <span className="text-xs text-text-muted">路由</span>
                                <p className="text-sm text-text-primary">{event.route || '--'}</p>
                            </div>
                            <div>
                                <span className="text-xs text-text-muted">访问 ID</span>
                                <p className="text-sm text-text-primary font-mono text-[10px]">{event.visitId}</p>
                            </div>
                        </div>
                    </div>

                    {/* 耗时指标 */}
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">耗时指标</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-bg-medium rounded-lg p-3 text-center">
                                <span className="text-xs text-text-muted block mb-1">加载耗时</span>
                                <span className={clsx('text-lg font-semibold', getPageTimingColor(event.loadDuration))}>
                                    {formatPageTiming(event.loadDuration)}
                                </span>
                                <span className="text-[10px] text-text-muted block mt-1">startAt → firstLayoutAt</span>
                            </div>
                            <div className="bg-bg-medium rounded-lg p-3 text-center">
                                <span className="text-xs text-text-muted block mb-1">可见耗时</span>
                                <span className={clsx('text-lg font-semibold', getPageTimingColor(event.appearDuration))}>
                                    {formatPageTiming(event.appearDuration)}
                                </span>
                                <span className="text-[10px] text-text-muted block mt-1">startAt → appearAt</span>
                            </div>
                            <div className="bg-bg-medium rounded-lg p-3 text-center">
                                <span className="text-xs text-text-muted block mb-1">总耗时</span>
                                <span className={clsx('text-lg font-semibold', getPageTimingColor(event.totalDuration))}>
                                    {formatPageTiming(event.totalDuration)}
                                </span>
                                <span className="text-[10px] text-text-muted block mt-1">startAt → endAt</span>
                            </div>
                        </div>
                    </div>

                    {/* 时间线 */}
                    <div className="mb-6">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">时间线</h3>

                        {/* 瀑布图可视化 */}
                        <PageTimingWaterfall event={event} />

                        {/* 时间点列表 */}
                        <div className="space-y-2 mt-4">
                            <TimelineItem
                                label="开始加载"
                                time={event.startAt}
                                elapsed={0}
                            />
                            {event.firstLayoutAt && (
                                <TimelineItem
                                    label="首次布局"
                                    time={event.firstLayoutAt}
                                    elapsed={event.loadDuration}
                                />
                            )}
                            {event.appearAt && (
                                <TimelineItem
                                    label="页面可见"
                                    time={event.appearAt}
                                    elapsed={event.appearDuration}
                                />
                            )}
                            {event.endAt && (
                                <TimelineItem
                                    label="页面离开"
                                    time={event.endAt}
                                    elapsed={event.totalDuration}
                                />
                            )}
                        </div>
                    </div>

                    {/* 自定义标记 */}
                    {event.markers && event.markers.length > 0 && (
                        <div className="mb-6">
                            <h3 className="text-sm font-medium text-text-secondary mb-3">
                                自定义标记 ({event.markers.length})
                            </h3>
                            <div className="space-y-2">
                                {event.markers.map((marker, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between bg-bg-medium rounded px-3 py-2"
                                    >
                                        <span className="text-xs text-text-primary">{marker.name}</span>
                                        <span className="text-xs text-text-muted">
                                            +{formatPageTiming(marker.elapsed)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 上下文信息 */}
                    <div>
                        <h3 className="text-sm font-medium text-text-secondary mb-3">上下文信息</h3>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                                <span className="text-text-muted">App 版本</span>
                                <p className="text-text-primary">
                                    {event.appVersion || '--'} ({event.appBuild || '--'})
                                </p>
                            </div>
                            <div>
                                <span className="text-text-muted">系统版本</span>
                                <p className="text-text-primary">{event.osVersion || '--'}</p>
                            </div>
                            <div>
                                <span className="text-text-muted">设备型号</span>
                                <p className="text-text-primary">{event.deviceModel || '--'}</p>
                            </div>
                            <div>
                                <span className="text-text-muted">来源页面</span>
                                <p className="text-text-primary font-mono">{event.parentPageId || '--'}</p>
                            </div>
                            <div>
                                <span className="text-text-muted">冷启动首页</span>
                                <p className="text-text-primary">{event.isColdStart ? '是' : '否'}</p>
                            </div>
                            <div>
                                <span className="text-text-muted">Push 导航</span>
                                <p className="text-text-primary">{event.isPush ? '是' : '否'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary px-4 py-2 text-sm"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>
    )
}

// 时间线项组件
function TimelineItem({
    label,
    time,
    elapsed,
}: {
    label: string
    time: string
    elapsed?: number
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
            <div className="flex-1 flex items-center justify-between bg-bg-medium rounded px-3 py-2">
                <span className="text-xs text-text-primary">{label}</span>
                <div className="text-right">
                    <span className="text-xs text-text-muted">{formatTimeWithMs(time)}</span>
                    {elapsed !== undefined && elapsed > 0 && (
                        <span className={clsx('text-xs ml-2', getPageTimingColor(elapsed))}>
                            +{formatPageTiming(elapsed)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

// 页面耗时瀑布图
function PageTimingWaterfall({ event }: { event: PageTimingEvent }) {
    // 计算各阶段相对于 startAt 的时间偏移（毫秒）
    const phases = useMemo(() => {
        const result: Array<{ name: string; start: number; end: number; color: string }> = []
        const loadDuration = event.loadDuration ?? 0
        const appearDuration = event.appearDuration ?? 0
        const totalDuration = event.totalDuration ?? 0

        // 加载阶段: startAt → firstLayoutAt
        if (event.firstLayoutAt && loadDuration > 0) {
            result.push({
                name: '加载',
                start: 0,
                end: loadDuration,
                color: '#3b82f6', // blue
            })
        }

        // 渲染阶段: firstLayoutAt → appearAt
        if (event.firstLayoutAt && event.appearAt && appearDuration > loadDuration) {
            result.push({
                name: '渲染',
                start: loadDuration,
                end: appearDuration,
                color: '#8b5cf6', // purple
            })
        }

        // 交互阶段: appearAt → endAt
        if (event.appearAt && event.endAt && totalDuration > appearDuration) {
            result.push({
                name: '交互',
                start: appearDuration,
                end: totalDuration,
                color: '#10b981', // green
            })
        }

        return result
    }, [event])

    // 添加自定义标记
    const markers = useMemo(() => {
        if (!event.markers || event.markers.length === 0) return []
        return event.markers.map((m) => ({
            name: m.name,
            time: m.elapsed,
        }))
    }, [event.markers])

    // 总时长用于计算比例
    const totalDuration = event.totalDuration || event.appearDuration || event.loadDuration || 1

    return (
        <div className="bg-bg-medium rounded-lg p-4">
            {/* 瀑布条形图 */}
            <div className="relative h-10 mb-3">
                {/* 背景刻度线 */}
                <div className="absolute inset-0 flex">
                    {[0, 25, 50, 75, 100].map((percent) => (
                        <div
                            key={percent}
                            className="absolute top-0 bottom-0 w-px bg-border"
                            style={{ left: `${percent}%` }}
                        />
                    ))}
                </div>

                {/* 阶段条 */}
                <div className="absolute inset-y-2 left-0 right-0">
                    {phases.map((phase, index) => {
                        const leftPercent = (phase.start / totalDuration) * 100
                        const widthPercent = ((phase.end - phase.start) / totalDuration) * 100
                        return (
                            <div
                                key={index}
                                className="absolute h-full rounded flex items-center justify-center overflow-hidden"
                                style={{
                                    left: `${leftPercent}%`,
                                    width: `${Math.max(widthPercent, 1)}%`,
                                    backgroundColor: phase.color,
                                }}
                                title={`${phase.name}: ${formatPageTiming(phase.end - phase.start)}`}
                            >
                                {widthPercent > 15 && (
                                    <span className="text-[10px] text-white font-medium truncate px-1">
                                        {phase.name}
                                    </span>
                                )}
                            </div>
                        )
                    })}

                    {/* 自定义标记 */}
                    {markers.map((marker, index) => {
                        const leftPercent = (marker.time / totalDuration) * 100
                        return (
                            <div
                                key={`marker-${index}`}
                                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400"
                                style={{ left: `${leftPercent}%` }}
                                title={`${marker.name}: +${formatPageTiming(marker.time)}`}
                            >
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-yellow-400" />
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* 刻度标签 */}
            <div className="flex justify-between text-[10px] text-text-muted">
                <span>0ms</span>
                <span>{formatPageTiming(totalDuration * 0.25)}</span>
                <span>{formatPageTiming(totalDuration * 0.5)}</span>
                <span>{formatPageTiming(totalDuration * 0.75)}</span>
                <span>{formatPageTiming(totalDuration)}</span>
            </div>

            {/* 图例 */}
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
                {phases.map((phase) => (
                    <div key={phase.name} className="flex items-center gap-1.5">
                        <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: phase.color }}
                        />
                        <span className="text-[10px] text-text-muted">
                            {phase.name}: {formatPageTiming(phase.end - phase.start)}
                        </span>
                    </div>
                ))}
                {markers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-yellow-400 rotate-45" />
                        <span className="text-[10px] text-text-muted">
                            标记 ({markers.length})
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

// 导出插件实例
export const PerformancePlugin = new PerformancePluginImpl()
