// DatabaseController.swift
// DebugHub
//
// Created by Sun on 2025/12/05.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

struct DatabaseController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let databases = routes.grouped("devices", ":deviceId", "databases")
        
        databases.get(use: listDatabases)
        databases.get(":dbId", "tables", use: listTables)
        databases.get(":dbId", "tables", ":table", "schema", use: describeTable)
        databases.get(":dbId", "tables", ":table", "rows", use: fetchTablePage)
        databases.post(":dbId", "query", use: executeQuery)
    }
    
    // MARK: - List Databases
    
    /// GET /api/devices/{deviceId}/databases
    /// 获取设备上的所有数据库列表
    func listDatabases(req: Request) async throws -> DBListDatabasesResponseDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }
        
        // 检查设备是否在线
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
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
        
        let response = try await sendCommandAndWaitResponse(
            command: command,
            to: session,
            timeout: 10
        )
        
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            throw Abort(.internalServerError, reason: errorMsg)
        }
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DBListDatabasesResponseDTO.self, from: payload)
    }
    
    // MARK: - List Tables
    
    /// GET /api/devices/{deviceId}/databases/{dbId}/tables
    /// 获取数据库的表列表
    func listTables(req: Request) async throws -> DBListTablesResponseDTO {
        guard let deviceId = req.parameters.get("deviceId"),
              let dbId = req.parameters.get("dbId") else {
            throw Abort(.badRequest, reason: "Missing deviceId or dbId")
        }
        
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
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
        
        let response = try await sendCommandAndWaitResponse(
            command: command,
            to: session,
            timeout: 10
        )
        
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            throw Abort(.internalServerError, reason: errorMsg)
        }
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DBListTablesResponseDTO.self, from: payload)
    }
    
    // MARK: - Describe Table
    
    /// GET /api/devices/{deviceId}/databases/{dbId}/tables/{table}/schema
    /// 获取表结构
    func describeTable(req: Request) async throws -> DBDescribeTableResponseDTO {
        guard let deviceId = req.parameters.get("deviceId"),
              let dbId = req.parameters.get("dbId"),
              let table = req.parameters.get("table") else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }
        
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
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
        
        let response = try await sendCommandAndWaitResponse(
            command: command,
            to: session,
            timeout: 10
        )
        
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            throw Abort(.internalServerError, reason: errorMsg)
        }
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DBDescribeTableResponseDTO.self, from: payload)
    }
    
    // MARK: - Fetch Table Page
    
    /// GET /api/devices/{deviceId}/databases/{dbId}/tables/{table}/rows
    /// 分页获取表数据
    func fetchTablePage(req: Request) async throws -> DBTablePageResultDTO {
        guard let deviceId = req.parameters.get("deviceId"),
              let dbId = req.parameters.get("dbId"),
              let table = req.parameters.get("table") else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }
        
        // 查询参数
        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 50, 500)
        let orderBy = req.query[String.self, at: "orderBy"]
        let ascending = req.query[Bool.self, at: "ascending"] ?? true
        
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
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
            ascending: ascending
        )
        
        let response = try await sendCommandAndWaitResponse(
            command: command,
            to: session,
            timeout: 15
        )
        
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            req.logger.error("[DB] fetchTablePage failed: \(errorMsg), dbId: \(dbId), table: \(table)")
            
            // 根据错误类型返回适当的 HTTP 状态码
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
        decoder.dateDecodingStrategy = .iso8601
        
        do {
            return try decoder.decode(DBTablePageResultDTO.self, from: payload)
        } catch {
            req.logger.error("[DB] Failed to decode fetchTablePage response: \(error)")
            throw Abort(.internalServerError, reason: "Failed to decode response: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Execute Query
    
    /// POST /api/devices/{deviceId}/databases/{dbId}/query
    /// 执行 SQL 查询
    struct ExecuteQueryRequest: Content {
        let query: String
    }
    
    func executeQuery(req: Request) async throws -> DBQueryResponseDTO {
        guard let deviceId = req.parameters.get("deviceId"),
              let dbId = req.parameters.get("dbId") else {
            throw Abort(.badRequest, reason: "Missing parameters")
        }
        
        let queryRequest = try req.content.decode(ExecuteQueryRequest.self)
        
        guard let session = DeviceRegistry.shared.getSession(deviceId: deviceId) else {
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
            query: queryRequest.query
        )
        
        let response = try await sendCommandAndWaitResponse(
            command: command,
            to: session,
            timeout: 30  // SQL 查询可能需要更长时间
        )
        
        guard response.success, let payload = response.payload else {
            let errorMsg = response.error?.message ?? "Unknown error"
            throw Abort(.internalServerError, reason: errorMsg)
        }
        
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(DBQueryResponseDTO.self, from: payload)
    }
    
    // MARK: - Helper Methods
    
    /// 发送命令并等待响应
    private func sendCommandAndWaitResponse(
        command: DBCommandDTO,
        to session: DeviceSession,
        timeout: TimeInterval
    ) async throws -> DBResponseDTO {
        // 使用 continuation 来等待响应
        return try await withCheckedThrowingContinuation { continuation in
            // 注册等待响应的 handler
            DBResponseManager.shared.registerWaiter(
                requestId: command.requestId,
                timeout: timeout
            ) { response in
                if let response = response {
                    continuation.resume(returning: response)
                } else {
                    continuation.resume(throwing: Abort(.gatewayTimeout, reason: "DB command timeout"))
                }
            }
            
            // 发送命令到设备
            let message = BridgeMessageDTO.dbCommand(command)
            DeviceRegistry.shared.sendMessage(to: session.deviceInfo.deviceId, message: message)
        }
    }
}

// MARK: - DB Response Manager

/// 管理 DB 响应等待
final class DBResponseManager: @unchecked Sendable {
    static let shared = DBResponseManager()
    
    private var waiters: [String: (DBResponseDTO?) -> Void] = [:]
    private let lock = NSLock()
    
    private init() {}
    
    /// 注册等待响应的 handler
    func registerWaiter(requestId: String, timeout: TimeInterval, handler: @escaping (DBResponseDTO?) -> Void) {
        lock.lock()
        waiters[requestId] = handler
        lock.unlock()
        
        // 设置超时
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.handleTimeout(requestId: requestId)
        }
    }
    
    /// 处理收到的响应
    func handleResponse(_ response: DBResponseDTO) {
        lock.lock()
        let handler = waiters.removeValue(forKey: response.requestId)
        lock.unlock()
        
        handler?(response)
    }
    
    /// 处理超时
    private func handleTimeout(requestId: String) {
        lock.lock()
        let handler = waiters.removeValue(forKey: requestId)
        lock.unlock()
        
        handler?(nil)
    }
}
