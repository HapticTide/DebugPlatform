// DatabaseDTOs.swift
// DebugHub
//
// Created by Sun on 2025/12/05.
// Copyright © 2025 Sun. All rights reserved.
//

import Foundation
import Vapor

// MARK: - Database Descriptor DTO

/// 数据库描述符
struct DatabaseDescriptorDTO: Content {
    /// 数据库类型（使用字符串以便扩展）
    typealias Kind = String

    /// 账户归属状态
    enum AccountOwnership: String, Content {
        /// 属于当前活跃用户
        case currentUser
        /// 共享数据库（不属于任何特定用户）
        case shared
        /// 属于其他用户（非当前登录用户）
        case otherUser
    }

    enum Location: Content {
        case appSupport(relative: String)
        case documents(relative: String)
        case caches(relative: String)
        case group(containerId: String, relative: String)
        case custom(description: String)
    }

    let id: String
    let name: String
    let kind: Kind
    let location: Location
    let isSensitive: Bool
    let visibleInInspector: Bool
    /// 账户归属状态（多账户场景下用于区分）
    let ownership: AccountOwnership
    /// 数据库所有者标识符
    /// - 对于 currentUser：当前用户 UUID
    /// - 对于 otherUser：其他用户 UUID
    /// - 对于 shared：nil
    let ownerIdentifier: String?
    /// 数据库所有者的显示名称（易读标识）
    /// 用于在 Inspector 中展示更友好的用户名
    /// - 如果未提供，WebUI 将回退显示 ownerIdentifier
    let ownerDisplayName: String?
    /// 是否为加密数据库
    let isEncrypted: Bool
    /// 加密类型（如 "SQLCipher"、"SQLite SEE" 等）
    let encryptionType: String?
}

// MARK: - Encryption Status

/// 加密数据库的解锁状态
enum EncryptionStatusDTO: String, Content {
    /// 未加密（普通数据库）
    case none
    /// 加密且已解锁（有 keyProvider 且验证成功）
    case unlocked
    /// 加密但未解锁（无 keyProvider 或验证失败）
    case locked
}

// MARK: - DB Info DTO

/// 数据库信息（包含表数量）
struct DBInfoDTO: Content {
    let descriptor: DatabaseDescriptorDTO
    let tableCount: Int
    let fileSizeBytes: Int64?
    /// 数据库文件的绝对路径
    let absolutePath: String?
    /// 加密状态
    let encryptionStatus: EncryptionStatusDTO
}

// MARK: - Table Info DTO

/// 表信息
struct DBTableInfoDTO: Content {
    let name: String
    let rowCount: Int?
}

// MARK: - Column Info DTO

/// 列信息
struct DBColumnInfoDTO: Content {
    let name: String
    let type: String?
    let notNull: Bool
    let primaryKey: Bool
    let defaultValue: String?
}

// MARK: - Row DTO

/// 行数据
struct DBRowDTO: Content {
    let values: [String: String?]
}

// MARK: - Table Page Result DTO

/// 分页查询结果
struct DBTablePageResultDTO: Content {
    let dbId: String
    let table: String
    let page: Int
    let pageSize: Int
    let totalRows: Int?
    let columns: [DBColumnInfoDTO]
    let rows: [DBRowDTO]
}

// MARK: - DB Command DTO

/// 数据库命令类型
enum DBCommandKindDTO: String, Content {
    case listDatabases
    case listTables
    case describeTable
    case fetchTablePage
    case executeQuery
}

/// 数据库命令
struct DBCommandDTO: Content {
    let requestId: String
    let kind: DBCommandKindDTO
    let dbId: String?
    let table: String?
    let page: Int?
    let pageSize: Int?
    let orderBy: String?
    let ascending: Bool?
    let query: String? // SQL 查询语句

    init(
        requestId: String,
        kind: DBCommandKindDTO,
        dbId: String? = nil,
        table: String? = nil,
        page: Int? = nil,
        pageSize: Int? = nil,
        orderBy: String? = nil,
        ascending: Bool? = nil,
        query: String? = nil
    ) {
        self.requestId = requestId
        self.kind = kind
        self.dbId = dbId
        self.table = table
        self.page = page
        self.pageSize = pageSize
        self.orderBy = orderBy
        self.ascending = ascending
        self.query = query
    }
}

// MARK: - DB Response DTO

/// DB Inspector 错误
enum DBInspectorErrorDTO: Content {
    case databaseNotFound(String)
    case tableNotFound(String)
    case invalidQuery(String)
    case timeout
    case accessDenied(String)
    case internalError(String)

    var message: String {
        switch self {
        case let .databaseNotFound(id):
            "Database not found: \(id)"
        case let .tableNotFound(name):
            "Table not found: \(name)"
        case let .invalidQuery(reason):
            "Invalid query: \(reason)"
        case .timeout:
            "Operation timeout"
        case let .accessDenied(reason):
            "Access denied: \(reason)"
        case let .internalError(msg):
            "Internal error: \(msg)"
        }
    }
}

/// 数据库响应
struct DBResponseDTO: Content {
    let requestId: String
    let success: Bool
    let payload: Data?
    let error: DBInspectorErrorDTO?
}

// MARK: - Response Wrapper DTOs

/// 数据库列表响应
struct DBListDatabasesResponseDTO: Content {
    let databases: [DBInfoDTO]
}

/// 表列表响应
struct DBListTablesResponseDTO: Content {
    let dbId: String
    let tables: [DBTableInfoDTO]
}

/// 表结构响应
struct DBDescribeTableResponseDTO: Content {
    let dbId: String
    let table: String
    let columns: [DBColumnInfoDTO]
}

/// SQL 查询响应
struct DBQueryResponseDTO: Content {
    let dbId: String
    let query: String
    let columns: [DBColumnInfoDTO]
    let rows: [DBRowDTO]
    let rowCount: Int
    let executionTimeMs: Double
}
