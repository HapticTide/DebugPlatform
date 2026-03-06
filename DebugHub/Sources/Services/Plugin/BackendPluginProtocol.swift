// BackendPluginProtocol.swift
// DebugHub
//
// Created by Sun on 2025/12/09.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

// MARK: - 后端插件标识

/// 内置后端插件 ID 常量
public enum BackendPluginId {
    public static let http = "http"
    public static let log = "log"
    public static let database = "database"
    public static let webSocket = "websocket"
    public static let mock = "mock"
    public static let breakpoint = "breakpoint"
    public static let chaos = "chaos"
    public static let performance = "performance"
}

// MARK: - 插件生命周期状态

/// 插件运行状态
public enum BackendPluginState: String, Sendable {
    case uninitialized
    case booting
    case running
    case stopping
    case stopped
    case error
}

// MARK: - 插件事件 DTO

/// 从设备接收的插件事件
public struct PluginEventDTO: Codable, Sendable {
    public let pluginId: String
    public let eventType: String
    public let eventId: String
    public let timestamp: Date
    public let payload: Data

    public init(
        pluginId: String,
        eventType: String,
        eventId: String,
        timestamp: Date,
        payload: Data
    ) {
        self.pluginId = pluginId
        self.eventType = eventType
        self.eventId = eventId
        self.timestamp = timestamp
        self.payload = payload
    }

    /// 解码 payload 为指定类型
    public func decodePayload<T: Decodable>(as type: T.Type) throws -> T {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(type, from: payload)
    }
}

// MARK: - 插件命令 DTO

/// 发送给设备的插件命令
public struct PluginCommandDTO: Codable, Sendable {
    public let pluginId: String
    public let commandType: String
    public let commandId: String
    public let payload: Data?

    public init(
        pluginId: String,
        commandType: String,
        commandId: String = UUID().uuidString,
        payload: Data? = nil
    ) {
        self.pluginId = pluginId
        self.commandType = commandType
        self.commandId = commandId
        self.payload = payload
    }

    /// 便捷初始化：自动编码 Codable payload
    public init<T: Encodable>(
        pluginId: String,
        commandType: String,
        commandId: String = UUID().uuidString,
        encodable: T
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds
        self.pluginId = pluginId
        self.commandType = commandType
        self.commandId = commandId
        payload = try encoder.encode(encodable)
    }
}

// MARK: - 插件上下文

/// 后端插件上下文，提供插件可用的能力
public protocol BackendPluginContext: AnyObject, Sendable {
    /// 数据库访问
    var database: Database { get }

    /// 日志记录器
    var logger: Logger { get }

    /// 向指定设备发送插件命令
    func sendCommand(_ command: PluginCommandDTO, to deviceId: String) async

    /// 向 WebUI 广播消息
    func broadcastToWebUI(_ message: Any, deviceId: String)

    /// 获取设备信息
    func getDeviceInfo(deviceId: String) -> DeviceInfoDTO?

    /// 获取配置值
    func getConfiguration<T: Decodable>(for key: String) -> T?

    /// 存储配置值
    func setConfiguration<T: Encodable>(_ value: T, for key: String)
}

// MARK: - 后端插件协议

/// 所有 DebugHub 后端插件必须实现的协议
public protocol BackendPlugin: AnyObject, Sendable {
    /// 插件唯一 ID
    var pluginId: String { get }

    /// 插件显示名称
    var displayName: String { get }

    /// 插件版本
    var version: String { get }

    /// 插件描述
    var pluginDescription: String { get }

    /// 插件依赖的其他插件 ID
    var dependencies: [String] { get }

    /// 当前状态
    var state: BackendPluginState { get }

    /// 初始化插件
    /// 在此注册路由、初始化存储等
    /// - Parameter context: 插件上下文
    func boot(context: BackendPluginContext) async throws

    /// 注册 HTTP 路由
    /// - Parameter routes: 路由构建器
    func registerRoutes(on routes: RoutesBuilder) throws

    /// 处理来自设备的插件事件
    /// - Parameters:
    ///   - event: 插件事件
    ///   - deviceId: 来源设备 ID
    func handleEvent(_ event: PluginEventDTO, from deviceId: String) async

    /// 处理插件命令响应
    /// - Parameters:
    ///   - response: 命令响应
    ///   - deviceId: 来源设备 ID
    func handleCommandResponse(_ response: PluginCommandResponseDTO, from deviceId: String) async

    /// 停止插件
    func shutdown() async
}

// MARK: - 默认实现

public extension BackendPlugin {
    var dependencies: [String] {
        []
    }

    func handleCommandResponse(_: PluginCommandResponseDTO, from _: String) async {
        // 默认空实现
    }

    func shutdown() async {
        // 默认空实现
    }
}

// MARK: - 插件命令响应 DTO

/// 插件对命令的响应
public struct PluginCommandResponseDTO: Codable, Sendable {
    public let pluginId: String
    public let commandId: String
    public let success: Bool
    public let errorMessage: String?
    public let payload: Data?

    public init(
        pluginId: String,
        commandId: String,
        success: Bool,
        errorMessage: String? = nil,
        payload: Data? = nil
    ) {
        self.pluginId = pluginId
        self.commandId = commandId
        self.success = success
        self.errorMessage = errorMessage
        self.payload = payload
    }

    /// 解码 payload 为指定类型
    public func decodePayload<T: Decodable>(as type: T.Type) throws -> T? {
        guard let payload else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(type, from: payload)
    }
}

// MARK: - 插件信息

/// 插件元信息
public struct BackendPluginInfo: Content, Sendable {
    public let pluginId: String
    public let displayName: String
    public let version: String
    public let description: String
    public let dependencies: [String]
    public let state: String

    public init(from plugin: BackendPlugin) {
        pluginId = plugin.pluginId
        displayName = plugin.displayName
        version = plugin.version
        description = plugin.pluginDescription
        dependencies = plugin.dependencies
        state = plugin.state.rawValue
    }
}
