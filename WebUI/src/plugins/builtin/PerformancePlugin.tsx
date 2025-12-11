// 性能监控前端插件
// 实时展示 CPU、内存、FPS 等性能指标

import React, { useEffect, useCallback, useState, useMemo } from 'react'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
} from '../types'
import { PerformanceIcon, CPUIcon, MemoryIcon, FPSIcon, SettingsIcon, AlertIcon } from '@/components/icons'
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
    type PerformanceMetrics,
    type JankEvent,
    type Alert,
    type AlertRule,
    type AlertSeverity,
} from '@/stores/performanceStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { useToastStore } from '@/stores/toastStore'
import clsx from 'clsx'

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
            ['performance_metrics', 'jank_event', 'performance_alert', 'alert_resolved'],
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
    const [activeTab, setActiveTab] = useState<'overview' | 'janks' | 'alerts'>('overview')
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

    // 刷新
    const handleRefresh = useCallback(() => {
        if (deviceId) {
            store.fetchRealtimeMetrics(deviceId)
            store.fetchStatus(deviceId)
            store.fetchJankEvents(deviceId)
        }
    }, [deviceId])

    // 清除数据
    const handleClear = useCallback(async () => {
        if (deviceId) {
            setIsClearing(true)
            try {
                await store.clearMetrics(deviceId)
                toast.show('success', '已清除性能数据')
                setShowClearConfirm(false)
            } finally {
                setIsClearing(false)
            }
        }
    }, [deviceId, toast])

    // 时间范围选项
    const timeRangeOptions = [
        { label: '1 分钟', value: 60 },
        { label: '5 分钟', value: 300 },
        { label: '15 分钟', value: 900 },
    ]

    if (!isActive) {
        return null
    }

    return (
        <div className="flex flex-col h-full">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-bg-medium flex items-center justify-between">
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
                                    ? 'bg-primary text-white'
                                    : 'text-text-secondary hover:text-text-primary'
                            )}
                        >
                            概览
                        </button>
                        <button
                            onClick={() => setActiveTab('janks')}
                            className={clsx(
                                'px-3 py-1.5 text-xs rounded-md transition-colors',
                                activeTab === 'janks'
                                    ? 'bg-primary text-white'
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
                                    ? 'bg-primary text-white'
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
                                ? 'bg-green-500/20 text-green-400'
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

                    <div className="h-5 w-px bg-border flex-shrink-0" />

                    {/* 清除数据 */}
                    <button
                        onClick={() => setShowClearConfirm(true)}
                        className="btn text-xs px-2.5 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                        title="清除数据"
                    >
                        清除数据
                    </button>

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
                ) : (
                    <AlertsContent
                        deviceId={deviceId}
                        alerts={store.alerts}
                        alertRules={store.alertRules}
                        alertConfig={store.alertConfig}
                        isLoading={store.isLoadingAlerts}
                        onResolve={(alertId) => store.resolveAlert(deviceId, alertId)}
                        onRefresh={() => store.fetchAlerts(deviceId)}
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

// 概览内容
function OverviewContent({
    metrics,
    lastMetrics,
    isLoading,
}: {
    metrics: PerformanceMetrics[]
    lastMetrics: PerformanceMetrics | null
    isLoading: boolean
}) {
    // 最新指标
    const latest = lastMetrics ?? metrics[metrics.length - 1]

    // 计算统计数据
    const stats = useMemo(() => {
        if (metrics.length === 0) return null

        const cpuUsages = metrics.map((m) => m.cpu?.usage ?? 0).filter((v) => v > 0)
        const memoryUsed = metrics.map((m) => m.memory?.usedMemory ?? 0).filter((v) => v > 0)
        const fpsValues = metrics.map((m) => m.fps?.fps ?? 0).filter((v) => v > 0)

        return {
            avgCPU: cpuUsages.length > 0 ? cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length : 0,
            maxCPU: Math.max(...cpuUsages, 0),
            avgMemory: memoryUsed.length > 0 ? memoryUsed.reduce((a, b) => a + b, 0) / memoryUsed.length : 0,
            maxMemory: Math.max(...memoryUsed, 0),
            avgFPS: fpsValues.length > 0 ? fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length : 0,
            minFPS: fpsValues.length > 0 ? Math.min(...fpsValues) : 0,
            totalDropped: metrics.reduce((sum, m) => sum + (m.fps?.droppedFrames ?? 0), 0),
            totalJanks: metrics.reduce((sum, m) => sum + (m.fps?.jankCount ?? 0), 0),
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
            {/* 指标卡片 */}
            <div className="grid grid-cols-4 gap-4">
                {/* CPU */}
                <MetricCard
                    icon={<CPUIcon size={20} />}
                    title="CPU"
                    value={latest.cpu?.usage?.toFixed(1) ?? '--'}
                    unit="%"
                    colorClass={getCPUUsageColor(latest.cpu?.usage ?? 0)}
                    subtitle={`线程: ${latest.cpu?.threadCount ?? '--'}`}
                />

                {/* 内存 */}
                <MetricCard
                    icon={<MemoryIcon size={20} />}
                    title="内存"
                    value={latest.memory ? formatBytes(latest.memory.usedMemory) : '--'}
                    colorClass={getMemoryPressureColor(latest.memory?.memoryPressure ?? 'low')}
                    subtitle={`峰值: ${latest.memory ? formatBytes(latest.memory.peakMemory) : '--'}`}
                />

                {/* FPS */}
                <MetricCard
                    icon={<FPSIcon size={20} />}
                    title="FPS"
                    value={latest.fps?.fps?.toFixed(0) ?? '--'}
                    colorClass={getFPSColor(latest.fps?.fps ?? 60)}
                    subtitle={`丢帧: ${latest.fps?.droppedFrames ?? 0}`}
                />

                {/* 内存压力 */}
                <MetricCard
                    icon={<MemoryIcon size={20} />}
                    title="内存压力"
                    value={latest.memory?.memoryPressure ?? '--'}
                    colorClass={getMemoryPressureColor(latest.memory?.memoryPressure ?? 'low')}
                    subtitle={`占用: ${((latest.memory?.footprintRatio ?? 0) * 100).toFixed(1)}%`}
                />
            </div>

            {/* 统计信息 */}
            {stats && (
                <div className="bg-zinc-800/50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-zinc-300 mb-3">统计概览</h3>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                        <div>
                            <div className="text-zinc-500">平均 CPU</div>
                            <div className={getCPUUsageColor(stats.avgCPU)}>{stats.avgCPU.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">最高 CPU</div>
                            <div className={getCPUUsageColor(stats.maxCPU)}>{stats.maxCPU.toFixed(1)}%</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">平均内存</div>
                            <div className="text-zinc-300">{formatBytes(stats.avgMemory)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">峰值内存</div>
                            <div className="text-zinc-300">{formatBytes(stats.maxMemory)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">平均 FPS</div>
                            <div className={getFPSColor(stats.avgFPS)}>{stats.avgFPS.toFixed(1)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">最低 FPS</div>
                            <div className={getFPSColor(stats.minFPS)}>{stats.minFPS.toFixed(1)}</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">总丢帧</div>
                            <div className="text-orange-400">{stats.totalDropped}</div>
                        </div>
                        <div>
                            <div className="text-zinc-500">卡顿次数</div>
                            <div className="text-red-400">{stats.totalJanks}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 简易图表 - 使用 ASCII 风格的迷你图 */}
            <div className="bg-zinc-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">趋势</h3>
                <div className="space-y-3">
                    <MiniChart
                        label="CPU"
                        data={metrics.map((m) => m.cpu?.usage ?? 0)}
                        maxValue={100}
                        color="text-blue-400"
                    />
                    <MiniChart
                        label="FPS"
                        data={metrics.map((m) => m.fps?.fps ?? 60)}
                        maxValue={60}
                        color="text-green-400"
                    />
                </div>
            </div>
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
}: {
    icon: React.ReactNode
    title: string
    value: string
    unit?: string
    colorClass: string
    subtitle?: string
}) {
    return (
        <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-zinc-400">{icon}</span>
                <span className="text-xs text-zinc-500">{title}</span>
            </div>
            <div className={clsx('text-2xl font-semibold', colorClass)}>
                {value}
                {unit && <span className="text-sm ml-1">{unit}</span>}
            </div>
            {subtitle && <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>}
        </div>
    )
}

// 迷你图表
function MiniChart({
    label,
    data,
    maxValue,
    color,
}: {
    label: string
    data: number[]
    maxValue: number
    color: string
}) {
    const bars = useMemo(() => {
        // 取最近 60 个数据点
        const recent = data.slice(-60)
        if (recent.length === 0) return []

        return recent.map((value) => ({
            height: Math.max(1, (value / maxValue) * 100),
            value,
        }))
    }, [data, maxValue])

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-10">{label}</span>
            <div className="flex-1 h-6 bg-zinc-900 rounded overflow-hidden flex items-end gap-px">
                {bars.map((bar, i) => (
                    <div
                        key={i}
                        className={clsx('flex-1 min-w-px', color.replace('text-', 'bg-'))}
                        style={{ height: `${bar.height}%` }}
                        title={`${bar.value.toFixed(1)}`}
                    />
                ))}
            </div>
            <span className={clsx('text-xs w-12 text-right', color)}>
                {data.length > 0 ? data[data.length - 1].toFixed(1) : '--'}
            </span>
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

    if (isLoading && events.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-zinc-500">
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

    return (
        <div className="flex flex-col h-full">
            {/* 列表 */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-800 sticky top-0">
                        <tr>
                            <th className="px-3 py-2 text-left text-zinc-400 font-medium">时间</th>
                            <th className="px-3 py-2 text-left text-zinc-400 font-medium">持续时间</th>
                            <th className="px-3 py-2 text-left text-zinc-400 font-medium">丢帧数</th>
                            <th className="px-3 py-2 text-left text-zinc-400 font-medium">调用栈</th>
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => (
                            <tr key={event.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                                <td className="px-3 py-2 text-zinc-300">
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                </td>
                                <td className="px-3 py-2">
                                    <span
                                        className={clsx(
                                            'px-2 py-0.5 rounded text-xs',
                                            event.duration > 500
                                                ? 'bg-red-900/50 text-red-400'
                                                : event.duration > 200
                                                    ? 'bg-orange-900/50 text-orange-400'
                                                    : 'bg-yellow-900/50 text-yellow-400'
                                        )}
                                    >
                                        {formatDuration(event.duration)}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-zinc-300">{event.droppedFrames}</td>
                                <td className="px-3 py-2 text-zinc-500 truncate max-w-xs">
                                    {event.stackTrace ?? '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-700">
                    <span className="text-xs text-zinc-500">
                        共 {total} 条
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(page - 1)}
                            disabled={page <= 1}
                            className="px-2 py-1 text-xs rounded bg-zinc-700 text-zinc-300 disabled:opacity-50"
                        >
                            上一页
                        </button>
                        <span className="text-xs text-zinc-400 px-2">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => onPageChange(page + 1)}
                            disabled={page >= totalPages}
                            className="px-2 py-1 text-xs rounded bg-zinc-700 text-zinc-300 disabled:opacity-50"
                        >
                            下一页
                        </button>
                    </div>
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
    onRefresh,
}: {
    deviceId: string
    alerts: Alert[]
    alertRules: AlertRule[]
    alertConfig: { cooldownSeconds: number; isEnabled: boolean }
    isLoading: boolean
    onResolve: (alertId: string) => void
    onRefresh: () => void
}) {
    const [showRules, setShowRules] = useState(false)
    const [includeResolved, setIncludeResolved] = useState(false)
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
                        <button
                            onClick={onRefresh}
                            disabled={isLoading}
                            className="btn btn-secondary text-xs px-2 py-1 disabled:opacity-50"
                        >
                            刷新
                        </button>
                    </div>
                </div>
            </div>

            {/* 告警规则面板 */}
            {showRules && (
                <div className="flex-shrink-0 px-4 pb-3">
                    <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
                        <h4 className="text-sm font-medium text-zinc-300 mb-2">告警规则</h4>
                        <div className="space-y-2">
                            {alertRules.length === 0 ? (
                                <p className="text-xs text-zinc-500">暂无告警规则</p>
                            ) : (
                                alertRules.map((rule) => (
                                    <div
                                        key={rule.id}
                                        className={clsx(
                                            'flex items-center justify-between px-2 py-1.5 rounded text-xs',
                                            rule.isEnabled ? 'bg-zinc-700/50' : 'bg-zinc-800/50 opacity-50'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={getSeverityColor(rule.severity)}>
                                                {rule.severity === 'critical' ? '🔴' : rule.severity === 'warning' ? '🟡' : '🔵'}
                                            </span>
                                            <span className="text-zinc-300">{getMetricTypeLabel(rule.metricType)}</span>
                                            <span className="text-zinc-500">
                                                {getConditionLabel(rule.condition)} {rule.threshold}
                                                {rule.metricType === 'memory' || rule.metricType === 'cpu' ? '%' : ''}
                                            </span>
                                            {rule.durationSeconds > 0 && (
                                                <span className="text-zinc-500">持续 {rule.durationSeconds}s</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() =>
                                                store.updateAlertRule(deviceId, rule.id, { isEnabled: !rule.isEnabled })
                                            }
                                            className={clsx(
                                                'px-1.5 py-0.5 rounded text-xs',
                                                rule.isEnabled
                                                    ? 'bg-green-900/50 text-green-400'
                                                    : 'bg-zinc-600 text-zinc-400'
                                            )}
                                        >
                                            {rule.isEnabled ? '启用' : '禁用'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
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
                                    ? 'bg-zinc-800/30 border-zinc-700/50 opacity-60'
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
                                        <span className="text-xs text-zinc-400">{getMetricTypeLabel(alert.metricType)}</span>
                                        <span className="text-xs text-zinc-500">{formatTimestamp(alert.timestamp)}</span>
                                        {alert.isResolved && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">
                                                已解决
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-zinc-200">{alert.message}</p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
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
                <div className="p-6 space-y-4">
                    {/* 采样间隔 */}
                    <div className="flex items-center justify-between">
                        <label className="text-sm text-text-secondary">采样间隔</label>
                        <select
                            value={localConfig.sampleInterval}
                            onChange={(e) =>
                                setLocalConfig({ ...localConfig, sampleInterval: Number(e.target.value) })
                            }
                            className="select"
                        >
                            <option value={0.5}>0.5 秒</option>
                            <option value={1}>1 秒</option>
                            <option value={2}>2 秒</option>
                            <option value={5}>5 秒</option>
                        </select>
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

// 导出插件实例
export const PerformancePlugin = new PerformancePluginImpl()
