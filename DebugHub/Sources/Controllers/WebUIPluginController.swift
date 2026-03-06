//
//  WebUIPluginController.swift
//  DebugHub
//
//  Created by Sun on 2025/12/13.
//  管理 WebUI 插件启用状态，并同步给连接的设备

import Vapor

// MARK: - WebUI 插件状态 DTO

/// WebUI 插件启用状态
struct WebUIPluginStateDTO: Content {
    /// 插件 ID
    let pluginId: String
    /// 插件显示名称
    let displayName: String
    /// 是否启用
    let isEnabled: Bool
}

/// WebUI 插件状态列表响应
struct WebUIPluginStatesDTO: Content {
    let plugins: [WebUIPluginStateDTO]
}

/// 更新插件状态请求
struct UpdatePluginStateRequest: Content {
    /// 插件状态列表
    let plugins: [WebUIPluginStateDTO]
}

// MARK: - WebUIPluginStateManager

/// 管理 WebUI 插件状态的单例
final class WebUIPluginStateManager: Sendable {
    static let shared = WebUIPluginStateManager()

    /// 使用 actor 来保证线程安全
    private actor StateStorage {
        var pluginStates: [String: WebUIPluginStateDTO] = [:]

        func update(_ states: [WebUIPluginStateDTO]) {
            for state in states {
                pluginStates[state.pluginId] = state
            }
        }

        func getAll() -> [WebUIPluginStateDTO] {
            Array(pluginStates.values).sorted { $0.pluginId < $1.pluginId }
        }

        func get(_ pluginId: String) -> WebUIPluginStateDTO? {
            pluginStates[pluginId]
        }
    }

    private let storage = StateStorage()

    private init() {}

    /// 更新插件状态
    func updateStates(_ states: [WebUIPluginStateDTO]) async {
        await storage.update(states)
    }

    /// 获取所有插件状态
    func getAllStates() async -> [WebUIPluginStateDTO] {
        await storage.getAll()
    }

    /// 获取单个插件状态
    func getState(for pluginId: String) async -> WebUIPluginStateDTO? {
        await storage.get(pluginId)
    }
}

// MARK: - WebUIPluginController

struct WebUIPluginController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let plugins = routes.grouped("webui-plugins")

        // GET /webui-plugins - 获取所有 WebUI 插件状态
        plugins.get(use: getPluginStates)

        // POST /webui-plugins - 更新 WebUI 插件状态（由 WebUI 调用）
        plugins.post(use: updatePluginStates)

        // GET /webui-plugins/:pluginId - 获取单个插件状态
        plugins.get(":pluginId", use: getPluginState)
    }

    // MARK: - Get All Plugin States

    func getPluginStates(req _: Request) async throws -> WebUIPluginStatesDTO {
        let states = await WebUIPluginStateManager.shared.getAllStates()
        return WebUIPluginStatesDTO(plugins: states)
    }

    // MARK: - Update Plugin States

    func updatePluginStates(req: Request) async throws -> HTTPStatus {
        let request = try req.content.decode(UpdatePluginStateRequest.self)
        await WebUIPluginStateManager.shared.updateStates(request.plugins)

        // 广播插件状态变化给所有连接的设备
        broadcastPluginStates(states: request.plugins)

        return .ok
    }

    // MARK: - Get Single Plugin State

    func getPluginState(req: Request) async throws -> WebUIPluginStateDTO {
        guard let pluginId = req.parameters.get("pluginId") else {
            throw Abort(.badRequest, reason: "Missing pluginId parameter")
        }

        guard let state = await WebUIPluginStateManager.shared.getState(for: pluginId) else {
            throw Abort(.notFound, reason: "Plugin not found: \(pluginId)")
        }

        return state
    }

    // MARK: - Broadcast to Devices

    /// 通过 WebSocket 广播插件状态给所有连接的设备
    /// 使用 pluginCommand 消息类型来传输
    private func broadcastPluginStates(states: [WebUIPluginStateDTO]) {
        // 构造 PluginCommandDTO 来传输 WebUI 插件状态
        // 使用 pluginId: "system", commandType: "webui_plugin_state"
        let payload: [String: Any] = [
            "plugins": states.map { state in
                [
                    "pluginId": state.pluginId,
                    "displayName": state.displayName,
                    "isEnabled": state.isEnabled,
                ]
            },
        ]

        // 将 payload 转为 Data
        guard let payloadData = try? JSONSerialization.data(withJSONObject: payload) else {
            print("[WebUIPluginController] Failed to serialize plugin states")
            return
        }

        // 使用 PluginCommandDTO 传输
        let command = PluginCommandDTO(
            pluginId: "system",
            commandType: "webui_plugin_state",
            payload: payloadData
        )

        let message = BridgeMessageDTO.pluginCommand(command)
        DeviceRegistry.shared.broadcast(message: message)
        print("[WebUIPluginController] Broadcasted WebUI plugin states to all devices: \(states.count) plugins")
    }
}
