# Debug Platform 更新日志

所有显著更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.2.4] - 2026-02-04

### 新增

- **HTTP Inspector**: 请求详情新增摘要折叠区（最终状态/链路位置/最终 URL/链路耗时/大小/协议）
- **HTTP Inspector**: 请求详情新增 Diff 标签（上一跳/下一跳对比）
- **错误结构化**: 贯通 HTTP 错误结构化字段（domain/code/category/isNetworkError/message）
- **重定向链路**: 列表支持上一跳/下一跳跳转与链路标识

### 改进

- **HTTP 错误识别**: 统一错误判定逻辑，支持网络错误与结构化错误筛选
- **状态码样式**: 1xx 状态码使用信息态样式

### 修复

- **HTTP**: 修复重定向链路事件关联与列表显示不一致问题
- **HTTP**: 缺失 `redirectToUrl` 时从响应 `Location` 解析最终 URL
- **详情视图**: 最终 URL 过长导致溢出的问题

---

## [1.2.3] - 2026-01-31

### 改进

- **设备会话识别**: 设备连接事件新增 `appSessionId` 透传，用于区分 App 重启与连接重连

### 修复

- **WebUI**: “仅显示本次启动”取消后可自动加载历史数据
- **WebUI**: 数据库跨表搜索结果跳转支持非第一页定位
- **WebUI**: 搜索结果列表分割线样式与其他列表对齐
- **WebUI**: 点击搜索结果不再自动关闭结果列表

---

## [1.2.0] - 2026-01-26

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
- **HTTP**: 修复中文字符乱码问题

---

## [1.0.0] - 2025-12-02

### 新增

#### 核心调试能力
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

#### 高级调试能力
- 高级搜索语法 (`method:POST status:4xx duration:>500ms`)
- HAR 导出 (HTTP Archive 1.2 格式)
- 断点调试 (请求/响应拦截与修改)
- 故障注入 (延迟、超时、错误码注入)
- 请求 Diff 对比 (并排对比两个请求差异)

#### 用户体验增强
- 数据自动清理 (默认3天过期)
- 图片响应预览 (检测图片类型并内联渲染)
- 深色/浅色主题 (CSS 变量 + 主题切换 + 跟随系统)
- 键盘快捷键 (全局快捷键支持 + 帮助面板)
- 请求收藏/标记 (收藏重要请求，防止被清理)
- 批量操作 (多选 + 批量删除/收藏/导出)

#### 工程化增强
- React WebUI 完整实现（React + TypeScript + Vite + Tailwind CSS）
- API 文档页 (`/api-docs`) - 内置交互式 API 文档
- 健康检查页 (`/health`) - 服务状态监控
- 一键部署脚本 (`deploy.sh`) - 自动安装依赖、配置数据库
- Swift 6 兼容 - Actor-based 并发、@unchecked Sendable
- SPA 路由支持 - 服务端 Fallback 支持前端路由刷新

#### 配置与日志增强
- 运行时配置管理 (`DebugProbeSettings`)
- 内部日志开关 (`DebugLog` 分级日志)
- 配置 UI 界面 (`DebugProbeSettingsController`)
- 配置持久化 (UserDefaults + Info.plist)
- HTTP 自动拦截 (`URLSessionConfigurationSwizzle`)
- WebSocket 连接级 Swizzle + 消息级 Hook

#### 可靠性与协议增强
- Protobuf Wire Format 解析 + 嵌套消息 + Hex 视图
- 事件持久化队列 (SQLite 本地队列)
- 断线重连恢复 - 自动恢复发送持久化事件
- PostgreSQL 支持 - 默认数据库，支持高并发

#### WebSocket 消息完整内容查看
- **后端 API**: `GET /api/devices/{deviceId}/ws-sessions/{sessionId}/frames/{frameId}`
- **前端格式切换器**: 支持 AUTO / TEXT / JSON / HEX / BASE64 五种格式

#### Traffic Rules 完整实现
- HTTP 请求列表应用规则过滤（hide 规则隐藏匹配的请求）
- HTTP 请求列表高亮显示（highlight 规则显示黄色背景和 ⭐ 图标）
- HTTP 请求列表标记功能（mark 规则显示自定义颜色的左边框和 🏷️ 图标）
- 支持域名匹配和 URL 正则匹配

#### DB Inspector Protobuf BLOB 解析
- 支持上传 `.desc` 文件（由 `protoc --descriptor_set_out` 生成）
- 支持配置 BLOB 列到 Protobuf 消息类型的映射
- 自动识别和解析 BLOB 类型单元格
- 三种视图模式：Schema 解码、Wire Format、Hex

#### DB Inspector SQL 查询功能
- 支持自定义 SQL 查询（仅 SELECT）
- 查询超时保护（5 秒自动中断）
- 结果集大小限制（最多 1000 行）
- 并发查询限制（串行队列）

#### HTTP 虚拟滚动
- 使用 `@tanstack/react-virtual` 实现虚拟滚动
- 支持 10,000+ 请求流畅浏览

#### HTTP 请求分组
- 按域名分组：相同域名的请求归类显示
- 按路径分组：按 URL 前缀分组
- 分组统计：请求数、平均耗时、错误数、Mock 数

#### 日志高级搜索
- 支持字段搜索语法：`level:error subsystem:Network message:"timeout"`
- 支持时间范围：`timestamp:>2025-12-05T10:00:00`
- 支持正则表达式消息搜索

#### 页面耗时监控
- `PageTimingRecorder` 页面耗时记录器
- 支持 UIKit ViewController 自动采集
- 支持 SwiftUI UIHostingController 自动采集
- 页面耗时 API 接口（列表、详情、统计、删除）
- "页面耗时"标签页

#### 设备管理增强
- 设备批量选择支持
- 设备备注名功能（保存到后端）
- 批量删除离线设备

#### 插件管理界面
- 新增 PluginManager 组件
- 支持动态启用/禁用插件
- 插件依赖自动管理

### 文档

- README 全面更新
- 功能模块路线图文档
- ANDROID_PROBE_GUIDE.md: Android 版 DebugProbe SDK 开发指南

---

## 版本历史图表

```
1.0.0 ────────────────────────► 1.2.4 (当前)
  │                                │
  │                                └─ 加密数据库状态显示
  │                                   ownerDisplayName 支持
  │                                   统一部署脚本
  │
  └─ 核心调试能力
     高级调试能力
     用户体验增强
     工程化增强
     Traffic Rules / DB Inspector
     HTTP 虚拟滚动 / 请求分组
     页面耗时监控
     设备管理 / 插件管理
```

---

## 升级指南

### 从 1.0.0 升级到 1.2.0

1. **后端无数据库迁移**，直接更新代码重新编译即可

2. **iOS SDK 需要同步升级到 1.2.0**：
   ```bash
   # Swift Package Manager 会自动更新
   # 或手动清理缓存
   rm -rf ~/Library/Caches/org.swift.swiftpm
   ```

3. **WebUI 重新部署**：
   ```bash
   cd WebUI && npm run deploy
   ```
