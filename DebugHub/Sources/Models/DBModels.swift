// DBModels.swift
// DebugHub
//
// Created by Sun on 2025/12/02.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

// MARK: - HTTP Event Model

final class HTTPEventModel: Model, Content, @unchecked Sendable {
    static let schema = "http_events"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String

    @Field(key: "method")
    var method: String

    @Field(key: "url")
    var url: String

    @Field(key: "query_items")
    var queryItems: String // JSON

    @Field(key: "request_headers")
    var requestHeaders: String // JSON

    @Field(key: "request_body")
    var requestBody: Data?

    @Field(key: "status_code")
    var statusCode: Int?

    @Field(key: "response_headers")
    var responseHeaders: String? // JSON

    @Field(key: "response_body")
    var responseBody: Data?

    @Field(key: "body_params")
    var bodyParams: String? // JSON flattened key-value pairs

    @Field(key: "start_time")
    var startTime: Date

    @Field(key: "end_time")
    var endTime: Date?

    @Field(key: "duration")
    var duration: Double?

    @Field(key: "error_description")
    var errorDescription: String?

    @Field(key: "error_domain")
    var errorDomain: String?

    @Field(key: "error_code")
    var errorCode: Int?

    @Field(key: "error_category")
    var errorCategory: String?

    @Field(key: "is_network_error")
    var isNetworkError: Bool?

    @Field(key: "is_mocked")
    var isMocked: Bool

    @Field(key: "mock_rule_id")
    var mockRuleId: String?

    @Field(key: "trace_id")
    var traceId: String?

    @Field(key: "timing_json")
    var timingJSON: String? // JSON encoded timing data

    @Field(key: "redirect_from_id")
    var redirectFromId: String?

    @Field(key: "redirect_to_url")
    var redirectToUrl: String?

    @Field(key: "is_favorite")
    var isFavorite: Bool

    @Field(key: "is_replay")
    var isReplay: Bool

    @Field(key: "seq_num")
    var seqNum: Int64

    init() {
        // Fluent 需要一个空的初始化器
        // 非 Optional Bool 类型需要默认值
        // 注意：这些值会被 Fluent 从数据库读取的值覆盖
    }

    init(
        id: String,
        deviceId: String,
        method: String,
        url: String,
        queryItems: String,
        requestHeaders: String,
        requestBody: Data?,
        statusCode: Int?,
        responseHeaders: String?,
        responseBody: Data?,
        bodyParams: String? = nil,
        startTime: Date,
        endTime: Date?,
        duration: Double?,
        errorDescription: String?,
        errorDomain: String? = nil,
        errorCode: Int? = nil,
        errorCategory: String? = nil,
        isNetworkError: Bool? = nil,
        isMocked: Bool,
        mockRuleId: String?,
        traceId: String?,
        timingJSON: String? = nil,
        redirectFromId: String? = nil,
        redirectToUrl: String? = nil,
        isFavorite: Bool = false,
        isReplay: Bool = false,
        seqNum: Int64 = 0
    ) {
        self.id = id
        self.deviceId = deviceId
        self.method = method
        self.url = url
        self.queryItems = queryItems
        self.requestHeaders = requestHeaders
        self.requestBody = requestBody
        self.statusCode = statusCode
        self.responseHeaders = responseHeaders
        self.responseBody = responseBody
        self.bodyParams = bodyParams
        self.startTime = startTime
        self.endTime = endTime
        self.duration = duration
        self.errorDescription = errorDescription
        self.errorDomain = errorDomain
        self.errorCode = errorCode
        self.errorCategory = errorCategory
        self.isNetworkError = isNetworkError
        self.isMocked = isMocked
        self.mockRuleId = mockRuleId
        self.traceId = traceId
        self.timingJSON = timingJSON
        self.redirectFromId = redirectFromId
        self.redirectToUrl = redirectToUrl
        self.isFavorite = isFavorite
        self.isReplay = isReplay
        self.seqNum = seqNum
    }
}

// MARK: - HTTP Event Param Model

final class HTTPEventParamModel: Model, Content, @unchecked Sendable {
    static let schema = "http_event_params"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "event_id")
    var eventId: String

    @Field(key: "param_key")
    var paramKey: String

    @Field(key: "param_value")
    var paramValue: String

    // 可选：param_type (query, body_form, body_json, header)
    // 这里先只存 key-value，如果需要更细粒度可以扩展

    init() {}

    init(id: String? = nil, eventId: String, paramKey: String, paramValue: String) {
        self.id = id
        self.eventId = eventId
        self.paramKey = paramKey
        self.paramValue = paramValue
    }
}

// MARK: - Traffic Rule Model

enum TrafficRuleMatchType: String, Codable {
    case domain // 域名匹配 (legacy)
    case urlRegex // URL 正则
    case header // Header 匹配
}

enum TrafficRuleAction: String, Codable {
    case highlight // 高亮 (原白名单)
    case hide // 隐藏 (原黑名单)
    case mark // 染色 (颜色标记)
}

final class TrafficRuleModel: Model, Content, @unchecked Sendable {
    static let schema = "traffic_rules"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String?

    @Field(key: "name")
    var name: String

    @Enum(key: "match_type")
    var matchType: TrafficRuleMatchType

    @Field(key: "match_value")
    var matchValue: String // domain string, regex string, or "HeaderName:HeaderValue"

    @Enum(key: "action")
    var action: TrafficRuleAction

    @Field(key: "color")
    var color: String? // hex color for highlight/mark

    @Field(key: "is_enabled")
    var isEnabled: Bool

    @Field(key: "priority")
    var priority: Int

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() {}

    init(
        id: String? = nil,
        deviceId: String? = nil,
        name: String,
        matchType: TrafficRuleMatchType,
        matchValue: String,
        action: TrafficRuleAction,
        color: String? = nil,
        isEnabled: Bool = true,
        priority: Int = 0
    ) {
        self.id = id
        self.deviceId = deviceId
        self.name = name
        self.matchType = matchType
        self.matchValue = matchValue
        self.action = action
        self.color = color
        self.isEnabled = isEnabled
        self.priority = priority
    }
}

// MARK: - Domain Policy Model

enum DomainPolicyStatus: String, Codable {
    case whitelist
    case blacklist
}

final class DomainPolicyModel: Model, Content, @unchecked Sendable {
    static let schema = "domain_policies"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String? // Optional, nil means global

    @Field(key: "domain")
    var domain: String

    @Enum(key: "status")
    var status: DomainPolicyStatus

    @Field(key: "note")
    var note: String?

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() {}

    init(
        id: String? = nil,
        deviceId: String? = nil,
        domain: String,
        status: DomainPolicyStatus,
        note: String? = nil
    ) {
        self.id = id
        self.deviceId = deviceId
        self.domain = domain
        self.status = status
        self.note = note
    }
}

// MARK: - WebSocket Session Model

final class WSSessionModel: Model, Content, @unchecked Sendable {
    static let schema = "ws_sessions"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String

    @Field(key: "url")
    var url: String

    @Field(key: "request_headers")
    var requestHeaders: String // JSON

    @Field(key: "subprotocols")
    var subprotocols: String // JSON

    @Field(key: "connect_time")
    var connectTime: Date

    @Field(key: "disconnect_time")
    var disconnectTime: Date?

    @Field(key: "close_code")
    var closeCode: Int?

    @Field(key: "close_reason")
    var closeReason: String?

    init() {}

    init(
        id: String,
        deviceId: String,
        url: String,
        requestHeaders: String,
        subprotocols: String,
        connectTime: Date,
        disconnectTime: Date?,
        closeCode: Int?,
        closeReason: String?
    ) {
        self.id = id
        self.deviceId = deviceId
        self.url = url
        self.requestHeaders = requestHeaders
        self.subprotocols = subprotocols
        self.connectTime = connectTime
        self.disconnectTime = disconnectTime
        self.closeCode = closeCode
        self.closeReason = closeReason
    }
}

// MARK: - WebSocket Frame Model

final class WSFrameModel: Model, Content, @unchecked Sendable {
    static let schema = "ws_frames"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String

    @Field(key: "session_id")
    var sessionId: String

    @Field(key: "direction")
    var direction: String

    @Field(key: "opcode")
    var opcode: String

    @Field(key: "payload")
    var payload: Data

    @Field(key: "payload_preview")
    var payloadPreview: String?

    @Field(key: "timestamp")
    var timestamp: Date

    @Field(key: "is_mocked")
    var isMocked: Bool

    @Field(key: "mock_rule_id")
    var mockRuleId: String?

    @Field(key: "seq_num")
    var seqNum: Int64

    init() {}

    init(
        id: String,
        deviceId: String,
        sessionId: String,
        direction: String,
        opcode: String,
        payload: Data,
        payloadPreview: String?,
        timestamp: Date,
        isMocked: Bool,
        mockRuleId: String?,
        seqNum: Int64 = 0
    ) {
        self.id = id
        self.deviceId = deviceId
        self.sessionId = sessionId
        self.direction = direction
        self.opcode = opcode
        self.payload = payload
        self.payloadPreview = payloadPreview
        self.timestamp = timestamp
        self.isMocked = isMocked
        self.mockRuleId = mockRuleId
        self.seqNum = seqNum
    }
}

// MARK: - Log Event Model

final class LogEventModel: Model, Content, @unchecked Sendable {
    static let schema = "log_events"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String

    @Field(key: "source")
    var source: String

    @Field(key: "timestamp")
    var timestamp: Date

    @Field(key: "level")
    var level: String

    @Field(key: "subsystem")
    var subsystem: String?

    @Field(key: "category")
    var category: String?

    @Field(key: "logger_name")
    var loggerName: String?

    @Field(key: "thread")
    var thread: String?

    @Field(key: "file")
    var file: String?

    @Field(key: "function")
    var function: String?

    @Field(key: "line")
    var line: Int?

    @Field(key: "message")
    var message: String

    @Field(key: "tags")
    var tags: String // JSON

    @Field(key: "trace_id")
    var traceId: String?

    @Field(key: "seq_num")
    var seqNum: Int64

    init() {}

    init(
        id: String,
        deviceId: String,
        source: String,
        timestamp: Date,
        level: String,
        subsystem: String?,
        category: String?,
        loggerName: String?,
        thread: String?,
        file: String?,
        function: String?,
        line: Int?,
        message: String,
        tags: String,
        traceId: String?,
        seqNum: Int64 = 0
    ) {
        self.id = id
        self.deviceId = deviceId
        self.source = source
        self.timestamp = timestamp
        self.level = level
        self.subsystem = subsystem
        self.category = category
        self.loggerName = loggerName
        self.thread = thread
        self.file = file
        self.function = function
        self.line = line
        self.message = message
        self.tags = tags
        self.traceId = traceId
        self.seqNum = seqNum
    }
}

// MARK: - Mock Rule Model

final class MockRuleModel: Model, Content, @unchecked Sendable {
    static let schema = "mock_rules"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String?

    @Field(key: "name")
    var name: String

    @Field(key: "target_type")
    var targetType: String

    @Field(key: "condition_json")
    var conditionJSON: String

    @Field(key: "action_json")
    var actionJSON: String

    @Field(key: "priority")
    var priority: Int

    @Field(key: "enabled")
    var enabled: Bool

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() {}

    init(
        id: String,
        deviceId: String?,
        name: String,
        targetType: String,
        conditionJSON: String,
        actionJSON: String,
        priority: Int,
        enabled: Bool
    ) {
        self.id = id
        self.deviceId = deviceId
        self.name = name
        self.targetType = targetType
        self.conditionJSON = conditionJSON
        self.actionJSON = actionJSON
        self.priority = priority
        self.enabled = enabled
    }

    func toDTO() -> MockRuleDTO {
        let decoder = JSONDecoder()
        let condition = (try? decoder.decode(MockRuleDTO.Condition.self, from: Data(conditionJSON.utf8)))
            ?? MockRuleDTO.Condition()
        let action = (try? decoder.decode(MockRuleDTO.Action.self, from: Data(actionJSON.utf8)))
            ?? MockRuleDTO.Action()

        return MockRuleDTO(
            id: id!,
            name: name,
            targetType: targetType,
            condition: condition,
            action: action,
            priority: priority,
            enabled: enabled
        )
    }
}

// MARK: - Page Timing Event Model

/// 页面耗时事件数据库模型
final class PageTimingEventModel: Model, Content, @unchecked Sendable {
    static let schema = "page_timing_events"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    @Field(key: "device_id")
    var deviceId: String

    @Field(key: "visit_id")
    var visitId: String

    @Field(key: "page_id")
    var pageId: String

    @Field(key: "page_name")
    var pageName: String

    @Field(key: "route")
    var route: String?

    @Field(key: "start_at")
    var startAt: Date

    @Field(key: "first_layout_at")
    var firstLayoutAt: Date?

    @Field(key: "appear_at")
    var appearAt: Date?

    @Field(key: "end_at")
    var endAt: Date?

    @Field(key: "load_duration")
    var loadDuration: Double?

    @Field(key: "appear_duration")
    var appearDuration: Double?

    @Field(key: "total_duration")
    var totalDuration: Double?

    @Field(key: "markers_json")
    var markersJSON: String?

    @Field(key: "app_version")
    var appVersion: String?

    @Field(key: "app_build")
    var appBuild: String?

    @Field(key: "os_version")
    var osVersion: String?

    @Field(key: "device_model")
    var deviceModel: String?

    @Field(key: "is_cold_start")
    var isColdStart: Bool

    @Field(key: "is_push")
    var isPush: Bool?

    @Field(key: "parent_page_id")
    var parentPageId: String?

    @Field(key: "seq_num")
    var seqNum: Int64

    init() {}

    init(
        id: String,
        deviceId: String,
        visitId: String,
        pageId: String,
        pageName: String,
        route: String? = nil,
        startAt: Date,
        firstLayoutAt: Date? = nil,
        appearAt: Date? = nil,
        endAt: Date? = nil,
        loadDuration: Double? = nil,
        appearDuration: Double? = nil,
        totalDuration: Double? = nil,
        markersJSON: String? = nil,
        appVersion: String? = nil,
        appBuild: String? = nil,
        osVersion: String? = nil,
        deviceModel: String? = nil,
        isColdStart: Bool = false,
        isPush: Bool? = nil,
        parentPageId: String? = nil,
        seqNum: Int64 = 0
    ) {
        self.id = id
        self.deviceId = deviceId
        self.visitId = visitId
        self.pageId = pageId
        self.pageName = pageName
        self.route = route
        self.startAt = startAt
        self.firstLayoutAt = firstLayoutAt
        self.appearAt = appearAt
        self.endAt = endAt
        self.loadDuration = loadDuration
        self.appearDuration = appearDuration
        self.totalDuration = totalDuration
        self.markersJSON = markersJSON
        self.appVersion = appVersion
        self.appBuild = appBuild
        self.osVersion = osVersion
        self.deviceModel = deviceModel
        self.isColdStart = isColdStart
        self.isPush = isPush
        self.parentPageId = parentPageId
        self.seqNum = seqNum
    }

    /// 转换为 DTO
    func toDTO() -> PageTimingEventDTO {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        let markers: [PageTimingMarkerDTO] = (try? decoder.decode(
            [PageTimingMarkerDTO].self,
            from: Data((markersJSON ?? "[]").utf8)
        )) ?? []

        return PageTimingEventDTO(
            eventId: id ?? "",
            visitId: visitId,
            pageId: pageId,
            pageName: pageName,
            route: route,
            startAt: startAt,
            firstLayoutAt: firstLayoutAt,
            appearAt: appearAt,
            endAt: endAt,
            loadDuration: loadDuration,
            appearDuration: appearDuration,
            totalDuration: totalDuration,
            markers: markers,
            appVersion: appVersion,
            appBuild: appBuild,
            osVersion: osVersion,
            deviceModel: deviceModel,
            isColdStart: isColdStart,
            isPush: isPush,
            parentPageId: parentPageId
        )
    }
}
