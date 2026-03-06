//
//  SystemToolController.swift
//  DebugHub
//
//  Created by Sun on 2025/12/16.
//  系统工具 API，如在 Finder 中显示文件

import Foundation
import Vapor

struct SystemToolController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let sys = routes.grouped("sys")

        // POST /sys/reveal - 在 Finder 中显示路径
        sys.post("reveal", use: revealInFinder)
    }

    // MARK: - Reveal in Finder

    struct RevealRequest: Content {
        let path: String
    }

    struct RevealResponse: Content {
        let success: Bool
        let message: String
    }

    func revealInFinder(req: Request) async throws -> RevealResponse {
        let input = try req.content.decode(RevealRequest.self)
        let path = input.path

        // 安全检查：只允许访问特定目录
        // 可以根据需要添加更多限制
        guard !path.isEmpty else {
            return RevealResponse(success: false, message: "路径不能为空")
        }

        // 检查文件是否存在
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: path) else {
            return RevealResponse(success: false, message: "文件不存在: \(path)")
        }

        // 使用 open -R 命令在 Finder 中显示
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-R", path]

        do {
            try process.run()
            process.waitUntilExit()

            if process.terminationStatus == 0 {
                return RevealResponse(success: true, message: "已在 Finder 中显示")
            } else {
                return RevealResponse(success: false, message: "打开失败，退出码: \(process.terminationStatus)")
            }
        } catch {
            return RevealResponse(success: false, message: "执行命令失败: \(error.localizedDescription)")
        }
    }
}
