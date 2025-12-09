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
}

// MARK: - HTTP Event DTO

struct HTTPEventDTO: Content {
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

    let id: String
    var name: String
    var targetType: String
    var condition: Condition
    var action: Action
    var priority: Int
    var enabled: Bool
}
