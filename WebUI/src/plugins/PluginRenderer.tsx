// 插件渲染器组件
// 负责渲染已注册的插件内容

import React, { useEffect, useMemo, useState } from 'react'
import { PluginRegistry } from '@/plugins/PluginRegistry'
import type { PluginContext, PluginRenderProps, PluginEvent } from '@/plugins/types'
import { useToastStore } from '@/stores/toastStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { realtimeService } from '@/services/realtime'

// API 基础路径
const API_BASE = '/api'

// 插件配置存储
const pluginConfigStore: Map<string, Record<string, unknown>> = new Map()

interface PluginRendererProps {
    // 设备 ID
    deviceId: string
    // 当前激活的插件 ID
    activePluginId: string
    // 可选的额外 props
    className?: string
}

interface PluginTabInfo {
    pluginId: string
    displayName: string
    icon: React.ReactNode
    tabOrder: number
}

/**
 * 获取所有启用的插件的标签信息
 */
export function getPluginTabs(): PluginTabInfo[] {
    return PluginRegistry.getAll()
        .filter((plugin) => PluginRegistry.isPluginEnabled(plugin.metadata.pluginId))
        .map((plugin) => ({
            pluginId: plugin.metadata.pluginId,
            displayName: plugin.metadata.displayName,
            icon: plugin.metadata.icon,
            tabOrder: PluginRegistry.getPluginConfig(plugin.metadata.pluginId)?.tabOrder ?? 999,
        }))
        .sort((a, b) => a.tabOrder - b.tabOrder)
}

/**
 * 插件渲染器组件
 */
export function PluginRenderer({ deviceId, activePluginId, className }: PluginRendererProps) {
    const toastStore = useToastStore()
    const isPluginEnabledOnDevice = useDeviceStore((state) => state.isPluginEnabled)
    const [updateTrigger, forceUpdate] = useState({})

    // 订阅插件状态变化
    useEffect(() => {
        return PluginRegistry.subscribe(() => forceUpdate({}))
    }, [])

    // 创建插件上下文
    const context = useMemo<PluginContext>(() => {
        return {
            deviceId,
            apiBaseUrl: API_BASE,
            fetch: window.fetch.bind(window),
            getConfig: <T,>(key: string): T | undefined => {
                const config = pluginConfigStore.get(activePluginId)
                return config?.[key] as T | undefined
            },
            setConfig: <T,>(key: string, value: T): void => {
                let config = pluginConfigStore.get(activePluginId)
                if (!config) {
                    config = {}
                    pluginConfigStore.set(activePluginId, config)
                }
                config[key] = value
            },
            showToast: (message, type) => {
                toastStore.show(type, message)
            },
            subscribeToEvents: (eventTypes, callback) => {
                // 监听实时消息
                const unsubMessage = realtimeService.onMessage((message) => {
                    if (message.deviceId !== deviceId) return

                    // 将实时消息类型映射到插件事件类型
                    const eventTypeMap: Record<string, string> = {
                        httpEvent: 'http_event',
                        logEvent: 'log_event',
                        wsEvent: 'ws_connection',
                        breakpointHit: 'breakpoint_hit',
                        performanceEvent: 'performance_metrics',
                    }

                    const pluginEventType = eventTypeMap[message.type]
                    if (pluginEventType && eventTypes.includes(pluginEventType)) {
                        const event: PluginEvent = {
                            pluginId: activePluginId,
                            eventType: pluginEventType,
                            eventId: Math.random().toString(36).substring(7),
                            payload: JSON.parse(message.payload),
                            timestamp: new Date().toISOString(),
                        }
                        callback(event)
                    }

                    // 特殊处理：performance 事件有多种类型
                    if (message.type === 'performanceEvent') {
                        try {
                            const perfData = JSON.parse(message.payload)
                            // 根据 eventType 字段判断具体类型
                            let specificEventType: string | null = null
                            if (perfData.eventType === 'metrics' && eventTypes.includes('performance_metrics')) {
                                specificEventType = 'performance_metrics'
                            } else if (perfData.eventType === 'jank' && eventTypes.includes('jank_event')) {
                                specificEventType = 'jank_event'
                            } else if (perfData.eventType === 'alert' && eventTypes.includes('performance_alert')) {
                                specificEventType = 'performance_alert'
                            } else if (perfData.eventType === 'alertResolved' && eventTypes.includes('alert_resolved')) {
                                specificEventType = 'alert_resolved'
                            }

                            if (specificEventType) {
                                const event: PluginEvent = {
                                    pluginId: activePluginId,
                                    eventType: specificEventType,
                                    eventId: Math.random().toString(36).substring(7),
                                    payload: perfData,
                                    timestamp: new Date().toISOString(),
                                }
                                callback(event)
                            }
                        } catch (error) {
                            console.error('[PluginRenderer] Failed to parse performance event:', error)
                        }
                    }
                })

                // 返回取消订阅函数
                return () => {
                    unsubMessage()
                }
            },
            sendCommand: async (command) => {
                // 发送命令到后端
                const response = await fetch(`${API_BASE}/devices/${deviceId}/plugins/${command.pluginId}/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(command),
                })

                if (!response.ok) {
                    throw new Error('Failed to send command')
                }

                return {
                    pluginId: command.pluginId,
                    commandId: command.commandId || '',
                    success: true,
                }
            },
        }
    }, [deviceId, activePluginId, toastStore])

    // 获取当前激活的插件
    const activePlugin = useMemo(() => {
        // 检查插件是否启用
        if (!activePluginId || !PluginRegistry.isPluginEnabled(activePluginId)) {
            return undefined
        }
        return PluginRegistry.get(activePluginId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePluginId, updateTrigger])

    // 初始化插件
    useEffect(() => {
        if (activePlugin) {
            activePlugin.initialize(context)
        }
    }, [activePlugin, context])

    // 构建渲染 props
    const renderProps = useMemo<PluginRenderProps>(() => ({
        context,
        isActive: true,
    }), [context])

    // 检查是否有任何启用的插件
    const enabledTabs = getPluginTabs()

    // 检查当前插件是否存在（但可能未启用）
    const pluginExists = activePluginId ? PluginRegistry.get(activePluginId) : undefined
    const isPluginDisabled = pluginExists && !PluginRegistry.isPluginEnabled(activePluginId)

    // 检查插件是否在 SDK 端被禁用
    const isPluginDisabledOnDevice = activePluginId ? !isPluginEnabledOnDevice(activePluginId) : false

    if (enabledTabs.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center h-full text-text-tertiary ${className}`}>
                <div className="text-lg mb-2">没有启用任何插件</div>
                <div className="text-sm text-text-muted">请点击右上角的"插件"按钮启用插件</div>
            </div>
        )
    }

    // 检查 SDK 端是否禁用了该插件
    if (isPluginDisabledOnDevice && activePlugin) {
        return (
            <div className={`flex flex-col items-center justify-center h-full text-text-tertiary ${className}`}>
                <div className="text-5xl mb-4">🔒</div>
                <div className="text-lg mb-2">插件在设备端已禁用</div>
                <div className="text-sm text-text-muted max-w-md text-center">
                    插件 "{activePlugin.metadata.displayName}" 在 DebugProbe SDK 中已被禁用，
                    无法在 WebUI 中使用。请在 App 中启用该插件后重新连接。
                </div>
            </div>
        )
    }

    if (!activePlugin) {
        // 区分插件未找到和插件未启用（WebUI 端）
        if (isPluginDisabled) {
            return (
                <div className={`flex flex-col items-center justify-center h-full text-text-tertiary ${className}`}>
                    <div className="text-lg mb-2">插件未启用</div>
                    <div className="text-sm text-text-muted mb-4">
                        插件 "{pluginExists?.metadata.displayName || activePluginId}" 当前已禁用
                    </div>
                    <button
                        onClick={() => PluginRegistry.setPluginEnabled(activePluginId, true)}
                        className="btn btn-primary text-sm"
                    >
                        启用插件
                    </button>
                </div>
            )
        }
        return (
            <div className={`flex items-center justify-center h-full text-text-tertiary ${className}`}>
                插件未找到: {activePluginId}
            </div>
        )
    }

    return (
        <div className={`h-full ${className}`}>
            {activePlugin.render(renderProps)}
        </div>
    )
}

/**
 * 插件标签栏组件
 */
interface PluginTabBarProps {
    activePluginId: string
    onTabChange: (pluginId: string) => void
    className?: string
}

export function PluginTabBar({ activePluginId, onTabChange, className }: PluginTabBarProps) {
    const [, forceUpdate] = useState({})
    const isPluginEnabledOnDevice = useDeviceStore((state) => state.isPluginEnabled)

    // 订阅插件状态变化
    useEffect(() => {
        return PluginRegistry.subscribe(() => forceUpdate({}))
    }, [])

    const tabs = getPluginTabs()

    return (
        <div className={`flex items-center gap-0.5 p-0.5 bg-bg-medium rounded-lg border border-border w-fit ${className}`}>
            {tabs.map((tab, index) => {
                const isDisabledOnDevice = !isPluginEnabledOnDevice(tab.pluginId)
                return (
                    <button
                        key={tab.pluginId}
                        onClick={() => onTabChange(tab.pluginId)}
                        title={isDisabledOnDevice ? `${tab.displayName}（设备端已禁用）` : `⌘${index + 1}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors relative whitespace-nowrap ${activePluginId === tab.pluginId
                                ? 'bg-primary text-bg-darkest'
                                : isDisabledOnDevice
                                    ? 'text-text-muted opacity-50 cursor-not-allowed'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-light'
                            }`}
                    >
                        <span className="text-sm">{tab.icon}</span>
                        <span>{tab.displayName}</span>
                        {isDisabledOnDevice && (
                            <span className="text-xs ml-1">🔒</span>
                        )}
                    </button>
                )
            })}
        </div>
    )
}

export default PluginRenderer
