// EventDTOs.swift
// DebugHub
//
// Created by Sun on 2025/12/02.
// Copyright © 2025 Sun. All rights reserved.
//

import Foundation
import Vapor

// MARK: - Debug Event DTO

enum DebugEventDTO: Codable {
    case http(HTTPEventDTO)
    case webSocket(WSEventDTO)
    case log(LogEventDTO)
    case stats(StatsEventDTO)
    case performance(PerformanceEventDTO)
}

// MARK: - HTTP Event DTO

struct HTTPEventDTO: Content {
    struct ErrorInfo: Codable {
        let domain: String?
        let code: Int?
        let category: String?
        let isNetworkError: Bool?
        let message: String?
    }

    struct Request: Codable {
        let id: String
        let method: String
        let url: String
        let queryItems: [String: String]
        let headers: [String: String]
        let body: Data?
        let startTime: Date
        let traceId: String?
    }

    struct Response: Codable {
        let statusCode: Int
        let headers: [String: String]
        let body: Data?
        let endTime: Date
        let duration: TimeInterval
        let errorDescription: String?
        let error: ErrorInfo?
    }

    /// 性能时间线 DTO
    struct Timing: Codable {
        let dnsLookup: TimeInterval?
        let tcpConnection: TimeInterval?
        let tlsHandshake: TimeInterval?
        let timeToFirstByte: TimeInterval?
        let contentDownload: TimeInterval?
        let connectionReused: Bool?
        let protocolName: String?
        let localAddress: String?
        let remoteAddress: String?
        let requestBodyBytesSent: Int64?
        let responseBodyBytesReceived: Int64?
    }

    let request: Request
    let response: Response?
    let timing: Timing?
    let isMocked: Bool
    let mockRuleId: String?
    let isReplay: Bool?
    let redirectFromId: String?
    let redirectToUrl: String?
}

// MARK: - WebSocket Event DTO

struct WSEventDTO: Content {
    struct Session: Codable {
        let id: String
        let url: String
        let requestHeaders: [String: String]
        let subprotocols: [String]
        let connectTime: Date
        let disconnectTime: Date?
        let closeCode: Int?
        let closeReason: String?
    }

    struct Frame: Codable {
        let id: String
        let sessionId: String
        let sessionUrl: String? // 会话 URL，用于在 session 被删除后恢复
        let direction: String
        let opcode: String
        let payload: Data
        let payloadPreview: String?
        let payloadSize: Int? // Optional - iOS SDK doesn't send this
        let timestamp: Date
        let isMocked: Bool
        let mockRuleId: String?

        /// Computed payload size for when payloadSize is not provided
        var effectivePayloadSize: Int {
            payloadSize ?? payload.count
        }
    }

    enum Kind: Codable {
        case sessionCreated(Session)
        case sessionClosed(Session)
        case frame(Frame)
    }

    let kind: Kind
}

// MARK: - Log Event DTO

struct LogEventDTO: Content {
    let id: String
    let source: String
    let timestamp: Date
    let level: String
    let subsystem: String?
    let category: String?
    let loggerName: String?
    let thread: String?
    let file: String?
    let function: String?
    let line: Int?
    let message: String
    let tags: [String]
    let traceId: String?
}

// MARK: - Stats Event DTO

struct StatsEventDTO: Content {
    let id: String
    let timestamp: Date
    let httpRequestCount: Int
    let httpErrorCount: Int
    let wsMessageCount: Int
    let logCount: Int
    let memoryUsage: UInt64
    let cpuUsage: Double
}

// MARK: - Mock Rule DTO

struct MockRuleDTO: Content {
    struct Condition: Codable {
        var urlPattern: String?
        var method: String?
        var statusCode: Int?
        var headerContains: [String: String]?
        var bodyContains: String?
        var wsPayloadContains: String?
        var enabled: Bool?
    }

    struct Action: Codable {
        var modifyRequestHeaders: [String: String]?
        var modifyRequestBody: Data?
        var mockResponseStatusCode: Int?
        var mockResponseHeaders: [String: String]?
        var mockResponseBody: Data?
        var mockWebSocketPayload: Data?
        var delayMilliseconds: Int?
    }

    var id: String? // 创建时为 nil，由服务器生成
    var name: String
    var targetType: String
    var condition: Condition
    var action: Action
    var priority: Int
    var enabled: Bool
}

// MARK: - Performance Event DTO

/// 性能事件 DTO（用于从客户端接收）
struct PerformanceEventDTO: Content {
    let id: String
    let eventType: String
    let timestamp: Date
    let metrics: [PerfMetricsItemDTO]?
    let jank: PerfJankEventDTO?
    let alert: PerfAlertEventDTO?
    let appLaunch: PerfAppLaunchDTO?
    let pageTiming: PerfPageTimingDTO?
}

/// 性能指标 DTO（仅用于事件传输）
struct PerfMetricsItemDTO: Codable {
    let timestamp: Date
    let cpu: PerfCPUMetricsDTO?
    let memory: PerfMemoryMetricsDTO?
    let fps: PerfFPSMetricsDTO?
    let network: PerfNetworkTrafficDTO?
    let diskIO: PerfDiskIODTO?
}

struct PerfCPUMetricsDTO: Codable {
    let usage: Double
    let userTime: Double
    let systemTime: Double
    let threadCount: Int
}

struct PerfMemoryMetricsDTO: Codable {
    let usedMemory: UInt64
    let peakMemory: UInt64
    let freeMemory: UInt64
    let memoryPressure: String
    let footprintRatio: Double
}

struct PerfFPSMetricsDTO: Codable {
    let fps: Double
    let droppedFrames: Int
    let jankCount: Int
    let averageRenderTime: Double
}

struct PerfNetworkTrafficDTO: Codable {
    let bytesReceived: UInt64
    let bytesSent: UInt64
    let receivedRate: Double
    let sentRate: Double
}

struct PerfDiskIODTO: Codable {
    let readBytes: UInt64
    let writeBytes: UInt64
    let readOps: UInt64
    let writeOps: UInt64
    let readRate: Double
    let writeRate: Double
}

struct PerfJankEventDTO: Codable {
    let id: String
    let timestamp: Date
    let duration: Double
    let droppedFrames: Int
    let stackTrace: String?
}

struct PerfAlertEventDTO: Codable {
    let id: String
    let ruleId: String
    let metricType: String
    let severity: String
    let message: String
    let currentValue: Double
    let threshold: Double
    let timestamp: Date
    let isResolved: Bool
    let resolvedAt: Date?
}

struct PerfAppLaunchDTO: Codable {
    /// 总启动时间（毫秒）
    let totalTime: Double
    /// PreMain 阶段耗时（毫秒）：processStart -> mainExecuted
    let preMainTime: Double?
    /// Main 到 Launch 阶段耗时（毫秒）：mainExecuted -> didFinishLaunching
    let mainToLaunchTime: Double?
    /// Launch 到首帧阶段耗时（毫秒）：didFinishLaunching -> firstFrameRendered
    let launchToFirstFrameTime: Double?
    /// 记录时间戳
    let timestamp: Date
    /// PreMain 细分详情（可选）
    /// 使用 PerformanceBackendPlugin 中定义的 PreMainDetailsDTO
    let preMainDetails: PreMainDetailsDTO?
}

// MARK: - Page Timing Event DTO

/// 页面耗时事件 DTO（用于从客户端接收）
struct PerfPageTimingDTO: Codable {
    let eventId: String
    let visitId: String
    let pageId: String
    let pageName: String
    let route: String?
    let startAt: Date
    let firstLayoutAt: Date?
    let appearAt: Date?
    let endAt: Date?
    let loadDuration: Double?
    let appearDuration: Double?
    let totalDuration: Double?
    let markers: [PerfPageTimingMarkerDTO]?
    let appVersion: String?
    let appBuild: String?
    let osVersion: String?
    let deviceModel: String?
    let isColdStart: Bool
    let isPush: Bool?
    let parentPageId: String?
}

/// 页面耗时标记点 DTO
struct PerfPageTimingMarkerDTO: Codable {
    let name: String
    let timestamp: Date
    let deltaMs: Double?
}

/// 页面耗时事件响应 DTO（用于 API 响应）
struct PageTimingEventDTO: Content {
    let eventId: String
    let visitId: String
    let pageId: String
    let pageName: String
    let route: String?
    let startAt: Date
    let firstLayoutAt: Date?
    let appearAt: Date?
    let endAt: Date?
    let loadDuration: Double?
    let appearDuration: Double?
    let totalDuration: Double?
    let markers: [PageTimingMarkerDTO]
    let appVersion: String?
    let appBuild: String?
    let osVersion: String?
    let deviceModel: String?
    let isColdStart: Bool
    let isPush: Bool?
    let parentPageId: String?
}

/// 页面耗时标记点响应 DTO
struct PageTimingMarkerDTO: Codable {
    let name: String
    let timestamp: Date
    let deltaMs: Double?
}

/// 页面耗时列表响应 DTO
struct PageTimingListDTO: Content {
    let items: [PageTimingEventDTO]
    let total: Int
    let page: Int
    let pageSize: Int
}

/// 页面耗时聚合统计 DTO
struct PageTimingSummaryDTO: Content {
    let pageId: String
    let pageName: String
    let count: Int
    let avgAppearDuration: Double?
    let avgLoadDuration: Double?
    let p50AppearDuration: Double?
    let p90AppearDuration: Double?
    let p95AppearDuration: Double?
    let maxAppearDuration: Double?
    let minAppearDuration: Double?
    let errorRate: Double
}

/// 页面耗时聚合列表响应 DTO
struct PageTimingSummaryListDTO: Content {
    let items: [PageTimingSummaryDTO]
    let totalPages: Int
}
