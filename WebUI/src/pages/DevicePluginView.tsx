// DevicePluginView.tsx
// 基于插件系统的设备详情视图

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useDeviceStore } from '@/stores/deviceStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useThemeStore } from '@/stores/themeStore'
import { useSessionActivityStore } from '@/stores/sessionActivityStore'
import { useHTTPStore } from '@/stores/httpStore'
import { useLogStore } from '@/stores/logStore'
import { useWSStore } from '@/stores/wsStore'
import { useMockStore } from '@/stores/mockStore'
import { useBreakpointStore } from '@/stores/breakpointStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import { PluginRenderer, PluginTabBar, getPluginTabs } from '@/plugins/PluginRenderer'
import { PluginRegistry } from '@/plugins/PluginRegistry'
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcutsHelp'
import { SessionActivityIndicator } from '@/components/SessionActivityIndicator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PluginManager } from '@/components/PluginManager'
import { ListLoadingOverlay } from '@/components/ListLoadingOverlay'
import { DeviceIdPopover } from '@/components/DeviceIdPopover'
import { getPlatformIcon } from '@/utils/deviceIcons'
import {
    BackIcon,
    KeyboardIcon,
    MoreIcon,
    ClearIcon,
    StarIcon,
    IPhoneIcon,
    SearchIcon,
} from '@/components/icons'
import { realtimeService, parseHTTPEvent, parseLogEvent } from '@/services/realtime'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { BreakpointHit, PerformanceEventData } from '@/types'
import clsx from 'clsx'

/**
 * 设备详情视图
 * 基于插件系统渲染各功能模块
 */
export function DevicePluginView() {
    const { deviceId } = useParams<{ deviceId: string }>()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    // 从 URL 读取当前激活的插件，如果没有指定或该插件未启用，则使用第一个启用的插件
    const getDefaultPluginId = useCallback(() => {
        const pluginParam = searchParams.get('plugin')
        // 如果 URL 有指定插件且该插件已启用，使用它
        if (pluginParam && PluginRegistry.isPluginEnabled(pluginParam)) {
            return pluginParam
        }
        // 否则使用第一个启用的插件
        const enabledTabs = getPluginTabs()
        return enabledTabs.length > 0 ? enabledTabs[0].pluginId : ''
    }, [searchParams])

    const [activePluginId, setActivePluginId] = useState(getDefaultPluginId)

    // Stores
    const { currentDevice, selectDevice, clearSelection, clearDeviceData, toggleFavorite, isFavorite, refreshDevice, updatePluginStates } =
        useDeviceStore()
    const { setConnected, setInDeviceDetail } = useConnectionStore()
    const toggleTheme = useThemeStore((s) => s.toggleTheme)
    const { addActivity, clearActivities, loadDeviceActivities } = useSessionActivityStore()

    // 数据 Stores
    const httpStore = useHTTPStore()
    const logStore = useLogStore()
    const wsStore = useWSStore()
    const mockStore = useMockStore()
    const breakpointStore = useBreakpointStore()
    const performanceStore = usePerformanceStore()

    // UI 状态
    const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
    const [showClearDeviceDialog, setShowClearDeviceDialog] = useState(false)
    const [showMoreMenu, setShowMoreMenu] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [pluginUpdateTrigger, setPluginUpdateTrigger] = useState({})

    // 订阅插件状态变化
    useEffect(() => {
        return PluginRegistry.subscribe(() => setPluginUpdateTrigger({}))
    }, [])

    // 检查 HTTP 是否有启用的子插件（Mock、Breakpoint、Chaos）
    const hasHttpSubPlugins = useMemo(() => {
        const httpSubPluginIds = ['mock', 'breakpoint', 'chaos']
        return httpSubPluginIds.some((id) => PluginRegistry.isPluginEnabled(id))
    }, [pluginUpdateTrigger])

    // 刷新设备信息
    const handleRefreshDevice = useCallback(async () => {
        setIsRefreshing(true)
        try {
            const result = await refreshDevice()
            if (!result.success) {
                // 显示错误提示
                if (result.error?.includes('not found') || result.error?.includes('offline')) {
                    toast.error('设备已离线，无法获取最新信息')
                } else {
                    toast.error(result.error || '刷新失败')
                }
            } else {
                toast.success('刷新成功')
            }
        } finally {
            setIsRefreshing(false)
        }
    }, [refreshDevice])

    // 更新 URL 参数
    const setActivePlugin = useCallback(
        (pluginId: string) => {
            setActivePluginId(pluginId)
            const params = new URLSearchParams(searchParams)
            params.set('plugin', pluginId)
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams]
    )

    // 组件初始化时同步 URL 参数
    useEffect(() => {
        const pluginParam = searchParams.get('plugin')
        // 如果 URL 没有指定插件或指定的插件未启用，更新 URL 到实际的激活插件
        if (activePluginId && (!pluginParam || pluginParam !== activePluginId)) {
            const params = new URLSearchParams(searchParams)
            params.set('plugin', activePluginId)
            setSearchParams(params, { replace: true })
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // 监听插件状态变化，当前插件被禁用时自动切换
    useEffect(() => {
        return PluginRegistry.subscribe(() => {
            // 检查当前插件是否仍然启用
            if (!PluginRegistry.isPluginEnabled(activePluginId)) {
                // 获取第一个启用的插件
                const enabledTabs = getPluginTabs()
                if (enabledTabs.length > 0) {
                    setActivePlugin(enabledTabs[0].pluginId)
                } else {
                    // 没有启用任何插件，清除选中
                    setActivePluginId('')
                }
            }
        })
    }, [activePluginId, setActivePlugin])

    // 键盘快捷键
    // 注意：Cmd/Ctrl + K 或 Cmd/Ctrl + F 由 GlobalSearch 组件全局处理
    useKeyboardShortcuts([
        {
            key: 'r',
            ctrl: true,
            description: '刷新',
            action: () => {
                if (deviceId) {
                    if (activePluginId === 'http') httpStore.fetchEvents(deviceId)
                    else if (activePluginId === 'logs') logStore.fetchEvents(deviceId)
                    else if (activePluginId === 'websocket') wsStore.fetchSessions(deviceId)
                }
            },
        },
        {
            key: 'l',
            ctrl: true,
            description: '清屏',
            action: () => {
                if (activePluginId === 'http') {
                    httpStore.clearEvents()
                } else if (activePluginId === 'logs') {
                    logStore.clearEvents()
                } else if (activePluginId === 'performance') {
                    performanceStore.clearData()
                }
            },
        },
        {
            key: 't',
            ctrl: true,
            description: '切换主题',
            action: toggleTheme,
        },
        {
            key: '/',
            ctrl: true,
            description: '显示快捷键帮助',
            action: () => setShowShortcutsHelp(true),
        },
        {
            key: 'Escape',
            description: '取消选择/关闭对话框',
            action: () => {
                if (showShortcutsHelp) {
                    setShowShortcutsHelp(false)
                } else if (mockStore.isEditorOpen) {
                    mockStore.closeEditor()
                } else if (httpStore.isSelectMode) {
                    httpStore.toggleSelectMode()
                } else {
                    httpStore.clearSelection()
                }
            },
        },
        {
            key: 'a',
            ctrl: true,
            description: '全选',
            action: () => {
                if (activePluginId === 'http' && httpStore.isSelectMode) {
                    httpStore.selectAll()
                }
            },
        },
    ])

    // 加载设备详情和数据
    useEffect(() => {
        if (!deviceId) return

        // 标记进入设备详情页
        setInDeviceDetail(true)

        selectDevice(deviceId)
        loadDeviceActivities(deviceId)

        // 连接实时流
        realtimeService.connect(deviceId)

        const unsubMessage = realtimeService.onMessage((message) => {
            if (message.deviceId !== deviceId) return

            switch (message.type) {
                case 'httpEvent':
                    httpStore.addRealtimeEvent(parseHTTPEvent(message.payload))
                    break
                case 'logEvent':
                    logStore.addRealtimeEvent(parseLogEvent(message.payload))
                    break
                // wsEvent 由 WebSocketPlugin 统一处理，避免重复
                case 'performanceEvent': {
                    const perfEvent = JSON.parse(message.payload) as PerformanceEventData
                    performanceStore.handleRealtimeEvent(perfEvent)
                    break
                }
                case 'deviceConnected': {
                    const data = JSON.parse(message.payload)
                    addActivity({
                        id: `${data.sessionId}-connected`,
                        deviceId: deviceId,
                        sessionId: data.sessionId,
                        timestamp: new Date().toISOString(),
                        type: 'connected',
                        deviceName: data.deviceName,
                    })
                    // 更新插件状态
                    if (data.pluginStates) {
                        updatePluginStates(data.pluginStates)
                    }
                    break
                }
                case 'deviceDisconnected': {
                    addActivity({
                        id: `${Date.now()}-disconnected`,
                        deviceId: deviceId,
                        sessionId: '',
                        timestamp: new Date().toISOString(),
                        type: 'disconnected',
                    })
                    break
                }
                case 'breakpointHit': {
                    const hit = JSON.parse(message.payload) as BreakpointHit
                    breakpointStore.addHit(hit)
                    // 不自动切换 Tab，只是添加到 store 中，让 BreakpointHitNotification 组件显示通知
                    break
                }
                case 'pluginStateChange': {
                    // 实时更新单个插件的启用状态
                    const data = JSON.parse(message.payload) as { pluginId: string; isEnabled: boolean }
                    const currentStates = useDeviceStore.getState().pluginStates
                    updatePluginStates({
                        ...currentStates,
                        [data.pluginId]: data.isEnabled
                    })
                    break
                }
            }
        })

        const unsubConnection = realtimeService.onConnection(setConnected)

        return () => {
            unsubMessage()
            unsubConnection()
            realtimeService.disconnect()
            clearSelection()
            httpStore.clearEvents()
            logStore.clearEvents()
            wsStore.clearSessions()
            mockStore.clearRules()
            breakpointStore.clear()
            performanceStore.clearData()
            clearActivities()
            setInDeviceDetail(false)
        }
    }, [deviceId])

    // 同步 URL 参数到状态
    useEffect(() => {
        const pluginParam = searchParams.get('plugin')
        if (pluginParam && pluginParam !== activePluginId) {
            // 只有当 URL 指定的插件已启用时才切换
            if (PluginRegistry.isPluginEnabled(pluginParam)) {
                setActivePluginId(pluginParam)
            } else {
                // 如果 URL 指定的插件未启用，同步到当前激活的插件
                if (activePluginId) {
                    const params = new URLSearchParams(searchParams)
                    params.set('plugin', activePluginId)
                    setSearchParams(params, { replace: true })
                }
            }
        }
    }, [searchParams, activePluginId, setSearchParams])

    // 返回设备列表
    const handleBack = useCallback(() => {
        navigate('/')
    }, [navigate])

    // 清空设备数据
    const handleClearDeviceData = useCallback(async () => {
        if (!deviceId) return

        realtimeService.pauseReconnect()

        await clearDeviceData()

        httpStore.clearEvents()
        logStore.clearEvents()
        wsStore.clearSessions()
        mockStore.clearRules()
        breakpointStore.clear()
        performanceStore.clearData()

        setShowClearDeviceDialog(false)

        realtimeService.resumeReconnect()
    }, [clearDeviceData, deviceId])

    if (!deviceId) {
        return (
            <div className="flex items-center justify-center h-full text-text-tertiary">
                未指定设备 ID
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full relative">
            {/* 刷新加载覆盖层 */}
            <ListLoadingOverlay isLoading={isRefreshing} text="刷新设备信息..." />

            {/* Header */}
            <header className="px-4 py-1.5 bg-bg-dark border-b border-border">
                <div className="flex items-center gap-2">
                    {/* 返回按钮 */}
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors group px-1.5 py-1 rounded hover:bg-bg-light"
                    >
                        <span className="group-hover:-translate-x-0.5 transition-transform">
                            <BackIcon size={14} />
                        </span>
                        <span className="text-xs font-medium">返回</span>
                    </button>

                    <div className="h-4 w-px bg-border" />

                    {/* 设备信息 - 紧凑单行 */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center border border-border flex-shrink-0">
                            {currentDevice ? getPlatformIcon(currentDevice.deviceInfo.platform, 14, undefined, currentDevice.deviceInfo.isSimulator) : <IPhoneIcon size={14} />}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                            {/* 设备名称：有别名时两行展示，无别名时单行 */}
                            <div className="min-w-0">
                                {currentDevice?.deviceInfo.deviceAlias ? (
                                    <>
                                        <h1 className="text-sm font-semibold text-text-primary truncate">
                                            {currentDevice.deviceInfo.deviceAlias}
                                        </h1>
                                        <p className="text-xs text-text-muted truncate">
                                            {currentDevice.deviceInfo.deviceName}
                                        </p>
                                    </>
                                ) : (
                                    <h1 className="text-sm font-semibold text-text-primary truncate">
                                        {currentDevice?.deviceInfo.deviceName || '加载中...'}
                                    </h1>
                                )}
                            </div>
                            {/* 设备 ID 后 4 位 - 点击弹出完整 ID */}
                            {deviceId && (
                                <DeviceIdPopover deviceId={deviceId}>
                                    <span
                                        className="text-xs px-1.5 py-0.5 rounded bg-bg-light text-text-muted font-mono flex-shrink-0 hover:bg-primary/20 hover:text-primary transition-colors"
                                    >
                                        #{deviceId.slice(-4).toUpperCase()}
                                    </span>
                                </DeviceIdPopover>
                            )}
                            {currentDevice?.deviceInfo.isSimulator && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex-shrink-0">
                                    模拟器
                                </span>
                            )}
                            {deviceId && (
                                <button
                                    onClick={() => toggleFavorite(deviceId)}
                                    className={clsx(
                                        "p-0.5 rounded transition-colors flex-shrink-0",
                                        isFavorite(deviceId)
                                            ? "text-yellow-400 hover:text-yellow-300"
                                            : "text-text-muted hover:text-yellow-400"
                                    )}
                                    title={isFavorite(deviceId) ? "取消收藏" : "收藏设备"}
                                >
                                    <StarIcon size={14} filled={isFavorite(deviceId)} />
                                </button>
                            )}
                            {currentDevice && (
                                <span
                                    className={clsx(
                                        'text-xs px-2 py-0.5 rounded flex items-center gap-1 flex-shrink-0',
                                        currentDevice.isOnline
                                            ? 'bg-status-success-bg text-status-success border border-green-500/30'
                                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                    )}
                                >
                                    <span className={clsx(
                                        'w-1.5 h-1.5 rounded-full',
                                        currentDevice.isOnline ? 'bg-green-400' : 'bg-red-400'
                                    )} />
                                    {currentDevice.isOnline ? '在线' : '离线'}
                                </span>
                            )}
                            {currentDevice && (
                                <span className="text-xs text-text-muted hidden xl:block truncate">
                                    {currentDevice.deviceInfo.deviceModel} · {currentDevice.deviceInfo.platform} {currentDevice.deviceInfo.systemVersion} · {currentDevice.deviceInfo.appName}
                                </span>
                            )}
                            {/* 刷新按钮 */}
                            <button
                                onClick={handleRefreshDevice}
                                disabled={isRefreshing}
                                className="btn btn-primary !px-1.5 !py-0.5 !text-2xs disabled:opacity-50"
                                title="刷新设备信息"
                            >
                                {isRefreshing ? '刷新中...' : '刷新'}
                            </button>
                        </div>
                    </div>

                    {/* 工具按钮 */}
                    <div className="flex items-center gap-0.5">
                        {/* 搜索按钮 */}
                        <button
                            onClick={() => useGlobalSearchStore.getState().open()}
                            className="btn btn-ghost p-1.5 rounded"
                            title="全局搜索 (⌘K / ⌘F)"
                        >
                            <SearchIcon size={14} />
                        </button>

                        {/* 插件管理 */}
                        <PluginManager />

                        <button
                            onClick={() => setShowShortcutsHelp(true)}
                            className="btn btn-ghost p-1.5 rounded"
                            title="快捷键 (Ctrl+/)"
                        >
                            <KeyboardIcon size={14} />
                        </button>

                        <div className="relative">
                            <button
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                className="btn btn-ghost p-1.5 rounded"
                                title="更多操作"
                            >
                                <MoreIcon size={14} />
                            </button>
                            {showMoreMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowMoreMenu(false)}
                                    />
                                    <div className="absolute right-0 top-full mt-1 w-48 bg-bg-dark border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                                        <button
                                            onClick={() => {
                                                setShowMoreMenu(false)
                                                setShowClearDeviceDialog(true)
                                            }}
                                            className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                                        >
                                            <ClearIcon size={14} />
                                            <span>清空设备数据</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                    </div>
                </div>
            </header>

            {/* Plugin Tab Bar - 带连接活动指示器 */}
            <div className={clsx(
                "px-4 py-1.5 bg-bg-dark flex items-center justify-between gap-4",
                // HTTP 插件有子标签时，选中时不显示底部边框，让子标签区域与父标签融合
                // 如果没有启用的子插件，则显示底部边框
                (activePluginId !== 'http' || !hasHttpSubPlugins) && "border-b border-border"
            )}>
                <PluginTabBar activePluginId={activePluginId} onTabChange={setActivePlugin} />

                {/* 常驻连接活动 */}
                {deviceId && (
                    <SessionActivityIndicator deviceId={deviceId} alwaysShow />
                )}
            </div>

            {/* Plugin Content */}
            <div className="flex-1 overflow-hidden">
                <PluginRenderer deviceId={deviceId} activePluginId={activePluginId} className="h-full" />
            </div>

            {/* Keyboard Shortcuts Help Modal */}
            <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />

            {/* Clear Device Data Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showClearDeviceDialog}
                onClose={() => setShowClearDeviceDialog(false)}
                onConfirm={handleClearDeviceData}
                title="清空设备数据"
                message={`确定要清空 "${currentDevice?.deviceInfo.deviceName || '该设备'}" 的所有数据吗？\n\n这将删除：\n• 所有 HTTP 请求记录\n• 所有日志事件\n• 所有 WebSocket 会话\n• 所有性能监控数据\n\n此操作不可恢复。`}
                confirmText="确认清空"
                cancelText="取消"
                type="danger"
            />
        </div>
    )
}

export default DevicePluginView
