# Debug Platform - 网络和日志一体化调试平台

一套专为内部 iOS App 设计的调试系统，类似于内部版的 Proxy Tool + Log Viewer。

## ✨ 功能特性

### 核心调试能力
- 🌐 **HTTP/HTTPS 捕获** - Method Swizzling 自动拦截 + URLSessionTaskMetrics 性能时间线
- 🔌 **WebSocket 捕获** - 连接级自动监控 + 消息级 Hook 支持
- 📝 **日志捕获** - CocoaLumberjack + os_log 包装
- 🎭 **Mock 规则引擎** - HTTP/WS 请求拦截与响应模拟
- 🔄 **请求重放** - 一键重放历史请求
- ⏸️ **断点调试** - 请求/响应拦截与修改
- 💥 **故障注入** - 延迟、超时、错误码注入

### 数据分析

- 🔍 **高级搜索语法** - `method:POST status:4xx duration:>500ms`
- 📊 **请求 Diff 对比** - 并排对比两个请求差异
- 📦 **Protobuf 解析** - Wire Format 自动解析
- 🖼️ **图片响应预览** - 检测图片类型并内联渲染
- ⏱️ **性能时间线** - DNS/TCP/TLS/TTFB 瀑布图

### 数据导出
- 📋 **cURL 导出** - 生成可复制的 cURL 命令
- 📁 **HAR 导出** - HTTP Archive 1.2 格式

### 用户体验
- 🌙 **深色/浅色主题** - 支持跟随系统
- ⌨️ **键盘快捷键** - 全局快捷键支持
- ⭐ **请求收藏** - 收藏重要请求，防止被清理
- 📦 **批量操作** - 多选 + 批量删除/收藏/导出
- 🧹 **自动清理** - 可配置的数据过期策略
- 📖 **API 文档页** - 内置交互式 API 文档
- 💚 **健康检查** - 服务状态监控页面

### 可靠性
- 💾 **事件持久化** - 断线时本地 SQLite 缓存
- 🔄 **断线恢复** - 重连后自动恢复发送
- 🐘 **PostgreSQL 支持** - 生产环境高并发数据库
- ⚙️ **运行时配置** - 动态修改 Hub 地址，无需重新编译
- 🔇 **日志开关** - 可控的内部日志输出

---

## 🏗️ 系统架构

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              iOS App                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         iOS Probe                                   │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │ URLProtocol│  │ WS Client  │  │ DD Logger  │  │ Mock Engine│     │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │   │
│  │        └───────────────┴───────────────┴───────────────┘            │   │
│  │                              │                                      │   │
│  │               ┌──────────────┼──────────────┐                       │   │
│  │               ▼              ▼              ▼                       │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │   │
│  │  │BreakpointEngine│  │  ChaosEngine   │  │ DebugEventBus  │         │   │
│  │  └────────────────┘  └────────────────┘  └───────┬────────┘         │   │
│  │                                                  │                  │   │
│  │                    ┌─────────────────────────────┼─────────────┐    │   │
│  │                    │      DebugBridgeClient      │             │    │   │
│  │                    │         (WebSocket)         │             │    │   │
│  │                    └─────────────────────────────┼─────────────┘    │   │
│  │                                                  │                  │   │
│  │                    ┌─────────────────────────────▼─────────────┐    │   │
│  │                    │     EventPersistenceQueue (SQLite)        │    │   │
│  │                    │        断线时本地缓存，重连后恢复             │    │   │
│  │                    └───────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ WebSocket (debug-bridge)
                                        │ Token 认证
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Debug Hub (Vapor + PostgreSQL)                    │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                         WebSocket Handlers                         │   │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────┐  │   │
│  │  │   DebugBridgeHandler    │  │    RealtimeStreamHandler        │  │   │
│  │  │   (iOS 设备连接)         │  │    (Web UI 实时推送)              │  │   │
│  │  └─────────────────────────┘  └─────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                        │                                  │
│  ┌─────────────────────────────────────▼───────────────────────────────┐  │
│  │                              Services                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │  │
│  │  │DeviceRegistry│  │EventIngestor │  │SearchParser  │               │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │  │
│  │  ┌──────────────┐  ┌──────────────┐                                 │  │
│  │  │DataCleanup   │  │BreakpointMgr │                                 │  │
│  │  └──────────────┘  └──────────────┘                                 │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                        │                                  │
│  ┌─────────────────────────────────────┼───────────────────────────────┐  │
│  │                           REST Controllers                          │  │
│  │  Device │ HTTP │ WS │ Log │ Mock │ Breakpoint │ Chaos │ Export      │  │
│  └─────────────────────────────────────┼───────────────────────────────┘  │
│                                        │                                  │
│  ┌─────────────────────────────────────▼───────────────────────────────┐  │
│  │                    Database (Fluent ORM)                            │  │
│  │              PostgreSQL (默认) │ SQLite (开发环境)                    │  │
│  │  http_events │ ws_sessions │ ws_frames │ log_events │ mock_rules    │  │
│  │  breakpoint_rules │ chaos_rules                                     │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                        │                                  │
│  ┌─────────────────────────────────────▼───────────────────────────────┐  │
│  │                    Static Files (Public/)                           │  │
│  │                      ← WebUI (React) 构建产物                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ HTTP + WebSocket (/ws/live)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          Web UI (React + TypeScript + Vite)               │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                              Pages                                 │   │
│  │  DeviceListPage │ DeviceDetailPage │ ApiDocsPage │ HealthPage      │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                            Components                              │   │
│  │  HTTPEventTable │ LogList │ JSONTree │ TimingWaterfall │ Sidebar   │   │
│  │  ProtobufViewer │ ImagePreview │ RequestDiff │ AdvancedSearch      │   │
│  │  ThemeToggle │ KeyboardShortcutsHelp │ BatchSelectionBar           │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   Zustand Stores │  │   API Service    │  │ Realtime Service │         │
│  │  device/http/log │  │  REST API 调用    │  │  WebSocket 订阅  │         │
│  │  theme/connection│  │                  │  │                  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
└───────────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
1. 正常流程:
   iOS App → Event → EventBus → BridgeClient → WebSocket → Debug Hub → PostgreSQL
                                                              ↓
                                              RealtimeStream → Web UI (React)

2. 断线流程:
   iOS App → Event → EventBus → BridgeClient → SQLite 本地队列 (iOS)
                                     ↓ (重连后)
                              分批恢复发送 → Debug Hub

3. 控制流程:
   Web UI → REST API → Debug Hub → WebSocket → iOS App (Mock规则/断点/故障注入)
```

---

## 📁 项目结构

```
DebugPlatform/
├── iOSProbe/                        # iOS 端调试探针 SDK
│   ├── Package.swift
│   └── Sources/
│       ├── Models/                  # 数据模型
│       │   ├── DebugEvent.swift         # 统一事件模型 (HTTP/WS/Log/Stats)
│       │   ├── DeviceInfo.swift         # 设备信息
│       │   ├── MockRule.swift           # Mock 规则
│       │   ├── BreakpointRule.swift     # 断点规则
│       │   ├── ChaosRule.swift          # 故障注入规则
│       │   └── BridgeMessage.swift      # 通信协议
│       ├── Core/                    # 核心组件
│       │   ├── DebugProbe.swift         # 主入口
│       │   ├── DebugProbeSettings.swift # 运行时配置管理
│       │   ├── DebugLog.swift           # 内部日志工具
│       │   ├── DebugEventBus.swift      # 事件总线
│       │   ├── DebugBridgeClient.swift  # WebSocket 客户端
│       │   ├── BreakpointEngine.swift   # 断点引擎 (Actor-based)
│       │   ├── ChaosEngine.swift        # 故障注入引擎
│       │   └── EventPersistenceQueue.swift # 本地持久化队列
│       ├── Network/                 # 网络层
│       │   ├── NetworkInstrumentation.swift
│       │   ├── URLSessionConfigurationSwizzle.swift # HTTP 自动拦截
│       │   ├── WebSocketInstrumentation.swift # WS 连接级监控
│       │   └── InstrumentedWebSocketClient.swift # WS 消息级监控
│       ├── Log/                     # 日志层
│       │   ├── DebugProbeDDLogger.swift
│       │   └── AppLogger.swift
│       └── Mock/                    # Mock 引擎
│           └── MockRuleEngine.swift
│
├── DebugHub/                        # Mac mini 后端服务 (Vapor)
│   ├── Package.swift                # Swift 6.0, macOS 14+
│   ├── deploy.sh                    # 一键部署脚本
│   ├── Sources/
│   │   ├── App/
│   │   │   ├── App.swift                # @main 入口点
│   │   │   └── Configure.swift          # 应用配置、路由、数据库
│   │   ├── Models/
│   │   │   ├── DBModels.swift           # Fluent 数据库模型 (@unchecked Sendable)
│   │   │   └── Migrations.swift         # 数据库迁移
│   │   ├── Services/
│   │   │   ├── DeviceRegistry.swift     # 设备会话管理
│   │   │   ├── EventIngestor.swift      # 事件入库
│   │   │   ├── EventDTOs.swift          # 数据传输对象
│   │   │   ├── SearchQueryParser.swift  # 高级搜索解析
│   │   │   └── DataCleanupService.swift # 自动清理服务
│   │   ├── WebSocket/
│   │   │   ├── DebugBridgeHandler.swift # iOS 设备连接
│   │   │   └── RealtimeStreamHandler.swift # Web UI 实时推送
│   │   └── Controllers/
│   │       ├── DeviceController.swift
│   │       ├── HTTPEventController.swift
│   │       ├── WSEventController.swift
│   │       ├── LogEventController.swift
│   │       ├── MockRuleController.swift
│   │       ├── BreakpointController.swift
│   │       ├── ChaosController.swift
│   │       └── ExportController.swift
│   └── Public/                      # ← WebUI (React) 构建产物
│       ├── index.html                   # SPA 入口
│       ├── favicon.svg
│       └── assets/                      # Vite 打包资源
│           ├── index-*.js
│           └── index-*.css
│
├── WebUI/                           # 前端项目 (React + TypeScript + Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── scripts/
│   │   └── deploy.sh                # 构建部署脚本
│   └── src/
│       ├── App.tsx                  # React Router 配置
│       ├── main.tsx
│       ├── index.css
│       ├── components/
│       │   ├── HTTPEventTable.tsx
│       │   ├── HTTPEventDetail.tsx
│       │   ├── LogList.tsx
│       │   ├── LogFilters.tsx
│       │   ├── JSONTree.tsx
│       │   ├── TimingWaterfall.tsx
│       │   ├── ProtobufViewer.tsx       # Protobuf Wire Format 解析
│       │   ├── ImagePreview.tsx
│       │   ├── AdvancedSearch.tsx
│       │   ├── RequestDiff.tsx
│       │   ├── ThemeToggle.tsx
│       │   ├── KeyboardShortcutsHelp.tsx
│       │   ├── BatchSelectionBar.tsx
│       │   ├── DeviceCard.tsx
│       │   └── Sidebar.tsx              # 导航侧边栏
│       ├── pages/
│       │   ├── DeviceListPage.tsx       # 设备列表
│       │   ├── DeviceDetailPage.tsx     # 设备详情
│       │   ├── ApiDocsPage.tsx          # API 文档页
│       │   └── HealthPage.tsx           # 健康检查页
│       ├── services/
│       │   ├── api.ts                   # REST API 封装
│       │   └── realtime.ts              # WebSocket 服务
│       ├── stores/
│       │   ├── deviceStore.ts
│       │   ├── httpStore.ts
│       │   ├── logStore.ts
│       │   ├── themeStore.ts
│       │   └── connectionStore.ts
│       ├── hooks/
│       │   └── useKeyboardShortcuts.ts
│       ├── types/
│       │   └── index.ts
│       └── utils/
│           └── format.ts
│
├── docs/
│   └── ROADMAP.md                   # 功能路线图
│
└── README.md
```

---

## 🚀 快速开始

### 1. 启动 Debug Hub

#### 一键部署（推荐）

使用部署脚本自动安装依赖、配置数据库并启动服务：

```bash
cd DebugPlatform/DebugHub

# 一键部署（默认 PostgreSQL + Release 模式）
./deploy.sh

# 指定端口
./deploy.sh --port 3000

# 同时构建 WebUI
./deploy.sh --with-webui

# 使用 SQLite（无需 PostgreSQL）
./deploy.sh --sqlite

# 仅编译不运行
./deploy.sh --build-only
```

#### PostgreSQL 模式（默认）

**方式一：使用 Docker（推荐）**

```bash
# 1. 启动 PostgreSQL 容器
docker run -d --name debughub-postgres \
  -e POSTGRES_USER=debug_hub \
  -e POSTGRES_PASSWORD=debug_hub_password \
  -e POSTGRES_DB=debug_hub \
  -p 5432:5432 \
  -v debughub_pgdata:/var/lib/postgresql/data \
  postgres:17

# 2. 启动 DebugHub
cd DebugPlatform/DebugHub
./deploy.sh
```

**方式二：使用本地 PostgreSQL**

```bash
cd DebugPlatform/DebugHub

# 部署脚本会自动：
# 1. 安装 Homebrew（如果未安装）
# 2. 安装 PostgreSQL（如果未安装）
# 3. 创建数据库和用户
# 4. 编译并启动服务
./deploy.sh
```

#### SQLite 模式（开发环境）

```bash
cd DebugPlatform/DebugHub

# 使用 SQLite，零配置（数据存储在 ./data/debug_hub.sqlite）
./deploy.sh --sqlite

# 指定数据目录
./deploy.sh --sqlite --data-dir /path/to/data

# 或手动运行
DATABASE_MODE=sqlite swift run
```

服务启动后：
- Web UI: http://localhost:8080
- API 文档: http://localhost:8080/api-docs
- 健康检查: http://localhost:8080/health
- Debug Bridge: ws://localhost:8080/debug-bridge
- REST API: http://localhost:8080/api/

### 2. 构建 Web UI（可选，已预构建）

```bash
cd DebugPlatform/WebUI

# 安装依赖
npm install

# 构建并部署到 DebugHub/Public
npm run deploy
```

### 3. 前端开发模式

```bash
cd DebugPlatform/WebUI

# 启动开发服务器 (localhost:5173)
npm run dev
```

### 4. iOS App 集成

#### 4.1 添加 SDK

将 `iOSProbe/Sources/` 目录添加到 Xcode 项目。

#### 4.2 初始化

```swift
#if !APPSTORE
import DebugProbe

func setupDebugProbe() {
    let settings = DebugProbeSettings.shared
    
    // 如果禁用了 DebugProbe，直接返回
    guard settings.isEnabled else { return }
    
    var config = DebugProbe.Configuration(
        hubURL: settings.hubURL,  // 支持运行时修改
        token: settings.token
    )
    
    // 配置持久化
    config.enablePersistence = true
    config.maxPersistenceQueueSize = 100_000
    config.persistenceRetentionDays = 3
    
    DebugProbe.shared.start(configuration: config)
}

// 在 AppDelegate/SceneDelegate 中调用
setupDebugProbe()
#endif
```

#### 4.3 HTTP 网络捕获

SDK 默认使用 `.automatic` 模式，通过 Method Swizzling 自动拦截所有 HTTP 请求：

```swift
// 自动模式（默认）- 无需任何配置，自动拦截所有请求
config.networkCaptureMode = .automatic

// 手动模式 - 需要手动注入到自定义 URLSessionConfiguration
config.networkCaptureMode = .manual
```

自动模式下，Alamofire、自定义 URLSession 等所有网络层都会被自动捕获。

#### 4.4 WebSocket 捕获

**方式一：使用 InstrumentedWebSocketClient（完整消息监控）**

```swift
let client = InstrumentedWebSocketClient(
    url: URL(string: "wss://api.example.com/ws")!,
    headers: ["Authorization": "Bearer token"]
)

client.onText = { message in
    print("收到消息: \(message)")
}

client.connect()
```

**方式二：集成 Debug Hooks（最小侵入）**

适用于已有 WebSocket 客户端的项目：

```swift
#if !APPSTORE
// 获取调试钩子
let hooks = DebugProbe.shared.getWebSocketHooks()

// 在 WebSocket 客户端中调用
hooks.onSessionCreated(sessionId, url, headers)
hooks.onMessageSent(sessionId, data)
hooks.onMessageReceived(sessionId, data)
hooks.onSessionClosed(sessionId, closeCode, reason)
#endif
```

**方式三：自动连接级监控**

SDK 默认通过 Swizzling 自动监控所有 `URLSessionWebSocketTask` 的连接和断开事件。

#### 4.5 日志捕获

```swift
// 方式一：CocoaLumberjack 自动集成
DDLogInfo("This is an info log")

// 方式二：AppLogger (os_log 包装)
let logger = AppLogger(subsystem: "com.company.app", category: "network")
logger.info("Response received")

// 方式三：直接使用
DebugProbe.shared.info("Operation completed", tags: ["perf"])
```

#### 4.6 运行时配置

支持在 App 运行时动态修改 DebugHub 地址，无需重新编译：

```swift
import DebugProbe

// 修改 DebugHub 地址（会自动重连）
DebugProbeSettings.shared.hubHost = "192.168.1.200"
DebugProbeSettings.shared.hubPort = 8080
DebugProbeSettings.shared.token = "new-token"

// 启用/禁用 DebugProbe
DebugProbeSettings.shared.isEnabled = false

// 启用详细日志（调试用）
DebugProbeSettings.shared.verboseLogging = true
```

配置优先级：`运行时配置 > Info.plist > 默认值`

Info.plist 配置（可选）：
```xml
<key>DEBUGHUB_HOST</key>
<string>192.168.1.100</string>
<key>DEBUGHUB_PORT</key>
<integer>8080</integer>
<key>DEBUGHUB_TOKEN</key>
<string>your-token</string>
```

---

## 📡 API 参考

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查（返回服务状态、版本、运行时间） |
| `/api/devices` | GET | 获取在线设备列表 |
| `/api/devices/{deviceId}` | GET | 获取设备详情 |
| `/api/devices/{deviceId}/http` | GET | 查询 HTTP 事件（支持高级搜索 `?q=`） |
| `/api/devices/{deviceId}/http/{eventId}` | GET | 获取 HTTP 事件详情 |
| `/api/devices/{deviceId}/http/{eventId}/curl` | GET | 生成 cURL 命令 |
| `/api/devices/{deviceId}/http/{eventId}/replay` | POST | 重放请求 |
| `/api/devices/{deviceId}/http/{eventId}/favorite` | POST | 收藏/取消收藏 |
| `/api/devices/{deviceId}/http/batch/delete` | POST | 批量删除 |
| `/api/devices/{deviceId}/http/batch/favorite` | POST | 批量收藏 |
| `/api/devices/{deviceId}/logs` | GET | 查询日志事件 |
| `/api/devices/{deviceId}/ws-sessions` | GET | 查询 WebSocket 会话 |
| `/api/devices/{deviceId}/ws-sessions/{sessionId}/frames` | GET | 获取 WebSocket 帧 |
| `/api/mock-rules` | GET/POST | Mock 规则管理 |
| `/api/mock-rules/{ruleId}` | PUT/DELETE | 更新/删除规则 |
| `/api/breakpoints` | GET/POST | 断点规则管理 |
| `/api/breakpoints/{id}` | PUT/DELETE | 更新/删除断点 |
| `/api/chaos-rules` | GET/POST | 故障注入规则管理 |
| `/api/chaos-rules/{id}` | PUT/DELETE | 更新/删除故障规则 |
| `/api/export/har` | GET | HAR 格式导出 |
| `/api/cleanup/config` | GET/PUT | 清理配置 |
| `/api/cleanup/run` | POST | 手动触发清理 |
| `/api/cleanup/truncate` | POST | 清空所有数据（危险操作） |
| `/api/devices/{deviceId}/control/toggle-capture` | POST | 开关捕获功能 |

### 页面路由

| 路径 | 说明 |
|------|------|
| `/` | 设备列表页（Web UI 首页） |
| `/device/{deviceId}` | 设备详情页 |
| `/api-docs` | API 文档页 |
| `/health` | 健康检查页 |

### WebSocket 端点

| 端点 | 说明 |
|------|------|
| `/debug-bridge` | iOS 设备连接（Token 认证） |
| `/ws/live?deviceId=xxx&type=http\|log\|ws\|all` | Web UI 实时事件流 |

### 高级搜索语法

```
# 字段过滤
method:POST              # HTTP 方法
status:200               # 精确状态码
status:4xx               # 4xx 状态码
status:200-299           # 状态码范围
duration:>500            # 耗时大于 500ms
host:api.example.com     # 域名包含
path:/api/v1             # 路径包含

# 组合搜索
method:POST status:5xx duration:>1000
```

---

## ⌨️ 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘/Ctrl + K` | 搜索 |
| `⌘/Ctrl + R` | 刷新列表 |
| `⌘/Ctrl + L` | 清空列表 |
| `⌘/Ctrl + E` | 导出数据 |
| `⌘/Ctrl + A` | 全选 |
| `⌘/Ctrl + T` | 切换主题 |
| `⌘/Ctrl + /` | 显示快捷键帮助 |
| `F` | 收藏/取消收藏 |
| `Delete/Backspace` | 删除选中 |
| `↑/↓` | 上下选择 |
| `Esc` | 取消选择/关闭面板 |

---

## 🎭 Mock 规则配置

```json
{
    "name": "Mock Login API",
    "targetType": "httpResponse",
    "condition": {
        "urlPattern": "*/api/v1/login",
        "method": "POST"
    },
    "action": {
        "mockResponseStatusCode": 200,
        "mockResponseBody": "eyJ0b2tlbiI6ICJtb2NrLXRva2VuIn0=",
        "delayMilliseconds": 500
    },
    "priority": 10,
    "enabled": true
}
```

---

## 💥 故障注入类型

| 类型 | 说明 | 参数 |
|------|------|------|
| `latency` | 延迟注入 | `minLatency`, `maxLatency` (ms) |
| `timeout` | 超时 | - |
| `connectionReset` | 连接重置 | - |
| `randomError` | 随机错误码 | `errorCodes: [500, 502, 503]` |
| `corruptResponse` | 响应损坏 | - |
| `slowNetwork` | 慢网络 | `bytesPerSecond` |
| `dropRequest` | 丢弃请求 | - |

---

## 🔒 安全性

1. **Token 认证**: Debug Bridge 连接需要提供有效的 Token
2. **条件编译**: 建议使用 `#if !APPSTORE` 保护调试代码，确保 App Store 版本不包含
3. **内网访问**: Debug Hub 建议仅在内网部署
4. **数据隔离**: 每个设备的数据独立存储
5. **自动清理**: 默认 3 天自动清理，收藏的请求除外
6. **运行时开关**: 可通过 `DebugProbeSettings.shared.isEnabled` 动态禁用

---

## 📦 Protobuf 支持

自动检测以下 Content-Type：
- `application/x-protobuf`
- `application/protobuf`
- `application/grpc`
- `application/grpc+proto`

支持 Wire Format 解析，显示字段编号、类型和多种可能的值解释。

---

## 💾 事件持久化

iOS Probe 支持断线时本地缓存事件：

```swift
config.enablePersistence = true           // 启用持久化
config.maxPersistenceQueueSize = 100_000  // 最大队列大小
config.persistenceRetentionDays = 3       // 保留天数
```

- 断线时自动存入本地 SQLite
- 重连后分批恢复发送
- 支持 App 重启后继续发送

---

## 🗄️ 数据库配置

Debug Hub 支持两种数据库模式：

### PostgreSQL（默认）

适合多设备并发、需要高可用的场景：

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `DATABASE_MODE` | `postgres` | 数据库模式 |
| `POSTGRES_HOST` | `localhost` | 数据库主机 |
| `POSTGRES_PORT` | `5432` | 数据库端口 |
| `POSTGRES_USER` | `debug_hub` | 用户名 |
| `POSTGRES_PASSWORD` | `debug_hub_password` | 密码 |
| `POSTGRES_DB` | `debug_hub` | 数据库名 |
| `POSTGRES_SSL` | `false` | 是否启用 SSL |
| `POSTGRES_MAX_CONNECTIONS` | `4` | 每个 EventLoop 最大连接数 |

### SQLite（开发环境）

零配置，适合本地开发和测试：

| 环境变量 | 默认值 | 说明 |
|---------|-------|------|
| `DATABASE_MODE` | - | 设为 `sqlite` 切换 |
| `DATA_DIR` | `./data` | 数据存储目录 |
| `SQLITE_PATH` | - | 数据库完整路径（覆盖 DATA_DIR） |

数据库文件默认存储在 `./data/debug_hub.sqlite`。

### Docker 快速启动 PostgreSQL

```bash
# 启动 PostgreSQL 容器（数据持久化到 Docker Volume）
docker run -d --name debughub-postgres \
  -e POSTGRES_USER=debug_hub \
  -e POSTGRES_PASSWORD=debug_hub_password \
  -e POSTGRES_DB=debug_hub \
  -p 5432:5432 \
  -v debughub_pgdata:/var/lib/postgresql/data \
  postgres:17

# 检查容器状态
docker ps

# 查看日志
docker logs debughub-postgres

# 停止/启动
docker stop debughub-postgres
docker start debughub-postgres

# 删除容器（数据保留在 Volume 中）
docker rm debughub-postgres

# 删除数据
docker volume rm debughub_pgdata
```

### Docker Compose 示例（完整部署）

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: debug_hub
      POSTGRES_PASSWORD: debug_hub_password
      POSTGRES_DB: debug_hub
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  debug-hub:
    build: ./DebugHub
    environment:
      DATABASE_MODE: postgres
      POSTGRES_HOST: postgres
      POSTGRES_USER: debug_hub
      POSTGRES_PASSWORD: debug_hub_password
      POSTGRES_DB: debug_hub
      DEBUG_HUB_TOKEN: your-secret-token
    ports:
      - "8080:8080"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

### 数据库对比

| 特性 | PostgreSQL (默认) | SQLite |
|-----|------------------|--------|
| 配置复杂度 | ⭐⭐ 部署脚本自动配置 | ⭐ 零配置 |
| 并发写入 | MVCC 高并发 | 单写入锁 |
| 推荐设备数 | 10+ 台 | 1-5 台 |
| 数据规模 | 无限制 | < 100 万条 |
| 高可用 | ✅ 主从复制 | ❌ |
| 在线备份 | ✅ pg_dump | ❌ |

---

## ⚠️ 已知限制

1. **仅限自家 App**: 无法抓取其他 App 的流量
2. **HTTPS 透明**: 不使用 MITM，直接在应用层捕获
3. **WebSocket 消息级监控**: 需要使用 `InstrumentedWebSocketClient` 或集成 Debug Hooks
4. **性能影响**: 建议仅在非 App Store 版本启用

---

## 🔮 未来规划

详见 [ROADMAP.md](docs/ROADMAP.md)

- [ ] 设备 SQLite 数据库查看（P2）
- [ ] 会话录制与回放
- [ ] 多设备并排对比
- [ ] 数据脱敏规则
- [ ] Prometheus Metrics
- [ ] 高可用部署方案
- [ ] 插件系统

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).
