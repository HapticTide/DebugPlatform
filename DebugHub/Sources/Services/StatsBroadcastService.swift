// StatsBroadcastService.swift
// DebugHub
//
// Created by Sun on 2025/07/09.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

/// 服务器统计数据广播服务
/// 使用节流机制，避免过于频繁的广播
final class StatsBroadcastService: @unchecked Sendable {
    static let shared = StatsBroadcastService()

    private var app: Application?
    private var timer: DispatchSourceTimer?
    private var needsBroadcast = false
    private let queue = DispatchQueue(label: "com.debug-hub.stats-broadcast")
    private let lock = NSLock()

    /// 最小广播间隔（秒）
    private let minInterval: TimeInterval = 5.0

    /// 定期广播间隔（秒）- 即使没有新事件也定期广播
    private let periodicInterval: TimeInterval = 30.0

    private init() {}

    // MARK: - Configuration

    /// 配置服务
    func configure(app: Application) {
        self.app = app
        startPeriodicBroadcast()
    }

    /// 启动定期广播定时器
    private func startPeriodicBroadcast() {
        timer?.cancel()

        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + periodicInterval, repeating: periodicInterval)
        timer.setEventHandler { [weak self] in
            self?.broadcastStatsNow()
        }
        timer.resume()
        self.timer = timer

        print("[StatsBroadcast] Started periodic broadcast every \(periodicInterval)s")
    }

    /// 停止服务
    func shutdown() {
        timer?.cancel()
        timer = nil
        print("[StatsBroadcast] Shutdown complete")
    }

    // MARK: - Public API

    /// 标记需要广播（新事件入库后调用）
    /// 使用节流机制，避免过于频繁的广播
    func markNeedsBroadcast() {
        lock.lock()
        let wasNeeded = needsBroadcast
        needsBroadcast = true
        lock.unlock()

        // 如果之前已经标记过，说明已经有一个延迟广播在等待
        if !wasNeeded {
            queue.asyncAfter(deadline: .now() + minInterval) { [weak self] in
                self?.broadcastIfNeeded()
            }
        }
    }

    // MARK: - Private

    /// 如果需要则广播
    private func broadcastIfNeeded() {
        lock.lock()
        guard needsBroadcast else {
            lock.unlock()
            return
        }
        needsBroadcast = false
        lock.unlock()

        broadcastStatsNow()
    }

    /// 立即广播当前 stats
    private func broadcastStatsNow() {
        guard let app = app else { return }

        Task {
            do {
                let stats = try await fetchStats(db: app.db)
                RealtimeStreamHandler.shared.broadcastServerStats(stats)
            } catch {
                print("[StatsBroadcast] Failed to fetch/broadcast stats: \(error)")
            }
        }
    }

    /// 获取服务器统计数据
    private func fetchStats(db: Database) async throws -> ServerStatsBroadcastDTO {
        let httpCount = try await HTTPEventModel.query(on: db).count()
        let logCount = try await LogEventModel.query(on: db).count()
        let wsSessionCount = try await WSSessionModel.query(on: db).count()
        let wsFrameCount = try await WSFrameModel.query(on: db).count()
        let perfMetricsCount = try await PerformanceMetricsModel.query(on: db).count()
        let jankEventCount = try await JankEventModel.query(on: db).count()
        let alertCount = try await AlertModel.query(on: db).count()
        let mockRuleCount = try await MockRuleModel.query(on: db).count()
        let breakpointRuleCount = try await BreakpointRuleModel.query(on: db).count()
        let chaosRuleCount = try await ChaosRuleModel.query(on: db).count()
        let trafficRuleCount = try await TrafficRuleModel.query(on: db).count()
        let deviceSessionCount = try await DeviceSessionModel.query(on: db).count()
        let onlineDeviceCount = DeviceRegistry.shared.getAllSessions().count

        // 获取数据库大小
        var databaseSizeBytes: Int64?
        let databaseMode = Environment.get("DATABASE_MODE")?.lowercased() ?? "postgres"

        if databaseMode == "sqlite" {
            let dataDir = getDataDirectory()
            let dbPath = Environment.get("SQLITE_PATH") ?? "\(dataDir)/debug_hub.sqlite"
            let fileManager = FileManager.default
            if
                let attrs = try? fileManager.attributesOfItem(atPath: dbPath),
                let fileSize = attrs[.size] as? Int64
            {
                databaseSizeBytes = fileSize
            }
        }

        return ServerStatsBroadcastDTO(
            httpEventCount: httpCount,
            logEventCount: logCount,
            wsSessionCount: wsSessionCount,
            wsFrameCount: wsFrameCount,
            perfMetricsCount: perfMetricsCount,
            jankEventCount: jankEventCount,
            alertCount: alertCount,
            mockRuleCount: mockRuleCount,
            breakpointRuleCount: breakpointRuleCount,
            chaosRuleCount: chaosRuleCount,
            trafficRuleCount: trafficRuleCount,
            deviceSessionCount: deviceSessionCount,
            onlineDeviceCount: onlineDeviceCount,
            databaseSizeBytes: databaseSizeBytes,
            databaseMode: databaseMode
        )
    }
}

// MARK: - DTO

/// 服务器统计数据 DTO（用于 WebSocket 广播）
struct ServerStatsBroadcastDTO: Content {
    let httpEventCount: Int
    let logEventCount: Int
    let wsSessionCount: Int
    let wsFrameCount: Int
    let perfMetricsCount: Int
    let jankEventCount: Int
    let alertCount: Int
    let mockRuleCount: Int
    let breakpointRuleCount: Int
    let chaosRuleCount: Int
    let trafficRuleCount: Int
    let deviceSessionCount: Int
    let onlineDeviceCount: Int
    let databaseSizeBytes: Int64?
    let databaseMode: String
}
