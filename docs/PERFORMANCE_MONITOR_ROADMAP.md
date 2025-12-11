# Performance Monitor 路线图

性能监控插件规划，用于监控 App 运行时性能指标。

> **当前状态**: 规划中
>
> **最后更新**: 2025-12-11

---

## 📋 概述

Performance Monitor 插件将提供全面的 App 性能监控能力，包括：

- 📊 **CPU 使用率** - 实时 CPU 占用监控
- 💾 **内存使用** - 内存分配、峰值、泄漏检测
- 🔋 **电池消耗** - 能耗评估和热点识别
- 📱 **帧率监控** - FPS 监控和卡顿检测
- 🌐 **网络性能** - 请求延迟分布、带宽使用
- 💽 **磁盘 I/O** - 读写性能和存储使用

---

## 🎯 目标用户场景

### 场景 1: 性能问题定位
开发者发现 App 在某些页面卡顿，需要快速定位是 CPU、内存还是渲染问题。

### 场景 2: 性能回归测试
QA 团队需要对比新版本与旧版本的性能指标，确保没有性能退化。

### 场景 3: 启动性能优化
开发者需要分析 App 冷启动、热启动的各阶段耗时，找出优化点。

---

## Phase 1: 基础指标采集 (优先级: 🔴 High)

### 1.1 CPU 监控

**目标**: 实时监控 App CPU 使用率

**采集指标**:
```swift
struct CPUMetrics {
    let timestamp: Date
    let usage: Double           // 0.0 - 100.0
    let userTime: Double        // 用户态时间
    let systemTime: Double      // 内核态时间
    let threadCount: Int        // 线程数
}
```

**实现方案**:
```swift
// 使用 mach_task_info
var taskInfo = task_basic_info()
var count = mach_msg_type_number_t(MemoryLayout<task_basic_info>.size / MemoryLayout<integer_t>.size)
let result = task_info(mach_task_self_, task_flavor_t(TASK_BASIC_INFO), &taskInfo, &count)
```

**预估**: 2 天

---

### 1.2 内存监控

**目标**: 监控 App 内存使用情况

**采集指标**:
```swift
struct MemoryMetrics {
    let timestamp: Date
    let usedMemory: UInt64      // 已用内存（字节）
    let peakMemory: UInt64      // 峰值内存
    let freeMemory: UInt64      // 可用内存
    let memoryPressure: MemoryPressureLevel  // low/medium/high/critical
}
```

**实现方案**:
```swift
// 使用 task_vm_info
var vmInfo = task_vm_info()
let result = task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), &vmInfo, &count)
let usedMemory = vmInfo.phys_footprint
```

**预估**: 2 天

---

### 1.3 帧率监控

**目标**: 监控 UI 渲染帧率和卡顿

**采集指标**:
```swift
struct FrameMetrics {
    let timestamp: Date
    let fps: Double             // 当前帧率
    let droppedFrames: Int      // 丢帧数
    let jankCount: Int          // 卡顿次数（连续丢帧 > 3）
    let renderTime: Double      // 平均渲染时间（ms）
}
```

**实现方案**:
```swift
// 使用 CADisplayLink
let displayLink = CADisplayLink(target: self, selector: #selector(tick))
displayLink.add(to: .main, forMode: .common)

@objc func tick(_ link: CADisplayLink) {
    let currentTime = link.timestamp
    let frameDuration = currentTime - lastTime
    let fps = 1.0 / frameDuration
    // 检测卡顿
    if frameDuration > 1.0 / 30 {
        jankCount += 1
    }
}
```

**预估**: 2 天

---

### 1.4 数据上报

**目标**: 将性能指标上报到 Debug Hub

**上报策略**:
- **实时指标**: 每秒采样，批量上报（5 秒一批）
- **事件指标**: 卡顿、内存警告等即时上报
- **聚合指标**: 每分钟上报一次统计数据

**消息格式**:
```json
{
  "type": "performanceMetrics",
  "deviceId": "xxx",
  "timestamp": "2025-12-11T10:00:00Z",
  "metrics": {
    "cpu": { "usage": 45.2, "threadCount": 12 },
    "memory": { "used": 104857600, "peak": 157286400 },
    "fps": { "current": 58.5, "dropped": 2 }
  }
}
```

**预估**: 2 天

---

## Phase 2: 可视化展示 (优先级: 🔴 High)

### 2.1 实时仪表盘

**目标**: 在 WebUI 展示实时性能指标

**UI 设计**:
```
┌─────────────────────────────────────────────────────────────┐
│  Performance Monitor                                        │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
│  │ CPU       │ │ Memory    │ │ FPS       │ │ Network   │   │
│  │   45%     │ │  256 MB   │ │   60      │ │  1.2 MB/s │   │
│  │ ▅▅▆▇▆▅▄▃ │ │ ▂▃▄▅▆▇▇▇ │ │ ▇▇▇▇▆▅▇▇ │ │ ▃▄▅▆▃▂▄▅ │   │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘   │
├─────────────────────────────────────────────────────────────┤
│  Timeline                                           [5min▼]│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 100% ─────────────────────────────────────────────────  ││
│  │  80% ────────────────────────────────────────────────── ││
│  │  60% ─────────────────────────────────────────────────  ││
│  │  40% ─────────────────────────────────────────────────  ││
│  │  20% ─────────────────────────────────────────────────  ││
│  │   0% └───────┴───────┴───────┴───────┴───────┴────────  ││
│  │      10:00   10:01   10:02   10:03   10:04   10:05      ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**技术方案**:
- 使用 Recharts 或 D3.js 绘制图表
- WebSocket 实时更新数据
- 支持时间范围选择（1min/5min/15min/1h）

**预估**: 4 天

---

### 2.2 卡顿事件列表

**目标**: 展示卡顿事件详情

**信息展示**:
```typescript
interface JankEvent {
    id: string
    timestamp: string
    duration: number        // 卡顿持续时间（ms）
    droppedFrames: number   // 丢帧数
    stackTrace?: string     // 主线程调用栈
    screenshot?: string     // 卡顿时截图（可选）
}
```

**预估**: 2 天

---

### 2.3 内存分析

**目标**: 展示内存使用趋势和潜在泄漏

**功能**:
- 内存使用趋势图
- 内存警告事件标记
- 对象分配热点（Top 10）

**预估**: 3 天

---

## Phase 3: 高级功能 (优先级: 🟡 Medium)

### 3.1 启动性能分析

**目标**: 详细分析 App 启动各阶段耗时

**阶段划分**:
```swift
enum LaunchPhase: String {
    case processStart       // 进程创建
    case preDyld           // dyld 加载前
    case dyldLoading       // dyld 加载动态库
    case objcSetup         // ObjC Runtime 初始化
    case staticInit        // +load 和 __attribute__((constructor))
    case main              // main() 函数
    case applicationInit   // application:didFinishLaunching
    case firstFrame        // 首帧渲染完成
}

struct LaunchMetrics {
    let phases: [LaunchPhase: TimeInterval]
    let totalTime: TimeInterval
    let isWarmLaunch: Bool
}
```

**预估**: 3 天

---

### 3.2 网络性能统计

**目标**: 汇总网络请求性能数据

**统计指标**:
- 请求延迟分布（P50/P90/P99）
- 成功率/失败率
- 按域名分组统计
- 带宽使用趋势

**预估**: 2 天

---

### 3.3 电池消耗评估

**目标**: 评估 App 对电池的影响

**采集指标**:
```swift
struct BatteryMetrics {
    let timestamp: Date
    let batteryLevel: Float      // 0.0 - 1.0
    let batteryState: UIDevice.BatteryState
    let thermalState: ProcessInfo.ThermalState
    let cpuEnergy: Double        // CPU 能耗估算
    let networkEnergy: Double    // 网络能耗估算
}
```

**预估**: 2 天

---

### 3.4 性能报告导出

**目标**: 生成性能分析报告

**报告内容**:
- 时间范围内的性能概览
- 关键指标趋势图
- 卡顿事件汇总
- 优化建议

**导出格式**: PDF / HTML / JSON

**预估**: 3 天

---

## Phase 4: 智能分析 (优先级: 🟢 Low)

### 4.1 性能基线

**目标**: 建立性能基线，自动检测回归

**实现**:
- 按版本记录性能指标均值
- 新版本自动对比基线
- 超过阈值自动告警

**预估**: 3 天

---

### 4.2 异常检测

**目标**: 自动识别性能异常模式

**检测项**:
- 内存泄漏趋势
- CPU 峰值异常
- 周期性卡顿
- 网络请求堆积

**预估**: 4 天

---

### 4.3 优化建议

**目标**: 基于性能数据给出优化建议

**示例建议**:
- "检测到频繁的小内存分配，建议使用对象池"
- "主线程 CPU 占用过高，建议将 xxx 操作移到后台"
- "网络请求并发数过高，建议增加请求合并"

**预估**: 3 天

---

## 📊 技术架构

### iOS 端 (DebugProbe)

```
┌─────────────────────────────────────────────┐
│            PerformancePlugin                │
├─────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐          │
│  │ CPUMonitor  │  │ MemoryMonitor│          │
│  └─────────────┘  └─────────────┘          │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ FPSMonitor  │  │ NetworkMonitor│         │
│  └─────────────┘  └─────────────┘          │
│                ↓                            │
│      MetricsAggregator                      │
│                ↓                            │
│      PluginContext.emit()                   │
└─────────────────────────────────────────────┘
```

### Server 端 (DebugHub)

```
┌─────────────────────────────────────────────┐
│       PerformanceBackendPlugin              │
├─────────────────────────────────────────────┤
│  WebSocket Handler → MetricsStore → API     │
│                          ↓                  │
│                     TimeSeries DB           │
│                    (InfluxDB / TimescaleDB) │
└─────────────────────────────────────────────┘
```

### WebUI 端

```
┌─────────────────────────────────────────────┐
│        PerformanceFrontendPlugin            │
├─────────────────────────────────────────────┤
│  Dashboard │ Timeline │ Events │ Reports   │
│                ↓                            │
│        performanceStore (Zustand)           │
│                ↓                            │
│         WebSocket Subscription              │
└─────────────────────────────────────────────┘
```

---

## 📅 里程碑

| 里程碑 | 内容 | 预计时间 |
|--------|------|----------|
| M1 | 基础指标采集（CPU/内存/FPS） | 1 周 |
| M2 | 实时仪表盘 | 1 周 |
| M3 | 卡顿检测和分析 | 1 周 |
| M4 | 启动性能分析 | 0.5 周 |
| M5 | 性能报告导出 | 0.5 周 |

**总预估**: 4 周

---

## 🔗 依赖

- **三层插件架构**: 需要 DebugProbe/DebugHub/WebUI 的插件系统支持
- **时序数据库**: 推荐使用 TimescaleDB 或 InfluxDB 存储大量时序数据
- **图表库**: WebUI 需要 Recharts 或类似图表库

---

## 📝 参考资料

- [Instruments User Guide](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/)
- [MetricKit Framework](https://developer.apple.com/documentation/metrickit)
- [WWDC 2019 - Getting Started with Instruments](https://developer.apple.com/videos/play/wwdc2019/411/)
