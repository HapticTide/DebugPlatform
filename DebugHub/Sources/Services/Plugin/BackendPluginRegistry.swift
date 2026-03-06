// BackendPluginRegistry.swift
// DebugHub
//
// Created by Sun on 2025/12/09.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

// MARK: - 后端插件注册表

/// 后端插件注册表，负责插件的注册、生命周期管理和事件路由
public final class BackendPluginRegistry: @unchecked Sendable {
    // MARK: - Singleton

    public static let shared = BackendPluginRegistry()

    // MARK: - Properties

    /// 已注册的插件
    private var plugins: [String: BackendPlugin] = [:]

    /// 插件启动顺序（拓扑排序后）
    private var bootOrder: [String] = []

    /// 线程安全锁
    private let lock = NSLock()

    /// 上下文实例
    private var context: BackendPluginContextImpl?

    /// 是否已启动
    public private(set) var isBooted: Bool = false

    // MARK: - Lifecycle

    private init() {}

    // MARK: - Plugin Registration

    /// 注册插件
    /// - Parameter plugin: 要注册的插件实例
    public func register(plugin: BackendPlugin) throws {
        lock.lock()
        defer { lock.unlock() }

        guard plugins[plugin.pluginId] == nil else {
            throw BackendPluginError.duplicatePluginId(plugin.pluginId)
        }

        plugins[plugin.pluginId] = plugin
        print("[PluginRegistry] Registered plugin: \(plugin.pluginId) (\(plugin.displayName))")
    }

    /// 批量注册插件
    public func register(plugins: [BackendPlugin]) throws {
        for plugin in plugins {
            try register(plugin: plugin)
        }
    }

    /// 获取插件实例
    public func getPlugin(pluginId: String) -> BackendPlugin? {
        lock.lock()
        defer { lock.unlock() }
        return plugins[pluginId]
    }

    /// 获取所有已注册的插件
    public func getAllPlugins() -> [BackendPlugin] {
        lock.lock()
        defer { lock.unlock() }
        return Array(plugins.values)
    }

    /// 获取所有插件信息
    public func getAllPluginInfos() -> [BackendPluginInfo] {
        getAllPlugins().map { BackendPluginInfo(from: $0) }
    }

    // MARK: - Lifecycle Management

    /// 启动所有插件
    /// - Parameters:
    ///   - app: Vapor Application
    public func bootAll(app: Application) async throws {
        guard !isBooted else {
            print("[PluginRegistry] Already booted")
            return
        }

        // 创建上下文
        context = BackendPluginContextImpl(app: app)

        // 拓扑排序确定启动顺序
        try resolveBootOrder()

        // 按顺序启动插件
        for pluginId in bootOrder {
            guard let plugin = plugins[pluginId], let context else { continue }

            print("[PluginRegistry] Booting plugin: \(pluginId)")
            do {
                try await plugin.boot(context: context)
                print("[PluginRegistry] Plugin booted: \(pluginId)")
            } catch {
                print("[PluginRegistry] Failed to boot plugin \(pluginId): \(error)")
                throw BackendPluginError.bootFailed(pluginId, error)
            }
        }

        isBooted = true
        print("[PluginRegistry] All plugins booted (\(bootOrder.count) plugins)")
    }

    /// 注册所有插件路由
    /// - Parameter routes: 路由构建器
    public func registerAllRoutes(on routes: RoutesBuilder) throws {
        for pluginId in bootOrder {
            guard let plugin = plugins[pluginId] else { continue }

            print("[PluginRegistry] Registering routes for plugin: \(pluginId)")
            try plugin.registerRoutes(on: routes)
        }
        print("[PluginRegistry] All plugin routes registered")
    }

    /// 停止所有插件
    public func shutdownAll() async {
        guard isBooted else { return }

        // 逆序停止
        for pluginId in bootOrder.reversed() {
            guard let plugin = plugins[pluginId] else { continue }

            print("[PluginRegistry] Shutting down plugin: \(pluginId)")
            await plugin.shutdown()
        }

        isBooted = false
        context = nil
        print("[PluginRegistry] All plugins shut down")
    }

    // MARK: - Event Routing

    /// 路由插件事件到对应插件
    public func routeEvent(_ event: PluginEventDTO, from deviceId: String) async {
        guard let plugin = getPlugin(pluginId: event.pluginId) else {
            print("[PluginRegistry] Plugin not found for event: \(event.pluginId)")
            return
        }

        await plugin.handleEvent(event, from: deviceId)
    }

    /// 路由插件命令响应
    public func routeCommandResponse(_ response: PluginCommandResponseDTO, from deviceId: String) async {
        guard let plugin = getPlugin(pluginId: response.pluginId) else {
            print("[PluginRegistry] Plugin not found for response: \(response.pluginId)")
            return
        }

        await plugin.handleCommandResponse(response, from: deviceId)
    }

    // MARK: - Private Methods

    /// 拓扑排序解析启动顺序
    private func resolveBootOrder() throws {
        var visited: Set<String> = []
        var visiting: Set<String> = []
        var order: [String] = []

        func visit(_ pluginId: String) throws {
            if visited.contains(pluginId) { return }
            if visiting.contains(pluginId) {
                throw BackendPluginError.circularDependency(pluginId)
            }

            visiting.insert(pluginId)

            if let plugin = plugins[pluginId] {
                for dep in plugin.dependencies {
                    guard plugins[dep] != nil else {
                        throw BackendPluginError.missingDependency(pluginId, dep)
                    }
                    try visit(dep)
                }
            }

            visiting.remove(pluginId)
            visited.insert(pluginId)
            order.append(pluginId)
        }

        for pluginId in plugins.keys {
            try visit(pluginId)
        }

        bootOrder = order
    }
}

// MARK: - Backend Plugin Errors

/// 后端插件相关错误
public enum BackendPluginError: Error, LocalizedError {
    case duplicatePluginId(String)
    case pluginNotFound(String)
    case circularDependency(String)
    case missingDependency(String, String)
    case bootFailed(String, Error)
    case invalidConfiguration(String)

    public var errorDescription: String? {
        switch self {
        case let .duplicatePluginId(id):
            "Plugin ID already registered: \(id)"
        case let .pluginNotFound(id):
            "Plugin not found: \(id)"
        case let .circularDependency(id):
            "Circular dependency detected for plugin: \(id)"
        case let .missingDependency(plugin, dep):
            "Plugin '\(plugin)' depends on missing plugin: \(dep)"
        case let .bootFailed(id, error):
            "Failed to boot plugin '\(id)': \(error.localizedDescription)"
        case let .invalidConfiguration(msg):
            "Invalid plugin configuration: \(msg)"
        }
    }
}

// MARK: - Backend Plugin Context Implementation

/// 后端插件上下文具体实现
final class BackendPluginContextImpl: BackendPluginContext, @unchecked Sendable {
    private let app: Application
    private var configurations: [String: Data] = [:]
    private let configLock = NSLock()

    var database: Database {
        app.db
    }

    var logger: Logger {
        app.logger
    }

    init(app: Application) {
        self.app = app
    }

    func sendCommand(_ command: PluginCommandDTO, to deviceId: String) async {
        // 通过 DeviceRegistry 发送命令到设备
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
            logger.warning("Device not found for command: \(deviceId)")
            return
        }

        // 将 PluginCommandDTO 转换为 BridgeMessageDTO 并发送
        let message = BridgeMessageDTO.pluginCommand(command)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        do {
            let data = try encoder.encode(message)
            try await session.webSocket.send(raw: data, opcode: .text)
            logger.debug("Sent plugin command to device \(deviceId): \(command.pluginId)/\(command.commandType)")
        } catch {
            logger.error("Failed to send plugin command: \(error)")
        }
    }

    func broadcastToWebUI(_ message: Any, deviceId: String) {
        // 通过 RealtimeStreamHandler 广播到 WebUI
        // 需要将消息转换为 JSON 字符串
        do {
            let jsonData: Data
            if let encodable = message as? Encodable {
                jsonData = try JSONEncoder().encode(AnyEncodable(encodable))
            } else if let dict = message as? [String: Any] {
                jsonData = try JSONSerialization.data(withJSONObject: dict)
            } else if let string = message as? String {
                RealtimeStreamHandler.shared.broadcastRaw(string, deviceId: deviceId)
                return
            } else {
                logger.warning("Cannot serialize message for WebUI broadcast: \(type(of: message))")
                return
            }
            guard let jsonString = String(data: jsonData, encoding: .utf8) else { return }
            RealtimeStreamHandler.shared.broadcastRaw(jsonString, deviceId: deviceId)
        } catch {
            logger.error("Failed to serialize message for WebUI broadcast: \(error)")
        }
    }

    func getDeviceInfo(deviceId: String) -> DeviceInfoDTO? {
        DeviceRegistry.shared.getSession(deviceId: deviceId)?.deviceInfo
    }

    func getConfiguration<T: Decodable>(for key: String) -> T? {
        configLock.lock()
        defer { configLock.unlock() }

        guard let data = configurations[key] else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    func setConfiguration(_ value: some Encodable, for key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        configLock.lock()
        configurations[key] = data
        configLock.unlock()
    }
}

// MARK: - Vapor Lifecycle Integration

extension BackendPluginRegistry: LifecycleHandler {
    public func willBoot(_: Application) throws {
        // 插件在 configure 中手动启动
    }

    public func shutdown(_: Application) {
        Task {
            await shutdownAll()
        }
    }
}

// MARK: - AnyEncodable Helper

/// 类型擦除的 Encodable 包装器
private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ value: Encodable) {
        encodeClosure = { encoder in
            try value.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}
