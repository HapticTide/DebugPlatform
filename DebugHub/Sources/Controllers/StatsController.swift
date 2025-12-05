//
//  StatsController.swift
//  DebugHub
//
//  Created by Sun on 2025/12/05.
//

import Fluent
import Vapor

struct StatsController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let stats = routes.grouped("stats")
        stats.get(use: getStats)
    }
    
    // MARK: - Get Server Stats
    
    func getStats(req: Request) async throws -> ServerStatsDTO {
        // 获取各表的记录数
        let httpCount = try await HTTPEventModel.query(on: req.db).count()
        let logCount = try await LogEventModel.query(on: req.db).count()
        let wsSessionCount = try await WSSessionModel.query(on: req.db).count()
        let wsFrameCount = try await WSFrameModel.query(on: req.db).count()
        let mockRuleCount = try await MockRuleModel.query(on: req.db).count()
        let breakpointRuleCount = try await BreakpointRuleModel.query(on: req.db).count()
        let chaosRuleCount = try await ChaosRuleModel.query(on: req.db).count()
        let trafficRuleCount = try await TrafficRuleModel.query(on: req.db).count()
        let deviceSessionCount = try await DeviceSessionModel.query(on: req.db).count()
        
        // 获取数据库文件大小（如果是 SQLite）
        var databaseSizeBytes: Int64?
        if let sqliteConfig = Environment.get("DATABASE_MODE"), sqliteConfig.lowercased() == "sqlite" {
            let dataDir = getDataDirectory()
            let dbPath = Environment.get("SQLITE_PATH") ?? "\(dataDir)/debug_hub.sqlite"
            let fileManager = FileManager.default
            if let attrs = try? fileManager.attributesOfItem(atPath: dbPath),
               let fileSize = attrs[.size] as? Int64 {
                databaseSizeBytes = fileSize
            }
        }
        
        // 在线设备数量
        let onlineDeviceCount = DeviceRegistry.shared.getAllSessions().count
        
        return ServerStatsDTO(
            httpEventCount: httpCount,
            logEventCount: logCount,
            wsSessionCount: wsSessionCount,
            wsFrameCount: wsFrameCount,
            mockRuleCount: mockRuleCount,
            breakpointRuleCount: breakpointRuleCount,
            chaosRuleCount: chaosRuleCount,
            trafficRuleCount: trafficRuleCount,
            deviceSessionCount: deviceSessionCount,
            onlineDeviceCount: onlineDeviceCount,
            databaseSizeBytes: databaseSizeBytes,
            databaseMode: Environment.get("DATABASE_MODE") ?? "postgres"
        )
    }
}

// MARK: - DTOs

struct ServerStatsDTO: Content {
    let httpEventCount: Int
    let logEventCount: Int
    let wsSessionCount: Int
    let wsFrameCount: Int
    let mockRuleCount: Int
    let breakpointRuleCount: Int
    let chaosRuleCount: Int
    let trafficRuleCount: Int
    let deviceSessionCount: Int
    let onlineDeviceCount: Int
    let databaseSizeBytes: Int64?
    let databaseMode: String
}
