// 前端插件注册表
// 管理所有已注册的前端插件

import { FrontendPlugin, PluginContext, PluginEvent, PluginRegistration, PluginTabConfig, BuiltinPluginId } from './types'

// 插件启用状态持久化 Key
const PLUGIN_ENABLED_STATE_KEY = 'debugplatform_plugin_enabled_state'

// 常用插件列表（默认启用）
// 这些插件在没有 localStorage 状态时默认启用
const COMMON_PLUGINS: string[] = [
    BuiltinPluginId.HTTP,
    BuiltinPluginId.LOG,
    BuiltinPluginId.DATABASE,
    BuiltinPluginId.MOCK,
]

class PluginRegistryImpl {
    private plugins: Map<string, PluginRegistration> = new Map()
    private context: PluginContext | null = null
    private eventHandlers: Map<string, Set<(event: PluginEvent) => void>> = new Map()
    private enabledState: Map<string, boolean> = new Map()
    private changeListeners: Set<() => void> = new Set()

    constructor() {
        // 从 localStorage 加载插件启用状态
        this.loadEnabledState()
    }

    // 订阅插件状态变化
    subscribe(listener: () => void): () => void {
        this.changeListeners.add(listener)
        return () => this.changeListeners.delete(listener)
    }

    // 通知所有监听器
    private notifyChange(): void {
        this.changeListeners.forEach((listener) => listener())
    }

    // 从 localStorage 加载插件启用状态
    private loadEnabledState(): void {
        try {
            const saved = localStorage.getItem(PLUGIN_ENABLED_STATE_KEY)
            if (saved) {
                const state = JSON.parse(saved) as Record<string, boolean>
                for (const [pluginId, enabled] of Object.entries(state)) {
                    this.enabledState.set(pluginId, enabled)
                }
            }
        } catch (error) {
            console.error('[PluginRegistry] Failed to load plugin enabled state:', error)
        }
    }

    // 保存插件启用状态到 localStorage
    private saveEnabledState(): void {
        try {
            const state: Record<string, boolean> = {}
            for (const [pluginId, enabled] of this.enabledState) {
                state[pluginId] = enabled
            }
            localStorage.setItem(PLUGIN_ENABLED_STATE_KEY, JSON.stringify(state))
        } catch (error) {
            console.error('[PluginRegistry] Failed to save plugin enabled state:', error)
        }
    }

    // 设置插件启用状态
    setPluginEnabled(pluginId: string, enabled: boolean): void {
        const plugin = this.getPlugin(pluginId)
        if (!plugin) return

        // 处理依赖联动
        if (enabled) {
            // 启用插件时，先检查并启用它依赖的插件
            const enabledDeps = this.enableRequiredDependencies(pluginId)
            if (enabledDeps.length > 0) {
                console.log(`[PluginRegistry] Auto-enabled dependencies for ${pluginId}: ${enabledDeps.join(', ')}`)
            }
        } else {
            // 禁用插件时，同时禁用依赖该插件的所有插件
            const disabledDeps = this.disableDependentPlugins(pluginId)
            if (disabledDeps.length > 0) {
                console.log(`[PluginRegistry] Auto-disabled dependent plugins of ${pluginId}: ${disabledDeps.join(', ')}`)
            }
        }

        plugin.isEnabled = enabled
        this.enabledState.set(pluginId, enabled)

        this.saveEnabledState()
        this.notifyChange()
        console.log(`[PluginRegistry] Plugin ${pluginId} ${enabled ? 'enabled' : 'disabled'}`)

        // 同步插件状态到 DebugHub
        this.syncPluginStatesToHub()
    }

    // 检查并返回启用插件时需要同时启用的依赖插件列表
    getRequiredDependencies(pluginId: string): string[] {
        const plugin = this.getPlugin(pluginId)
        if (!plugin) return []

        const deps = plugin.metadata.dependencies || []
        return deps.filter(dep => !this.isPluginEnabled(dep))
    }

    // 检查是否可以禁用插件（返回依赖该插件的已启用插件列表）
    getDependentPlugins(pluginId: string): string[] {
        const dependents: string[] = []
        for (const [id, registration] of this.plugins) {
            const deps = registration.plugin.metadata.dependencies
            if (deps?.includes(pluginId) && this.isPluginEnabled(id)) {
                dependents.push(id)
            }
        }
        return dependents
    }

    // 同步所有插件状态到 DebugHub
    private syncPluginStatesToHub(): void {
        const plugins = this.getAllPlugins().map((plugin) => ({
            pluginId: plugin.metadata.pluginId,
            displayName: plugin.metadata.displayName,
            isEnabled: plugin.isEnabled,
        }))

        // 异步发送到 DebugHub，不阻塞主流程
        fetch('/api/webui-plugins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plugins }),
        }).catch((error) => {
            console.warn('[PluginRegistry] Failed to sync plugin states to DebugHub:', error)
        })
    }

    // 初始化时同步一次插件状态
    syncInitialStatesToHub(): void {
        this.syncPluginStatesToHub()
    }

    // 启用插件所依赖的所有插件（返回被启用的插件列表）
    private enableRequiredDependencies(pluginId: string): string[] {
        const plugin = this.getPlugin(pluginId)
        if (!plugin) return []

        const deps = plugin.metadata.dependencies || []
        const enabled: string[] = []

        for (const depId of deps) {
            if (!this.isPluginEnabled(depId)) {
                const depPlugin = this.getPlugin(depId)
                if (depPlugin) {
                    depPlugin.isEnabled = true
                    this.enabledState.set(depId, true)
                    enabled.push(depId)
                }
            }
        }

        return enabled
    }

    // 禁用依赖该插件的所有插件（返回被禁用的插件列表）
    private disableDependentPlugins(pluginId: string): string[] {
        const disabled: string[] = []

        // 找到所有依赖该插件且当前启用的插件
        for (const [id, registration] of this.plugins) {
            const deps = registration.plugin.metadata.dependencies
            if (deps?.includes(pluginId) && this.isPluginEnabled(id)) {
                registration.plugin.isEnabled = false
                this.enabledState.set(id, false)
                disabled.push(id)
            }
        }

        return disabled
    }

    // 获取插件启用状态
    isPluginEnabled(pluginId: string): boolean {
        // 如果有持久化状态，使用持久化状态
        if (this.enabledState.has(pluginId)) {
            return this.enabledState.get(pluginId)!
        }
        // 否则使用常用插件默认规则：常用插件默认启用，其他插件默认禁用
        return COMMON_PLUGINS.includes(pluginId)
    }

    // 注册插件
    register(
        plugin: FrontendPlugin,
        options: { routePath: string; tabOrder?: number }
    ): void {
        if (this.plugins.has(plugin.metadata.pluginId)) {
            console.warn(`Plugin already registered: ${plugin.metadata.pluginId}`)
            return
        }

        // 应用持久化的启用状态，或使用常用插件默认规则
        if (this.enabledState.has(plugin.metadata.pluginId)) {
            plugin.isEnabled = this.enabledState.get(plugin.metadata.pluginId)!
        } else {
            // 没有持久化状态时，常用插件默认启用，其他插件默认禁用
            plugin.isEnabled = COMMON_PLUGINS.includes(plugin.metadata.pluginId)
        }

        const registration: PluginRegistration = {
            plugin,
            routePath: options.routePath,
            tabOrder: options.tabOrder ?? this.plugins.size,
        }

        this.plugins.set(plugin.metadata.pluginId, registration)
        console.log(`[PluginRegistry] Registered plugin: ${plugin.metadata.pluginId}`)
    }

    // 注销插件
    unregister(pluginId: string): void {
        const registration = this.plugins.get(pluginId)
        if (registration) {
            registration.plugin.destroy?.()
            this.plugins.delete(pluginId)
            console.log(`[PluginRegistry] Unregistered plugin: ${pluginId}`)
        }
    }

    // 获取插件
    getPlugin(pluginId: string): FrontendPlugin | undefined {
        return this.plugins.get(pluginId)?.plugin
    }

    // 获取所有已注册的插件
    getAllPlugins(): FrontendPlugin[] {
        return Array.from(this.plugins.values())
            .sort((a, b) => a.tabOrder - b.tabOrder)
            .map((r) => r.plugin)
    }

    // 获取插件 Tab 配置（用于动态生成 Tab）
    getTabConfigs(): PluginTabConfig[] {
        return Array.from(this.plugins.values())
            .sort((a, b) => a.tabOrder - b.tabOrder)
            .filter((r) => r.plugin.isEnabled)
            .map((r) => ({
                pluginId: r.plugin.metadata.pluginId,
                label: r.plugin.metadata.displayName,
                icon: r.plugin.metadata.icon,
                description: r.plugin.metadata.description,
                routePath: r.routePath,
            }))
    }

    // 设置插件上下文
    setContext(context: PluginContext): void {
        this.context = context
    }

    // 获取插件上下文
    getContext(): PluginContext | null {
        return this.context
    }

    // 初始化所有插件
    async initializeAll(context: PluginContext): Promise<void> {
        this.context = context

        // 按依赖顺序排序
        const sortedPlugins = this.topologicalSort()

        for (const pluginId of sortedPlugins) {
            const registration = this.plugins.get(pluginId)
            if (!registration) continue

            const plugin = registration.plugin
            if (!plugin.isEnabled) continue

            try {
                console.log(`[PluginRegistry] Initializing plugin: ${pluginId}`)
                await plugin.initialize(context)
                console.log(`[PluginRegistry] Plugin initialized: ${pluginId}`)
            } catch (error) {
                console.error(`[PluginRegistry] Failed to initialize plugin ${pluginId}:`, error)
            }
        }
    }

    // 派发事件到插件
    dispatchEvent(event: PluginEvent): void {
        // 派发给特定插件
        const plugin = this.getPlugin(event.pluginId)
        if (plugin?.onEvent) {
            plugin.onEvent(event)
        }

        // 派发给订阅了该事件类型的处理器
        const handlers = this.eventHandlers.get(event.eventType)
        if (handlers) {
            handlers.forEach((handler) => handler(event))
        }
    }

    // 订阅事件
    subscribeToEvents(
        eventTypes: string[],
        handler: (event: PluginEvent) => void
    ): () => void {
        for (const eventType of eventTypes) {
            if (!this.eventHandlers.has(eventType)) {
                this.eventHandlers.set(eventType, new Set())
            }
            this.eventHandlers.get(eventType)!.add(handler)
        }

        // 返回取消订阅函数
        return () => {
            for (const eventType of eventTypes) {
                this.eventHandlers.get(eventType)?.delete(handler)
            }
        }
    }

    // 销毁所有插件
    destroyAll(): void {
        for (const registration of this.plugins.values()) {
            registration.plugin.destroy?.()
        }
        this.plugins.clear()
        this.eventHandlers.clear()
        this.context = null
    }

    // 拓扑排序（按依赖顺序）
    private topologicalSort(): string[] {
        const visited = new Set<string>()
        const visiting = new Set<string>()
        const result: string[] = []

        const visit = (pluginId: string) => {
            if (visited.has(pluginId)) return
            if (visiting.has(pluginId)) {
                console.warn(`Circular dependency detected: ${pluginId}`)
                return
            }

            visiting.add(pluginId)

            const registration = this.plugins.get(pluginId)
            if (registration) {
                const deps = registration.plugin.metadata.dependencies || []
                for (const dep of deps) {
                    if (this.plugins.has(dep)) {
                        visit(dep)
                    }
                }
            }

            visiting.delete(pluginId)
            visited.add(pluginId)
            result.push(pluginId)
        }

        for (const pluginId of this.plugins.keys()) {
            visit(pluginId)
        }

        return result
    }

    // 获取单个插件（便捷方法）
    get(pluginId: string): FrontendPlugin | undefined {
        return this.getPlugin(pluginId)
    }

    // 获取所有插件（便捷方法）
    getAll(): FrontendPlugin[] {
        return this.getAllPlugins()
    }

    // 获取插件配置
    getPluginConfig(pluginId: string): { routePath: string; tabOrder: number } | undefined {
        const registration = this.plugins.get(pluginId)
        if (!registration) return undefined
        return {
            routePath: registration.routePath,
            tabOrder: registration.tabOrder,
        }
    }
}

// 导出单例
export const PluginRegistry = new PluginRegistryImpl()

// 导出类型以便测试
export type { PluginRegistryImpl }
