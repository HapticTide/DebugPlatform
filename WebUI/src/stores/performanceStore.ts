import { create } from 'zustand'
import * as api from '@/services/api'

// MARK: - Debounce Utility

// 防抖计时器引用
let summaryFetchTimer: ReturnType<typeof setTimeout> | null = null

// 防抖刷新 Summary（500ms 防抖，避免频繁请求）
function debouncedFetchSummary(deviceId: string, fetchFn: (deviceId: string) => Promise<void>) {
    if (summaryFetchTimer) {
        clearTimeout(summaryFetchTimer)
    }
    summaryFetchTimer = setTimeout(() => {
        fetchFn(deviceId)
        summaryFetchTimer = null
    }, 500)
}

// MARK: - Types

export interface CPUMetrics {
    usage: number // 0.0 - 100.0
    userTime: number
    systemTime: number
    threadCount: number
}

export interface MemoryMetrics {
    usedMemory: number // bytes
    peakMemory: number
    freeMemory: number
    memoryPressure: 'low' | 'medium' | 'high' | 'critical'
    footprintRatio: number // 0.0 - 1.0
}

export interface FPSMetrics {
    fps: number
    droppedFrames: number
    jankCount: number
    averageRenderTime: number // ms
}

export interface NetworkTrafficMetrics {
    bytesReceived: number
    bytesSent: number
    downloadRate: number // bytes/s
    uploadRate: number // bytes/s
}

export interface DiskIOMetrics {
    readBytes: number
    writeBytes: number
    readRate: number // bytes/s
    writeRate: number // bytes/s
}

// App 启动时间指标（分阶段记录）
export interface AppLaunchMetrics {
    totalTime: number              // 总启动时间（毫秒）
    preMainTime?: number           // PreMain 阶段耗时（毫秒）
    mainToLaunchTime?: number      // Main 到 Launch 阶段耗时（毫秒）
    launchToFirstFrameTime?: number // Launch 到首帧阶段耗时（毫秒）
    timestamp: string              // 记录时间（ISO 字符串）
}

// App 启动历史记录项
export interface AppLaunchHistoryItem {
    id: string
    totalTime: number
    preMainTime?: number
    mainToLaunchTime?: number
    launchToFirstFrameTime?: number
    timestamp: string // ISO 时间字符串
}

// App 启动统计指标
export interface AppLaunchStats {
    count: number        // 总启动次数
    avgTotalTime: number // 平均总耗时
    minTotalTime: number // 最小总耗时
    maxTotalTime: number // 最大总耗时
    p50TotalTime: number // P50 耗时
    p90TotalTime: number // P90 耗时
    p95TotalTime: number // P95 耗时
    avgPreMainTime?: number // 平均 pre-main 耗时
    avgMainToLaunchTime?: number // 平均 main-to-launch 耗时
    avgLaunchToFirstFrameTime?: number // 平均 launch-to-first-frame 耗时
}

// App 启动完整响应
export interface AppLaunchResponse {
    deviceId: string
    launchMetrics: AppLaunchMetrics | null // 最新一次启动
    history: AppLaunchHistoryItem[] // 历史启动记录
    stats: AppLaunchStats | null // 统计指标
}

export interface PerformanceMetrics {
    timestamp: string
    cpu?: CPUMetrics
    memory?: MemoryMetrics
    fps?: FPSMetrics
    network?: NetworkTrafficMetrics
    diskIO?: DiskIOMetrics
}

export interface JankEvent {
    id: string
    timestamp: string
    duration: number // ms
    droppedFrames: number
    stackTrace?: string
}

// MARK: - Page Timing Types

// 页面耗时 Marker
export interface PageTimingMarker {
    name: string
    timestamp: string
    elapsed: number // 从 startAt 到此时间的毫秒数
}

// 页面耗时事件
export interface PageTimingEvent {
    id: string
    deviceId: string
    visitId: string              // 唯一访问 ID
    pageId: string               // 页面标识（如 VC 类名）
    pageName: string             // 人类可读的页面名称
    route?: string               // 路由路径（如有）
    startAt: string              // 页面开始加载时间（ISO 字符串）
    firstLayoutAt?: string       // 首次布局时间
    appearAt?: string            // 页面完全可见时间
    endAt?: string               // 页面离开时间
    loadDuration?: number        // startAt -> firstLayoutAt（毫秒）
    appearDuration?: number      // startAt -> appearAt（毫秒）
    totalDuration?: number       // startAt -> endAt（毫秒）
    markers: PageTimingMarker[]  // 自定义标记点
    appVersion?: string
    appBuild?: string
    osVersion?: string
    deviceModel?: string
    isColdStart?: boolean        // 是否冷启动首页
    isPush?: boolean             // 是否来自 Push 导航
    parentPageId?: string        // 来源页面 ID
    seqNum: number               // 序列号
}

// 页面耗时列表响应
export interface PageTimingListResponse {
    items: PageTimingEvent[]
    total: number
    page: number
    pageSize: number
}

// 页面耗时聚合统计
export interface PageTimingSummary {
    pageId: string
    pageName: string
    count: number                  // 访问次数
    avgAppearDuration?: number     // 平均页面可见耗时
    avgLoadDuration?: number       // 平均加载耗时
    p50AppearDuration?: number     // P50 耗时
    p90AppearDuration?: number     // P90 耗时
    p95AppearDuration?: number     // P95 耗时
    maxAppearDuration?: number     // 最大耗时
    minAppearDuration?: number     // 最小耗时
    errorRate?: number             // 页面未正常结束的比例
}

// 页面耗时聚合统计列表响应
export interface PageTimingSummaryListResponse {
    items: PageTimingSummary[]
    totalPages: number
}

// MARK: - Alert Types

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertMetricType = 'cpu' | 'memory' | 'fps' | 'jank'
export type AlertCondition = 'gt' | 'lt' | 'gte' | 'lte'

export interface AlertRule {
    id: string
    metricType: AlertMetricType
    threshold: number
    condition: AlertCondition
    durationSeconds: number
    severity: AlertSeverity
    isEnabled: boolean
}

export interface Alert {
    id: string
    ruleId: string
    metricType: AlertMetricType
    severity: AlertSeverity
    message: string
    currentValue: number
    threshold: number
    timestamp: string
    isResolved: boolean
    resolvedAt?: string
}

export interface AlertConfig {
    rules: AlertRule[]
    cooldownSeconds: number
    isEnabled: boolean
}

// MARK: - API Responses

interface PerformanceRealtimeResponse {
    metrics: PerformanceMetrics[]
    deviceId: string
    rangeSeconds: number
}

interface PerformanceHistoryResponse {
    metrics: PerformanceMetrics[]
    deviceId: string
    startTime?: string
    endTime: string
    intervalSeconds: number
}

interface JankEventListResponse {
    items: JankEvent[]
    total: number
    page: number
    pageSize: number
}

interface PerformanceStatusResponse {
    deviceId: string
    isMonitoring: boolean
    lastMetrics?: PerformanceMetrics
    recentJankCount: number
}

interface PerformanceConfigInput {
    sampleInterval?: number
    monitorFPS?: boolean
    monitorCPU?: boolean
    monitorMemory?: boolean
}

interface AlertListResponse {
    items: Alert[]
    total: number
    page: number
    pageSize: number
    activeCount: number
}

interface AlertConfigResponse {
    rules: AlertRule[]
    cooldownSeconds: number
    isEnabled: boolean
}

interface AlertRuleInput {
    id?: string
    metricType: AlertMetricType
    threshold: number
    condition: AlertCondition
    durationSeconds?: number
    severity?: AlertSeverity
    isEnabled?: boolean
}

// MARK: - Trends Types

export type TrendDirection = 'improving' | 'stable' | 'degrading'

export interface MetricTrend {
    metricName: string
    trend: TrendDirection
    firstHalfAverage: number
    secondHalfAverage: number
    changePercent: number
    minValue: number
    maxValue: number
}

export interface PerformanceTrends {
    deviceId: string
    analysisMinutes: number
    dataPoints: number
    cpu?: MetricTrend
    memory?: MetricTrend
    fps?: MetricTrend
    overall: TrendDirection
    recommendations: string[]
}

// MARK: - Page Timing Query Params (用于 Store Action 类型定义)

export interface PageTimingQueryParams {
    page?: number
    pageSize?: number
    pageId?: string
    pageName?: string
    route?: string
    from?: Date
    to?: Date
    minDuration?: number
}

// MARK: - Store State

interface PerformanceState {
    // 实时数据
    realtimeMetrics: PerformanceMetrics[]
    isLoading: boolean
    error: string | null

    // 卡顿事件
    jankEvents: JankEvent[]
    jankTotal: number
    jankPage: number
    jankPageSize: number
    isLoadingJanks: boolean

    // 监控状态
    isMonitoring: boolean
    lastMetrics: PerformanceMetrics | null
    recentJankCount: number

    // App 启动时间
    appLaunchMetrics: AppLaunchMetrics | null
    appLaunchHistory: AppLaunchHistoryItem[]
    appLaunchStats: AppLaunchStats | null
    isLoadingAppLaunch: boolean

    // 趋势分析
    trends: PerformanceTrends | null
    isLoadingTrends: boolean

    // 配置
    config: {
        sampleInterval: number
        monitorFPS: boolean
        monitorCPU: boolean
        monitorMemory: boolean
        monitorNetwork: boolean
        monitorDiskIO: boolean
        smartSamplingEnabled: boolean
    }

    // 告警
    alerts: Alert[]
    alertRules: AlertRule[]
    alertConfig: {
        cooldownSeconds: number
        isEnabled: boolean
    }
    isLoadingAlerts: boolean
    activeAlertCount: number

    // 显示设置
    timeRange: number // 显示多少秒的数据

    // 页面耗时
    pageTimingEvents: PageTimingEvent[]
    pageTimingTotal: number
    pageTimingPage: number
    pageTimingPageSize: number
    pageTimingSummary: PageTimingSummary[]
    isLoadingPageTiming: boolean
    isLoadingPageTimingSummary: boolean
    selectedPageTimingEvent: PageTimingEvent | null

    // Actions
    fetchRealtimeMetrics: (deviceId: string) => Promise<void>
    fetchHistoryMetrics: (deviceId: string, startTime?: Date, endTime?: Date, interval?: number) => Promise<void>
    fetchTrends: (deviceId: string, minutes?: number) => Promise<void>
    fetchJankEvents: (deviceId: string, page?: number, minDuration?: number) => Promise<void>
    fetchStatus: (deviceId: string) => Promise<void>
    updateConfig: (deviceId: string, config: PerformanceConfigInput) => Promise<void>
    clearMetrics: (deviceId: string) => Promise<void>
    fetchAppLaunchData: (deviceId: string) => Promise<void>

    // Alert Actions
    fetchAlerts: (deviceId: string, includeResolved?: boolean) => Promise<void>
    fetchAlertConfig: (deviceId: string) => Promise<void>
    updateAlertConfig: (deviceId: string, config: Partial<AlertConfig>) => Promise<void>
    addAlertRule: (deviceId: string, rule: AlertRuleInput) => Promise<void>
    updateAlertRule: (deviceId: string, ruleId: string, rule: Partial<AlertRuleInput>) => Promise<void>
    deleteAlertRule: (deviceId: string, ruleId: string) => Promise<void>
    resolveAlert: (deviceId: string, alertId: string) => Promise<void>

    // Page Timing Actions
    fetchPageTimingEvents: (deviceId: string, params?: PageTimingQueryParams) => Promise<void>
    fetchPageTimingSummary: (deviceId: string, from?: Date, to?: Date, pageName?: string) => Promise<void>
    fetchPageTimingEvent: (deviceId: string, eventId: string) => Promise<void>
    clearPageTimingEvents: (deviceId: string) => Promise<void>
    setSelectedPageTimingEvent: (event: PageTimingEvent | null) => void
    addPageTimingEvent: (event: PageTimingEvent) => void

    // Realtime updates
    addRealtimeMetrics: (metrics: PerformanceMetrics[]) => void
    addJankEvent: (event: JankEvent) => void
    addAlert: (alert: Alert) => void
    updateAlert: (alert: Alert) => void
    handleRealtimeEvent: (event: import('@/types').PerformanceEventData, deviceId?: string) => void

    // UI
    setTimeRange: (seconds: number) => void
    clearData: () => void
}

// MARK: - API Functions

const API_BASE = '/api'

async function getRealtimeMetrics(deviceId: string, seconds: number = 60): Promise<PerformanceRealtimeResponse> {
    return api.api.get<PerformanceRealtimeResponse>(`${API_BASE}/devices/${deviceId}/performance/realtime?seconds=${seconds}`)
}

async function getHistoryMetrics(
    deviceId: string,
    startTime?: Date,
    endTime?: Date,
    interval: number = 60
): Promise<PerformanceHistoryResponse> {
    const params = new URLSearchParams()
    if (startTime) params.set('startTime', startTime.toISOString())
    if (endTime) params.set('endTime', endTime.toISOString())
    params.set('interval', interval.toString())

    return api.api.get<PerformanceHistoryResponse>(`${API_BASE}/devices/${deviceId}/performance/history?${params}`)
}

async function getTrends(deviceId: string, minutes: number = 60): Promise<PerformanceTrends> {
    return api.api.get<PerformanceTrends>(`${API_BASE}/devices/${deviceId}/performance/trends?minutes=${minutes}`)
}

async function getJankEvents(
    deviceId: string,
    page: number = 1,
    pageSize: number = 50,
    minDuration?: number
): Promise<JankEventListResponse> {
    const params = new URLSearchParams()
    params.set('page', page.toString())
    params.set('pageSize', pageSize.toString())
    if (minDuration) params.set('minDuration', minDuration.toString())

    return api.api.get<JankEventListResponse>(`${API_BASE}/devices/${deviceId}/performance/janks?${params}`)
}

async function getStatus(deviceId: string): Promise<PerformanceStatusResponse> {
    return api.api.get<PerformanceStatusResponse>(`${API_BASE}/devices/${deviceId}/performance/status`)
}

async function postConfig(deviceId: string, config: PerformanceConfigInput): Promise<{ success: boolean; message: string }> {
    return api.api.post(`${API_BASE}/devices/${deviceId}/performance/config`, config)
}

async function deleteMetrics(deviceId: string): Promise<{ deletedMetrics: number; deletedJanks: number }> {
    return api.api.delete(`${API_BASE}/devices/${deviceId}/performance`)
}

// Alert API functions
async function getAlerts(deviceId: string, includeResolved: boolean = false): Promise<AlertListResponse> {
    return api.api.get<AlertListResponse>(
        `${API_BASE}/devices/${deviceId}/performance/alerts?includeResolved=${includeResolved}`
    )
}

async function getAlertConfig(deviceId: string): Promise<AlertConfigResponse> {
    return api.api.get<AlertConfigResponse>(`${API_BASE}/devices/${deviceId}/performance/alerts/config`)
}

async function postAlertConfig(
    deviceId: string,
    config: Partial<AlertConfig>
): Promise<{ success: boolean; message: string }> {
    return api.api.post(`${API_BASE}/devices/${deviceId}/performance/alerts/config`, config)
}

async function postAlertRule(deviceId: string, rule: AlertRuleInput): Promise<{ success: boolean; message: string }> {
    return api.api.post(`${API_BASE}/devices/${deviceId}/performance/alerts/rules`, rule)
}

async function patchAlertRule(
    deviceId: string,
    ruleId: string,
    rule: Partial<AlertRuleInput>
): Promise<{ success: boolean; message: string }> {
    // 使用 PUT 代替 PATCH
    return api.api.put(`${API_BASE}/devices/${deviceId}/performance/alerts/rules/${ruleId}`, rule)
}

async function deleteAlertRule(deviceId: string, ruleId: string): Promise<{ success: boolean; message: string }> {
    return api.api.delete(`${API_BASE}/devices/${deviceId}/performance/alerts/rules/${ruleId}`)
}

async function postResolveAlert(deviceId: string, alertId: string): Promise<{ success: boolean; message: string }> {
    return api.api.post(`${API_BASE}/devices/${deviceId}/performance/alerts/${alertId}/resolve`, {})
}

// App 启动数据 API
async function getAppLaunchData(deviceId: string): Promise<AppLaunchResponse> {
    return api.api.get<AppLaunchResponse>(`${API_BASE}/devices/${deviceId}/performance/launch`)
}

// MARK: - Page Timing API Functions

async function getPageTimingEvents(
    deviceId: string,
    params: PageTimingQueryParams = {}
): Promise<PageTimingListResponse> {
    const query = new URLSearchParams()
    if (params.page) query.set('page', params.page.toString())
    if (params.pageSize) query.set('pageSize', params.pageSize.toString())
    if (params.pageId) query.set('pageId', params.pageId)
    if (params.pageName) query.set('pageName', params.pageName)
    if (params.route) query.set('route', params.route)
    if (params.from) query.set('from', params.from.toISOString())
    if (params.to) query.set('to', params.to.toISOString())
    if (params.minDuration) query.set('minDuration', params.minDuration.toString())

    const queryString = query.toString()
    const url = `${API_BASE}/devices/${deviceId}/performance/page-timings${queryString ? '?' + queryString : ''}`
    return api.api.get<PageTimingListResponse>(url)
}

async function getPageTimingSummary(
    deviceId: string,
    from?: Date,
    to?: Date,
    pageName?: string
): Promise<PageTimingSummaryListResponse> {
    const query = new URLSearchParams()
    if (from) query.set('from', from.toISOString())
    if (to) query.set('to', to.toISOString())
    if (pageName) query.set('pageName', pageName)

    const queryString = query.toString()
    const url = `${API_BASE}/devices/${deviceId}/performance/page-timings/summary${queryString ? '?' + queryString : ''}`
    return api.api.get<PageTimingSummaryListResponse>(url)
}

async function getPageTimingEvent(deviceId: string, eventId: string): Promise<PageTimingEvent> {
    return api.api.get<PageTimingEvent>(`${API_BASE}/devices/${deviceId}/performance/page-timings/${eventId}`)
}

async function deletePageTimingEvents(deviceId: string): Promise<void> {
    await api.api.delete(`${API_BASE}/devices/${deviceId}/performance/page-timings`)
}

// MARK: - Store

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
    // Initial state
    realtimeMetrics: [],
    isLoading: false,
    error: null,

    jankEvents: [],
    jankTotal: 0,
    jankPage: 1,
    jankPageSize: 50,
    isLoadingJanks: false,

    isMonitoring: false,
    lastMetrics: null,
    recentJankCount: 0,

    appLaunchMetrics: null,
    appLaunchHistory: [],
    appLaunchStats: null,
    isLoadingAppLaunch: false,

    trends: null,
    isLoadingTrends: false,

    config: {
        sampleInterval: 1.0,
        monitorFPS: true,
        monitorCPU: true,
        monitorMemory: true,
        monitorNetwork: true,
        monitorDiskIO: true,
        smartSamplingEnabled: true,
    },

    alerts: [],
    alertRules: [],
    alertConfig: {
        cooldownSeconds: 60,
        isEnabled: true,
    },
    isLoadingAlerts: false,
    activeAlertCount: 0,

    timeRange: 60,

    // 页面耗时
    pageTimingEvents: [],
    pageTimingTotal: 0,
    pageTimingPage: 1,
    pageTimingPageSize: 50,
    pageTimingSummary: [],
    isLoadingPageTiming: false,
    isLoadingPageTimingSummary: false,
    selectedPageTimingEvent: null,

    // Actions
    fetchRealtimeMetrics: async (deviceId: string) => {
        set({ isLoading: true, error: null })
        try {
            const response = await getRealtimeMetrics(deviceId, get().timeRange)
            set({ realtimeMetrics: response.metrics, isLoading: false })
        } catch (error) {
            set({ error: String(error), isLoading: false })
        }
    },

    fetchHistoryMetrics: async (deviceId: string, startTime?: Date, endTime?: Date, interval?: number) => {
        set({ isLoading: true, error: null })
        try {
            const response = await getHistoryMetrics(deviceId, startTime, endTime, interval)
            set({ realtimeMetrics: response.metrics, isLoading: false })
        } catch (error) {
            set({ error: String(error), isLoading: false })
        }
    },

    fetchTrends: async (deviceId: string, minutes: number = 60) => {
        set({ isLoadingTrends: true })
        try {
            const response = await getTrends(deviceId, minutes)
            set({ trends: response, isLoadingTrends: false })
        } catch (error) {
            console.error('Failed to fetch trends:', error)
            set({ isLoadingTrends: false })
        }
    },

    fetchJankEvents: async (deviceId: string, page: number = 1, minDuration?: number) => {
        set({ isLoadingJanks: true })
        try {
            const response = await getJankEvents(deviceId, page, get().jankPageSize, minDuration)
            set({
                jankEvents: response.items,
                jankTotal: response.total,
                jankPage: response.page,
                isLoadingJanks: false,
            })
        } catch (error) {
            set({ isLoadingJanks: false })
        }
    },

    fetchStatus: async (deviceId: string) => {
        try {
            const response = await getStatus(deviceId)
            set({
                isMonitoring: response.isMonitoring,
                lastMetrics: response.lastMetrics ?? null,
                recentJankCount: response.recentJankCount,
            })
        } catch (error) {
            console.error('Failed to fetch performance status:', error)
        }
    },

    updateConfig: async (deviceId: string, config: PerformanceConfigInput) => {
        try {
            await postConfig(deviceId, config)
            set((state) => ({
                config: { ...state.config, ...config },
            }))
        } catch (error) {
            console.error('Failed to update config:', error)
        }
    },

    clearMetrics: async (deviceId: string) => {
        try {
            await deleteMetrics(deviceId)
            set({
                realtimeMetrics: [],
                jankEvents: [],
                jankTotal: 0,
                // 同时清除 App Launch 相关状态
                appLaunchMetrics: null,
                appLaunchHistory: [],
                appLaunchStats: null,
                // 同时清除告警相关状态
                alerts: [],
                activeAlertCount: 0,
            })
        } catch (error) {
            console.error('Failed to clear metrics:', error)
        }
    },

    fetchAppLaunchData: async (deviceId: string) => {
        set({ isLoadingAppLaunch: true })
        try {
            const response = await getAppLaunchData(deviceId)
            set({
                appLaunchMetrics: response.launchMetrics ? {
                    totalTime: response.launchMetrics.totalTime,
                    preMainTime: response.launchMetrics.preMainTime,
                    mainToLaunchTime: response.launchMetrics.mainToLaunchTime,
                    launchToFirstFrameTime: response.launchMetrics.launchToFirstFrameTime,
                    timestamp: response.launchMetrics.timestamp,
                } : null,
                appLaunchHistory: response.history,
                appLaunchStats: response.stats,
                isLoadingAppLaunch: false,
            })
        } catch (error) {
            console.error('Failed to fetch app launch data:', error)
            set({ isLoadingAppLaunch: false })
        }
    },

    // Realtime updates
    addRealtimeMetrics: (metrics: PerformanceMetrics[]) => {
        set((state) => {
            const combined = [...state.realtimeMetrics, ...metrics]
            // 保持最近 timeRange 秒的数据
            const cutoff = new Date(Date.now() - state.timeRange * 1000)
            const filtered = combined.filter((m) => new Date(m.timestamp) >= cutoff)
            return {
                realtimeMetrics: filtered,
                lastMetrics: metrics[metrics.length - 1] ?? state.lastMetrics,
            }
        })
    },

    addJankEvent: (event: JankEvent) => {
        set((state) => {
            // 根据 ID 去重，避免重复添加
            const exists = state.jankEvents.some(e => e.id === event.id)
            if (exists) {
                return state
            }
            return {
                jankEvents: [event, ...state.jankEvents].slice(0, 100), // 最多保留 100 条
                jankTotal: state.jankTotal + 1,
                recentJankCount: state.recentJankCount + 1,
            }
        })
    },

    // Alert Actions
    fetchAlerts: async (deviceId: string, includeResolved: boolean = false) => {
        set({ isLoadingAlerts: true })
        try {
            const response = await getAlerts(deviceId, includeResolved)
            set({
                alerts: response.items,
                activeAlertCount: response.activeCount,
                isLoadingAlerts: false,
            })
        } catch (error) {
            console.error('Failed to fetch alerts:', error)
            set({ isLoadingAlerts: false })
        }
    },

    fetchAlertConfig: async (deviceId: string) => {
        try {
            const response = await getAlertConfig(deviceId)
            set({
                alertRules: response.rules,
                alertConfig: {
                    cooldownSeconds: response.cooldownSeconds,
                    isEnabled: response.isEnabled,
                },
            })
        } catch (error) {
            console.error('Failed to fetch alert config:', error)
        }
    },

    updateAlertConfig: async (deviceId: string, config: Partial<AlertConfig>) => {
        try {
            await postAlertConfig(deviceId, config)
            set((state) => ({
                alertConfig: { ...state.alertConfig, ...config },
                alertRules: config.rules ?? state.alertRules,
            }))
        } catch (error) {
            console.error('Failed to update alert config:', error)
        }
    },

    addAlertRule: async (deviceId: string, rule: AlertRuleInput) => {
        try {
            await postAlertRule(deviceId, rule)
            // 刷新配置
            get().fetchAlertConfig(deviceId)
        } catch (error) {
            console.error('Failed to add alert rule:', error)
        }
    },

    updateAlertRule: async (deviceId: string, ruleId: string, rule: Partial<AlertRuleInput>) => {
        try {
            await patchAlertRule(deviceId, ruleId, rule)
            set((state) => ({
                alertRules: state.alertRules.map((r) => (r.id === ruleId ? { ...r, ...rule } : r)),
            }))
        } catch (error) {
            console.error('Failed to update alert rule:', error)
        }
    },

    deleteAlertRule: async (deviceId: string, ruleId: string) => {
        try {
            await deleteAlertRule(deviceId, ruleId)
            set((state) => ({
                alertRules: state.alertRules.filter((r) => r.id !== ruleId),
            }))
        } catch (error) {
            console.error('Failed to delete alert rule:', error)
        }
    },

    resolveAlert: async (deviceId: string, alertId: string) => {
        try {
            await postResolveAlert(deviceId, alertId)
            set((state) => ({
                alerts: state.alerts.map((a) =>
                    a.id === alertId ? { ...a, isResolved: true, resolvedAt: new Date().toISOString() } : a
                ),
                activeAlertCount: Math.max(0, state.activeAlertCount - 1),
            }))
        } catch (error) {
            console.error('Failed to resolve alert:', error)
        }
    },

    addAlert: (alert: Alert) => {
        set((state) => ({
            alerts: [alert, ...state.alerts].slice(0, 100),
            activeAlertCount: alert.isResolved ? state.activeAlertCount : state.activeAlertCount + 1,
        }))
    },

    updateAlert: (alert: Alert) => {
        set((state) => {
            const existing = state.alerts.find((a) => a.id === alert.id)
            const wasActive = existing && !existing.isResolved
            const isNowActive = !alert.isResolved

            let activeCount = state.activeAlertCount
            if (wasActive && !isNowActive) {
                activeCount = Math.max(0, activeCount - 1)
            } else if (!wasActive && isNowActive) {
                activeCount += 1
            }

            return {
                alerts: state.alerts.map((a) => (a.id === alert.id ? alert : a)),
                activeAlertCount: activeCount,
            }
        })
    },

    // 处理实时事件
    handleRealtimeEvent: (event, deviceId) => {
        switch (event.eventType) {
            case 'metrics':
                if (event.metrics && event.metrics.length > 0) {
                    const metrics: PerformanceMetrics[] = event.metrics.map((m) => ({
                        timestamp: m.timestamp,
                        cpu: m.cpu
                            ? {
                                usage: m.cpu.usage,
                                userTime: m.cpu.userTime,
                                systemTime: m.cpu.systemTime,
                                threadCount: m.cpu.threadCount,
                            }
                            : undefined,
                        memory: m.memory
                            ? {
                                usedMemory: m.memory.usedMemory,
                                peakMemory: m.memory.peakMemory,
                                freeMemory: m.memory.freeMemory,
                                memoryPressure: m.memory.memoryPressure as MemoryMetrics['memoryPressure'],
                                footprintRatio: m.memory.footprintRatio,
                            }
                            : undefined,
                        fps: m.fps
                            ? {
                                fps: m.fps.fps,
                                droppedFrames: m.fps.droppedFrames,
                                jankCount: m.fps.jankCount,
                                averageRenderTime: m.fps.averageRenderTime,
                            }
                            : undefined,
                        network: m.network
                            ? {
                                bytesReceived: m.network.bytesReceived,
                                bytesSent: m.network.bytesSent,
                                downloadRate: m.network.downloadRate,
                                uploadRate: m.network.uploadRate,
                            }
                            : undefined,
                        diskIO: m.diskIO
                            ? {
                                readBytes: m.diskIO.readBytes,
                                writeBytes: m.diskIO.writeBytes,
                                readRate: m.diskIO.readRate,
                                writeRate: m.diskIO.writeRate,
                            }
                            : undefined,
                    }))
                    get().addRealtimeMetrics(metrics)
                    // 设置监控状态为 true（收到数据说明在监控中）
                    set({ isMonitoring: true })
                }
                break

            case 'jank':
                if (event.jank) {
                    get().addJankEvent({
                        id: event.jank.id,
                        timestamp: event.jank.timestamp,
                        duration: event.jank.duration,
                        droppedFrames: event.jank.droppedFrames,
                        stackTrace: event.jank.stackTrace,
                    })
                }
                break

            case 'alert':
                if (event.alert) {
                    get().addAlert({
                        id: event.alert.id,
                        ruleId: event.alert.ruleId,
                        metricType: event.alert.metricType as AlertMetricType,
                        severity: event.alert.severity as AlertSeverity,
                        message: event.alert.message,
                        currentValue: event.alert.currentValue,
                        threshold: event.alert.threshold,
                        timestamp: event.alert.timestamp,
                        isResolved: event.alert.isResolved,
                        resolvedAt: event.alert.resolvedAt,
                    })
                }
                break

            case 'alertResolved':
                if (event.alert) {
                    get().updateAlert({
                        id: event.alert.id,
                        ruleId: event.alert.ruleId,
                        metricType: event.alert.metricType as AlertMetricType,
                        severity: event.alert.severity as AlertSeverity,
                        message: event.alert.message,
                        currentValue: event.alert.currentValue,
                        threshold: event.alert.threshold,
                        timestamp: event.alert.timestamp,
                        isResolved: true,
                        resolvedAt: event.alert.resolvedAt,
                    })
                }
                break

            case 'appLaunch':
                if (event.appLaunch) {
                    // SDK 发送分阶段启动数据: { totalTime, preMainTime, mainToLaunchTime, launchToFirstFrameTime, timestamp }
                    set({
                        appLaunchMetrics: {
                            totalTime: event.appLaunch.totalTime,
                            preMainTime: event.appLaunch.preMainTime,
                            mainToLaunchTime: event.appLaunch.mainToLaunchTime,
                            launchToFirstFrameTime: event.appLaunch.launchToFirstFrameTime,
                            timestamp: event.appLaunch.timestamp,
                        },
                    })
                }
                break

            case 'pageTiming':
                if (event.pageTiming) {
                    // 将实时页面耗时事件添加到列表
                    get().addPageTimingEvent({
                        id: event.pageTiming.eventId,
                        deviceId: deviceId ?? '',
                        visitId: event.pageTiming.visitId,
                        pageId: event.pageTiming.pageId,
                        pageName: event.pageTiming.pageName,
                        route: event.pageTiming.route,
                        startAt: event.pageTiming.startAt,
                        firstLayoutAt: event.pageTiming.firstLayoutAt,
                        appearAt: event.pageTiming.appearAt,
                        endAt: event.pageTiming.endAt,
                        loadDuration: event.pageTiming.loadDuration,
                        appearDuration: event.pageTiming.appearDuration,
                        totalDuration: event.pageTiming.totalDuration,
                        markers: event.pageTiming.markers?.map(m => ({
                            name: m.name,
                            timestamp: m.timestamp,
                            elapsed: m.duration ?? 0,
                        })) ?? [],
                        appVersion: event.pageTiming.appVersion,
                        appBuild: event.pageTiming.appBuild,
                        osVersion: event.pageTiming.osVersion,
                        deviceModel: event.pageTiming.deviceModel,
                        isColdStart: event.pageTiming.isColdStart,
                        isPush: event.pageTiming.isPush,
                        parentPageId: event.pageTiming.parentPageId,
                        seqNum: 0, // 实时事件暂无序号
                    })
                    // 触发汇总数据刷新（防抖处理在 debouncedFetchSummary 中）
                    if (deviceId) {
                        debouncedFetchSummary(deviceId, get().fetchPageTimingSummary)
                    }
                }
                break
        }
    },

    // UI
    setTimeRange: (seconds: number) => {
        set({ timeRange: seconds })
    },

    clearData: () => {
        // 清除数据但不改变监控状态
        set({
            realtimeMetrics: [],
            jankEvents: [],
            jankTotal: 0,
            jankPage: 1,
            lastMetrics: null,
            recentJankCount: 0,
            trends: null,
            alerts: [],
            activeAlertCount: 0,
            pageTimingEvents: [],
            pageTimingTotal: 0,
            pageTimingPage: 1,
            pageTimingSummary: [],
            selectedPageTimingEvent: null,
            // 同时清除 App Launch 相关状态
            appLaunchMetrics: null,
            appLaunchHistory: [],
            appLaunchStats: null,
        })
    },

    // Page Timing Actions
    fetchPageTimingEvents: async (deviceId: string, params: PageTimingQueryParams = {}) => {
        set({ isLoadingPageTiming: true })
        try {
            const response = await getPageTimingEvents(deviceId, params)
            set({
                pageTimingEvents: response.items,
                pageTimingTotal: response.total,
                pageTimingPage: response.page,
                pageTimingPageSize: response.pageSize,
                isLoadingPageTiming: false,
            })
        } catch (error) {
            console.error('Failed to fetch page timing events:', error)
            set({ isLoadingPageTiming: false })
        }
    },

    fetchPageTimingSummary: async (deviceId: string, from?: Date, to?: Date, pageName?: string) => {
        set({ isLoadingPageTimingSummary: true })
        try {
            const response = await getPageTimingSummary(deviceId, from, to, pageName)
            set({
                pageTimingSummary: response.items,
                isLoadingPageTimingSummary: false,
            })
        } catch (error) {
            console.error('Failed to fetch page timing summary:', error)
            set({ isLoadingPageTimingSummary: false })
        }
    },

    fetchPageTimingEvent: async (deviceId: string, eventId: string) => {
        try {
            const event = await getPageTimingEvent(deviceId, eventId)
            set({ selectedPageTimingEvent: event })
        } catch (error) {
            console.error('Failed to fetch page timing event:', error)
        }
    },

    clearPageTimingEvents: async (deviceId: string) => {
        try {
            await deletePageTimingEvents(deviceId)
            set({
                pageTimingEvents: [],
                pageTimingTotal: 0,
                pageTimingPage: 1,
                pageTimingSummary: [],
                selectedPageTimingEvent: null,
            })
        } catch (error) {
            console.error('Failed to clear page timing events:', error)
        }
    },

    setSelectedPageTimingEvent: (event: PageTimingEvent | null) => {
        set({ selectedPageTimingEvent: event })
    },

    addPageTimingEvent: (event: PageTimingEvent) => {
        set((state) => {
            // 按时间倒序，新事件在最前面
            const exists = state.pageTimingEvents.some(e => e.id === event.id)
            if (exists) {
                return state
            }
            return {
                pageTimingEvents: [event, ...state.pageTimingEvents].slice(0, 100),
                pageTimingTotal: state.pageTimingTotal + 1,
            }
        })
    },
}))

// MARK: - Helper Functions

export function formatBytes(bytes: number | undefined | null): string {
    if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 B'
    if (bytes < 0) return '0 B' // 处理负数情况
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    // 确保索引不越界
    const index = Math.min(i, sizes.length - 1)
    return parseFloat((bytes / Math.pow(k, index)).toFixed(1)) + ' ' + sizes[index]
}

export function formatDuration(ms: number | undefined | null): string {
    if (ms === undefined || ms === null || isNaN(ms)) return '--'
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(2)}s`
}

export function getMemoryPressureColor(pressure: string): string {
    switch (pressure) {
        case 'low':
            return 'text-green-400'
        case 'medium':
            return 'text-yellow-400'
        case 'high':
            return 'text-orange-400'
        case 'critical':
            return 'text-red-400'
        default:
            return 'text-zinc-400'
    }
}

export function getCPUUsageColor(usage: number): string {
    if (usage < 30) return 'text-green-400'
    if (usage < 60) return 'text-yellow-400'
    if (usage < 80) return 'text-orange-400'
    return 'text-red-400'
}

export function getFPSColor(fps: number): string {
    if (fps >= 55) return 'text-green-400'
    if (fps >= 40) return 'text-yellow-400'
    if (fps >= 25) return 'text-orange-400'
    return 'text-red-400'
}

export function getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
        case 'info':
            return 'text-blue-400'
        case 'warning':
            return 'text-yellow-400'
        case 'critical':
            return 'text-red-400'
        default:
            return 'text-zinc-400'
    }
}

export function getSeverityBgColor(severity: AlertSeverity): string {
    switch (severity) {
        case 'info':
            return 'bg-blue-500/20 border-blue-500/50'
        case 'warning':
            return 'bg-yellow-500/20 border-yellow-500/50'
        case 'critical':
            return 'bg-red-500/20 border-red-500/50'
        default:
            return 'bg-zinc-500/20 border-zinc-500/50'
    }
}

export function getMetricTypeLabel(type: AlertMetricType): string {
    switch (type) {
        case 'cpu':
            return 'CPU'
        case 'memory':
            return '内存'
        case 'fps':
            return '帧率'
        case 'jank':
            return '卡顿'
        default:
            return type
    }
}

export function getConditionLabel(condition: AlertCondition): string {
    switch (condition) {
        case 'gt':
            return '大于'
        case 'lt':
            return '小于'
        case 'gte':
            return '大于等于'
        case 'lte':
            return '小于等于'
        default:
            return condition
    }
}
export function getTrendLabel(trend: TrendDirection): string {
    switch (trend) {
        case 'improving':
            return '改善中'
        case 'stable':
            return '稳定'
        case 'degrading':
            return '劣化中'
        default:
            return trend
    }
}

export function getTrendColor(trend: TrendDirection): string {
    switch (trend) {
        case 'improving':
            return 'text-green-400'
        case 'stable':
            return 'text-blue-400'
        case 'degrading':
            return 'text-red-400'
        default:
            return 'text-zinc-400'
    }
}

export function getTrendIcon(trend: TrendDirection): string {
    switch (trend) {
        case 'improving':
            return '📈'
        case 'stable':
            return '➖'
        case 'degrading':
            return '📉'
        default:
            return '❓'
    }
}

// MARK: - Page Timing Helper Functions

/// 根据页面耗时获取颜色类
export function getPageTimingColor(durationMs: number | undefined | null): string {
    if (durationMs === undefined || durationMs === null || isNaN(durationMs)) {
        return 'text-zinc-400'
    }
    if (durationMs < 300) return 'text-green-400'
    if (durationMs < 500) return 'text-yellow-400'
    if (durationMs < 1000) return 'text-orange-400'
    return 'text-red-400'
}

/// 根据页面耗时获取背景色类
export function getPageTimingBgColor(durationMs: number | undefined | null): string {
    if (durationMs === undefined || durationMs === null || isNaN(durationMs)) {
        return 'bg-zinc-500/10'
    }
    if (durationMs < 300) return 'bg-green-500/10'
    if (durationMs < 500) return 'bg-yellow-500/10'
    if (durationMs < 1000) return 'bg-orange-500/10'
    return 'bg-red-500/10'
}

/// 格式化页面耗时为可读字符串
export function formatPageTiming(durationMs: number | undefined | null): string {
    if (durationMs === undefined || durationMs === null || isNaN(durationMs)) {
        return '--'
    }
    if (durationMs < 1000) {
        return `${Math.round(durationMs)}ms`
    }
    return `${(durationMs / 1000).toFixed(2)}s`
}
