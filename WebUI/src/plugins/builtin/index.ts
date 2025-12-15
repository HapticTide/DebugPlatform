// 内置前端插件注册
// 注册所有内置的前端插件

import { PluginRegistry } from '../PluginRegistry'
import { HttpPlugin } from './HttpPlugin'
import { LogPlugin } from './LogPlugin'
import { WebSocketPlugin } from './WebSocketPlugin'
import { DatabasePlugin } from './DatabasePlugin'
import { MockPlugin } from './MockPlugin'
import { BreakpointPlugin } from './BreakpointPlugin'
import { ChaosPlugin } from './ChaosPlugin'
import { PerformancePlugin } from './PerformancePlugin'

// 注册所有内置插件
// 插件顺序固定为：HTTP、WebSocket、Log、Database、Performance、Mock、Breakpoint、Chaos
// 可通过插件管理功能启用/禁用任意插件
export function registerBuiltinPlugins(): void {
    // HTTP 请求监控插件
    PluginRegistry.register(HttpPlugin, {
        routePath: '/device/:deviceId/http',
        tabOrder: 0,
    })

    // WebSocket 插件
    PluginRegistry.register(WebSocketPlugin, {
        routePath: '/device/:deviceId/websocket',
        tabOrder: 1,
    })

    // 日志插件
    PluginRegistry.register(LogPlugin, {
        routePath: '/device/:deviceId/logs',
        tabOrder: 2,
    })

    // 数据库插件
    PluginRegistry.register(DatabasePlugin, {
        routePath: '/device/:deviceId/database',
        tabOrder: 3,
    })

    // 性能监控插件
    PluginRegistry.register(PerformancePlugin, {
        routePath: '/device/:deviceId/performance',
        tabOrder: 4,
    })

    // Mock 规则插件
    PluginRegistry.register(MockPlugin, {
        routePath: '/device/:deviceId/mock',
        tabOrder: 5,
    })

    // 断点插件
    PluginRegistry.register(BreakpointPlugin, {
        routePath: '/device/:deviceId/breakpoint',
        tabOrder: 6,
    })

    // 混沌工程插件
    PluginRegistry.register(ChaosPlugin, {
        routePath: '/device/:deviceId/chaos',
        tabOrder: 7,
    })

    console.log('[BuiltinPlugins] All builtin plugins registered')
}

// 导出所有内置插件
export { HttpPlugin } from './HttpPlugin'
export { LogPlugin } from './LogPlugin'
export { WebSocketPlugin } from './WebSocketPlugin'
export { DatabasePlugin } from './DatabasePlugin'
export { MockPlugin } from './MockPlugin'
export { BreakpointPlugin } from './BreakpointPlugin'
export { ChaosPlugin } from './ChaosPlugin'
export { PerformancePlugin } from './PerformancePlugin'
