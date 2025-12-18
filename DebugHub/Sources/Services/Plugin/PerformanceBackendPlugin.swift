// PerformanceBackendPlugin.swift
// DebugHub
//
// Created by Sun on 2025/12/11.
// Copyright © 2025 Sun. All rights reserved.
//

import Fluent
import Foundation
import Vapor

// MARK: - Performance Backend Plugin

/// 性能监控后端插件
/// 负责接收、存储和查询性能指标数据
public final class PerformanceBackendPlugin: BackendPlugin, @unchecked Sendable {
    public let pluginId = BackendPluginId.performance
    public let displayName = "Performance"
    public let version = "1.0.0"
    public let pluginDescription = "性能监控后端"
    public let dependencies: [String] = []

    public private(set) var state: BackendPluginState = .uninitialized
    private var context: BackendPluginContext?

    /// 内存中缓存的实时指标（按设备 ID 分组）
    private var realtimeMetrics: [String: [PerformanceMetricsDTO]] = [:]
    private let metricsLock = NSLock()

    /// 内存中缓存的活跃告警（按设备 ID 分组）
    private var activeAlerts: [String: [AlertDTO]] = [:]
    private let alertsLock = NSLock()

    /// 内存中缓存的 App 启动时间（按设备 ID）
    private var appLaunchMetrics: [String: AppLaunchMetricsDTO] = [:]
    private let launchLock = NSLock()

    /// 最大缓存数量（每设备）
    private let maxCacheSize = 300 // 5 分钟的数据（1秒1条）

    public init() {}

    public func boot(context: BackendPluginContext) async throws {
        self.context = context
        state = .running
        context.logger.info("PerformanceBackendPlugin booted")
    }

    public func registerRoutes(on routes: RoutesBuilder) throws {
        let perf = routes.grouped("devices", ":deviceId", "performance")

        // 实时指标
        perf.get("realtime", use: getRealtimeMetrics)
        // 历史指标
        perf.get("history", use: getHistoryMetrics)

        // 趋势分析
        perf.get("trends", use: getTrends)

        // 卡顿事件
        perf.get("janks", use: listJankEvents)

        // 当前状态
        perf.get("status", use: getStatus)

        // 配置
        perf.post("config", use: updateConfig)

        // 清除数据
        perf.delete(use: clearMetrics)

        // 告警相关路由
        let alerts = perf.grouped("alerts")
        alerts.get(use: listAlerts)
        alerts.get("config", use: getAlertConfig)
        alerts.post("config", use: setAlertConfig)
        alerts.get("rules", use: listAlertRules)
        alerts.post("rules", use: addAlertRule)
        alerts.delete("rules", ":ruleId", use: deleteAlertRule)
        alerts.put("rules", ":ruleId", use: updateAlertRule)
        alerts.post(":alertId", "resolve", use: resolveAlert)

        // App 启动时间
        perf.get("launch", use: getAppLaunchMetrics)

        // Page Timing 路由
        let pageTiming = perf.grouped("page-timings")
        pageTiming.get(use: listPageTimingEvents)
        pageTiming.get("summary", use: getPageTimingSummary)
        pageTiming.get(":eventId", use: getPageTimingEvent)
        pageTiming.delete(use: deleteAllPageTimingEvents)
    }

    public func handleEvent(_ event: PluginEventDTO, from deviceId: String) async {
        switch event.eventType {
        case "performance_metrics":
            await handlePerformanceMetrics(event, from: deviceId)
        case "jank_event":
            await handleJankEvent(event, from: deviceId)
        case "performance_alert":
            await handlePerformanceAlert(event, from: deviceId)
        case "app_launch":
            await handleAppLaunchEvent(event, from: deviceId)
        case "page_timing":
            await handlePageTimingEvent(event, from: deviceId)
        default:
            break
        }
    }

    // MARK: - Synchronized Cache Access

    /// 同步添加指标到缓存
    private func addMetricsToCache(_ metrics: [PerformanceMetricsDTO], deviceId: String) {
        metricsLock.lock()
        defer { metricsLock.unlock() }
        if realtimeMetrics[deviceId] == nil {
            realtimeMetrics[deviceId] = []
        }
        realtimeMetrics[deviceId]?.append(contentsOf: metrics)

        // 限制缓存大小
        if let count = realtimeMetrics[deviceId]?.count, count > maxCacheSize {
            realtimeMetrics[deviceId]?.removeFirst(count - maxCacheSize)
        }
    }

    /// 同步获取缓存指标
    private func getCachedMetrics(deviceId: String) -> [PerformanceMetricsDTO] {
        metricsLock.lock()
        defer { metricsLock.unlock() }
        return realtimeMetrics[deviceId] ?? []
    }

    /// 同步清除缓存
    private func clearCachedMetrics(deviceId: String) {
        metricsLock.lock()
        defer { metricsLock.unlock() }
        realtimeMetrics[deviceId] = []
        appLaunchMetrics[deviceId] = nil
    }

    /// 同步清除告警缓存
    private func clearCachedAlerts(deviceId: String) {
        alertsLock.lock()
        defer { alertsLock.unlock() }
        activeAlerts[deviceId] = []
    }

    /// 同步清除所有缓存
    private func clearAllCachedMetrics() {
        metricsLock.lock()
        defer { metricsLock.unlock() }
        realtimeMetrics.removeAll()
    }

    /// 同步添加告警到缓存
    private func addAlertToCache(_ alert: AlertDTO, deviceId: String) {
        alertsLock.lock()
        defer { alertsLock.unlock() }

        if activeAlerts[deviceId] == nil {
            activeAlerts[deviceId] = []
        }
        // 如果是已解决的告警，从活跃列表移除
        if alert.isResolved {
            activeAlerts[deviceId]?.removeAll { $0.id == alert.id }
        } else {
            // 检查是否已存在
            if let index = activeAlerts[deviceId]?.firstIndex(where: { $0.id == alert.id }) {
                activeAlerts[deviceId]?[index] = alert
            } else {
                activeAlerts[deviceId]?.append(alert)
            }
        }
    }

    /// 同步获取活跃告警
    private func getActiveAlertsFromCache(deviceId: String) -> [AlertDTO] {
        alertsLock.lock()
        defer { alertsLock.unlock() }
        return activeAlerts[deviceId] ?? []
    }

    /// 同步解决告警
    private func resolveAlertInCache(alertId: String, deviceId: String) -> AlertDTO? {
        alertsLock.lock()
        defer { alertsLock.unlock() }

        if let index = activeAlerts[deviceId]?.firstIndex(where: { $0.id == alertId }) {
            var alert = activeAlerts[deviceId]![index]
            alert.isResolved = true
            alert.resolvedAt = Date()
            activeAlerts[deviceId]?.remove(at: index)
            return alert
        }
        return nil
    }

    /// 同步添加 App 启动时间到缓存
    private func addAppLaunchToCache(_ metrics: AppLaunchMetricsDTO, deviceId: String) {
        launchLock.lock()
        defer { launchLock.unlock() }
        appLaunchMetrics[deviceId] = metrics
    }

    /// 同步获取 App 启动时间
    private func getAppLaunchFromCache(deviceId: String) -> AppLaunchMetricsDTO? {
        launchLock.lock()
        defer { launchLock.unlock() }
        return appLaunchMetrics[deviceId]
    }

    // MARK: - Event Handlers

    private func handlePerformanceMetrics(_ event: PluginEventDTO, from deviceId: String) async {
        do {
            let batch = try event.decodePayload(as: PerformanceMetricsBatchDTO.self)

            // 添加到内存缓存（同步操作）
            addMetricsToCache(batch.metrics, deviceId: deviceId)

            // 保存到数据库（用于历史查询）
            try await saveMetricsToDB(batch.metrics, deviceId: deviceId)

            // 广播到 WebUI
            let wsEvent: [String: Any] = [
                "type": "performance_metrics",
                "deviceId": deviceId,
                "data": batch.metrics.map { $0.toDictionary() },
            ]
            context?.broadcastToWebUI(wsEvent, deviceId: deviceId)

        } catch {
            context?.logger.error("Failed to process performance metrics: \(error)")
        }
    }

    private func handleJankEvent(_ event: PluginEventDTO, from deviceId: String) async {
        do {
            let jankEvent = try event.decodePayload(as: JankEventDTO.self)

            // 保存到数据库
            try await saveJankEventToDB(jankEvent, deviceId: deviceId)

            // 构建 PerformanceEventDTO 并通过 RealtimeStreamHandler 广播
            // 这样 WebUI 可以通过标准的 performanceEvent 消息接收
            let perfEventDTO = PerformanceEventDTO(
                id: jankEvent.id,
                eventType: "jank",
                timestamp: jankEvent.timestamp,
                metrics: nil,
                jank: PerfJankEventDTO(
                    id: jankEvent.id,
                    timestamp: jankEvent.timestamp,
                    duration: jankEvent.duration,
                    droppedFrames: jankEvent.droppedFrames,
                    stackTrace: jankEvent.stackTrace
                ),
                alert: nil,
                appLaunch: nil,
                pageTiming: nil
            )

            // 通过 RealtimeStreamHandler 广播给 WebUI
            RealtimeStreamHandler.shared.broadcast(events: [.performance(perfEventDTO)], deviceId: deviceId)

        } catch {
            context?.logger.error("Failed to process jank event: \(error)")
        }
    }

    private func handlePerformanceAlert(_ event: PluginEventDTO, from deviceId: String) async {
        do {
            let alert = try event.decodePayload(as: AlertDTO.self)

            // 添加到内存缓存
            addAlertToCache(alert, deviceId: deviceId)

            // 保存到数据库
            try await saveAlertToDB(alert, deviceId: deviceId)

            // 广播到 WebUI
            let wsEvent: [String: Any] = [
                "type": "performance_alert",
                "deviceId": deviceId,
                "data": alert.toDictionary(),
            ]
            context?.broadcastToWebUI(wsEvent, deviceId: deviceId)

            // 记录告警日志
            let logLevel = alert.severity == "critical" ? "error" : "warning"
            context?.logger.log(
                level: logLevel == "error" ? .error : .warning,
                "\(alert.message) [device: \(deviceId)]"
            )

        } catch {
            context?.logger.error("Failed to process performance alert: \(error)")
        }
    }

    private func handleAppLaunchEvent(_ event: PluginEventDTO, from deviceId: String) async {
        do {
            let launchMetrics = try event.decodePayload(as: AppLaunchMetricsDTO.self)

            // 保存到内存缓存
            addAppLaunchToCache(launchMetrics, deviceId: deviceId)

            // 保存到数据库（不依赖 WebUI 是否打开）
            await saveAppLaunchToDB(launchMetrics, deviceId: deviceId)

            // 构建 PerformanceEventDTO 并通过 RealtimeStreamHandler 广播
            // 这样 WebUI 可以通过标准的 performanceEvent 消息接收
            let perfEventDTO = PerformanceEventDTO(
                id: UUID().uuidString,
                eventType: "appLaunch",
                timestamp: launchMetrics.timestamp,
                metrics: nil,
                jank: nil,
                alert: nil,
                appLaunch: PerfAppLaunchDTO(
                    totalTime: launchMetrics.totalTime,
                    preMainTime: launchMetrics.preMainTime,
                    mainToLaunchTime: launchMetrics.mainToLaunchTime,
                    launchToFirstFrameTime: launchMetrics.launchToFirstFrameTime,
                    timestamp: launchMetrics.timestamp
                ),
                pageTiming: nil
            )

            // 通过 RealtimeStreamHandler 广播给 WebUI
            RealtimeStreamHandler.shared.broadcast(events: [.performance(perfEventDTO)], deviceId: deviceId)

            // 构建日志输出
            var logParts = ["App launch recorded: total=\(launchMetrics.totalTime)ms"]
            if let preMain = launchMetrics.preMainTime {
                logParts.append("preMain=\(preMain)ms")
            }
            if let mainToLaunch = launchMetrics.mainToLaunchTime {
                logParts.append("mainToLaunch=\(mainToLaunch)ms")
            }
            if let launchToFrame = launchMetrics.launchToFirstFrameTime {
                logParts.append("launchToFirstFrame=\(launchToFrame)ms")
            }
            context?.logger.info("\(logParts.joined(separator: ", ")) [device: \(deviceId)]")

        } catch {
            context?.logger.error("Failed to process app launch event: \(error)")
        }
    }

    /// 保存 App 启动时间到数据库
    private func saveAppLaunchToDB(_ metrics: AppLaunchMetricsDTO, deviceId: String) async {
        guard let db = context?.database else { return }

        let model = AppLaunchEventModel(
            deviceId: deviceId,
            totalTime: metrics.totalTime,
            preMainTime: metrics.preMainTime,
            mainToLaunchTime: metrics.mainToLaunchTime,
            launchToFirstFrameTime: metrics.launchToFirstFrameTime,
            timestamp: metrics.timestamp
        )

        do {
            try await model.save(on: db)
            context?.logger.info("App launch event saved to database [device: \(deviceId)]")
        } catch {
            context?.logger.error("Failed to save app launch event to database: \(error)")
        }
    }

    // MARK: - Database Operations

    private func saveMetricsToDB(_ metrics: [PerformanceMetricsDTO], deviceId: String) async throws {
        guard let db = context?.database else { return }

        for metric in metrics {
            let model = PerformanceMetricsModel(
                deviceId: deviceId,
                timestamp: metric.timestamp,
                cpuUsage: metric.cpu?.usage,
                cpuUserTime: metric.cpu?.userTime,
                cpuSystemTime: metric.cpu?.systemTime,
                threadCount: metric.cpu?.threadCount,
                memoryUsed: metric.memory?.usedMemory,
                memoryPeak: metric.memory?.peakMemory,
                memoryFree: metric.memory?.freeMemory,
                memoryPressure: metric.memory?.memoryPressure,
                memoryFootprintRatio: metric.memory?.footprintRatio,
                fps: metric.fps?.fps,
                droppedFrames: metric.fps?.droppedFrames,
                jankCount: metric.fps?.jankCount,
                averageRenderTime: metric.fps?.averageRenderTime
            )
            try await model.save(on: db)
        }
    }

    private func saveJankEventToDB(_ event: JankEventDTO, deviceId: String) async throws {
        guard let db = context?.database else { return }

        let model = JankEventModel(
            id: UUID(uuidString: event.id) ?? UUID(),
            deviceId: deviceId,
            timestamp: event.timestamp,
            duration: event.duration,
            droppedFrames: event.droppedFrames,
            stackTrace: event.stackTrace
        )
        try await model.save(on: db)
    }

    private func saveAlertToDB(_ alert: AlertDTO, deviceId: String) async throws {
        guard let db = context?.database else { return }

        let model = AlertModel(
            id: UUID(uuidString: alert.id) ?? UUID(),
            deviceId: deviceId,
            ruleId: alert.ruleId,
            metricType: alert.metricType,
            severity: alert.severity,
            message: alert.message,
            currentValue: alert.currentValue,
            threshold: alert.threshold,
            timestamp: alert.timestamp,
            isResolved: alert.isResolved,
            resolvedAt: alert.resolvedAt
        )
        try await model.save(on: db)
    }

    // MARK: - Route Handlers

    /// 获取实时指标
    func getRealtimeMetrics(req: Request) async throws -> PerformanceRealtimeResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let seconds = req.query[Int.self, at: "seconds"] ?? 60

        // 使用同步方法获取缓存
        let metrics = getCachedMetrics(deviceId: deviceId)

        // 过滤指定时间范围内的数据
        let cutoff = Date().addingTimeInterval(-TimeInterval(seconds))
        let filtered = metrics.filter { $0.timestamp >= cutoff }

        return PerformanceRealtimeResponse(
            metrics: filtered,
            deviceId: deviceId,
            rangeSeconds: seconds
        )
    }

    /// 获取历史指标
    func getHistoryMetrics(req: Request) async throws -> PerformanceHistoryResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let startTime = req.query[Date.self, at: "startTime"]
        let endTime = req.query[Date.self, at: "endTime"] ?? Date()
        let interval = req.query[Int.self, at: "interval"] ?? 60 // 聚合间隔（秒）

        var query = PerformanceMetricsModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)

        if let start = startTime {
            query = query.filter(\.$timestamp >= start)
        }
        query = query.filter(\.$timestamp <= endTime)

        let metrics = try await query
            .sort(\.$timestamp, .ascending)
            .all()

        // 按间隔聚合数据
        let aggregated = aggregateMetrics(metrics, interval: interval)

        return PerformanceHistoryResponse(
            metrics: aggregated,
            deviceId: deviceId,
            startTime: startTime,
            endTime: endTime,
            intervalSeconds: interval
        )
    }

    /// 获取性能趋势分析
    func getTrends(req: Request) async throws -> PerformanceTrendsResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 分析时间范围（默认最近1小时）
        let minutes = req.query[Int.self, at: "minutes"] ?? 60
        let cutoff = Date().addingTimeInterval(-TimeInterval(minutes * 60))

        let metrics = try await PerformanceMetricsModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .filter(\.$timestamp >= cutoff)
            .sort(\.$timestamp, .ascending)
            .all()

        guard metrics.count >= 2 else {
            return PerformanceTrendsResponse(
                deviceId: deviceId,
                analysisMinutes: minutes,
                dataPoints: metrics.count,
                cpu: nil,
                memory: nil,
                fps: nil,
                overall: .stable,
                recommendations: ["数据点不足，无法进行趋势分析"]
            )
        }

        // 将数据分成前后两半进行对比
        let midIndex = metrics.count / 2
        let firstHalf = Array(metrics[0..<midIndex])
        let secondHalf = Array(metrics[midIndex...])

        // CPU 趋势分析
        let cpuTrend = analyzeTrend(
            first: firstHalf.compactMap(\.cpuUsage),
            second: secondHalf.compactMap(\.cpuUsage),
            metricName: "CPU"
        )

        // 内存趋势分析
        let memoryTrend = analyzeTrend(
            first: firstHalf.compactMap(\.memoryFootprintRatio).map { $0 * 100 },
            second: secondHalf.compactMap(\.memoryFootprintRatio).map { $0 * 100 },
            metricName: "Memory"
        )

        // FPS 趋势分析（FPS 下降是负面趋势）
        let fpsTrend = analyzeTrend(
            first: firstHalf.compactMap(\.fps),
            second: secondHalf.compactMap(\.fps),
            metricName: "FPS",
            invertTrend: true
        )

        // 综合评估
        let trends = [cpuTrend?.trend, memoryTrend?.trend, fpsTrend?.trend].compactMap(\.self)
        let degradingCount = trends.count(where: { $0 == .degrading })
        let improvingCount = trends.count(where: { $0 == .improving })

        let overall: TrendDirection = if degradingCount >= 2 {
            .degrading
        } else if improvingCount >= 2 {
            .improving
        } else {
            .stable
        }

        // 生成建议
        var recommendations: [String] = []

        if let cpu = cpuTrend, cpu.trend == .degrading {
            recommendations.append("CPU 使用率呈上升趋势（+\(String(format: "%.1f", cpu.changePercent))%），建议检查后台任务或优化算法")
        }
        if let memory = memoryTrend, memory.trend == .degrading {
            recommendations.append("内存使用呈上升趋势（+\(String(format: "%.1f", memory.changePercent))%），可能存在内存泄漏")
        }
        if let fps = fpsTrend, fps.trend == .degrading {
            recommendations.append("帧率呈下降趋势（\(String(format: "%.1f", fps.changePercent))%），建议优化 UI 渲染性能")
        }

        if recommendations.isEmpty, overall == .stable {
            recommendations.append("性能表现稳定，无明显异常")
        } else if overall == .improving {
            recommendations.append("整体性能呈改善趋势")
        }

        return PerformanceTrendsResponse(
            deviceId: deviceId,
            analysisMinutes: minutes,
            dataPoints: metrics.count,
            cpu: cpuTrend,
            memory: memoryTrend,
            fps: fpsTrend,
            overall: overall,
            recommendations: recommendations
        )
    }

    /// 分析单项指标趋势
    private func analyzeTrend(
        first: [Double],
        second: [Double],
        metricName: String,
        invertTrend: Bool = false
    ) -> MetricTrend? {
        guard !first.isEmpty, !second.isEmpty else { return nil }

        let firstAvg = first.reduce(0, +) / Double(first.count)
        let secondAvg = second.reduce(0, +) / Double(second.count)

        let change = secondAvg - firstAvg
        let changePercent = firstAvg > 0 ? (change / firstAvg) * 100 : 0

        // 判断趋势方向（5% 以上的变化视为显著）
        let trend: TrendDirection
        let significantChange = abs(changePercent) > 5

        if !significantChange {
            trend = .stable
        } else if invertTrend {
            // FPS：下降是负面，上升是正面
            trend = change < 0 ? .degrading : .improving
        } else {
            // CPU/Memory：上升是负面，下降是正面
            trend = change > 0 ? .degrading : .improving
        }

        return MetricTrend(
            metricName: metricName,
            trend: trend,
            firstHalfAverage: firstAvg,
            secondHalfAverage: secondAvg,
            changePercent: changePercent,
            minValue: min(first.min() ?? 0, second.min() ?? 0),
            maxValue: max(first.max() ?? 0, second.max() ?? 0)
        )
    }

    /// 列出卡顿事件
    func listJankEvents(req: Request) async throws -> JankEventListResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 50, 200)
        let minDuration = req.query[Double.self, at: "minDuration"]

        var query = JankEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)

        if let min = minDuration {
            query = query.filter(\.$duration >= min)
        }

        let total = try await query.count()
        let events = try await query
            .sort(\.$timestamp, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        let items = events.map { JankEventItemDTO(from: $0) }

        return JankEventListResponse(
            items: items,
            total: total,
            page: page,
            pageSize: pageSize
        )
    }

    /// 获取 App 启动时间指标（包含历史和统计）
    func getAppLaunchMetrics(req: Request) async throws -> AppLaunchResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 从内存获取最新启动数据
        let launchMetrics = getAppLaunchFromCache(deviceId: deviceId)

        // 从数据库获取历史数据（最近 100 条，按时间倒序）
        let historyModels = try await AppLaunchEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .sort(\.$timestamp, .descending)
            .limit(100)
            .all()

        let history = historyModels.map { model in
            AppLaunchHistoryItem(
                id: model.id?.uuidString ?? UUID().uuidString,
                totalTime: model.totalTime,
                preMainTime: model.preMainTime,
                mainToLaunchTime: model.mainToLaunchTime,
                launchToFirstFrameTime: model.launchToFirstFrameTime,
                timestamp: model.timestamp
            )
        }

        // 计算统计指标
        var stats: AppLaunchStats?
        if !historyModels.isEmpty {
            let totalTimes = historyModels.map(\.totalTime).sorted()
            let count = totalTimes.count

            // 计算百分位数
            let p50Index = count / 2
            let p90Index = Int(Double(count) * 0.9)
            let p95Index = Int(Double(count) * 0.95)

            // 计算各阶段平均值
            let preMainTimes = historyModels.compactMap(\.preMainTime)
            let mainToLaunchTimes = historyModels.compactMap(\.mainToLaunchTime)
            let launchToFirstFrameTimes = historyModels.compactMap(\.launchToFirstFrameTime)

            stats = AppLaunchStats(
                count: count,
                avgTotalTime: totalTimes.reduce(0, +) / Double(count),
                minTotalTime: totalTimes.first ?? 0,
                maxTotalTime: totalTimes.last ?? 0,
                p50TotalTime: totalTimes[min(p50Index, count - 1)],
                p90TotalTime: totalTimes[min(p90Index, count - 1)],
                p95TotalTime: totalTimes[min(p95Index, count - 1)],
                avgPreMainTime: preMainTimes.isEmpty ? nil : preMainTimes.reduce(0, +) / Double(preMainTimes.count),
                avgMainToLaunchTime: mainToLaunchTimes.isEmpty
                    ? nil
                    : mainToLaunchTimes.reduce(0, +) / Double(mainToLaunchTimes.count),
                avgLaunchToFirstFrameTime: launchToFirstFrameTimes.isEmpty
                    ? nil
                    : launchToFirstFrameTimes.reduce(0, +) / Double(launchToFirstFrameTimes.count)
            )
        }

        return AppLaunchResponse(
            deviceId: deviceId,
            launchMetrics: launchMetrics,
            history: history,
            stats: stats
        )
    }

    /// 获取状态
    func getStatus(req: Request) async throws -> PerformanceStatusResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 使用同步方法获取缓存
        let metrics = getCachedMetrics(deviceId: deviceId)
        let latest = metrics.last

        // 获取卡顿统计
        let jankCount = try await JankEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .filter(\.$timestamp >= Date().addingTimeInterval(-3600)) // 最近 1 小时
            .count()

        return PerformanceStatusResponse(
            deviceId: deviceId,
            isMonitoring: latest != nil,
            lastMetrics: latest,
            recentJankCount: jankCount
        )
    }

    /// 更新配置
    func updateConfig(req: Request) async throws -> PerformanceConfigResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let config = try req.content.decode(PerformanceConfigInput.self)

        // 发送配置命令到设备
        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "set_config",
            encodable: config
        )

        await context?.sendCommand(command, to: deviceId)

        return PerformanceConfigResponse(success: true, message: "Config sent to device")
    }

    /// 清除指标数据
    func clearMetrics(req: Request) async throws -> PerformanceClearResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 清除内存缓存（同步操作）
        clearCachedMetrics(deviceId: deviceId)
        clearCachedAlerts(deviceId: deviceId)

        // 清除数据库数据 - Performance Metrics
        let metricsCount = try await PerformanceMetricsModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .count()

        try await PerformanceMetricsModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        // 清除数据库数据 - Jank Events
        let jankCount = try await JankEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .count()

        try await JankEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        // 清除数据库数据 - App Launch Events
        try await AppLaunchEventModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        // 清除数据库数据 - Alerts
        try await AlertModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)
            .delete()

        return PerformanceClearResponse(
            deletedMetrics: metricsCount,
            deletedJanks: jankCount
        )
    }

    // MARK: - Alert Route Handlers

    /// 获取告警列表
    func listAlerts(req: Request) async throws -> AlertListResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let page = req.query[Int.self, at: "page"] ?? 1
        let pageSize = min(req.query[Int.self, at: "pageSize"] ?? 50, 200)
        let includeResolved = req.query[Bool.self, at: "includeResolved"] ?? false

        var query = AlertModel.query(on: req.db)
            .filter(\.$deviceId == deviceId)

        if !includeResolved {
            query = query.filter(\.$isResolved == false)
        }

        let total = try await query.count()
        let alerts = try await query
            .sort(\.$timestamp, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        let items = alerts.map { AlertDTO(from: $0) }

        return AlertListResponse(
            items: items,
            total: total,
            page: page,
            pageSize: pageSize,
            activeCount: items.count(where: { !$0.isResolved })
        )
    }

    /// 获取告警配置
    func getAlertConfig(req: Request) async throws -> AlertConfigResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 发送命令到设备获取配置
        let command = PluginCommandDTO(
            pluginId: pluginId,
            commandType: "get_alert_config"
        )

        await context?.sendCommand(command, to: deviceId)

        // 返回默认配置（实际配置会通过 WebSocket 返回）
        return AlertConfigResponse(
            rules: AlertRuleDTO.defaultRules,
            cooldownSeconds: 60,
            isEnabled: true
        )
    }

    /// 设置告警配置
    func setAlertConfig(req: Request) async throws -> AlertConfigUpdateResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let config = try req.content.decode(AlertConfigInput.self)

        // 发送配置命令到设备
        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "set_alert_config",
            encodable: config
        )

        await context?.sendCommand(command, to: deviceId)

        return AlertConfigUpdateResponse(success: true, message: "Alert config sent to device")
    }

    /// 获取告警规则列表
    func listAlertRules(req: Request) async throws -> AlertRulesResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // 发送命令到设备获取配置
        let command = PluginCommandDTO(
            pluginId: pluginId,
            commandType: "get_alert_config"
        )

        await context?.sendCommand(command, to: deviceId)

        // 返回默认规则（实际规则会通过 WebSocket 返回）
        return AlertRulesResponse(rules: AlertRuleDTO.defaultRules)
    }

    /// 添加告警规则
    func addAlertRule(req: Request) async throws -> AlertRuleUpdateResponse {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        let rule = try req.content.decode(AlertRuleInput.self)

        // 发送命令到设备
        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "add_alert_rule",
            encodable: rule.toDTO()
        )

        await context?.sendCommand(command, to: deviceId)

        return AlertRuleUpdateResponse(success: true, message: "Alert rule added")
    }

    /// 删除告警规则
    func deleteAlertRule(req: Request) async throws -> AlertRuleUpdateResponse {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let ruleId = req.parameters.get("ruleId")
        else {
            throw Abort(.badRequest, reason: "Missing deviceId or ruleId")
        }

        struct RemovePayload: Codable {
            let ruleId: String
        }

        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "remove_alert_rule",
            encodable: RemovePayload(ruleId: ruleId)
        )

        await context?.sendCommand(command, to: deviceId)

        return AlertRuleUpdateResponse(success: true, message: "Alert rule removed")
    }

    /// 更新告警规则
    func updateAlertRule(req: Request) async throws -> AlertRuleUpdateResponse {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let ruleId = req.parameters.get("ruleId")
        else {
            throw Abort(.badRequest, reason: "Missing deviceId or ruleId")
        }

        var rule = try req.content.decode(AlertRuleInput.self)
        rule.id = ruleId

        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "update_alert_rule",
            encodable: rule.toDTO()
        )

        await context?.sendCommand(command, to: deviceId)

        return AlertRuleUpdateResponse(success: true, message: "Alert rule updated")
    }

    /// 解决告警
    func resolveAlert(req: Request) async throws -> AlertResolveResponse {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let alertId = req.parameters.get("alertId")
        else {
            throw Abort(.badRequest, reason: "Missing deviceId or alertId")
        }

        // 更新内存缓存
        let resolvedAlert = resolveAlertInCache(alertId: alertId, deviceId: deviceId)

        // 更新数据库
        if let alert = try await AlertModel.find(UUID(uuidString: alertId), on: req.db) {
            alert.isResolved = true
            alert.resolvedAt = Date()
            try await alert.save(on: req.db)
        }

        // 发送命令到设备
        struct ResolvePayload: Codable {
            let alertId: String
        }

        let command = try PluginCommandDTO(
            pluginId: pluginId,
            commandType: "resolve_alert",
            encodable: ResolvePayload(alertId: alertId)
        )

        await context?.sendCommand(command, to: deviceId)

        // 广播到 WebUI
        if let resolved = resolvedAlert {
            let wsEvent: [String: Any] = [
                "type": "alert_resolved",
                "deviceId": deviceId,
                "data": resolved.toDictionary(),
            ]
            context?.broadcastToWebUI(wsEvent, deviceId: deviceId)
        }

        return AlertResolveResponse(success: true, message: "Alert resolved")
    }

    // MARK: - Helper Methods

    /// 按时间间隔聚合指标
    private func aggregateMetrics(_ metrics: [PerformanceMetricsModel], interval: Int) -> [PerformanceMetricsDTO] {
        guard !metrics.isEmpty else { return [] }

        var result: [PerformanceMetricsDTO] = []
        var bucket: [PerformanceMetricsModel] = []
        var bucketStart = metrics.first!.timestamp

        for metric in metrics {
            let diff = metric.timestamp.timeIntervalSince(bucketStart)
            if diff >= TimeInterval(interval) {
                // 聚合当前桶
                if !bucket.isEmpty {
                    result.append(aggregateBucket(bucket))
                }
                bucket = [metric]
                bucketStart = metric.timestamp
            } else {
                bucket.append(metric)
            }
        }

        // 处理最后一个桶
        if !bucket.isEmpty {
            result.append(aggregateBucket(bucket))
        }

        return result
    }

    private func aggregateBucket(_ bucket: [PerformanceMetricsModel]) -> PerformanceMetricsDTO {
        let count = Double(bucket.count)

        // 计算 CPU 平均值
        let cpuUsages = bucket.compactMap(\.cpuUsage)
        let avgCPU = cpuUsages.isEmpty ? nil : cpuUsages.reduce(0, +) / Double(cpuUsages.count)

        // 计算内存平均值
        let memUsed = bucket.compactMap(\.memoryUsed)
        let avgMemUsed = memUsed.isEmpty ? nil : UInt64(memUsed.reduce(0, +) / UInt64(memUsed.count))

        // 计算 FPS 平均值
        let fpsValues = bucket.compactMap(\.fps)
        let avgFPS = fpsValues.isEmpty ? nil : fpsValues.reduce(0, +) / Double(fpsValues.count)

        // 汇总丢帧和卡顿
        let totalDropped = bucket.compactMap(\.droppedFrames).reduce(0, +)
        let totalJanks = bucket.compactMap(\.jankCount).reduce(0, +)

        let timestamp = bucket.first?.timestamp ?? Date()

        var cpuMetrics: CPUMetricsDTO?
        if let avg = avgCPU {
            cpuMetrics = CPUMetricsDTO(
                usage: avg,
                userTime: bucket.compactMap(\.cpuUserTime).last ?? 0,
                systemTime: bucket.compactMap(\.cpuSystemTime).last ?? 0,
                threadCount: bucket.compactMap(\.threadCount).last ?? 0
            )
        }

        var memoryMetrics: MemoryMetricsDTO?
        if let avgMem = avgMemUsed {
            memoryMetrics = MemoryMetricsDTO(
                usedMemory: avgMem,
                peakMemory: bucket.compactMap(\.memoryPeak).max() ?? 0,
                freeMemory: bucket.compactMap(\.memoryFree).last ?? 0,
                memoryPressure: bucket.compactMap(\.memoryPressure).last ?? "low",
                footprintRatio: bucket.compactMap(\.memoryFootprintRatio).last ?? 0
            )
        }

        var fpsMetrics: FPSMetricsDTO?
        if let avg = avgFPS {
            fpsMetrics = FPSMetricsDTO(
                fps: avg,
                droppedFrames: totalDropped,
                jankCount: totalJanks,
                averageRenderTime: bucket.compactMap(\.averageRenderTime).reduce(0, +) / count
            )
        }

        // 注：聚合数据时，network 和 diskIO 暂不支持聚合
        return PerformanceMetricsDTO(
            timestamp: timestamp,
            cpu: cpuMetrics,
            memory: memoryMetrics,
            fps: fpsMetrics,
            network: nil,
            diskIO: nil
        )
    }

    public func shutdown() async {
        // 使用同步方法清除缓存
        clearAllCachedMetrics()
        state = .stopped
    }
}

// MARK: - DTOs

/// 性能指标 DTO
public struct PerformanceMetricsDTO: Codable, Content {
    public let timestamp: Date
    public let cpu: CPUMetricsDTO?
    public let memory: MemoryMetricsDTO?
    public let fps: FPSMetricsDTO?
    public let network: NetworkTrafficMetricsDTO?
    public let diskIO: DiskIOMetricsDTO?

    public func toDictionary() -> [String: Any] {
        var dict: [String: Any] = ["timestamp": ISO8601DateFormatter().string(from: timestamp)]
        if let cpu {
            dict["cpu"] = [
                "usage": cpu.usage,
                "userTime": cpu.userTime,
                "systemTime": cpu.systemTime,
                "threadCount": cpu.threadCount,
            ]
        }
        if let memory {
            dict["memory"] = [
                "usedMemory": memory.usedMemory,
                "peakMemory": memory.peakMemory,
                "freeMemory": memory.freeMemory,
                "memoryPressure": memory.memoryPressure,
                "footprintRatio": memory.footprintRatio,
            ]
        }
        if let fps {
            dict["fps"] = [
                "fps": fps.fps,
                "droppedFrames": fps.droppedFrames,
                "jankCount": fps.jankCount,
                "averageRenderTime": fps.averageRenderTime,
            ]
        }
        if let network {
            dict["network"] = [
                "bytesReceived": network.bytesReceived,
                "bytesSent": network.bytesSent,
                "receivedRate": network.receivedRate,
                "sentRate": network.sentRate,
            ]
        }
        if let diskIO {
            dict["diskIO"] = [
                "readBytes": diskIO.readBytes,
                "writeBytes": diskIO.writeBytes,
                "readOps": diskIO.readOps,
                "writeOps": diskIO.writeOps,
                "readRate": diskIO.readRate,
                "writeRate": diskIO.writeRate,
            ]
        }
        return dict
    }
}

public struct CPUMetricsDTO: Codable, Content {
    public let usage: Double
    public let userTime: Double
    public let systemTime: Double
    public let threadCount: Int
}

public struct MemoryMetricsDTO: Codable, Content {
    public let usedMemory: UInt64
    public let peakMemory: UInt64
    public let freeMemory: UInt64
    public let memoryPressure: String
    public let footprintRatio: Double
}

public struct FPSMetricsDTO: Codable, Content {
    public let fps: Double
    public let droppedFrames: Int
    public let jankCount: Int
    public let averageRenderTime: Double
}

/// 网络流量指标 DTO
public struct NetworkTrafficMetricsDTO: Codable, Content {
    public let bytesReceived: UInt64
    public let bytesSent: UInt64
    public let receivedRate: Double
    public let sentRate: Double
}

/// 磁盘 I/O 指标 DTO
public struct DiskIOMetricsDTO: Codable, Content {
    public let readBytes: UInt64
    public let writeBytes: UInt64
    public let readOps: UInt64
    public let writeOps: UInt64
    public let readRate: Double
    public let writeRate: Double
}

/// App 启动时间指标 DTO（分阶段记录）
public struct AppLaunchMetricsDTO: Codable, Content {
    /// 总启动时间（毫秒）
    public let totalTime: Double
    /// PreMain 阶段耗时（毫秒）：processStart -> mainExecuted
    public let preMainTime: Double?
    /// Main 到 Launch 阶段耗时（毫秒）：mainExecuted -> didFinishLaunching
    public let mainToLaunchTime: Double?
    /// Launch 到首帧阶段耗时（毫秒）：didFinishLaunching -> firstFrameRendered
    public let launchToFirstFrameTime: Double?
    /// 记录时间戳
    public let timestamp: Date

    public func toDictionary() -> [String: Any] {
        var result: [String: Any] = [
            "totalTime": totalTime,
            "timestamp": ISO8601DateFormatter().string(from: timestamp),
        ]
        if let preMainTime {
            result["preMainTime"] = preMainTime
        }
        if let mainToLaunchTime {
            result["mainToLaunchTime"] = mainToLaunchTime
        }
        if let launchToFirstFrameTime {
            result["launchToFirstFrameTime"] = launchToFirstFrameTime
        }
        return result
    }
}

public struct PerformanceMetricsBatchDTO: Codable {
    public let metrics: [PerformanceMetricsDTO]
}

// MARK: - Trends DTOs

/// 趋势方向
public enum TrendDirection: String, Codable, Content {
    case improving
    case stable
    case degrading
}

/// 单项指标趋势
public struct MetricTrend: Codable, Content {
    public let metricName: String
    public let trend: TrendDirection
    public let firstHalfAverage: Double
    public let secondHalfAverage: Double
    public let changePercent: Double
    public let minValue: Double
    public let maxValue: Double
}

/// 趋势分析响应
public struct PerformanceTrendsResponse: Content {
    public let deviceId: String
    public let analysisMinutes: Int
    public let dataPoints: Int
    public let cpu: MetricTrend?
    public let memory: MetricTrend?
    public let fps: MetricTrend?
    public let overall: TrendDirection
    public let recommendations: [String]
}

/// 卡顿事件 DTO
public struct JankEventDTO: Codable, Content {
    public let id: String
    public let timestamp: Date
    public let duration: Double
    public let droppedFrames: Int
    public let stackTrace: String?

    public func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "timestamp": ISO8601DateFormatter().string(from: timestamp),
            "duration": duration,
            "droppedFrames": droppedFrames,
        ]
        if let stack = stackTrace {
            dict["stackTrace"] = stack
        }
        return dict
    }
}

public struct JankEventItemDTO: Codable, Content {
    public let id: UUID
    public let timestamp: Date
    public let duration: Double
    public let droppedFrames: Int
    public let stackTrace: String?

    public init(from model: JankEventModel) {
        id = model.id ?? UUID()
        timestamp = model.timestamp
        duration = model.duration
        droppedFrames = model.droppedFrames
        stackTrace = model.stackTrace
    }
}

// MARK: - Request/Response DTOs

public struct PerformanceRealtimeResponse: Content {
    public let metrics: [PerformanceMetricsDTO]
    public let deviceId: String
    public let rangeSeconds: Int
}

public struct PerformanceHistoryResponse: Content {
    public let metrics: [PerformanceMetricsDTO]
    public let deviceId: String
    public let startTime: Date?
    public let endTime: Date
    public let intervalSeconds: Int
}

public struct JankEventListResponse: Content {
    public let items: [JankEventItemDTO]
    public let total: Int
    public let page: Int
    public let pageSize: Int
}

public struct PerformanceStatusResponse: Content {
    public let deviceId: String
    public let isMonitoring: Bool
    public let lastMetrics: PerformanceMetricsDTO?
    public let recentJankCount: Int
}

public struct AppLaunchResponse: Content {
    public let deviceId: String
    public let launchMetrics: AppLaunchMetricsDTO? // 最新一次启动
    public let history: [AppLaunchHistoryItem] // 历史启动记录
    public let stats: AppLaunchStats? // 统计指标
}

/// 历史启动记录项
public struct AppLaunchHistoryItem: Content {
    public let id: String
    public let totalTime: Double
    public let preMainTime: Double?
    public let mainToLaunchTime: Double?
    public let launchToFirstFrameTime: Double?
    public let timestamp: Date
}

/// 启动耗时统计指标
public struct AppLaunchStats: Content {
    public let count: Int // 总启动次数
    public let avgTotalTime: Double // 平均总耗时
    public let minTotalTime: Double // 最小总耗时
    public let maxTotalTime: Double // 最大总耗时
    public let p50TotalTime: Double // P50 耗时
    public let p90TotalTime: Double // P90 耗时
    public let p95TotalTime: Double // P95 耗时
    public let avgPreMainTime: Double? // 平均 pre-main 耗时
    public let avgMainToLaunchTime: Double? // 平均 main-to-launch 耗时
    public let avgLaunchToFirstFrameTime: Double? // 平均 launch-to-first-frame 耗时
}

public struct PerformanceConfigInput: Content {
    public let sampleInterval: Double?
    public let monitorFPS: Bool?
    public let monitorCPU: Bool?
    public let monitorMemory: Bool?
    public let monitorNetwork: Bool?
    public let monitorDiskIO: Bool?
    public let smartSamplingEnabled: Bool?
}

public struct PerformanceConfigResponse: Content {
    public let success: Bool
    public let message: String
}

public struct PerformanceClearResponse: Content {
    public let deletedMetrics: Int
    public let deletedJanks: Int
}

// MARK: - Database Models

/// 性能指标数据库模型
public final class PerformanceMetricsModel: Model, @unchecked Sendable {
    public static let schema = "performance_metrics"

    @ID(key: .id)
    public var id: UUID?

    @Field(key: "device_id")
    public var deviceId: String

    @Field(key: "timestamp")
    public var timestamp: Date

    // CPU
    @OptionalField(key: "cpu_usage")
    public var cpuUsage: Double?

    @OptionalField(key: "cpu_user_time")
    public var cpuUserTime: Double?

    @OptionalField(key: "cpu_system_time")
    public var cpuSystemTime: Double?

    @OptionalField(key: "thread_count")
    public var threadCount: Int?

    // Memory
    @OptionalField(key: "memory_used")
    public var memoryUsed: UInt64?

    @OptionalField(key: "memory_peak")
    public var memoryPeak: UInt64?

    @OptionalField(key: "memory_free")
    public var memoryFree: UInt64?

    @OptionalField(key: "memory_pressure")
    public var memoryPressure: String?

    @OptionalField(key: "memory_footprint_ratio")
    public var memoryFootprintRatio: Double?

    // FPS
    @OptionalField(key: "fps")
    public var fps: Double?

    @OptionalField(key: "dropped_frames")
    public var droppedFrames: Int?

    @OptionalField(key: "jank_count")
    public var jankCount: Int?

    @OptionalField(key: "average_render_time")
    public var averageRenderTime: Double?

    public init() {}

    public init(
        id: UUID? = nil,
        deviceId: String,
        timestamp: Date,
        cpuUsage: Double? = nil,
        cpuUserTime: Double? = nil,
        cpuSystemTime: Double? = nil,
        threadCount: Int? = nil,
        memoryUsed: UInt64? = nil,
        memoryPeak: UInt64? = nil,
        memoryFree: UInt64? = nil,
        memoryPressure: String? = nil,
        memoryFootprintRatio: Double? = nil,
        fps: Double? = nil,
        droppedFrames: Int? = nil,
        jankCount: Int? = nil,
        averageRenderTime: Double? = nil
    ) {
        self.id = id
        self.deviceId = deviceId
        self.timestamp = timestamp
        self.cpuUsage = cpuUsage
        self.cpuUserTime = cpuUserTime
        self.cpuSystemTime = cpuSystemTime
        self.threadCount = threadCount
        self.memoryUsed = memoryUsed
        self.memoryPeak = memoryPeak
        self.memoryFree = memoryFree
        self.memoryPressure = memoryPressure
        self.memoryFootprintRatio = memoryFootprintRatio
        self.fps = fps
        self.droppedFrames = droppedFrames
        self.jankCount = jankCount
        self.averageRenderTime = averageRenderTime
    }
}

/// 卡顿事件数据库模型
public final class JankEventModel: Model, @unchecked Sendable {
    public static let schema = "jank_events"

    @ID(key: .id)
    public var id: UUID?

    @Field(key: "device_id")
    public var deviceId: String

    @Field(key: "timestamp")
    public var timestamp: Date

    @Field(key: "duration")
    public var duration: Double

    @Field(key: "dropped_frames")
    public var droppedFrames: Int

    @OptionalField(key: "stack_trace")
    public var stackTrace: String?

    public init() {}

    public init(
        id: UUID? = nil,
        deviceId: String,
        timestamp: Date,
        duration: Double,
        droppedFrames: Int,
        stackTrace: String? = nil
    ) {
        self.id = id
        self.deviceId = deviceId
        self.timestamp = timestamp
        self.duration = duration
        self.droppedFrames = droppedFrames
        self.stackTrace = stackTrace
    }
}

// MARK: - Database Migrations

/// 创建性能指标表迁移
public struct CreatePerformanceMetrics: AsyncMigration {
    public init() {}

    public func prepare(on database: Database) async throws {
        try await database.schema(PerformanceMetricsModel.schema)
            .id()
            .field("device_id", .string, .required)
            .field("timestamp", .datetime, .required)
            .field("cpu_usage", .double)
            .field("cpu_user_time", .double)
            .field("cpu_system_time", .double)
            .field("thread_count", .int)
            .field("memory_used", .uint64)
            .field("memory_peak", .uint64)
            .field("memory_free", .uint64)
            .field("memory_pressure", .string)
            .field("memory_footprint_ratio", .double)
            .field("fps", .double)
            .field("dropped_frames", .int)
            .field("jank_count", .int)
            .field("average_render_time", .double)
            .create()
    }

    public func revert(on database: Database) async throws {
        try await database.schema(PerformanceMetricsModel.schema).delete()
    }
}

/// 创建卡顿事件表迁移
public struct CreateJankEvent: AsyncMigration {
    public init() {}

    public func prepare(on database: Database) async throws {
        try await database.schema(JankEventModel.schema)
            .id()
            .field("device_id", .string, .required)
            .field("timestamp", .datetime, .required)
            .field("duration", .double, .required)
            .field("dropped_frames", .int, .required)
            .field("stack_trace", .string)
            .create()
    }

    public func revert(on database: Database) async throws {
        try await database.schema(JankEventModel.schema).delete()
    }
}

// MARK: - Alert DTOs

/// 告警 DTO
public struct AlertDTO: Content {
    public var id: String
    public let ruleId: String
    public let metricType: String
    public let severity: String
    public let message: String
    public let currentValue: Double
    public let threshold: Double
    public let timestamp: Date
    public var isResolved: Bool
    public var resolvedAt: Date?

    init(
        id: String = UUID().uuidString,
        ruleId: String,
        metricType: String,
        severity: String,
        message: String,
        currentValue: Double,
        threshold: Double,
        timestamp: Date = Date(),
        isResolved: Bool = false,
        resolvedAt: Date? = nil
    ) {
        self.id = id
        self.ruleId = ruleId
        self.metricType = metricType
        self.severity = severity
        self.message = message
        self.currentValue = currentValue
        self.threshold = threshold
        self.timestamp = timestamp
        self.isResolved = isResolved
        self.resolvedAt = resolvedAt
    }

    init(from model: AlertModel) {
        id = model.id?.uuidString ?? UUID().uuidString
        ruleId = model.ruleId
        metricType = model.metricType
        severity = model.severity
        message = model.message
        currentValue = model.currentValue
        threshold = model.threshold
        timestamp = model.timestamp
        isResolved = model.isResolved
        resolvedAt = model.resolvedAt
    }

    func toDictionary() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "ruleId": ruleId,
            "metricType": metricType,
            "severity": severity,
            "message": message,
            "currentValue": currentValue,
            "threshold": threshold,
            "timestamp": ISO8601DateFormatter().string(from: timestamp),
            "isResolved": isResolved,
        ]
        if let resolved = resolvedAt {
            dict["resolvedAt"] = ISO8601DateFormatter().string(from: resolved)
        }
        return dict
    }
}

/// 告警规则 DTO
public struct AlertRuleDTO: Content {
    public let id: String
    public let metricType: String
    public let threshold: Double
    public let condition: String
    public let durationSeconds: Int
    public let severity: String
    public var isEnabled: Bool

    /// 默认告警规则
    public static var defaultRules: [AlertRuleDTO] {
        [
            AlertRuleDTO(
                id: "cpu_high",
                metricType: "cpu",
                threshold: 80,
                condition: "gt",
                durationSeconds: 5,
                severity: "warning",
                isEnabled: true
            ),
            AlertRuleDTO(
                id: "cpu_critical",
                metricType: "cpu",
                threshold: 95,
                condition: "gt",
                durationSeconds: 3,
                severity: "critical",
                isEnabled: true
            ),
            AlertRuleDTO(
                id: "memory_high",
                metricType: "memory",
                threshold: 70,
                condition: "gt",
                durationSeconds: 5,
                severity: "warning",
                isEnabled: true
            ),
            AlertRuleDTO(
                id: "memory_critical",
                metricType: "memory",
                threshold: 90,
                condition: "gt",
                durationSeconds: 3,
                severity: "critical",
                isEnabled: true
            ),
            AlertRuleDTO(
                id: "fps_low",
                metricType: "fps",
                threshold: 45,
                condition: "lt",
                durationSeconds: 5,
                severity: "warning",
                isEnabled: true
            ),
            AlertRuleDTO(
                id: "fps_critical",
                metricType: "fps",
                threshold: 30,
                condition: "lt",
                durationSeconds: 3,
                severity: "critical",
                isEnabled: true
            ),
        ]
    }
}

/// 告警规则输入
public struct AlertRuleInput: Content {
    public var id: String?
    public let metricType: String
    public let threshold: Double
    public let condition: String
    public let durationSeconds: Int?
    public let severity: String?
    public let isEnabled: Bool?

    func toDTO() -> AlertRuleDTO {
        AlertRuleDTO(
            id: id ?? UUID().uuidString,
            metricType: metricType,
            threshold: threshold,
            condition: condition,
            durationSeconds: durationSeconds ?? 0,
            severity: severity ?? "warning",
            isEnabled: isEnabled ?? true
        )
    }
}

/// 告警配置输入
public struct AlertConfigInput: Content {
    public let rules: [AlertRuleDTO]?
    public let cooldownSeconds: Int?
    public let isEnabled: Bool?
}

// MARK: - Alert Responses

/// 告警列表响应
public struct AlertListResponse: Content {
    public let items: [AlertDTO]
    public let total: Int
    public let page: Int
    public let pageSize: Int
    public let activeCount: Int
}

/// 告警配置响应
public struct AlertConfigResponse: Content {
    public let rules: [AlertRuleDTO]
    public let cooldownSeconds: Int
    public let isEnabled: Bool
}

/// 告警配置更新响应
public struct AlertConfigUpdateResponse: Content {
    public let success: Bool
    public let message: String
}

/// 告警规则列表响应
public struct AlertRulesResponse: Content {
    public let rules: [AlertRuleDTO]
}

/// 告警规则更新响应
public struct AlertRuleUpdateResponse: Content {
    public let success: Bool
    public let message: String
}

/// 告警解决响应
public struct AlertResolveResponse: Content {
    public let success: Bool
    public let message: String
}

// MARK: - Alert Database Model

/// 告警数据库模型
public final class AlertModel: Model, @unchecked Sendable {
    public static let schema = "performance_alerts"

    @ID(key: .id)
    public var id: UUID?

    @Field(key: "device_id")
    public var deviceId: String

    @Field(key: "rule_id")
    public var ruleId: String

    @Field(key: "metric_type")
    public var metricType: String

    @Field(key: "severity")
    public var severity: String

    @Field(key: "message")
    public var message: String

    @Field(key: "current_value")
    public var currentValue: Double

    @Field(key: "threshold")
    public var threshold: Double

    @Field(key: "timestamp")
    public var timestamp: Date

    @Field(key: "is_resolved")
    public var isResolved: Bool

    @OptionalField(key: "resolved_at")
    public var resolvedAt: Date?

    public init() {}

    public init(
        id: UUID? = nil,
        deviceId: String,
        ruleId: String,
        metricType: String,
        severity: String,
        message: String,
        currentValue: Double,
        threshold: Double,
        timestamp: Date,
        isResolved: Bool = false,
        resolvedAt: Date? = nil
    ) {
        self.id = id
        self.deviceId = deviceId
        self.ruleId = ruleId
        self.metricType = metricType
        self.severity = severity
        self.message = message
        self.currentValue = currentValue
        self.threshold = threshold
        self.timestamp = timestamp
        self.isResolved = isResolved
        self.resolvedAt = resolvedAt
    }
}

/// 创建告警表迁移
public struct CreateAlert: AsyncMigration {
    public init() {}

    public func prepare(on database: Database) async throws {
        try await database.schema(AlertModel.schema)
            .id()
            .field("device_id", .string, .required)
            .field("rule_id", .string, .required)
            .field("metric_type", .string, .required)
            .field("severity", .string, .required)
            .field("message", .string, .required)
            .field("current_value", .double, .required)
            .field("threshold", .double, .required)
            .field("timestamp", .datetime, .required)
            .field("is_resolved", .bool, .required)
            .field("resolved_at", .datetime)
            .create()
    }

    public func revert(on database: Database) async throws {
        try await database.schema(AlertModel.schema).delete()
    }
}

// MARK: - App Launch Event Model

/// App 启动耗时数据库模型
public final class AppLaunchEventModel: Model, @unchecked Sendable {
    public static let schema = "app_launch_events"

    @ID(key: .id)
    public var id: UUID?

    @Field(key: "device_id")
    public var deviceId: String

    @Field(key: "total_time")
    public var totalTime: Double

    @OptionalField(key: "pre_main_time")
    public var preMainTime: Double?

    @OptionalField(key: "main_to_launch_time")
    public var mainToLaunchTime: Double?

    @OptionalField(key: "launch_to_first_frame_time")
    public var launchToFirstFrameTime: Double?

    @Field(key: "timestamp")
    public var timestamp: Date

    public init() {}

    public init(
        id: UUID? = nil,
        deviceId: String,
        totalTime: Double,
        preMainTime: Double? = nil,
        mainToLaunchTime: Double? = nil,
        launchToFirstFrameTime: Double? = nil,
        timestamp: Date
    ) {
        self.id = id
        self.deviceId = deviceId
        self.totalTime = totalTime
        self.preMainTime = preMainTime
        self.mainToLaunchTime = mainToLaunchTime
        self.launchToFirstFrameTime = launchToFirstFrameTime
        self.timestamp = timestamp
    }
}

// MARK: - Page Timing Extension

extension PerformanceBackendPlugin {
    // MARK: - Event Handler

    /// 处理页面耗时事件
    func handlePageTimingEvent(_ event: PluginEventDTO, from deviceId: String) async {
        do {
            let perfEvent = try event.decodePayload(as: PerformanceEventDTO.self)
            guard let pageTiming = perfEvent.pageTiming else { return }

            // 入库
            try await ingestPageTimingEvent(pageTiming, deviceId: deviceId)

            // 广播到 WebUI（使用标准的 performanceEvent 格式）
            // 构建 PerformanceEventDTO 用于广播
            let broadcastEvent = PerformanceEventDTO(
                id: perfEvent.id,
                eventType: "pageTiming",
                timestamp: perfEvent.timestamp,
                metrics: nil,
                jank: nil,
                alert: nil,
                appLaunch: nil,
                pageTiming: pageTiming
            )
            // 通过 RealtimeStreamHandler 发送 performanceEvent
            RealtimeStreamHandler.shared.broadcast(
                events: [.performance(broadcastEvent)],
                deviceId: deviceId
            )
        } catch {
            context?.logger.error("Failed to handle page timing event: \(error)")
        }
    }

    /// 入库页面耗时事件
    private func ingestPageTimingEvent(_ event: PerfPageTimingDTO, deviceId: String) async throws {
        guard let db = context?.database else { return }

        // 获取序列号
        let seqNum = await SequenceNumberManager.shared.nextSeqNum(for: deviceId, type: .pageTiming, db: db)

        // 编码 markers
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601WithMilliseconds
        let markersJSON = (try? String(data: encoder.encode(event.markers ?? []), encoding: .utf8)) ?? "[]"

        let model = PageTimingEventModel(
            id: event.eventId,
            deviceId: deviceId,
            visitId: event.visitId,
            pageId: event.pageId,
            pageName: event.pageName,
            route: event.route,
            startAt: event.startAt,
            firstLayoutAt: event.firstLayoutAt,
            appearAt: event.appearAt,
            endAt: event.endAt,
            loadDuration: event.loadDuration,
            appearDuration: event.appearDuration,
            totalDuration: event.totalDuration,
            markersJSON: markersJSON,
            appVersion: event.appVersion,
            appBuild: event.appBuild,
            osVersion: event.osVersion,
            deviceModel: event.deviceModel,
            isColdStart: event.isColdStart,
            isPush: event.isPush,
            parentPageId: event.parentPageId,
            seqNum: seqNum
        )

        try await model.save(on: db)
    }

    // MARK: - API Handlers

    /// 获取页面耗时事件列表
    func listPageTimingEvents(_ req: Request) async throws -> PageTimingListDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }
        guard let db = context?.database else {
            throw Abort(.internalServerError, reason: "Database not available")
        }

        // 解析分页参数
        let page = (try? req.query.get(Int.self, at: "page")) ?? 1
        let pageSize = min((try? req.query.get(Int.self, at: "pageSize")) ?? 50, 100)

        // 解析筛选参数
        let pageId = try? req.query.get(String.self, at: "pageId")
        let pageName = try? req.query.get(String.self, at: "pageName")
        let route = try? req.query.get(String.self, at: "route")
        let fromStr = try? req.query.get(String.self, at: "from")
        let toStr = try? req.query.get(String.self, at: "to")
        let minDuration = try? req.query.get(Double.self, at: "minDuration")

        // 解析日期
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let from = fromStr.flatMap { dateFormatter.date(from: $0) }
        let to = toStr.flatMap { dateFormatter.date(from: $0) }

        // 构建查询
        var query = PageTimingEventModel.query(on: db)
            .filter(\.$deviceId == deviceId)

        if let pageId {
            query = query.filter(\.$pageId == pageId)
        }
        if let pageName {
            query = query.filter(\.$pageName ~~ pageName) // 模糊匹配
        }
        if let route {
            query = query.filter(\.$route == route)
        }
        if let from {
            query = query.filter(\.$startAt >= from)
        }
        if let to {
            query = query.filter(\.$startAt <= to)
        }
        if let minDuration {
            query = query.filter(\.$appearDuration >= minDuration)
        }

        // 获取总数
        let total = try await query.count()

        // 分页查询
        let items = try await query
            .sort(\.$startAt, .descending)
            .range((page - 1) * pageSize..<page * pageSize)
            .all()

        return PageTimingListDTO(
            items: items.map { $0.toDTO() },
            total: total,
            page: page,
            pageSize: pageSize
        )
    }

    /// 获取单个页面耗时事件
    func getPageTimingEvent(_ req: Request) async throws -> PageTimingEventDTO {
        guard
            let deviceId = req.parameters.get("deviceId"),
            let eventId = req.parameters.get("eventId")
        else {
            throw Abort(.badRequest, reason: "Missing deviceId or eventId")
        }
        guard let db = context?.database else {
            throw Abort(.internalServerError, reason: "Database not available")
        }

        guard
            let event = try await PageTimingEventModel.query(on: db)
                .filter(\.$id == eventId)
                .filter(\.$deviceId == deviceId)
                .first()
        else {
            throw Abort(.notFound, reason: "Page timing event not found")
        }

        return event.toDTO()
    }

    /// 获取页面耗时聚合统计
    func getPageTimingSummary(_ req: Request) async throws -> PageTimingSummaryListDTO {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }
        guard let db = context?.database else {
            throw Abort(.internalServerError, reason: "Database not available")
        }

        // 解析时间范围
        let fromStr = try? req.query.get(String.self, at: "from")
        let toStr = try? req.query.get(String.self, at: "to")
        // 解析页面名过滤
        let pageName = try? req.query.get(String.self, at: "pageName")

        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let from = fromStr.flatMap { dateFormatter.date(from: $0) }
        let to = toStr.flatMap { dateFormatter.date(from: $0) }

        // 构建查询
        var query = PageTimingEventModel.query(on: db)
            .filter(\.$deviceId == deviceId)

        if let from {
            query = query.filter(\.$startAt >= from)
        }
        if let to {
            query = query.filter(\.$startAt <= to)
        }
        // 应用页面名过滤（支持模糊匹配）
        if let pageName, !pageName.isEmpty {
            query = query.filter(\.$pageName ~~ pageName)
        }

        // 获取所有事件（按 pageId 分组统计）
        let events = try await query.all()

        // 按 pageId 分组
        var grouped: [String: [PageTimingEventModel]] = [:]
        for event in events {
            let key = event.pageId
            grouped[key, default: []].append(event)
        }

        // 计算统计
        var summaries: [PageTimingSummaryDTO] = []
        for (pageId, pageEvents) in grouped {
            let pageName = pageEvents.first?.pageName ?? pageId
            let count = pageEvents.count

            // 收集 appearDuration 值
            let appearDurations = pageEvents.compactMap(\.appearDuration).sorted()
            let loadDurations = pageEvents.compactMap(\.loadDuration)

            // 计算统计
            let avgAppear = appearDurations.isEmpty ? nil : appearDurations.reduce(0, +) / Double(appearDurations.count)
            let avgLoad = loadDurations.isEmpty ? nil : loadDurations.reduce(0, +) / Double(loadDurations.count)
            let maxAppear = appearDurations.max()
            let minAppear = appearDurations.min()

            // 计算百分位数
            let p50 = percentile(appearDurations, 0.50)
            let p90 = percentile(appearDurations, 0.90)
            let p95 = percentile(appearDurations, 0.95)

            // 计算错误率（endAt 为空的比例）
            let errorCount = pageEvents.count(where: { $0.endAt == nil })
            let errorRate = count > 0 ? Double(errorCount) / Double(count) : 0

            summaries.append(PageTimingSummaryDTO(
                pageId: pageId,
                pageName: pageName,
                count: count,
                avgAppearDuration: avgAppear,
                avgLoadDuration: avgLoad,
                p50AppearDuration: p50,
                p90AppearDuration: p90,
                p95AppearDuration: p95,
                maxAppearDuration: maxAppear,
                minAppearDuration: minAppear,
                errorRate: errorRate
            ))
        }

        // 按 count 降序排序
        summaries.sort { $0.count > $1.count }

        return PageTimingSummaryListDTO(
            items: summaries,
            totalPages: grouped.count
        )
    }

    /// 删除所有页面耗时事件
    func deleteAllPageTimingEvents(_ req: Request) async throws -> HTTPStatus {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }
        guard let db = context?.database else {
            throw Abort(.internalServerError, reason: "Database not available")
        }

        try await PageTimingEventModel.query(on: db)
            .filter(\.$deviceId == deviceId)
            .delete()

        return .noContent
    }

    /// 计算百分位数
    private func percentile(_ sortedValues: [Double], _ p: Double) -> Double? {
        guard !sortedValues.isEmpty else { return nil }
        let index = Int(Double(sortedValues.count - 1) * p)
        return sortedValues[index]
    }
}
