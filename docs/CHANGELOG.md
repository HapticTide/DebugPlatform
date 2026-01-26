# Debug Platform 更新日志

所有显著更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.2.0] - 2025-01-27

> **注意**: 此版本包含自 1.1.0 以来的所有累积更新，对应 Git tag `1.2.0`。

### 新增

#### 加密数据库状态显示
- **WebUI**: 新增 `EncryptionStatus` 类型（none/unlocked/locked）
- **WebUI**: 新增 `UnlockIcon` 解锁图标组件
- **WebUI**: 加密数据库列表显示锁定/解锁状态图标
  - 🔓 绿色解锁图标：已解锁的加密数据库
  - 🔒 红色锁定图标：未解锁的加密数据库
- **Hub**: 新增 `EncryptionStatusDTO` 枚举类型

#### 数据库归属显示增强
- **WebUI**: "当前账户"分组标题优先使用 `ownerDisplayName`（显示用户昵称而非通用标签）

#### 部署脚本
- **新增**: `deploy.sh` 根目录统一部署脚本
  - 支持 `--sqlite` / `--postgres` 数据库模式切换
  - 支持 `--port` / `--host` 自定义端口和地址
  - 支持 `--with-webui` 同时构建前端
  - 支持 `--status` / `--stop` / `--restart` / `--logs` 服务管理
  - 自动处理旧 DebugHub 进程端口占用

### 修复

- **远程部署**: 修复 `remote-deploy.sh` 中脚本路径问题（`DebugHub/deploy.sh` → `deploy.sh`）

---

## [1.5.0] - 2025-12-17

### 新增

#### 页面耗时监控
- **SDK**: 新增 `PageTimingRecorder` 页面耗时记录器
- **SDK**: 支持 UIKit ViewController 自动采集（viewWillAppear → viewDidAppear）
- **SDK**: 支持 SwiftUI UIHostingController 自动采集
- **SDK**: 支持手动 API 精确控制页面生命周期标记
- **SDK**: 支持自定义标记点（markers）
- **SDK**: 支持采样率控制和黑/白名单
- **Hub**: 新增 `page_timing` 事件类型处理和存储
- **Hub**: 新增页面耗时 API 接口（列表、详情、统计、删除）
- **WebUI**: 新增"页面耗时"标签页
- **WebUI**: 支持页面列表视图和统计摘要视图
- **WebUI**: 支持页面耗时分布图表

### 修复

- **SDK**: 修复 SwiftUI 页面被错误过滤的问题（shouldTrack 逻辑优化）
- **Hub**: 修复 `pageTiming` 事件路由缺失的问题

### 改进

- **WebUI**: HTTP 子标签颜色改为主题绿色，与父 Tab 样式保持一致
- **WebUI**: WebSocket、Performance、Log 操作栏间距统一为 `px-4 py-1.5`

---

## [1.4.1] - 2025-12-12

### 文档

#### README 全面更新
- **DebugPlatform/README.md**: 更新架构图显示 8 个插件，修正插件名称
- **WebUI/README.md**: 完全重写，详细列出所有组件、页面、插件、stores
- **DebugProbe/README.md**: 修正版本号，更新插件列表和架构图

#### 路线图文档更新
- **ROADMAP.md**: 更新三层架构插件数量（7→8），添加相关文档链接
- **HTTP_INSPECTOR_ROADMAP.md**: 标记虚拟滚动、增量加载、请求分组为已完成
- **LOG_VIEWER_ROADMAP.md**: 标记高级搜索语法、正则搜索为已完成
- **DB_INSPECTOR_ROADMAP.md**: 更新版本号（v0.2→v1.3），添加 Protobuf BLOB 解析
- **BREAKPOINT_ROADMAP.md**: 标记 Phase 0 全部为已完成
- **CHAOS_ENGINE_ROADMAP.md**: 标记 Phase 0 为已完成
- **PERFORMANCE_MONITOR_ROADMAP.md**: 更新状态为"开发中"

#### PROMPTS.md 同步
- 更新插件数量和 ID（`network`→`http`）
- 更新 DebugHub 目录结构
- 更新 WebUI 目录结构
- 修正 HTTP 相关开发参考

#### 新增文档
- **ANDROID_PROBE_GUIDE.md**: Android 版 DebugProbe SDK 开发指南
  - 完整的架构设计和模块结构
  - 插件系统设计（与 iOS 一致）
  - OkHttp 拦截器实现
  - Timber 日志集成
  - SQLite 检查器实现
  - WebSocket 通信协议
  - 快速开始指南和开发清单

---

## [1.4.0] - 2025-12-11

### 新增

#### 设备管理增强
- 设备批量选择支持
- 设备备注名功能（保存到后端）
- 批量删除离线设备

#### 插件管理界面
- 新增 PluginManager 组件
- 支持动态启用/禁用插件
- 插件依赖自动管理

### 改进

#### 平台中立化
- 所有 "Debug Hub" 文案改为 "Debug Platform"
- 所有 "iOS App" 文案改为 "App"
- localStorage key 前缀从 `debughub_` 改为 `debugplatform_`

#### UI/UX 优化
- 侧边栏 DOMAINS 区域根据当前插件切换显示
- Log 过滤器栏背景色与工具栏一致
- 确认对话框支持 ESC 键关闭
- 批量操作后列表自动刷新

#### API 文档更新
- 移除废弃的 `toggle-capture` API
- 新增 `PUT /api/devices/:deviceId/nickname` API
- 按插件化体系重新组织 API 文档
- 补充批量删除、单条删除等 API

### 移除

#### 废弃代码清理
- 移除 `captureEnabled` 相关字段和逻辑
- 移除旧的 `currentTab` URL 参数
- 删除历史 AI Prompts 文档：
  - PLUGIN_REFACTOR_PROMPTS_1.md
  - PLUGIN_REFACTOR_PROMPTS_2.md
  - PLUGIN_REFACTOR_STATUS.md
  - PROMPTS.md

### 文档

#### README 更新
- 更新架构图显示三层插件系统
- 更新版本号和日期
- 更新功能模块状态表

#### ROADMAP 更新
- 标记所有模块为稳定状态
- 更新下一步计划
- 添加废弃文档清单

---

## [1.3.0] - 2025-12-06

### 新增

#### Traffic Rules 完整实现
- HTTP 请求列表应用规则过滤（hide 规则隐藏匹配的请求）
- HTTP 请求列表高亮显示（highlight 规则显示黄色背景和 ⭐ 图标）
- HTTP 请求列表标记功能（mark 规则显示自定义颜色的左边框和 🏷️ 图标）
- 支持域名匹配和 URL 正则匹配
- VirtualHTTPEventTable 和 GroupedHTTPEventList 均支持规则

#### DB Inspector Protobuf BLOB 解析
- 支持上传 `.desc` 文件（由 `protoc --descriptor_set_out` 生成）
- 支持配置 BLOB 列到 Protobuf 消息类型的映射
- 自动识别和解析 BLOB 类型单元格
- 三种视图模式：Schema 解码、Wire Format、Hex
- 配置持久化到 localStorage
- 点击 BLOB 单元格弹出详细解析面板

#### DB Inspector SQL 查询功能
- 支持自定义 SQL 查询（仅 SELECT）
- 查询超时保护（5 秒自动中断）
- 结果集大小限制（最多 1000 行）
- 并发查询限制（串行队列）
- 完整错误信息显示

#### HTTP 虚拟滚动
- 使用 `@tanstack/react-virtual` 实现虚拟滚动
- 支持 10,000+ 请求流畅浏览
- 预渲染 10 行以提升滚动体验

#### HTTP 请求分组
- 按域名分组：相同域名的请求归类显示
- 按路径分组：按 URL 前缀分组
- 分组统计：请求数、平均耗时、错误数、Mock 数
- 支持展开/收起单个分组或全部

#### 日志高级搜索
- 支持字段搜索语法：`level:error subsystem:Network message:"timeout"`
- 支持时间范围：`timestamp:>2025-12-05T10:00:00`
- 支持正则表达式消息搜索
- 搜索帮助弹出框
- 简单/高级模式切换

#### 功能模块路线图
- 新增 7 个独立功能模块路线图文档
- HTTP_INSPECTOR_ROADMAP.md
- WS_INSPECTOR_ROADMAP.md
- LOG_VIEWER_ROADMAP.md
- MOCK_ENGINE_ROADMAP.md
- BREAKPOINT_ROADMAP.md
- CHAOS_ENGINE_ROADMAP.md
- 更新 ROADMAP.md 整合所有模块

### 改进

#### UI 选中样式优化
- **DB Inspector**: 数据库和表选中改为实色主题块（`bg-primary`/`bg-accent-blue`）
- **HTTP 列表**: 选中行改为实色主题块，内部元素颜色自适应
- **WebSocket 列表**: 选中行改为实色主题块，状态指示器颜色自适应
- 所有选中样式添加阴影效果，更突出

#### 日志级别筛选优化
- 筛选模式从多选改为单选层级模式
- 选择某个级别后，显示该级别及更高级别的日志
- 日志级别调整为 CocoaLumberjack 标准：error > warning > info > debug > verbose
- 移除 `fault` 级别，新增 `verbose` 级别

### 修复

#### 断点功能修复
- **消息格式统一**: `BreakpointResumeDTO` 添加 `modifiedResponse` 字段，与 iOS SDK 格式匹配
- **网络层集成已完成**: `CaptureURLProtocol.startLoading()` 已正确调用 `BreakpointEngine` 和 `ChaosEngine`
- **breakpointHit 处理已完成**: DebugHub 正确处理断点命中并广播到 WebUI

#### Chaos Engine 修复
- **网络层集成已完成**: `CaptureURLProtocol` 已集成完整的 Chaos 故障注入支持
- 支持延迟注入、超时模拟、连接重置、错误码注入、数据损坏、请求丢弃

#### SQLite 内存安全
- 修复 `tableExists()` 方法的内存 bug
- 使用 `SQLITE_TRANSIENT` 确保字符串正确绑定
- 防止 C 字符串在 `sqlite3_step()` 执行前被释放

### 改进文件

| 文件 | 变更类型 |
|------|----------|
| `WebUI/src/components/DBInspector.tsx` | SQL 查询 UI、选中样式 |
| `WebUI/src/components/HTTPEventTable.tsx` | 选中样式优化 |
| `WebUI/src/components/WSSessionList.tsx` | 选中样式优化 |
| `WebUI/src/components/LogFilters.tsx` | 单选层级模式 |
| `WebUI/src/components/LogList.tsx` | 日志级别标签 |
| `WebUI/src/stores/dbStore.ts` | SQL 查询状态 |
| `WebUI/src/stores/logStore.ts` | 层级筛选逻辑 |
| `WebUI/src/types/index.ts` | LogLevel 类型 |
| `WebUI/src/utils/format.ts` | 日志级别样式 |
| `WebUI/tailwind.config.js` | 颜色配置 |
| `DebugProbe/Sources/Database/SQLiteInspector.swift` | 超时保护、内存修复 |
| `DebugProbe/Sources/Models/DebugEvent.swift` | Level 枚举 |
| `DebugProbe/Sources/Log/AppLogger.swift` | verbose 方法 |
| `DebugProbe/Sources/Log/DebugProbeDDLogger.swift` | DDLogFlag 映射 |
| `DebugHub/Sources/Controllers/DatabaseController.swift` | executeQuery 端点 |
| `docs/*.md` | 路线图文档 |

---

## [1.2.0] - 2025-12-4

### 新增

#### WebSocket 消息完整内容查看

- **后端 API**: `GET /api/devices/{deviceId}/ws-sessions/{sessionId}/frames/{frameId}`
  - 返回 `payloadText`: UTF-8 解码的文本（如果可解码）
  - 返回 `payloadBase64`: Base64 编码的完整 payload
- **前端格式切换器**: 支持 AUTO / TEXT / JSON / HEX / BASE64 五种格式
  - AUTO 模式智能检测最佳显示格式
  - HEX 格式专业 hex dump 显示（带偏移量和 ASCII）
  - JSON 格式使用 JSONTree 组件展示

#### 请求重放功能实现
- iOS SDK 完整实现 `replayRequest` 消息处理
- 使用 `.ephemeral` URLSession 执行重放，避免重放请求被重复记录
- 日志记录请求执行状态

### 修复

#### 协议兼容性
- **payloadSize 解码错误**: `WSEventDTO.Frame` 中 `payloadSize` 改为可选字段
- **replayRequest 消息类型**: iOS SDK 添加缺失的消息类型 (`replayRequest`, `updateBreakpointRules`, `breakpointResume`, `updateChaosRules`)
- **ReplayRequestPayload 字段同步**: iOS SDK 字段名从 `requestId` 改为 `id`，`body` 类型从 `Data?` 改为 `String?` (base64)

#### WebSocket Session URL

- 修复帧事件先于 session 事件到达时，session URL 显示为 "(unknown - session created from frame)" 的问题
- 添加异步 session 信息获取机制

### 变更

#### 视觉风格简化

- 移除所有发光效果 (`shadow-glow-*`, `shadow-neon-*`)
- 移除背景渐变效果
- 边框颜色改为纯色 (`#1e293b`, `#2a3441`)
- 字体改为 Inter

### 改进文件

| 文件 | 变更类型 |
|------|----------|
| `DebugHub/Sources/Controllers/WSEventController.swift` | 新增 frame payload API |
| `DebugHub/Sources/Services/EventDTOs.swift` | payloadSize 可选 |
| `DebugProbe/Sources/Models/BridgeMessage.swift` | 新增消息类型，修复 payload 结构 |
| `DebugProbe/Sources/Core/DebugBridgeClient.swift` | 实现 replayRequest 处理 |
| `WebUI/src/components/WSSessionDetail.tsx` | 完整重写，支持格式切换 |
| `WebUI/src/pages/DeviceDetailPage.tsx` | 异步 session 信息获取 |
| `WebUI/src/stores/wsStore.ts` | 添加 updateSessionUrl 方法 |
| `WebUI/src/services/api.ts` | 添加 getWSFrameDetail 函数 |
| `WebUI/src/types/index.ts` | 添加 WSFrameDetail 类型 |
| `WebUI/src/index.css` | 移除渐变和发光效果 |
| `WebUI/tailwind.config.js` | 字体改为 Inter |
| 多个组件文件 | 边框和背景样式简化 |

---

## [1.1.0] - 2025-12-3

### 新增

#### 工程化增强 (Phase 3.6)
- React WebUI 完整实现（React + TypeScript + Vite + Tailwind CSS）
- API 文档页 (`/api-docs`) - 内置交互式 API 文档
- 健康检查页 (`/health`) - 服务状态监控
- 一键部署脚本 (`deploy.sh`) - 自动安装依赖、配置数据库
- Swift 6 兼容 - Actor-based 并发、@unchecked Sendable
- SPA 路由支持 - 服务端 Fallback 支持前端路由刷新

#### 配置与日志增强 (Phase 3.7)
- 运行时配置管理 (`DebugProbeSettings`)
- 内部日志开关 (`DebugLog` 分级日志)
- 配置 UI 界面 (`DebugProbeSettingsController`)
- 配置持久化 (UserDefaults + Info.plist)
- HTTP 自动拦截 (`URLSessionConfigurationSwizzle`)
- WebSocket 连接级 Swizzle + 消息级 Hook

#### 可靠性与协议增强 (Phase 3.5)
- Protobuf Wire Format 解析 + 嵌套消息 + Hex 视图
- 事件持久化队列 (SQLite 本地队列)
- 断线重连恢复 - 自动恢复发送持久化事件
- PostgreSQL 支持 - 默认数据库，支持高并发

### 变更

- 数据库默认从 SQLite 改为 PostgreSQL
- 部署方式改为脚本化一键部署

---

## [1.0.0] - 2025-12-2

### 新增

#### 核心调试能力 (Phase 1)
- iOS Probe 网络捕获 (URLProtocol + URLSessionTaskMetrics)
- iOS Probe 日志捕获 (CocoaLumberjack + os_log)
- Debug Hub 后端服务 (Vapor + PostgreSQL/SQLite + WebSocket)
- Web UI 基础框架 (React + TypeScript + Vite + Tailwind)
- 实时数据流 (WebSocket 双向通信)
- Mock 规则引擎 (HTTP/WS 请求拦截与响应模拟)
- 请求重放 (通过 WebSocket 指令重放请求)
- cURL 导出 (生成可复制的 cURL 命令)
- JSON 响应树形展示 (可折叠的 JSON 树形视图)
- 性能时间线 (DNS/TCP/TLS/TTFB 时间瀑布图)

#### 高级调试能力 (Phase 2)
- 高级搜索语法 (`method:POST status:4xx duration:>500ms`)
- HAR 导出 (HTTP Archive 1.2 格式)
- 断点调试 (请求/响应拦截与修改)
- 故障注入 (延迟、超时、错误码注入)
- 请求 Diff 对比 (并排对比两个请求差异)

#### 用户体验增强 (Phase 3)
- 数据自动清理 (默认3天过期)
- 图片响应预览 (检测图片类型并内联渲染)
- 深色/浅色主题 (CSS 变量 + 主题切换 + 跟随系统)
- 键盘快捷键 (全局快捷键支持 + 帮助面板)
- 请求收藏/标记 (收藏重要请求，防止被清理)
- 批量操作 (多选 + 批量删除/收藏/导出)

---

## 版本历史图表

```
1.0.0 ─► 1.1.0 ─► 1.2.0 ─► 1.3.0 ─► 1.4.0 ─► 1.4.1 (当前)
  │        │        │        │        │        │
  │        │        │        │        │        └─ 文档全面更新
  │        │        │        │        │           Android 开发指南
  │        │        │        │        │
  │        │        │        │        └─ 设备管理增强
  │        │        │        │           插件管理界面
  │        │        │        │           平台中立化
  │        │        │        │
  │        │        │        └─ Traffic Rules
  │        │        │           DB Inspector 增强
  │        │        │           HTTP 虚拟滚动/分组
  │        │        │           日志高级搜索
  │        │        │
  │        │        └─ WebSocket 完整内容
  │        │           请求重放
  │        │           视觉风格简化
  │        │
  │        └─ 工程化增强
  │           配置与日志增强
  │           可靠性增强
  │
  └─ 核心调试能力
     高级调试能力
     用户体验增强
```

---

## 升级指南

### 从 1.1.x 升级到 1.2.x

1. **后端无数据库迁移**，直接更新代码重新编译即可

2. **iOS SDK 需要重新集成**：
   ```bash
   # Swift Package Manager 会自动更新
   # 或手动清理缓存
   rm -rf ~/Library/Caches/org.swift.swiftpm
   ```

3. **WebUI 重新部署**：
   ```bash
   cd WebUI && npm run deploy
   ```

### 从 1.0.x 升级到 1.1.x

1. **数据库迁移** (如果使用 PostgreSQL)：
   ```bash
   cd DebugHub
   swift run App migrate
   ```

2. **配置文件更新**：
   - 检查 `.env` 文件中的数据库连接字符串
   - 确保 `DATABASE_URL` 指向正确的 PostgreSQL 实例
