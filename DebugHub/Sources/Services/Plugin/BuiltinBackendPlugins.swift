// BuiltinBackendPlugins.swift
// DebugHub
//
// Created by Sun on 2025/12/09.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

// MARK: - 内置后端插件工厂

/// 内置后端插件工厂
public enum BuiltinBackendPlugins {
    /// 创建所有内置后端插件实例
    public static func createAll() -> [BackendPlugin] {
        [
            HttpBackendPlugin(),
            LogBackendPlugin(),
            WebSocketBackendPlugin(),
            DatabaseBackendPlugin(),
            MockBackendPlugin(),
            BreakpointBackendPlugin(),
            ChaosBackendPlugin(),
        ]
    }

    /// 注册所有内置后端插件
    public static func registerAll() throws {
        let plugins = createAll()
        try BackendPluginRegistry.shared.register(plugins: plugins)
    }
}

// MARK: - Log Backend Plugin

/// 日志后端插件
public final class LogBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.log
    public let displayName = "Log"
    public let version = "1.0.0"
    public let pluginDescription = "应用日志后端"
    public let dependencies: [String] = []

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("LogBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let logs = routes.grouped("devices", ":deviceId", "logs")
        logs.get(use: listLogs)
        logs.get("subsystems", use: listSubsystems)
        logs.get("categories", use: listCategories)
        logs.post("batch-delete", use: batchDelete)
        logs.delete(use: deleteAllLogs)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        guard event.eventType == "log_event" else { return }

        do {
            let logEvent = try event.decodePayload(as: LogEventDTO.self)
            try await ingestLogEvent(logEvent, deviceId: deviceId)

            // 广播到 WebUI
            let wsEvent = ["type": "log_event", "deviceId": deviceId, "data": logEvent] as [String: Any]
            context?.broadcastToWebUI(wsEvent, deviceId: deviceId)
        } catch {
            context?.logger.error("Failed to process log event: \(error)")
        }
    }

    private func ingestLogEvent(_ event: LogEventDTO, deviceId: String) async throws {
        guard let db = context?.database else { return }

        let model = LogEventModel(
            id: event.id,
            deviceId: deviceId,
            source: event.source,
            timestamp: event.timestamp,
            level: event.level,
            subsystem: event.subsystem,
            category: event.category,
            loggerName: event.loggerName,
            thread: event.thread,
            file: event.file,
            function: event.function,
            line: event.line,
            message: event.message,
            tags: event.tags.joined(separator: ","),
            traceId: event.traceId
        )

        try await model.save(on: db)
    }

    func listLogs(req: Request) async throws -> PluginLogEventListResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 100, 500)

        var query = LogEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)

        if let level = req.query[String.self, at: "level"] {
            query = query.filter(\.$level == level)
        }

        let total = try await query.count()
        let events = try await query
            .sort(\.$timestamp, .descending)
            .sort(\.$seqNum, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        let items = events.map { PluginLogEventItemDTO(from: $0) }

        return PluginLogEventListResponse(items: items, total: total, page: page, pageSize: pageSize)
    }

    func listSubsystems(req: Request) async throws -> [String] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let subsystems = try await LogEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .unique()
            .all(\.$subsystem)

        return subsystems.compactMap(\.self)
    }

    func listCategories(req: Request) async throws -> [String] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let categories = try await LogEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .unique()
            .all(\.$category)

        return categories.compactMap(\.self)
    }

    func batchDelete(req: Request) async throws -> BatchLogDeleteResponse {
        let input = try req.content.decode(BatchLogDeleteInput.self)
        try await LogEventModel.query(on: req.db)
            .filter(\.$id ~~ input.ids)
            .delete()
        return BatchLogDeleteResponse(deleted: input.ids.count)
    }

    /// 删除设备全部日志
    func deleteAllLogs(req: Request) async throws -> DeleteAllLogsResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let count = try await LogEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .count()

        try await LogEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        return DeleteAllLogsResponse(deleted: count)
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - WebSocket Backend Plugin

/// WebSocket 后端插件
public final class WebSocketBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.webSocket
    public let displayName = "WebSocket"
    public let version = "1.0.0"
    public let pluginDescription = "WebSocket 连接后端"
    public let dependencies: [String] = []

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("WebSocketBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let ws = routes.grouped("devices", ":deviceId")
        ws.get("ws-sessions", use: listSessions)
        ws.get("ws-sessions", ":sessionId", use: getSession)
        ws.get("ws-sessions", ":sessionId", "frames", use: listFrames)
        ws.get("ws-sessions", ":sessionId", "frames", ":frameId", use: getFrame)
        ws.delete("ws-sessions", use: deleteAllWSSessions)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        guard event.eventType == "ws_event" else { return }

        do {
            let wsEvent = try event.decodePayload(as: WSEventDTO.self)
            try await ingestWSEvent(wsEvent, deviceId: deviceId)

            // 广播到 WebUI
            let data = ["type": "ws_event", "deviceId": deviceId, "data": wsEvent] as [String: Any]
            context?.broadcastToWebUI(data, deviceId: deviceId)
        } catch {
            context?.logger.error("Failed to process WebSocket event: \(error)")
        }
    }

    private func ingestWSEvent(_ event: WSEventDTO, deviceId: String) async throws {
        guard let db = context?.database else { return }
        let encoder = JSONEncoder()

        switch event.kind {
        case let .sessionCreated(session):
            let model = try WSSessionModel(
                id: session.id,
                deviceId: deviceId,
                url: session.url,
                requestHeaders: String(data: encoder.encode(session.requestHeaders), encoding: .utf8) ?? "{}",
                subprotocols: String(data: encoder.encode(session.subprotocols), encoding: .utf8) ?? "[]",
                connectTime: session.connectTime,
                disconnectTime: session.disconnectTime,
                closeCode: session.closeCode,
                closeReason: session.closeReason
            )
            try await model.save(on: db)

        case let .sessionClosed(session):
            if let existing = try await WSSessionModel.find(session.id, on: db) {
                existing.disconnectTime = session.disconnectTime
                existing.closeCode = session.closeCode
                existing.closeReason = session.closeReason
                try await existing.save(on: db)
            }

        case let .frame(frame):
            // 检查 session 是否存在，如果不存在则自动创建
            let sessionExists = try await WSSessionModel.find(frame.sessionId, on: db) != nil
            if !sessionExists {
                let sessionUrl = frame.sessionUrl ?? "(Session \(String(frame.sessionId.prefix(8)))...)"
                let placeholderSession = WSSessionModel(
                    id: frame.sessionId,
                    deviceId: deviceId,
                    url: sessionUrl,
                    requestHeaders: "{}",
                    subprotocols: "[]",
                    connectTime: frame.timestamp,
                    disconnectTime: nil,
                    closeCode: nil,
                    closeReason: nil
                )
                try await placeholderSession.save(on: db)
            }

            let model = WSFrameModel(
                id: frame.id,
                deviceId: deviceId,
                sessionId: frame.sessionId,
                direction: frame.direction,
                opcode: frame.opcode,
                payload: frame.payload,
                payloadPreview: frame.payloadPreview,
                timestamp: frame.timestamp,
                isMocked: frame.isMocked,
                mockRuleId: frame.mockRuleId
            )
            try await model.save(on: db)
        }
    }

    func listSessions(req: Request) async throws -> WSSessionListResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 50, 200)

        let query = WSSessionModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)

        let total = try await query.count()
        let sessions = try await query
            .sort(\.$connectTime, .descending)
            .sort(\.$id, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        let items = sessions.map { WSSessionDTO(from: $0) }
        return WSSessionListResponse(items: items, total: total, page: page, pageSize: pageSize)
    }

    func getSession(req: Request) async throws -> WSSessionDetailDTO {
        guard let sessionId = req.parameters.get("sessionId") else {
            throw Abort(.badRequest)
        }
        guard let session = try await WSSessionModel.find(sessionId, on: req.db) else {
            throw Abort(.notFound)
        }

        // 获取帧数量
        let frameCount = try await WSFrameModel.query(on: req.db)
            .filter(\.$sessionId == sessionId)
            .count()

        return WSSessionDetailDTO(from: session, frameCount: frameCount)
    }

    func listFrames(req: Request) async throws -> WSFrameListResponse {
        guard let sessionId = req.parameters.get("sessionId") else {
            throw Abort(.badRequest)
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 100, 500)
        let direction = req.query[String.self, at: "direction"]

        var query = WSFrameModel.query(on: req.db)
            .filter(\.$sessionId == sessionId)

        // 根据方向筛选
        if let direction, !direction.isEmpty {
            query = query.filter(\.$direction == direction)
        }

        let total = try await query.count()
        let frames = try await query
            .sort(\.$timestamp, .descending)
            .sort(\.$seqNum, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        let items = frames.map { WSFrameDTO(from: $0) }
        return WSFrameListResponse(items: items, total: total, page: page, pageSize: pageSize)
    }

    func getFrame(req: Request) async throws -> WSFrameDetailDTO {
        guard let frameId = req.parameters.get("frameId") else {
            throw Abort(.badRequest)
        }
        guard let frame = try await WSFrameModel.find(frameId, on: req.db) else {
            throw Abort(.notFound)
        }
        return WSFrameDetailDTO(from: frame)
    }

    /// 删除设备全部 WebSocket 会话和帧
    func deleteAllWSSessions(req: Request) async throws -> DeleteAllWSSessionsResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 先获取所有 session ID
        let sessionIds = try await WSSessionModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .all()
            .compactMap(\.id)

        // 删除关联的 frames
        if !sessionIds.isEmpty {
            try await WSFrameModel.query(on: req.db)
                .filter(\.$sessionId ~~ sessionIds)
                .delete()
        }

        // 删除 sessions
        let count = try await WSSessionModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .count()

        try await WSSessionModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        return DeleteAllWSSessionsResponse(deleted: count)
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - Database Backend Plugin

/// 数据库检查后端插件
public final class DatabaseBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.database
    public let displayName = "Database"
    public let version = "1.0.0"
    public let pluginDescription = "SQLite 数据库检查后端"
    public let dependencies: [String] = []

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("DatabaseBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let db = routes.grouped("devices", ":deviceId", "databases")
        db.get(use: listDatabases)
        db.get(":dbId", "tables", use: listTables)
        db.get(":dbId", "tables", ":table", "schema", use: describeTable)
        db.get(":dbId", "tables", ":table", "rows", use: fetchTablePage)
        db.post(":dbId", "query", use: executeQuery)
        db.post(":dbId", "search", use: searchDatabase)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        // 数据库插件接收响应事件
        if event.eventType == "db_response" {
            if let response = try? event.decodePayload(as: DBResponseDTO.self) {
                DBResponseManager.shared.handleResponse(response)
            }
        }
    }

    // MARK: - Route Handlers

    func listDatabases(req: Request) async throws -> DBListDatabasesResponseDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .listDatabases,
            dbId: nil,
            table: nil,
            page: nil,
            pageSize: nil,
            orderBy: nil,
            ascending: nil
        )

        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 10)
        guard response.success, let payload = response.payload else {
            throw Abort(.internalServerError, reason: response.error?.message ?? "Unknown error")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(DBListDatabasesResponseDTO.self, from: payload)
    }

    func listTables(req: Request) async throws -> DBListTablesResponseDTO {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let dbId = req.parameters.get("dbId")
        else {
            throw Abort(.badRequest, reason: "Missing deviceId or dbId")
        }

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .listTables,
            dbId: dbId,
            table: nil,
            page: nil,
            pageSize: nil,
            orderBy: nil,
            ascending: nil
        )

        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 10)
        guard response.success, let payload = response.payload else {
            throw Abort(.internalServerError, reason: response.error?.message ?? "Unknown error")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(DBListTablesResponseDTO.self, from: payload)
    }

    func describeTable(req: Request) async throws -> DBDescribeTableResponseDTO {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let dbId = req.parameters.get("dbId"),
            let table = req.parameters.get("table")
        else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .describeTable,
            dbId: dbId,
            table: table,
            page: nil,
            pageSize: nil,
            orderBy: nil,
            ascending: nil
        )

        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 10)
        guard response.success, let payload = response.payload else {
            throw Abort(.internalServerError, reason: response.error?.message ?? "Unknown error")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(DBDescribeTableResponseDTO.self, from: payload)
    }

    func fetchTablePage(req: Request) async throws -> DBTablePageResultDTO {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let dbId = req.parameters.get("dbId"),
            let table = req.parameters.get("table")
        else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 50, 500)
        let orderBy = req.query[String.self, at: "orderBy"]
        let ascending = req.query[Bool.self, at: "ascending"] ?? true
        let targetRowId = req.query[String.self, at: "targetRowId"]

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .fetchTablePage,
            dbId: dbId,
            table: table,
            page: page,
            pageSize: pageSize,
            orderBy: orderBy,
            ascending: ascending,
            targetRowId: targetRowId
        )

        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 15)
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            if errorMsg.contains("not found") {
                throw Abort(.notFound, reason: errorMsg)
            } else if errorMsg.contains("Access denied") || errorMsg.contains("sensitive") {
                throw Abort(.forbidden, reason: errorMsg)
            } else if errorMsg.contains("timeout") {
                throw Abort(.gatewayTimeout, reason: errorMsg)
            } else {
                throw Abort(.internalServerError, reason: errorMsg)
            }
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(DBTablePageResultDTO.self, from: payload)
    }

    func executeQuery(req: Request) async throws -> PluginDBQueryResponse {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let dbId = req.parameters.get("dbId")
        else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }

        struct QueryInput: Content {
            let query: String
        }
        let input = try req.content.decode(QueryInput.self)

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .executeQuery,
            dbId: dbId,
            table: nil,
            page: nil,
            pageSize: nil,
            orderBy: nil,
            ascending: nil,
            query: input.query
        )

        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 30)

        // 如果执行失败，返回结构化的错误响应而不是抛出异常
        guard response.success, let payload = response.payload else {
            let errorInfo = parseSQLError(
                originalError: response.error?.message ?? "Unknown error",
                query: input.query,
                dbId: dbId
            )
            return PluginDBQueryResponse.failure(
                dbId: dbId,
                query: input.query,
                error: errorInfo
            )
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds

        // 解析原始响应
        struct RawQueryResponse: Decodable {
            let dbId: String
            let query: String
            let columns: [PluginDBColumnInfo]
            let rows: [PluginDBRow]
            let rowCount: Int
            let executionTimeMs: Double
        }

        let rawResult = try decoder.decode(RawQueryResponse.self, from: payload)
        return PluginDBQueryResponse.success(
            dbId: rawResult.dbId,
            query: rawResult.query,
            columns: rawResult.columns,
            rows: rawResult.rows,
            rowCount: rawResult.rowCount,
            executionTimeMs: rawResult.executionTimeMs
        )
    }

    func searchDatabase(req: Request) async throws -> DBSearchResponseDTO {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let dbId = req.parameters.get("dbId")
        else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }

        struct SearchInput: Content {
            let keyword: String
            let maxResultsPerTable: Int?
        }
        let input = try req.content.decode(SearchInput.self)

        guard !input.keyword.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw Abort(.badRequest, reason: "Keyword cannot be empty")
        }

        guard DeviceRegistry.shared.getSession(deviceId: deviceId) != nil else {
            throw Abort(.notFound, reason: "Device not connected")
        }

        let command = DBCommandDTO(
            requestId: UUID().uuidString,
            kind: .searchDatabase,
            dbId: dbId,
            table: nil,
            page: nil,
            pageSize: nil,
            orderBy: nil,
            ascending: nil,
            query: nil,
            keyword: input.keyword,
            maxResultsPerTable: input.maxResultsPerTable ?? 10
        )

        // 搜索可能需要更长时间，设置 60 秒超时
        let response = try await sendCommandAndWaitResponse(command: command, to: deviceId, timeout: 60)

        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            if errorMsg.contains("not found") {
                throw Abort(.notFound, reason: errorMsg)
            } else if errorMsg.contains("Access denied") || errorMsg.contains("sensitive") {
                throw Abort(.forbidden, reason: errorMsg)
            } else if errorMsg.contains("timeout") {
                throw Abort(.gatewayTimeout, reason: errorMsg)
            } else {
                throw Abort(.internalServerError, reason: errorMsg)
            }
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601WithMilliseconds
        return try decoder.decode(DBSearchResponseDTO.self, from: payload)
    }

    /// 解析 SQL 错误并生成友好的错误信息和建议
    private func parseSQLError(originalError: String, query: String, dbId: String) -> PluginDBQueryError {
        let lowercasedError = originalError.lowercased()
        let lowercasedQuery = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        // 检测错误类型
        var errorType = "internal_error"
        var description = "执行 SQL 查询时发生错误"
        var suggestions: [String] = []

        // 语法错误检测
        if lowercasedError.contains("syntax error") || lowercasedError.contains("near") {
            errorType = "syntax_error"
            description = "SQL 语法错误"
            suggestions = generateSyntaxSuggestions(query: query, error: originalError)
        }
        // 表不存在
        else if
            lowercasedError.contains("no such table") ||
            (lowercasedError.contains("table") && lowercasedError.contains("not")) {
            errorType = "table_not_found"
            description = "指定的表不存在"
            suggestions = generateTableSuggestions(query: query, error: originalError)
        }
        // 列不存在
        else if
            lowercasedError.contains("no such column") ||
            (lowercasedError.contains("column") && lowercasedError.contains("not")) {
            errorType = "column_not_found"
            description = "指定的列不存在"
            suggestions = generateColumnSuggestions(query: query, error: originalError)
        }
        // 访问被拒绝
        else if lowercasedError.contains("access denied") || lowercasedError.contains("permission") {
            errorType = "access_denied"
            description = "没有权限执行此查询"
        }
        // 超时
        else if lowercasedError.contains("timeout") {
            errorType = "timeout"
            description = "查询执行超时"
            suggestions = ["尝试添加 LIMIT 限制返回行数", "考虑添加索引优化查询性能"]
        }
        // 只读数据库
        else if lowercasedError.contains("readonly") || lowercasedError.contains("read-only") {
            errorType = "access_denied"
            description = "数据库为只读模式"
            suggestions = ["仅支持 SELECT 查询"]
        }
        // 无效查询类型
        else if !lowercasedQuery.hasPrefix("select") {
            errorType = "invalid_query"
            description = "仅支持 SELECT 查询"
            suggestions = generateSelectSuggestion(query: query)
        }

        // 如果没有生成建议，尝试通用建议
        if suggestions.isEmpty {
            suggestions = generateGenericSuggestions(query: query)
        }

        return PluginDBQueryError(
            type: errorType,
            message: originalError,
            description: description,
            suggestions: suggestions.isEmpty ? nil : suggestions
        )
    }

    /// 生成语法错误建议
    private func generateSyntaxSuggestions(query: String, error: String) -> [String] {
        var suggestions: [String] = []
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercasedQuery = trimmedQuery.lowercased()

        // 检查是否缺少 SELECT 关键字
        if !lowercasedQuery.hasPrefix("select") {
            if lowercasedQuery.hasPrefix("*") || lowercasedQuery.contains("from") {
                suggestions.append("SELECT \(trimmedQuery)")
            }
        }

        // 检查是否缺少 FROM
        if lowercasedQuery.hasPrefix("select"), !lowercasedQuery.contains("from") {
            // 尝试从 error 中提取表名或猜测
            suggestions.append("在 SELECT 后添加 FROM 子句，例如: SELECT * FROM table_name")
        }

        // 检查 WHERE 后缺少条件的情况
        // 匹配 WHERE 后直接跟 LIMIT/ORDER/GROUP/; 或结尾的情况
        let wherePattern = #"(?i)\bwhere\s+(limit|order|group|;|$)"#
        if
            let regex = try? NSRegularExpression(pattern: wherePattern),
            regex.firstMatch(in: trimmedQuery, range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery)) != nil {
            suggestions.append("WHERE 子句后需要添加条件，例如: WHERE column = value")
            // 生成一个移除空 WHERE 的建议
            if let whereRemoveRegex = try? NSRegularExpression(pattern: #"(?i)\s+where\s+(?=limit|order|group|$)"#) {
                let fixed = whereRemoveRegex.stringByReplacingMatches(
                    in: trimmedQuery,
                    range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery),
                    withTemplate: " "
                )
                if fixed != trimmedQuery {
                    suggestions.append(fixed)
                }
            }
        }

        // 检查 ORDER BY 后缺少列名
        let orderByPattern = #"(?i)\border\s+by\s*(limit|group|where|;|$)"#
        if
            let regex = try? NSRegularExpression(pattern: orderByPattern),
            regex.firstMatch(in: trimmedQuery, range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery)) != nil {
            suggestions.append("ORDER BY 后需要指定列名，例如: ORDER BY column_name ASC")
        }

        // 检查 GROUP BY 后缺少列名
        let groupByPattern = #"(?i)\bgroup\s+by\s*(limit|order|having|where|;|$)"#
        if
            let regex = try? NSRegularExpression(pattern: groupByPattern),
            regex.firstMatch(in: trimmedQuery, range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery)) != nil {
            suggestions.append("GROUP BY 后需要指定列名，例如: GROUP BY column_name")
        }

        // 检查 LIMIT 后缺少数字
        let limitPattern = #"(?i)\blimit\s*(order|group|where|;|$)"#
        if
            let regex = try? NSRegularExpression(pattern: limitPattern),
            regex.firstMatch(in: trimmedQuery, range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery)) != nil {
            suggestions.append("LIMIT 后需要指定数量，例如: LIMIT 100")
        }

        // 检查重复的 SELECT 关键字
        let duplicateSelectPattern = #"(?i)\bselect\s+select\b"#
        if
            let regex = try? NSRegularExpression(pattern: duplicateSelectPattern),
            regex.firstMatch(in: trimmedQuery, range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery)) != nil {
            let fixed = trimmedQuery.replacingOccurrences(
                of: #"(?i)\bselect\s+select\b"#,
                with: "SELECT",
                options: .regularExpression
            )
            suggestions.append("检测到重复的 SELECT 关键字")
            suggestions.append(fixed)
        }

        // 检查常见拼写错误 - 使用单词边界匹配避免误替换
        let commonTypos: [(String, String)] = [
            // SELECT 拼写错误
            (#"\bslect\b"#, "SELECT"),
            (#"\bselet\b"#, "SELECT"),
            (#"\bselct\b"#, "SELECT"),
            (#"\bselectt\b"#, "SELECT"),
            // FROM 拼写错误
            (#"\bfomr\b"#, "FROM"),
            (#"\bform\b"#, "FROM"),
            (#"\bfrmo\b"#, "FROM"),
            // WHERE 拼写错误
            (#"\bwhre\b"#, "WHERE"),
            (#"\bwehre\b"#, "WHERE"),
            (#"\bwher\b"#, "WHERE"),
            // ORDER 拼写错误
            (#"\bordre\b"#, "ORDER"),
            (#"\boder\b"#, "ORDER"),
            // GROUP 拼写错误
            (#"\bgruop\b"#, "GROUP"),
            (#"\bgourp\b"#, "GROUP"),
            (#"\bgropu\b"#, "GROUP"),
            // LIMIT 拼写错误
            (#"\blimt\b"#, "LIMIT"),
            (#"\blimti\b"#, "LIMIT"),
            // DISTINCT 拼写错误
            (#"\bdistint\b"#, "DISTINCT"),
            (#"\bdistict\b"#, "DISTINCT"),
            (#"\bdistnct\b"#, "DISTINCT"),
            // JOIN 拼写错误
            (#"\bjion\b"#, "JOIN"),
            (#"\bjoni\b"#, "JOIN"),
            // HAVING 拼写错误
            (#"\bhavign\b"#, "HAVING"),
            (#"\bhaivng\b"#, "HAVING"),
        ]

        for (typoPattern, correct) in commonTypos {
            if
                let regex = try? NSRegularExpression(pattern: typoPattern, options: .caseInsensitive),
                regex.firstMatch(
                    in: lowercasedQuery,
                    range: NSRange(lowercasedQuery.startIndex..., in: lowercasedQuery)
                ) != nil {
                let fixed = regex.stringByReplacingMatches(
                    in: trimmedQuery,
                    range: NSRange(trimmedQuery.startIndex..., in: trimmedQuery),
                    withTemplate: correct
                )
                if fixed != trimmedQuery {
                    suggestions.append(fixed)
                }
                break
            }
        }

        // 检查引号匹配
        let singleQuotes = query.count(where: { $0 == "'" })
        let doubleQuotes = query.count(where: { $0 == "\"" })
        if singleQuotes % 2 != 0 {
            suggestions.append("检查单引号是否成对: 当前有 \(singleQuotes) 个单引号")
        }
        if doubleQuotes % 2 != 0 {
            suggestions.append("检查双引号是否成对: 当前有 \(doubleQuotes) 个双引号")
        }

        // 检查括号匹配
        let openParens = query.count(where: { $0 == "(" })
        let closeParens = query.count(where: { $0 == ")" })
        if openParens != closeParens {
            suggestions.append("检查括号是否成对: 有 \(openParens) 个左括号和 \(closeParens) 个右括号")
        }

        return suggestions
    }

    /// 生成表相关建议
    private func generateTableSuggestions(query: String, error: String) -> [String] {
        var suggestions: [String] = []

        // 尝试从错误中提取表名
        let pattern = #"no such table:?\s*(\w+)"#
        if
            let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
            let match = regex.firstMatch(in: error, options: [], range: NSRange(error.startIndex..., in: error)),
            let range = Range(match.range(at: 1), in: error) {
            let tableName = String(error[range])
            suggestions.append("表 '\(tableName)' 不存在，请检查表名是否正确")
            suggestions.append("使用左侧表列表查看可用的表名")
        } else {
            suggestions.append("请检查表名是否正确拼写")
            suggestions.append("使用左侧表列表查看可用的表名")
        }

        return suggestions
    }

    /// 生成列相关建议
    private func generateColumnSuggestions(query: String, error: String) -> [String] {
        var suggestions: [String] = []

        // 尝试从错误中提取列名
        let pattern = #"no such column:?\s*(\w+)"#
        if
            let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
            let match = regex.firstMatch(in: error, options: [], range: NSRange(error.startIndex..., in: error)),
            let range = Range(match.range(at: 1), in: error) {
            let columnName = String(error[range])
            suggestions.append("列 '\(columnName)' 不存在，请检查列名是否正确")
        }

        suggestions.append("点击左侧表名查看该表的所有列")
        suggestions.append("尝试使用 SELECT * 查询所有列")

        return suggestions
    }

    /// 生成 SELECT 建议
    private func generateSelectSuggestion(query: String) -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var suggestions: [String] = []

        let lowercased = trimmed.lowercased()

        // 不支持的 SQL 语句类型
        let unsupportedCommands = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "replace"]
        let isUnsupportedCommand = unsupportedCommands.contains { lowercased.hasPrefix($0) }

        if isUnsupportedCommand {
            suggestions.append("此工具仅支持 SELECT 查询，不支持数据修改操作")
        } else if lowercased.hasPrefix("*") || lowercased.contains(" from ") {
            // 看起来像是缺少 SELECT 的查询
            suggestions.append("SELECT \(trimmed)")
        } else {
            // 提供通用建议
            suggestions.append("请使用 SELECT 语句查询数据")
            suggestions.append("示例: SELECT * FROM table_name LIMIT 100")
        }

        return suggestions
    }

    /// 生成通用建议
    private func generateGenericSuggestions(query: String) -> [String] {
        var suggestions: [String] = []
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)

        // 基本 SELECT 语句模板
        if trimmed.isEmpty {
            suggestions.append("SELECT * FROM table_name LIMIT 100")
        } else {
            suggestions.append("确保 SQL 语句以 SELECT 开头")
            suggestions.append("基本语法: SELECT column1, column2 FROM table_name WHERE condition")
        }

        return suggestions
    }

    // MARK: - Helpers

    private func sendCommandAndWaitResponse(
        command: DBCommandDTO,
        to deviceId: String,
        timeout: TimeInterval
    ) async throws -> DBResponseDTO {
        try await withCheckedThrowingContinuation { continuation in
            DBResponseManager.shared.registerWaiter(
                requestId: command.requestId,
                timeout: timeout
            ) { response in
                if let response {
                    continuation.resume(returning: response)
                } else {
                    continuation.resume(throwing: Abort(.gatewayTimeout, reason: "DB command timeout"))
                }
            }

            let message = BridgeMessageDTO.dbCommand(command)
            DeviceRegistry.shared.sendMessage(to: deviceId, message: message)
        }
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - Mock Backend Plugin

/// Mock 规则后端插件
public final class MockBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.mock
    public let displayName = "Mock"
    public let version = "1.0.0"
    public let pluginDescription = "Mock 规则管理后端"
    public let dependencies: [String] = [BackendPluginId.http]

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("MockBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let mock = routes.grouped("devices", ":deviceId", "mock-rules")
        mock.get(use: listRules)
        mock.post(use: createRule)
        mock.put(":ruleId", use: updateRule)
        mock.delete(":ruleId", use: deleteRule)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        // Mock 插件不接收事件
    }

    func listRules(req: Request) async throws -> [MockRuleDTO] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let rules = try await MockRuleModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .sort(\.$createdAt, .descending)  // 按创建时间倒序，最新的在前
            .all()

        return rules.map { $0.toDTO() }
    }

    func createRule(req: Request) async throws -> MockRuleDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let input = try req.content.decode(MockRuleDTO.self)
        let encoder = JSONEncoder()
        let conditionJSON = (try? String(data: encoder.encode(input.condition), encoding: .utf8)) ?? "{}"
        let actionJSON = (try? String(data: encoder.encode(input.action), encoding: .utf8)) ?? "{}"

        let model = MockRuleModel(
            id: UUID().uuidString,
            deviceId: deviceId,
            name: input.name,
            targetType: input.targetType,
            conditionJSON: conditionJSON,
            actionJSON: actionJSON,
            priority: input.priority,
            enabled: input.enabled
        )

        try await model.save(on: req.db)

        // 通知设备更新规则
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return model.toDTO()
    }

    func updateRule(req: Request) async throws -> MockRuleDTO {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        guard let model = try await MockRuleModel.find(ruleId, on: req.db) else {
            throw Abort(.notFound)
        }

        let input = try req.content.decode(MockRuleDTO.self)
        let encoder = JSONEncoder()
        model.name = input.name
        model.targetType = input.targetType
        model.conditionJSON = (try? String(data: encoder.encode(input.condition), encoding: .utf8)) ?? "{}"
        model.actionJSON = (try? String(data: encoder.encode(input.action), encoding: .utf8)) ?? "{}"
        model.priority = input.priority
        model.enabled = input.enabled

        try await model.save(on: req.db)
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return model.toDTO()
    }

    func deleteRule(req: Request) async throws -> HTTPStatus {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        try await MockRuleModel.query(on: req.db)
            .filter(\.$id == ruleId)
            .delete()

        await syncRulesToDevice(deviceId: deviceId, db: req.db)
        return .noContent
    }

    private func syncRulesToDevice(deviceId: String, db: Database) async {
        let rules = await (try? MockRuleModel.query(on: db)
            .filter(\.$deviceId == deviceId)
            .filter(\.$enabled == true)
            .all()) ?? []

        let ruleDTOs = rules.map { $0.toDTO() }

        do {
            let command = try PluginCommandDTO(
                pluginId: pluginId,
                commandType: "update_rules",
                encodable: ruleDTOs
            )
            await context?.sendCommand(command, to: deviceId)
        } catch {
            context?.logger.error("Failed to sync mock rules: \(error)")
        }
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - Breakpoint Backend Plugin

/// 断点后端插件
public final class BreakpointBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.breakpoint
    public let displayName = "Breakpoint"
    public let version = "1.0.0"
    public let pluginDescription = "断点调试后端"
    public let dependencies: [String] = [BackendPluginId.http]

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("BreakpointBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let bp = routes.grouped("devices", ":deviceId", "breakpoints")
        bp.get(use: listRules)
        bp.post(use: createRule)
        bp.put(":ruleId", use: updateRule)
        bp.delete(":ruleId", use: deleteRule)
        bp.get("pending", use: getPendingBreakpoints)
        bp.post("resume", ":requestId", use: resumeBreakpoint)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        if event.eventType == "breakpoint_hit" {
            // 解析断点命中事件
            if let hit = try? event.decodePayload(as: BreakpointHitDTO.self) {
                // 存储到 BreakpointManager
                BreakpointManager.shared.addPendingHit(hit)
            }
            // 广播断点命中事件到 WebUI
            context?.broadcastToWebUI(["type": "breakpoint_hit", "deviceId": deviceId], deviceId: deviceId)
        }
    }

    func listRules(req: Request) async throws -> [PluginBreakpointRuleDTO] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let rules = try await BreakpointRuleModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .sort(\.$createdAt, .descending) // 按创建时间倒序，最新的在前
            .all()

        return rules.map { PluginBreakpointRuleDTO(from: $0) }
    }

    func createRule(req: Request) async throws -> PluginBreakpointRuleDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let input = try req.content.decode(PluginBreakpointRuleInput.self)
        let model = BreakpointRuleModel(
            id: UUID().uuidString,
            deviceId: deviceId,
            name: input.name ?? "",
            urlPattern: input.urlPattern ?? "",
            method: input.method,
            phase: input.phase ?? "request",
            enabled: input.enabled ?? true,
            priority: input.priority ?? 0
        )

        try await model.save(on: req.db)
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return PluginBreakpointRuleDTO(from: model)
    }

    func updateRule(req: Request) async throws -> PluginBreakpointRuleDTO {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        guard
            let model = try await BreakpointRuleModel.query(on: req.db)
                .filter(\.$id == ruleId)
                .filter(\.$deviceId == deviceId)
                .first()
        else {
            throw Abort(.notFound)
        }

        let input = try req.content.decode(PluginBreakpointRuleInput.self)
        if let name = input.name { model.name = name }
        if let urlPattern = input.urlPattern { model.urlPattern = urlPattern }
        if let method = input.method { model.method = method }
        if let phase = input.phase { model.phase = phase }
        if let enabled = input.enabled { model.enabled = enabled }
        if let priority = input.priority { model.priority = priority }

        try await model.save(on: req.db)
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return PluginBreakpointRuleDTO(from: model)
    }

    func deleteRule(req: Request) async throws -> HTTPStatus {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        try await BreakpointRuleModel.query(on: req.db)
            .filter(\.$id == ruleId)
            .filter(\.$deviceId == deviceId)
            .delete()

        await syncRulesToDevice(deviceId: deviceId, db: req.db)
        return .noContent
    }

    func getPendingBreakpoints(req _: Request) async throws -> [BreakpointHitDTO] {
        BreakpointManager.shared.getPendingHits()
    }

    func resumeBreakpoint(req: Request) async throws -> HTTPStatus {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let requestId = req.parameters.get("requestId")
        else {
            throw Abort(.badRequest)
        }

        let action = try req.content.decode(BreakpointActionDTO.self)
        let breakpointId = BreakpointManager.shared.getPendingHits()
            .first { $0.requestId == requestId }?.breakpointId ?? ""

        let resume = BreakpointResumeDTO.from(
            requestId: requestId,
            breakpointId: breakpointId,
            actionDTO: action
        )

        DeviceRegistry.shared.sendMessage(to: deviceId, message: .breakpointResume(resume))
        BreakpointManager.shared.removePendingHit(requestId: requestId)

        return .ok
    }

    private func syncRulesToDevice(deviceId: String, db: Database) async {
        let rules = await (try? BreakpointRuleModel.query(on: db)
            .filter(\.$deviceId == deviceId)
            .filter(\.$enabled == true)
            .sort(\.$priority, .descending)
            .all()) ?? []

        let dtos = rules.map { $0.toDTO() }
        DeviceRegistry.shared.sendMessage(to: deviceId, message: .updateBreakpointRules(dtos))
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - Chaos Backend Plugin

/// 故障注入后端插件
public final class ChaosBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.chaos
    public let displayName = "Chaos"
    public let version = "1.0.0"
    public let pluginDescription = "故障注入后端"
    public let dependencies: [String] = [BackendPluginId.http]

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("ChaosBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let chaos = routes.grouped("devices", ":deviceId", "chaos")
        chaos.get(use: listRules)
        chaos.post(use: createRule)
        chaos.put(":ruleId", use: updateRule)
        chaos.delete(":ruleId", use: deleteRule)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        // Chaos 插件不接收事件，只接收命令下发
    }

    func listRules(req: Request) async throws -> [ChaosRuleDTO] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let rules = try await ChaosRuleModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .sort(\.$createdAt, .descending) // 按创建时间倒序，最新的在前
            .all()

        return rules.map { $0.toDTO() }
    }

    func createRule(req: Request) async throws -> ChaosRuleDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest)
        }

        let input = try req.content.decode(PluginChaosRuleInput.self)
        guard let chaos = input.chaos else {
            throw Abort(.badRequest, reason: "Missing chaos type")
        }

        let encoder = JSONEncoder()
        let chaosJSON = try String(data: encoder.encode(chaos), encoding: .utf8) ?? "{}"

        let model = ChaosRuleModel(
            id: UUID().uuidString,
            deviceId: deviceId,
            name: input.name ?? "",
            urlPattern: input.urlPattern ?? "",
            method: input.method,
            probability: input.probability ?? 1.0,
            chaosJSON: chaosJSON,
            enabled: input.enabled ?? true,
            priority: input.priority ?? 0
        )

        try await model.save(on: req.db)
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return model.toDTO()
    }

    func updateRule(req: Request) async throws -> ChaosRuleDTO {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        guard
            let model = try await ChaosRuleModel.query(on: req.db)
                .filter(\.$id == ruleId)
                .filter(\.$deviceId == deviceId)
                .first()
        else {
            throw Abort(.notFound)
        }

        let input = try req.content.decode(PluginChaosRuleInput.self)
        if let name = input.name { model.name = name }
        if let urlPattern = input.urlPattern { model.urlPattern = urlPattern }
        if let method = input.method { model.method = method }
        if let probability = input.probability { model.probability = probability }
        if let chaos = input.chaos {
            let encoder = JSONEncoder()
            let chaosJSON = try String(data: encoder.encode(chaos), encoding: .utf8) ?? "{}"
            model.chaosJSON = chaosJSON
        }
        if let enabled = input.enabled { model.enabled = enabled }
        if let priority = input.priority { model.priority = priority }

        try await model.save(on: req.db)
        await syncRulesToDevice(deviceId: deviceId, db: req.db)

        return model.toDTO()
    }

    func deleteRule(req: Request) async throws -> HTTPStatus {
        guard
            let ruleId = req.parameters.get("ruleId"),
            let deviceId = req.parameters.get("deviceId")
        else {
            throw Abort(.badRequest)
        }

        try await ChaosRuleModel.query(on: req.db)
            .filter(\.$id == ruleId)
            .filter(\.$deviceId == deviceId)
            .delete()

        await syncRulesToDevice(deviceId: deviceId, db: req.db)
        return .noContent
    }

    private func syncRulesToDevice(deviceId: String, db: Database) async {
        let rules = await (try? ChaosRuleModel.query(on: db)
            .filter(\.$deviceId == deviceId)
            .filter(\.$enabled == true)
            .sort(\.$priority, .descending)
            .all()) ?? []

        let dtos = rules.map { $0.toDTO() }
        DeviceRegistry.shared.sendMessage(to: deviceId, message: .updateChaosRules(dtos))
    }

    public func shutdown() async {
        state = .stopped
    }
}

// MARK: - Supporting DTOs

struct PluginLogEventListResponse: Content {
    let items: [PluginLogEventItemDTO]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct PluginLogEventItemDTO: Content {
    let id: String
    let level: String
    let message: String
    let timestamp: Date
    let subsystem: String?
    let category: String?
    let seqNum: Int64

    init(from model: LogEventModel) {
        id = model.id ?? ""
        level = model.level
        message = model.message
        timestamp = model.timestamp
        subsystem = model.subsystem
        category = model.category
        seqNum = model.seqNum
    }
}

struct BatchLogDeleteInput: Content {
    let ids: [String]
}

struct BatchLogDeleteResponse: Content {
    let deleted: Int
}

struct DeleteAllLogsResponse: Content {
    let deleted: Int
}

struct DeleteAllWSSessionsResponse: Content {
    let deleted: Int
}

struct WSSessionDTO: Content {
    let id: String
    let url: String
    let connectTime: Date
    let disconnectTime: Date?
    let closeCode: Int?
    let closeReason: String?
    let isOpen: Bool

    init(from model: WSSessionModel) {
        id = model.id ?? ""
        url = model.url
        connectTime = model.connectTime
        disconnectTime = model.disconnectTime
        closeCode = model.closeCode
        closeReason = model.closeReason
        // 如果 disconnectTime 为 nil，则认为连接还在打开状态
        isOpen = model.disconnectTime == nil
    }
}

/// WebSocket 会话详情 DTO（包含帧数量）
struct WSSessionDetailDTO: Content {
    let id: String
    let url: String
    let requestHeaders: [String: String]
    let subprotocols: [String]
    let connectTime: Date
    let disconnectTime: Date?
    let closeCode: Int?
    let closeReason: String?
    let frameCount: Int

    init(from model: WSSessionModel, frameCount: Int) {
        id = model.id ?? ""
        url = model.url
        requestHeaders = (try? JSONDecoder().decode([String: String].self, from: Data(model.requestHeaders.utf8))) ??
            [:]
        subprotocols = (try? JSONDecoder().decode([String].self, from: Data(model.subprotocols.utf8))) ?? []
        connectTime = model.connectTime
        disconnectTime = model.disconnectTime
        closeCode = model.closeCode
        closeReason = model.closeReason
        self.frameCount = frameCount
    }
}

struct WSSessionListResponse: Content {
    let items: [WSSessionDTO]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct WSFrameDTO: Content {
    let id: String
    let direction: String
    let opcode: String
    let payloadPreview: String?
    let payloadSize: Int
    let timestamp: Date
    let isMocked: Bool
    let seqNum: Int64

    init(from model: WSFrameModel) {
        id = model.id ?? ""
        direction = model.direction
        opcode = model.opcode
        payloadPreview = model.payloadPreview
        payloadSize = model.payload.count
        timestamp = model.timestamp
        isMocked = model.isMocked
        seqNum = model.seqNum
    }
}

/// WebSocket 帧详情 DTO（包含完整 payload）
struct WSFrameDetailDTO: Content {
    let id: String
    let sessionId: String
    let direction: String
    let opcode: String
    let payloadText: String?
    let payloadBase64: String
    let payloadSize: Int
    let timestamp: Date
    let isMocked: Bool

    init(from model: WSFrameModel) {
        id = model.id ?? ""
        sessionId = model.sessionId
        direction = model.direction
        opcode = model.opcode
        payloadSize = model.payload.count
        timestamp = model.timestamp
        isMocked = model.isMocked

        // Base64 编码的完整 payload
        payloadBase64 = model.payload.base64EncodedString()

        // 尝试 UTF-8 解码
        if let text = String(data: model.payload, encoding: .utf8) {
            payloadText = text
        } else {
            payloadText = nil
        }
    }
}

struct WSFrameListResponse: Content {
    let items: [WSFrameDTO]
    let total: Int
    let page: Int
    let pageSize: Int
}

struct DBListResponse: Content {
    let pending: Bool
    let databases: [PluginDBInfoDTO]
}

struct PluginDBInfoDTO: Content {
    let id: String
    let name: String
    let tableCount: Int
}

struct PluginDBTablesResponse: Content {
    let tables: [String]
}

struct PluginDBColumnInfo: Content {
    let name: String
    let type: String?
    let notNull: Bool
    let primaryKey: Bool
    let defaultValue: String?
}

struct PluginDBRow: Content {
    let values: [String: String?]
}

struct PluginDBQueryResponse: Content {
    let success: Bool
    let dbId: String
    let query: String
    let columns: [PluginDBColumnInfo]?
    let rows: [PluginDBRow]?
    let rowCount: Int?
    let executionTimeMs: Double?
    /// 错误信息
    let error: PluginDBQueryError?

    /// 成功响应
    static func success(
        dbId: String,
        query: String,
        columns: [PluginDBColumnInfo],
        rows: [PluginDBRow],
        rowCount: Int,
        executionTimeMs: Double
    ) -> PluginDBQueryResponse {
        PluginDBQueryResponse(
            success: true,
            dbId: dbId,
            query: query,
            columns: columns,
            rows: rows,
            rowCount: rowCount,
            executionTimeMs: executionTimeMs,
            error: nil
        )
    }

    /// 失败响应
    static func failure(
        dbId: String,
        query: String,
        error: PluginDBQueryError
    ) -> PluginDBQueryResponse {
        PluginDBQueryResponse(
            success: false,
            dbId: dbId,
            query: query,
            columns: nil,
            rows: nil,
            rowCount: nil,
            executionTimeMs: nil,
            error: error
        )
    }
}

/// SQL 查询错误详情
struct PluginDBQueryError: Content {
    /// 错误类型：syntax_error, table_not_found, column_not_found, access_denied, timeout, internal_error
    let type: String
    /// 原始错误消息
    let message: String
    /// 友好的错误描述
    let description: String
    /// SQL 语句建议（如果能推断出用户意图）
    let suggestions: [String]?
}

struct PluginDBSQLResponse: Content {
    let success: Bool
    let affectedRows: Int?
}

// 使用 Plugin 前缀避免与现有 DTO 冲突
struct PluginMockRuleDTO: Content {
    let id: String
    let name: String
    let urlPattern: String
    let method: String?
    let responseStatus: Int
    let isEnabled: Bool

    init(from model: MockRuleModel) {
        id = model.id ?? ""
        name = model.name

        // 从 conditionJSON 解析 urlPattern 和 method
        let decoder = JSONDecoder()
        struct ConditionJSON: Decodable {
            let urlPattern: String?
            let method: String?
        }
        let condition = (try? decoder.decode(ConditionJSON.self, from: Data(model.conditionJSON.utf8)))
        urlPattern = condition?.urlPattern ?? ""
        method = condition?.method

        // 从 actionJSON 解析 responseStatus
        struct ActionJSON: Decodable {
            let statusCode: Int?
        }
        let action = (try? decoder.decode(ActionJSON.self, from: Data(model.actionJSON.utf8)))
        responseStatus = action?.statusCode ?? 200

        isEnabled = model.enabled
    }
}

struct PluginMockRuleInput: Content {
    let name: String
    let urlPattern: String
    let method: String?
    let responseStatus: Int
    let responseHeaders: String?
    let responseBody: Data?
    let isEnabled: Bool?
}

struct PluginBreakpointRuleDTO: Content {
    let id: String
    let name: String
    let urlPattern: String?
    let method: String?
    let phase: String
    let enabled: Bool
    let priority: Int

    init(from model: BreakpointRuleModel) {
        id = model.id ?? ""
        name = model.name
        urlPattern = model.urlPattern
        method = model.method
        phase = model.phase
        enabled = model.enabled
        priority = model.priority
    }
}

struct PluginBreakpointResumeInput: Content {
    let requestId: String
    let action: String
}

// MARK: - Input DTOs

struct PluginBreakpointRuleInput: Content {
    let name: String?
    let urlPattern: String?
    let method: String?
    let phase: String?
    let enabled: Bool?
    let priority: Int?
}

struct PluginChaosRuleInput: Content {
    let name: String?
    let urlPattern: String?
    let method: String?
    let probability: Double?
    let chaos: ChaosTypeDTO?
    let enabled: Bool?
    let priority: Int?
}
