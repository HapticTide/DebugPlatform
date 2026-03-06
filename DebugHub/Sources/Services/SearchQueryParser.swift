// SearchQueryParser.swift
// DebugHub
//
// Created by Sun on 2025/12/02.
// Copyright © 2025 Sun. All rights reserved.
//

import Foundation

// MARK: - Search Query Models

/// 搜索过滤条件
struct SearchFilter {
    enum Operator: String {
        case equals = "="
        case notEquals = "!="
        case contains = "~"
        case greaterThan = ">"
        case lessThan = "<"
        case greaterOrEqual = ">="
        case lessOrEqual = "<="
        case regex = "~="
    }

    let field: String
    let op: Operator
    let value: String
}

/// 解析后的搜索查询
struct ParsedSearchQuery {
    let filters: [SearchFilter]
    let logicalOperator: LogicalOperator

    enum LogicalOperator {
        case and
        case or
    }
}

// MARK: - Search Query Parser

/// 高级搜索语法解析器
/// 支持语法：
/// - method:POST status:4xx domain:api.example.com
/// - method:GET AND status:200
/// - url:/api/users body:error
/// - duration:>500ms size:>1MB
/// - is:error is:slow is:mocked
enum SearchQueryParser {
    // MARK: - 快捷别名映射

    private static let aliases: [String: [SearchFilter]] = [
        "is:error": [
            SearchFilter(field: "statusCode", op: .greaterOrEqual, value: "400"),
        ],
        "is:slow": [
            SearchFilter(field: "duration", op: .greaterThan, value: "1"),
        ],
        "is:mocked": [
            SearchFilter(field: "isMocked", op: .equals, value: "true"),
        ],
        "has:body": [
            SearchFilter(field: "hasBody", op: .equals, value: "true"),
        ],
    ]

    // MARK: - Status Code 范围映射

    private static let statusRanges: [String: (Int, Int)] = [
        "1xx": (100, 199),
        "2xx": (200, 299),
        "3xx": (300, 399),
        "4xx": (400, 499),
        "5xx": (500, 599),
    ]

    // MARK: - Parse

    static func parse(_ query: String) -> ParsedSearchQuery {
        let trimmed = query.trimmingCharacters(in: .whitespaces)

        guard !trimmed.isEmpty else {
            return ParsedSearchQuery(filters: [], logicalOperator: .and)
        }

        // 检测逻辑操作符
        var logicalOp: ParsedSearchQuery.LogicalOperator = .and
        var workingQuery = trimmed

        // 处理 AND/OR
        if workingQuery.uppercased().contains(" OR ") {
            logicalOp = .or
            workingQuery = workingQuery
                .replacingOccurrences(of: " OR ", with: " ", options: .caseInsensitive)
        } else {
            workingQuery = workingQuery
                .replacingOccurrences(of: " AND ", with: " ", options: .caseInsensitive)
        }

        // 分割查询条件
        let tokens = tokenize(workingQuery)
        var filters: [SearchFilter] = []

        for token in tokens {
            // 检查别名
            if let aliasFilters = aliases[token.lowercased()] {
                filters.append(contentsOf: aliasFilters)
                continue
            }

            // 解析 field:value 格式
            if let filter = parseToken(token) {
                filters.append(filter)
            }
        }

        return ParsedSearchQuery(filters: filters, logicalOperator: logicalOp)
    }

    // MARK: - Tokenize

    private static func tokenize(_ query: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        var inQuotes = false
        var quoteChar: Character?

        for char in query {
            if char == "\"" || char == "'", !inQuotes {
                inQuotes = true
                quoteChar = char
            } else if char == quoteChar, inQuotes {
                inQuotes = false
                quoteChar = nil
            } else if char == " ", !inQuotes {
                if !current.isEmpty {
                    tokens.append(current)
                    current = ""
                }
            } else {
                current.append(char)
            }
        }

        if !current.isEmpty {
            tokens.append(current)
        }

        return tokens
    }

    // MARK: - Parse Token

    private static func parseToken(_ token: String) -> SearchFilter? {
        // 支持的操作符（按长度降序排列，避免 >= 被误解析为 >）
        let operators: [(String, SearchFilter.Operator)] = [
            (">=", .greaterOrEqual),
            ("<=", .lessOrEqual),
            ("!=", .notEquals),
            ("~=", .regex),
            (">", .greaterThan),
            ("<", .lessThan),
            ("~", .contains),
            (":", .equals),
            ("=", .equals),
        ]

        for (opStr, op) in operators {
            if let range = token.range(of: opStr) {
                let field = String(token[..<range.lowerBound])
                var value = String(token[range.upperBound...])

                // 移除值周围的引号
                if
                    (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
                    (value.hasPrefix("'") && value.hasSuffix("'"))
                {
                    value = String(value.dropFirst().dropLast())
                }

                guard !field.isEmpty, !value.isEmpty else { continue }

                // 处理特殊字段
                let (processedField, processedValue, processedOp) = processSpecialFields(
                    field: field.lowercased(),
                    value: value,
                    op: op
                )

                return SearchFilter(
                    field: processedField,
                    op: processedOp,
                    value: processedValue
                )
            }
        }

        // 没有操作符，作为 URL 包含搜索
        if !token.isEmpty {
            return SearchFilter(field: "url", op: .contains, value: token)
        }

        return nil
    }

    // MARK: - Process Special Fields

    private static func processSpecialFields(
        field: String,
        value: String,
        op: SearchFilter.Operator
    ) -> (String, String, SearchFilter.Operator) {
        var processedField = field
        var processedValue = value
        var processedOp = op

        // 处理 status 范围 (4xx, 5xx 等)
        if field == "status" || field == "statuscode" {
            processedField = "statusCode"

            if let range = statusRanges[value.lowercased()] {
                // 返回范围的最小值，并设置为 >= 操作符
                // 实际过滤逻辑会处理范围
                processedValue = "\(range.0)-\(range.1)"
                processedOp = .equals // 特殊标记，表示范围查询
            }
        }

        // 处理 duration 单位
        if field == "duration" {
            processedField = "duration"
            processedValue = parseDuration(value)
        }

        // 处理 size 单位
        if field == "size" || field == "bodysize" {
            processedField = "bodySize"
            processedValue = parseSize(value)
        }

        // 字段名映射
        let fieldMappings: [String: String] = [
            "domain": "url",
            "host": "url",
            "path": "url",
            "header": "requestHeaders",
            "body": "requestBody",
            "responsebody": "responseBody",
            "traceid": "traceId",
            "trace": "traceId",
            "mock": "isMocked",
            "mocked": "isMocked",
            "error": "errorDescription",
        ]

        if let mapped = fieldMappings[processedField] {
            processedField = mapped
        }

        return (processedField, processedValue, processedOp)
    }

    // MARK: - Parse Duration

    private static func parseDuration(_ value: String) -> String {
        let lower = value.lowercased()

        // 提取数字部分
        let numericPart = lower.filter { $0.isNumber || $0 == "." }
        guard let number = Double(numericPart) else {
            return value
        }

        // 转换为秒
        if lower.contains("ms") {
            return String(number / 1000.0)
        } else if lower.contains("s"), !lower.contains("ms") {
            return String(number)
        } else if lower.contains("m"), !lower.contains("ms") {
            return String(number * 60)
        }

        // 默认假设是毫秒
        return String(number / 1000.0)
    }

    // MARK: - Parse Size

    private static func parseSize(_ value: String) -> String {
        let lower = value.lowercased()

        let numericPart = lower.filter { $0.isNumber || $0 == "." }
        guard let number = Double(numericPart) else {
            return value
        }

        // 转换为字节
        if lower.contains("gb") {
            return String(Int(number * 1024 * 1024 * 1024))
        } else if lower.contains("mb") {
            return String(Int(number * 1024 * 1024))
        } else if lower.contains("kb") {
            return String(Int(number * 1024))
        } else if lower.contains("b") {
            return String(Int(number))
        }

        return value
    }
}

// MARK: - Query Builder

/// 将解析后的查询转换为数据库查询条件
extension ParsedSearchQuery {
    /// 生成 SQL WHERE 子句（用于原生查询）
    func toSQLConditions(prefix: String = "") -> (String, [String]) {
        var conditions: [String] = []
        var params: [String] = []
        let connector = logicalOperator == .and ? " AND " : " OR "

        for filter in filters {
            let (condition, param) = filter.toSQLCondition(prefix: prefix, paramIndex: params.count)
            if !condition.isEmpty {
                conditions.append(condition)
                if let p = param {
                    params.append(p)
                }
            }
        }

        return (conditions.joined(separator: connector), params)
    }
}

extension SearchFilter {
    func toSQLCondition(prefix: String, paramIndex: Int) -> (String, String?) {
        let column = prefix.isEmpty ? field : "\(prefix).\(field)"
        let paramPlaceholder = "$\(paramIndex + 1)"

        switch op {
        case .equals:
            // 检查是否是状态码范围
            if field == "statusCode", value.contains("-") {
                let parts = value.split(separator: "-")
                if
                    parts.count == 2,
                    let min = Int(parts[0]),
                    let max = Int(parts[1])
                {
                    return ("(\(column) >= \(min) AND \(column) <= \(max))", nil)
                }
            }
            return ("\(column) = \(paramPlaceholder)", value)

        case .notEquals:
            return ("\(column) != \(paramPlaceholder)", value)

        case .contains:
            return ("\(column) LIKE '%' || \(paramPlaceholder) || '%'", value)

        case .greaterThan:
            return ("\(column) > \(paramPlaceholder)", value)

        case .lessThan:
            return ("\(column) < \(paramPlaceholder)", value)

        case .greaterOrEqual:
            return ("\(column) >= \(paramPlaceholder)", value)

        case .lessOrEqual:
            return ("\(column) <= \(paramPlaceholder)", value)

        case .regex:
            // SQLite 不原生支持 REGEXP，使用 LIKE 作为降级方案
            return ("\(column) LIKE '%' || \(paramPlaceholder) || '%'", value)
        }
    }
}
