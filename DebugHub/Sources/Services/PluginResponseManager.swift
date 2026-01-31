// PluginResponseManager.swift
// DebugHub
//
// Created by Sun on 2025/12/05.
// Copyright © 2025 Sun. All rights reserved.
//

import Foundation
import Vapor

// MARK: - Plugin Response Manager

/// 管理插件命令响应等待
final class PluginResponseManager: @unchecked Sendable {
    static let shared = PluginResponseManager()

    private var waiters: [String: (PluginCommandResponseDTO?) -> Void] = [:]
    private let lock = NSLock()

    private init() {}

    /// 注册等待响应的 handler
    func registerWaiter(commandId: String, timeout: TimeInterval, handler: @escaping (PluginCommandResponseDTO?) -> Void) {
        lock.lock()
        waiters[commandId] = handler
        lock.unlock()

        // 设置超时
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.handleTimeout(commandId: commandId)
        }
    }

    /// 处理收到的响应
    func handleResponse(_ response: PluginCommandResponseDTO) {
        lock.lock()
        let handler = waiters.removeValue(forKey: response.commandId)
        lock.unlock()

        handler?(response)
    }

    /// 处理超时
    private func handleTimeout(commandId: String) {
        lock.lock()
        let handler = waiters.removeValue(forKey: commandId)
        lock.unlock()

        handler?(nil)
    }
}
