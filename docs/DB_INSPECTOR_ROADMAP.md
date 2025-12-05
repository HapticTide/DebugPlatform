# DB Inspector 优化路线图

## 当前状态 (v0.2)

### 已实现
- ✅ 数据库列表（名称、类型、大小、表数量）
- ✅ 表列表（名称、行数）
- ✅ 表数据分页浏览
- ✅ 列排序（点击表头）
- ✅ Schema 查看
- ✅ 自定义 SQL 查询（仅 SELECT）
- ✅ 敏感数据库保护
- ✅ 状态持久化（切换 Tab 保持选中）
- ✅ **查询超时保护** (Phase 1.1 已完成)
- ✅ **结果集大小限制** (Phase 1.2 已完成)
- ✅ **并发查询限制** (Phase 1.3 已完成)

---

## Phase 1: 性能保护 (优先级: 🔴 Critical) ✅ 已完成

### 1.1 查询超时保护 ✅

**实现位置**: `iOSProbe/Sources/Database/SQLiteInspector.swift`

**配置参数**:
```swift
/// SQLite busy_timeout（毫秒）- 等待数据库锁的最大时间
private let busyTimeout: Int32 = 5000  // 5 秒

/// 查询执行超时（秒）- 超时后强制中断查询
private let queryExecutionTimeout: TimeInterval = 10.0
```

**实现机制**:
```swift
// 1. 设置超时定时器
var timedOut = false
let timeoutWorkItem = DispatchWorkItem {
    timedOut = true
    sqlite3_interrupt(db)  // 强制中断查询
    DebugLog.warning("[DBInspector] Query timeout after \(queryExecutionTimeout)s, interrupted")
}
DispatchQueue.global().asyncAfter(
    deadline: .now() + queryExecutionTimeout,
    execute: timeoutWorkItem
)

// 2. 在查询循环中检查超时状态
while !timedOut && rows.count < maxQueryRows {
    let stepResult = sqlite3_step(stmt)
    
    if timedOut { break }
    
    if stepResult == SQLITE_INTERRUPT {
        // 查询被中断（超时）
        break
    }
    // ...
}

// 3. 超时后抛出错误
if timedOut {
    throw DBInspectorError.timeout
}
```

### 1.2 结果集大小限制 ✅

**配置参数**:
```swift
/// 单页最大行数（表数据浏览）
private let maxPageSize = 500

/// SQL 查询最大返回行数
private let maxQueryRows = 1000
```

**限制说明**:
- 表数据分页浏览: 每页最多 500 行
- 自定义 SQL 查询: 最多返回 1000 行
- 超出限制会自动截断，不会报错

### 1.3 并发查询限制 ✅

**实现机制**:
```swift
/// 串行队列确保线程安全
private let queue = DispatchQueue(label: "com.debug.dbinspector", qos: .userInitiated)

// 所有数据库操作都在串行队列中执行
return try await withCheckedThrowingContinuation { continuation in
    queue.async {
        // 查询操作...
    }
}
```

**效果**:
- 同一时间只能执行一个查询
- 多个查询请求会排队执行
- 防止并发查询导致的资源竞争

### 1.4 SQL 注入防护 ✅

**实现机制**:
```swift
// 只允许 SELECT 语句
guard trimmedQuery.uppercased().hasPrefix("SELECT") else {
    throw DBInspectorError.invalidQuery("Only SELECT statements are allowed")
}

// 禁止危险操作关键字
let dangerousPatterns = ["DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE", "ATTACH", "DETACH"]
for pattern in dangerousPatterns {
    if upperQuery.contains(pattern) {
        throw DBInspectorError.invalidQuery("Query contains forbidden operation: \(pattern)")
    }
}
```

---

## Phase 2: 数据浏览增强 (优先级: 🟡 High)

### 2.1 筛选功能
```
表数据筛选:
- 列筛选: WHERE column = 'value'
- 文本搜索: WHERE column LIKE '%keyword%'
- 范围筛选: WHERE column BETWEEN a AND b
- NULL 筛选: WHERE column IS NULL / IS NOT NULL
```

### 2.2 列操作
- 隐藏/显示列
- 列宽调整
- 列固定（freeze）
- 列重排序

### 2.3 数据格式化
```
自动识别并格式化:
- 时间戳 → 可读日期
- JSON 字符串 → 格式化展示
- Base64 → 解码预览
- Blob → 大小显示 + 下载
- URL → 可点击链接
```

### 2.4 行详情视图
- 双击行展开详情面板
- 显示完整字段值（不截断）
- JSON/XML 高亮显示
- 复制单个字段值

---

## Phase 3: 查询增强 (优先级: 🟡 High)

### 3.1 查询历史
```typescript
interface QueryHistory {
  query: string
  timestamp: Date
  executionTimeMs: number
  rowCount: number
  dbId: string
}
```
- 保存最近 50 条查询
- 支持搜索历史
- 一键重新执行

### 3.2 查询构建器
- 可视化 WHERE 条件构建
- 表/列自动补全
- JOIN 辅助

### 3.3 查询模板
```
预设常用查询:
- SELECT COUNT(*) FROM {table}
- SELECT * FROM {table} ORDER BY {pk} DESC LIMIT 100
- PRAGMA table_info({table})
- PRAGMA index_list({table})
```

### 3.4 SQL 语法高亮
- 使用 CodeMirror 或 Monaco Editor
- 关键字高亮
- 错误提示

---

## Phase 4: 数据编辑 (优先级: 🟠 Medium) ⚠️ 危险操作

### 4.1 单元格编辑
- 双击编辑
- UPDATE 语句生成
- 需要确认弹窗

### 4.2 行操作
- 新增行 (INSERT)
- 删除行 (DELETE)
- 复制行
- 导出选中行

### 4.3 安全控制
```swift
// 在 DebugProbeSettings 中添加
var allowDatabaseWrite: Bool { get set }
var writeProtectedDatabases: [String] { get set }
```

### 4.4 操作审计日志
- 记录所有写操作
- 生成回滚 SQL

---

## Phase 5: 导入导出 (优先级: 🟠 Medium)

### 5.1 导出功能
```
支持格式:
- CSV (默认)
- JSON
- SQL INSERT 语句
- Excel (xlsx)
```

### 5.2 导入功能
- CSV 导入
- SQL 脚本执行（需安全审核）

### 5.3 数据库备份
- 一键导出整个数据库
- 下载 .sqlite 文件

---

## Phase 6: 高级功能 (优先级: 🟢 Low)

### 6.1 数据库结构
- ER 图可视化
- 索引列表
- 触发器列表
- 外键关系

### 6.2 性能分析
- EXPLAIN QUERY PLAN 可视化
- 慢查询标记
- 索引使用建议

### 6.3 数据比较
- 两个表对比
- 两个数据库对比
- 差异高亮

### 6.4 数据生成
- 测试数据生成器
- 支持 Faker 规则

---

## 实现优先级排序

| 阶段 | 功能 | 优先级 | 状态 | 预估工时 |
|------|------|--------|------|----------|
| 1.1 | 查询超时保护 | 🔴 Critical | ✅ 已完成 | - |
| 1.2 | 结果集大小限制 | 🔴 Critical | ✅ 已完成 | - |
| 1.3 | 并发查询限制 | 🔴 Critical | ✅ 已完成 | - |
| 1.4 | SQL 注入防护 | 🔴 Critical | ✅ 已完成 | - |
| 2.1 | 数据筛选 | 🟡 High | ⏳ 待开发 | 8h |
| 2.4 | 行详情视图 | 🟡 High | ⏳ 待开发 | 4h |
| 3.1 | 查询历史 | 🟡 High | ⏳ 待开发 | 4h |
| 2.3 | 数据格式化 | 🟡 High | ⏳ 待开发 | 6h |
| 3.4 | SQL 语法高亮 | 🟡 High | ⏳ 待开发 | 3h |
| 2.2 | 列操作 | 🟠 Medium | ⏳ 待开发 | 6h |
| 5.1 | CSV 导出 | 🟠 Medium | ⏳ 待开发 | 4h |
| 3.3 | 查询模板 | 🟠 Medium | ⏳ 待开发 | 2h |

---

## 技术实现参考

### 已实现的超时保护代码

**位置**: `iOSProbe/Sources/Database/SQLiteInspector.swift`

```swift
private func executeQueryInternal(at url: URL, dbId: String, query: String) throws -> DBQueryResponse {
    let startTime = CFAbsoluteTimeGetCurrent()
    
    let db = try openDatabase(at: url)
    defer { sqlite3_close(db) }
    
    // 设置超时定时器 - 超时后强制中断查询
    var timedOut = false
    let timeoutWorkItem = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        timedOut = true
        sqlite3_interrupt(db)
        DebugLog.warning("[DBInspector] Query timeout after \(self.queryExecutionTimeout)s, interrupted")
    }
    DispatchQueue.global().asyncAfter(
        deadline: .now() + queryExecutionTimeout,
        execute: timeoutWorkItem
    )
    defer { timeoutWorkItem.cancel() }
    
    var stmt: OpaquePointer?
    let prepareResult = sqlite3_prepare_v2(db, query, -1, &stmt, nil)
    
    if timedOut {
        sqlite3_finalize(stmt)
        throw DBInspectorError.timeout
    }
    
    guard prepareResult == SQLITE_OK else {
        let errorMessage = String(cString: sqlite3_errmsg(db))
        throw DBInspectorError.invalidQuery(errorMessage)
    }
    defer { sqlite3_finalize(stmt) }
    
    // ... 获取列信息 ...
    
    // 执行查询并获取结果（限制最多 maxQueryRows 行）
    var rows: [DBRow] = []
    
    while !timedOut && rows.count < maxQueryRows {
        let stepResult = sqlite3_step(stmt)
        
        if timedOut { break }
        
        if stepResult == SQLITE_DONE {
            break
        } else if stepResult == SQLITE_ROW {
            // ... 读取行数据 ...
            rows.append(DBRow(values: values))
        } else if stepResult == SQLITE_INTERRUPT {
            // 查询被中断（超时）
            break
        } else {
            let errorMessage = String(cString: sqlite3_errmsg(db))
            throw DBInspectorError.internalError("Query failed: \(errorMessage)")
        }
    }
    
    // 检查是否因超时而中断
    if timedOut {
        throw DBInspectorError.timeout
    }
    
    // ... 返回结果 ...
}
```

### 下一步推荐实现: 查询历史

**WebUI 存储方案**:
```typescript
// stores/dbStore.ts
interface QueryHistoryItem {
  id: string
  query: string
  dbId: string
  dbName: string
  timestamp: number
  executionTimeMs: number
  rowCount: number
  success: boolean
  error?: string
}

// 使用 localStorage 持久化
const HISTORY_KEY = 'db_inspector_query_history'
const MAX_HISTORY = 50

// 在 executeQuery 成功/失败后添加记录
addToHistory: (item: Omit<QueryHistoryItem, 'id'>) => {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  const newItem = { ...item, id: crypto.randomUUID() }
  history.unshift(newItem)
  if (history.length > MAX_HISTORY) history.pop()
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  set({ queryHistory: history })
}
```
