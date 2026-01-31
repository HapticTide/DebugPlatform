// RealtimeStreamHandler.swift
// DebugHub
//
// Created by Sun on 2025/12/02.
// Copyright © 2025 Sun. All rights reserved.
//

import Foundation
import Vapor

/// 实时流消息类型
struct RealtimeMessage: Content {
    enum MessageType: String, Codable {
        case httpEvent
        case wsEvent
        case logEvent
        case stats
        case performanceEvent
        case deviceConnected
        case deviceDisconnected
        case deviceReconnected
        case deviceInfoUpdated
        case breakpointHit
        case pluginStateChange
    }

    let type: MessageType
    let deviceId: String
    let payload: String // JSON string
}

/// 设备会话事件
struct DeviceSessionEvent: Content {
    let sessionId: String
    let deviceId: String
    let deviceName: String
    var deviceAlias: String? // 设备别名（可选）
    var appSessionId: String? // App 本次启动的会话标识（可选）
    let timestamp: Date
    var pluginStates: [String: Bool]? // 插件启用状态（可选，仅在连接/重连时携带）
}

/// 订阅者信息
struct StreamSubscriber {
    let deviceId: String?
    let types: Set<RealtimeMessage.MessageType>
    let webSocket: WebSocket
}

/// 实时流 WebSocket 处理器
final class RealtimeStreamHandler: LifecycleHandler, @unchecked Sendable {
    static let shared = RealtimeStreamHandler()

    private var subscribers: [ObjectIdentifier: StreamSubscriber] = [:]
    private let lock = NSLock()

    private init() {}

    // MARK: - LifecycleHandler

    func shutdown(_: Application) {
        lock.lock()
        let currentSubscribers = Array(subscribers.values)
        subscribers.removeAll()
        lock.unlock()

        // 非阻塞关闭所有 WebSocket 连接
        for subscriber in currentSubscribers {
            subscriber.webSocket.close(code: .goingAway, promise: nil)
        }

        print("[RealtimeStream] Shutdown complete")
    }

    // MARK: - Connection Handling

    func handleConnection(req: Request, ws: WebSocket) {
        // 解析查询参数
        let deviceId = req.query[String.self, at: "deviceId"]
        let typeParam = req.query[String.self, at: "type"] ?? "both"

        var types: Set<RealtimeMessage.MessageType> = []
        switch typeParam {
        case "network":
            types = [.httpEvent, .wsEvent]
        case "log":
            types = [.logEvent]
        case "performance":
            types = [.performanceEvent]
        case "both", "all":
            types = [.httpEvent, .wsEvent, .logEvent, .stats, .breakpointHit, .performanceEvent]
        default:
            types = [.httpEvent, .wsEvent, .logEvent, .breakpointHit, .performanceEvent]
        }

        let subscriber = StreamSubscriber(deviceId: deviceId, types: types, webSocket: ws)
        let id = ObjectIdentifier(ws)

        lock.lock()
        subscribers[id] = subscriber
        lock.unlock()

        print("[RealtimeStream] New subscriber: deviceId=\(deviceId ?? "all"), types=\(types)")

        ws.onClose.whenComplete { [weak self] _ in
            self?.lock.lock()
            self?.subscribers.removeValue(forKey: id)
            self?.lock.unlock()
            print("[RealtimeStream] Subscriber disconnected")
        }
    }

    /// 广播设备连接事件
    func broadcastDeviceConnected(
        deviceId: String,
        deviceName: String,
        sessionId: String,
        appSessionId: String? = nil,
        pluginStates: [String: Bool] = [:]
    ) {
        var event = DeviceSessionEvent(
            sessionId: sessionId,
            deviceId: deviceId,
            deviceName: deviceName,
            timestamp: Date()
        )
        event.pluginStates = pluginStates
        event.appSessionId = appSessionId

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(event),
            let payload = String(data: payloadData, encoding: .utf8) else {
            return
        }

        let message = RealtimeMessage(type: .deviceConnected, deviceId: deviceId, payload: payload)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted device connected: \(deviceName)")
    }

    /// 广播设备断开事件
    func broadcastDeviceDisconnected(deviceId: String) {
        let event = DeviceSessionEvent(
            sessionId: "",
            deviceId: deviceId,
            deviceName: "",
            timestamp: Date()
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(event),
            let payload = String(data: payloadData, encoding: .utf8) else {
            return
        }

        let message = RealtimeMessage(type: .deviceDisconnected, deviceId: deviceId, payload: payload)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted device disconnected: \(deviceId)")
    }

    /// 广播设备重连事件
    func broadcastDeviceReconnected(deviceId: String, deviceName: String, sessionId: String, appSessionId: String? = nil) {
        var event = DeviceSessionEvent(
            sessionId: sessionId,
            deviceId: deviceId,
            deviceName: deviceName,
            timestamp: Date()
        )
        event.appSessionId = appSessionId

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(event),
            let payload = String(data: payloadData, encoding: .utf8) else {
            return
        }

        let message = RealtimeMessage(type: .deviceReconnected, deviceId: deviceId, payload: payload)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted device reconnected: \(deviceName)")
    }

    /// 广播设备信息更新事件（如设备别名变更）
    func broadcastDeviceInfoUpdated(deviceId: String, deviceName: String, deviceAlias: String?) {
        var event = DeviceSessionEvent(
            sessionId: "",
            deviceId: deviceId,
            deviceName: deviceName,
            timestamp: Date()
        )
        event.deviceAlias = deviceAlias

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(event),
            let payload = String(data: payloadData, encoding: .utf8) else {
            return
        }

        let message = RealtimeMessage(type: .deviceInfoUpdated, deviceId: deviceId, payload: payload)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted device info updated: \(deviceAlias ?? deviceName)")
    }

    /// 广播断点命中事件
    func broadcastBreakpointHit(_ hit: BreakpointHitDTO, deviceId: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(hit),
            let payload = String(data: payloadData, encoding: .utf8) else {
            return
        }

        let message = RealtimeMessage(type: .breakpointHit, deviceId: deviceId, payload: payload)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted breakpoint hit: requestId=\(hit.requestId)")
    }

    /// 广播单个消息给所有相关订阅者
    private func broadcastMessage(_ message: RealtimeMessage) {
        lock.lock()
        let currentSubscribers = Array(subscribers.values)
        lock.unlock()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        for subscriber in currentSubscribers {
            // 检查设备过滤
            if let subscriberDeviceId = subscriber.deviceId, subscriberDeviceId != message.deviceId {
                continue
            }

            // 发送消息
            do {
                let data = try encoder.encode(message)
                if let text = String(data: data, encoding: .utf8) {
                    subscriber.webSocket.send(text)
                }
            } catch {
                print("[RealtimeStream] Failed to send message: \(error)")
            }
        }
    }

    func broadcast(events: [DebugEventDTO], deviceId: String, seqNumMap: [String: Int64] = [:]) {
        lock.lock()
        let currentSubscribers = Array(subscribers.values)
        lock.unlock()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        // 统计事件类型
        var httpCount = 0, wsCount = 0, logCount = 0, statsCount = 0, perfCount = 0
        for event in events {
            switch event {
            case .http: httpCount += 1
            case .webSocket: wsCount += 1
            case .log: logCount += 1
            case .stats: statsCount += 1
            case .performance: perfCount += 1
            }
        }
        if wsCount > 0 || perfCount > 0 {
            print(
                "[RealtimeStream] Broadcasting events: http=\(httpCount), ws=\(wsCount), log=\(logCount), stats=\(statsCount), perf=\(perfCount), subscribers=\(currentSubscribers.count)"
            )
        }

        for event in events {
            let messageType: RealtimeMessage.MessageType
            var payloadJSON: String

            do {
                switch event {
                case let .http(httpEvent):
                    messageType = .httpEvent
                    // 添加序号到 payload
                    var dict = try JSONSerialization
                        .jsonObject(with: encoder.encode(httpEvent)) as? [String: Any] ?? [:]
                    if let seqNum = seqNumMap[httpEvent.request.id] {
                        dict["seqNum"] = seqNum
                    }
                    let enrichedData = try JSONSerialization.data(withJSONObject: dict)
                    payloadJSON = String(data: enrichedData, encoding: .utf8) ?? "{}"

                case let .webSocket(wsEvent):
                    messageType = .wsEvent
                    // 对于 frame 事件添加序号
                    var dict = try JSONSerialization.jsonObject(with: encoder.encode(wsEvent)) as? [String: Any] ?? [:]
                    if case let .frame(frame) = wsEvent.kind, let seqNum = seqNumMap[frame.id] {
                        // Swift Codable 将无标签关联值编码为 _0，所以结构是 kind.frame._0
                        if
                            var kind = dict["kind"] as? [String: Any],
                            var frameWrapper = kind["frame"] as? [String: Any],
                            var frameDict = frameWrapper["_0"] as? [String: Any] {
                            frameDict["seqNum"] = seqNum
                            frameWrapper["_0"] = frameDict
                            kind["frame"] = frameWrapper
                            dict["kind"] = kind
                        }
                    }
                    let enrichedData = try JSONSerialization.data(withJSONObject: dict)
                    payloadJSON = String(data: enrichedData, encoding: .utf8) ?? "{}"
                    print("[RealtimeStream] WS event payload: \(payloadJSON.prefix(200))...")

                case let .log(logEvent):
                    messageType = .logEvent
                    // 添加序号到 payload
                    var dict = try JSONSerialization.jsonObject(with: encoder.encode(logEvent)) as? [String: Any] ?? [:]
                    if let seqNum = seqNumMap[logEvent.id] {
                        dict["seqNum"] = seqNum
                    }
                    let enrichedData = try JSONSerialization.data(withJSONObject: dict)
                    payloadJSON = String(data: enrichedData, encoding: .utf8) ?? "{}"

                case let .stats(statsEvent):
                    messageType = .stats
                    payloadJSON = try String(data: encoder.encode(statsEvent), encoding: .utf8) ?? "{}"

                case let .performance(perfEvent):
                    messageType = .performanceEvent
                    payloadJSON = try String(data: encoder.encode(perfEvent), encoding: .utf8) ?? "{}"
                }
            } catch {
                print("[RealtimeStream] Failed to encode event: \(error)")
                continue
            }

            let message = RealtimeMessage(type: messageType, deviceId: deviceId, payload: payloadJSON)

            for subscriber in currentSubscribers {
                // 检查设备过滤
                if let subscriberDeviceId = subscriber.deviceId, subscriberDeviceId != deviceId {
                    continue
                }

                // 检查类型过滤
                guard subscriber.types.contains(messageType) else {
                    continue
                }

                // 发送消息（使用文本格式以兼容浏览器 WebSocket）
                do {
                    let data = try encoder.encode(message)
                    if let text = String(data: data, encoding: .utf8) {
                        subscriber.webSocket.send(text)
                    }
                } catch {
                    print("[RealtimeStream] Failed to send message: \(error)")
                }
            }
        }
    }

    // MARK: - Plugin Support

    /// 广播原始 JSON 数据给所有订阅者
    /// 用于插件系统发送自定义消息
    /// - Parameters:
    ///   - json: JSON 字符串
    ///   - deviceId: 可选的设备 ID 过滤
    func broadcastRaw(_ json: String, deviceId: String? = nil) {
        lock.lock()
        let currentSubscribers = Array(subscribers.values)
        lock.unlock()

        for subscriber in currentSubscribers {
            // 检查设备过滤
            if
                let targetDeviceId = deviceId,
                let subscriberDeviceId = subscriber.deviceId,
                subscriberDeviceId != targetDeviceId {
                continue
            }

            subscriber.webSocket.send(json)
        }
    }

    /// 广播插件事件给所有相关订阅者
    /// - Parameters:
    ///   - event: 插件事件 DTO
    ///   - deviceId: 设备 ID
    func broadcastPluginEvent(_ event: PluginEventDTO, deviceId: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(event),
            let payload = String(data: payloadData, encoding: .utf8) else {
            print("[RealtimeStream] Failed to encode plugin event")
            return
        }

        // 包装为统一消息格式
        let wrapper: [String: Any] = [
            "type": "pluginEvent",
            "deviceId": deviceId,
            "payload": payload,
        ]

        guard
            let wrapperData = try? JSONSerialization.data(withJSONObject: wrapper),
            let json = String(data: wrapperData, encoding: .utf8) else {
            print("[RealtimeStream] Failed to wrap plugin event")
            return
        }

        broadcastRaw(json, deviceId: deviceId)
    }

    /// 广播插件状态变化事件
    /// - Parameters:
    ///   - pluginId: 插件 ID
    ///   - isEnabled: 是否启用
    ///   - deviceId: 设备 ID
    func broadcastPluginStateChange(pluginId: String, isEnabled: Bool, deviceId: String) {
        let payload: [String: Any] = [
            "pluginId": pluginId,
            "isEnabled": isEnabled,
        ]

        guard
            let payloadData = try? JSONSerialization.data(withJSONObject: payload),
            let payloadString = String(data: payloadData, encoding: .utf8) else {
            print("[RealtimeStream] Failed to encode plugin state change")
            return
        }

        let message = RealtimeMessage(type: .pluginStateChange, deviceId: deviceId, payload: payloadString)
        broadcastMessage(message)
        print("[RealtimeStream] Broadcasted plugin state change: \(pluginId) -> \(isEnabled)")
    }

    /// 广播服务器统计数据更新
    /// - Parameter stats: 服务器统计数据
    func broadcastServerStats(_ stats: some Encodable) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds

        guard
            let payloadData = try? encoder.encode(stats),
            let payloadString = String(data: payloadData, encoding: .utf8) else {
            print("[RealtimeStream] Failed to encode server stats")
            return
        }

        // 服务器 stats 使用空 deviceId（全局广播）
        let message = RealtimeMessage(type: .stats, deviceId: "", payload: payloadString)
        broadcastMessage(message)
    }
}
