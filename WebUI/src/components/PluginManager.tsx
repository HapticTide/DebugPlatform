// 插件管理器组件
// 允许用户启用/禁用插件

import { useState, useCallback, useMemo, useEffect } from 'react'
import { PluginRegistry } from '@/plugins/PluginRegistry'
import { SettingsIcon, PlugIcon } from '@/components/icons'
import { toast } from 'react-hot-toast'
import clsx from 'clsx'

interface PluginManagerProps {
    className?: string
}

/**
 * 插件管理弹出面板
 */
export function PluginManager({ className }: PluginManagerProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [, forceUpdate] = useState({})

    // 订阅插件状态变化
    useEffect(() => {
        return PluginRegistry.subscribe(() => forceUpdate({}))
    }, [])

    // 获取所有插件（包括已禁用的）
    const plugins = useMemo(() => {
        return PluginRegistry.getAll()
            .map((plugin) => ({
                pluginId: plugin.metadata.pluginId,
                displayName: plugin.metadata.displayName,
                description: plugin.metadata.description,
                icon: plugin.metadata.icon,
                dependencies: plugin.metadata.dependencies || [],
                isEnabled: PluginRegistry.isPluginEnabled(plugin.metadata.pluginId),
            }))
    }, [])

    // 切换插件启用状态（带依赖提示）
    const handleTogglePlugin = useCallback((pluginId: string, enabled: boolean) => {
        if (enabled) {
            // 启用插件时，检查是否需要启用依赖
            const requiredDeps = PluginRegistry.getRequiredDependencies(pluginId)
            if (requiredDeps.length > 0) {
                const depNames = requiredDeps.map(id => {
                    const plugin = PluginRegistry.getPlugin(id)
                    return plugin?.metadata.displayName || id
                }).join('、')
                toast.success(`已同时启用依赖插件：${depNames}`, { duration: 3000 })
            }
        } else {
            // 禁用插件时，检查是否有依赖该插件的插件
            const dependents = PluginRegistry.getDependentPlugins(pluginId)
            if (dependents.length > 0) {
                const depNames = dependents.map(id => {
                    const plugin = PluginRegistry.getPlugin(id)
                    return plugin?.metadata.displayName || id
                }).join('、')
                toast.success(`已同时禁用依赖插件：${depNames}`, { duration: 3000 })
            }
        }
        PluginRegistry.setPluginEnabled(pluginId, enabled)
    }, [])

    // 启用所有插件
    const handleEnableAll = useCallback(() => {
        for (const plugin of plugins) {
            PluginRegistry.setPluginEnabled(plugin.pluginId, true)
        }
        // 状态变化会通过 subscribe 自动触发更新
    }, [plugins])

    // 禁用所有插件（保留常用插件）
    const handleDisableAll = useCallback(() => {
        const commonPlugins = ['http', 'log', 'database']
        for (const plugin of plugins) {
            if (!commonPlugins.includes(plugin.pluginId)) {
                PluginRegistry.setPluginEnabled(plugin.pluginId, false)
            }
        }
        // 状态变化会通过 subscribe 自动触发更新
    }, [plugins])

    // 统计启用数量
    const enabledCount = plugins.filter((p) => PluginRegistry.isPluginEnabled(p.pluginId)).length

    return (
        <div className={clsx('relative', className)}>
            {/* 触发按钮 */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="btn btn-ghost p-2 rounded flex items-center gap-1.5 text-text-secondary hover:text-text-primary"
                title="插件管理"
            >
                <PlugIcon size={16} />
                <span className="text-xs hidden sm:inline">插件</span>
                <span className="text-xs px-1.5 py-0.5 bg-bg-light rounded-full">
                    {enabledCount}/{plugins.length}
                </span>
            </button>

            {/* 弹出面板 */}
            {isOpen && (
                <>
                    {/* 背景遮罩 */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* 面板 */}
                    <div className="absolute right-0 top-full mt-2 w-80 bg-bg-dark border border-border rounded-lg shadow-lg z-50">
                        {/* 标题栏 */}
                        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <SettingsIcon size={16} className="text-text-muted" />
                                <span className="font-medium text-text-primary">插件管理</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleEnableAll}
                                    className="text-xs text-primary hover:underline"
                                >
                                    全部启用
                                </button>
                                <span className="text-text-muted">|</span>
                                <button
                                    onClick={handleDisableAll}
                                    className="text-xs text-text-muted hover:text-text-secondary"
                                >
                                    仅保留常用
                                </button>
                            </div>
                        </div>

                        {/* 插件列表 */}
                        <div className="max-h-[400px] overflow-auto">
                            {plugins.map((plugin) => {
                                const isEnabled = PluginRegistry.isPluginEnabled(plugin.pluginId)
                                const isCommon = ['http', 'log', 'database'].includes(plugin.pluginId)
                                // 获取依赖的插件名称
                                const dependencyNames = plugin.dependencies.map(depId => {
                                    const dep = PluginRegistry.getPlugin(depId)
                                    return dep?.metadata.displayName || depId
                                })

                                return (
                                    <div
                                        key={plugin.pluginId}
                                        className={clsx(
                                            'px-4 py-3 flex items-center gap-3 hover:bg-bg-light/50 transition-colors',
                                            !isEnabled && 'opacity-60'
                                        )}
                                    >
                                        {/* 图标 */}
                                        <div className={clsx(
                                            'w-8 h-8 rounded-lg flex items-center justify-center',
                                            isEnabled ? 'bg-primary/10 text-primary' : 'bg-bg-medium text-text-muted'
                                        )}>
                                            {plugin.icon}
                                        </div>

                                        {/* 信息 */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={clsx(
                                                    'font-medium',
                                                    isEnabled ? 'text-text-primary' : 'text-text-muted'
                                                )}>
                                                    {plugin.displayName}
                                                </span>
                                                {isCommon && (
                                                    <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                                                        常用
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-text-muted truncate">
                                                {plugin.description}
                                            </div>
                                            {/* 依赖提示 */}
                                            {dependencyNames.length > 0 && (
                                                <div className="text-xs text-yellow-500/80 mt-0.5">
                                                    依赖: {dependencyNames.join('、')}
                                                </div>
                                            )}
                                        </div>

                                        {/* 开关 */}
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={isEnabled}
                                                onChange={(e) => handleTogglePlugin(plugin.pluginId, e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-bg-medium rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                                        </label>
                                    </div>
                                )
                            })}
                        </div>

                        {/* 底部提示 */}
                        <div className="px-4 py-2 border-t border-border bg-bg-medium/50">
                            <p className="text-xs text-text-muted">
                                💡 禁用的插件不会在标签栏显示，重新启用后生效
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default PluginManager
