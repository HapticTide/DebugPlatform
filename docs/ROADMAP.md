# Debug Platform 开发路线图

本文档是 Debug Platform 的总体规划。各功能模块的详细路线图请参阅对应文档。

> **当前版本**: 1.2.1 | [更新日志](CHANGELOG.md)
>
> **最后更新**: 2025-12-17

---

## 📊 当前状态概览

### 三层插件化架构 ✅ 已完成

| 层级 | 状态 | 说明 |
|------|------|------|
| **DebugProbe (iOS SDK)** | ✅ 100% | 8 个内置插件，统一 PluginManager |
| **DebugHub (Vapor 后端)** | ✅ 100% | 8 个 Backend 插件，BackendPluginRegistry |
| **WebUI (React 前端)** | ✅ 100% | 8 个 Frontend 插件，PluginRenderer |

---

## 📚 功能模块路线图

| 模块 | 文档 | 当前状态 | 下一步 |
|------|------|----------|--------|
| **HTTP Inspector** | [HTTP_INSPECTOR_ROADMAP.md](HTTP_INSPECTOR_ROADMAP.md) | ✅ 1.3 稳定 | 请求缓存 |
| **WebSocket Inspector** | [WS_INSPECTOR_ROADMAP.md](WS_INSPECTOR_ROADMAP.md) | ✅ 1.2 稳定 | 消息搜索/过滤 |
| **Log Viewer** | [LOG_VIEWER_ROADMAP.md](LOG_VIEWER_ROADMAP.md) | ✅ 1.3 稳定 | 搜索历史 |
| **DB Inspector** | [DB_INSPECTOR_ROADMAP.md](DB_INSPECTOR_ROADMAP.md) | ✅ 1.3 稳定 | 数据编辑 |
| **Mock Engine** | [MOCK_ENGINE_ROADMAP.md](MOCK_ENGINE_ROADMAP.md) | ✅ 1.2 稳定 | 动态响应模板 |
| **Breakpoint** | [BREAKPOINT_ROADMAP.md](BREAKPOINT_ROADMAP.md) | ✅ 1.3 稳定 | 请求修改 UI |
| **Chaos Engine** | [CHAOS_ENGINE_ROADMAP.md](CHAOS_ENGINE_ROADMAP.md) | ✅ 1.3 稳定 | DNS 失败模拟 |
| **Performance Monitor** | [PERFORMANCE_MONITOR_ROADMAP.md](PERFORMANCE_MONITOR_ROADMAP.md) | ✅ 1.5 稳定 | 内存泄漏检测 |

---

## 🚧 跨模块功能

### 1. 会话录制与回放

**目标**: 录制完整的调试会话，支持保存、分享和回放

**用户故事**:
1. 开发者在调试时发现问题
2. 点击「保存会话」，命名并保存到服务器
3. 生成分享链接，其他开发者可回放整个会话过程

**涉及模块**: HTTP + WebSocket + Log

**优先级**: P2 | **预估**: 2 周

---

### 2. 多设备并排对比

**目标**: 同时监控多台设备，对比相同操作在不同设备上的表现

```
┌─────────────────────┬───────────────────┬───────────────────┐
│ iPhone 15 Pro       │ iPhone 12         │ iPad Pro          │
├─────────────────────┼───────────────────┼───────────────────┤
│ GET /api/home 200   │ GET /api/home 200 │ GET /api/home 200 │
│ 150ms               │ 320ms             │ 180ms             │
└─────────────────────┴───────────────────┴───────────────────┘
```

**涉及模块**: 全局

**优先级**: P2 | **预估**: 1.5 周

---

### 3. 数据脱敏规则

**目标**: 自动识别和脱敏敏感信息

**内置规则**:
| 类型 | 匹配 | 替换 |
|------|-----|------|
| 信用卡 | `\d{4}-\d{4}-\d{4}-\d{4}` | `****-****-****-1234` |
| 手机号 | `1[3-9]\d{9}` | `138****5678` |
| Token | `Bearer \w+` | `Bearer [REDACTED]` |

**涉及模块**: HTTP + WebSocket + Log

**优先级**: P2 | **预估**: 1 周

---

### 4. Prometheus Metrics

**目标**: 暴露监控指标，接入现有监控体系

**指标**:
```prometheus
debug_platform_devices_connected{}
debug_platform_events_received_total{type="http|ws|log"}
debug_platform_database_size_bytes{}
```

**涉及模块**: DebugHub

**优先级**: P3 | **预估**: 3 天

---

## 🏗️ 架构演进

### Phase 5: 高可用与扩展性

#### 5.1 高可用部署

**目标**: 支持多实例部署

**方案**:
- Redis 会话共享
- PostgreSQL 主从复制
- WebSocket 连接黏连（Sticky Session）

**优先级**: P3 | **预估**: 2 周

---

#### 5.2 第三方插件支持

**目标**: 支持用户自定义插件

**能力**:
- 插件市场 / 仓库
- 热加载 / 热卸载
- 沙箱隔离

**优先级**: P3 | **预估**: 3 周

---

## 📋 版本规划

| 版本 | 计划内容 | 预计时间 |
|------|----------|----------|
| 1.5 | WebSocket 搜索/过滤 + 请求缓存 | 2025 Q1 |
| 1.6 | 会话录制与回放 | 2025 Q1 |
| 2.0 | 多设备对比 + Prometheus | 2025 Q2 |

---

## 📖 相关文档

| 文档 | 说明 |
|------|------|
| [ANDROID_PROBE_GUIDE.md](ANDROID_PROBE_GUIDE.md) | Android 版 DebugProbe SDK 开发指南 |
| [PROMPTS.md](PROMPTS.md) | AI 开发 Prompts 参考 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |

---

## 📝 已废弃文档

以下文档已在 1.4.0 版本中移除（历史参考用的 AI Prompts 和进度追踪）：

- ~~PLUGIN_REFACTOR_PROMPTS_1.md~~
- ~~PLUGIN_REFACTOR_PROMPTS_2.md~~
- ~~PLUGIN_REFACTOR_STATUS.md~~
