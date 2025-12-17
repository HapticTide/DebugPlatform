# Prometheus & Grafana 集成路线图

将 Prometheus 监控和 Grafana 可视化能力集成到 DebugHub 平台。

> **当前状态**: 📋 规划中
>
> **最后更新**: 2025-12-17

---

## 📋 概述

### 背景

DebugHub 当前已具备完整的性能指标采集能力：
- CPU/内存/FPS 实时监控
- App 启动时间分析
- 页面耗时统计
- 网络流量统计
- 卡顿事件记录

这些数据存储在 SQLite/PostgreSQL 数据库中，通过 WebUI 进行可视化展示。

### 集成目标

1. **Prometheus 集成**：将 DebugHub 指标以 Prometheus 格式暴露，支持外部监控系统抓取
2. **Grafana 集成**：提供专业的数据可视化和告警能力

### 集成方案选择

| 方案 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **方案 A: 内嵌集成** | 在 DebugHub 进程内集成 | 部署简单，单进程 | 增加复杂度，资源占用 |
| **方案 B: 外部服务** | 独立运行 Prometheus/Grafana | 架构清晰，专业工具 | 需要额外部署 |
| **方案 C: 混合方案** | DebugHub 暴露 /metrics，外部 Prometheus 抓取 | 灵活，低侵入 | 需要用户配置 |

**推荐**: 方案 C（混合方案）- 在 DebugHub 中添加 Prometheus exporter 端点，让用户选择是否启用外部 Prometheus/Grafana。

---

## 🎯 目标用户场景

### 场景 1: 多设备监控
运维团队需要同时监控多个测试设备的性能指标，需要统一的监控面板和告警。

### 场景 2: 长期趋势分析
QA 团队需要查看过去一周/一个月的性能趋势，评估版本迭代的性能影响。

### 场景 3: 自定义告警
开发团队需要设置自定义告警规则，如"CPU 连续 5 分钟 > 80%"时触发通知。

### 场景 4: 团队协作
将 DebugHub 数据接入公司现有的 Prometheus/Grafana 基础设施。

---

## 难度评估与成本分析

### 总体评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **技术难度** | ⭐⭐⭐☆☆ (3/5) | Vapor 框架支持良好，Prometheus 格式简单 |
| **开发工作量** | ⭐⭐⭐☆☆ (3/5) | 约 15-20 人天 |
| **维护成本** | ⭐⭐☆☆☆ (2/5) | 主要是配置和文档维护 |
| **价值收益** | ⭐⭐⭐⭐☆ (4/5) | 显著提升监控能力和专业度 |

### 详细成本拆解

#### Phase 1: Prometheus Exporter (8-10 人天)

| 任务 | 预估时间 | 风险 |
|------|---------|------|
| 设计指标命名规范 | 0.5 天 | 低 |
| 实现 /metrics 端点 | 2 天 | 低 |
| 设备指标导出 | 2 天 | 中 |
| 性能指标导出 | 2 天 | 中 |
| 系统指标导出 | 1 天 | 低 |
| 测试与文档 | 1.5 天 | 低 |

#### Phase 2: Grafana Dashboard (3-4 人天)

| 任务 | 预估时间 | 风险 |
|------|---------|------|
| 设计 Dashboard 模板 | 1 天 | 低 |
| 设备概览面板 | 0.5 天 | 低 |
| 性能监控面板 | 1 天 | 低 |
| 告警规则模板 | 0.5 天 | 低 |
| 打包与文档 | 1 天 | 低 |

#### Phase 3: WebUI Grafana 嵌入 (4-6 人天)

| 任务 | 预估时间 | 风险 |
|------|---------|------|
| iframe 嵌入方案 | 1 天 | 中 |
| 认证打通 | 2 天 | 高 |
| 样式适配 | 1 天 | 中 |
| 配置 UI | 1 天 | 低 |

---

## Phase 1: Prometheus Exporter (优先级: 🔴 High)

### 1.1 指标命名规范

遵循 Prometheus 命名最佳实践：

```
# 格式: debughub_<domain>_<metric>_<unit>

# 设备相关
debughub_device_info                    # 设备信息（标签）
debughub_device_online                  # 设备在线状态

# 性能指标
debughub_cpu_usage_percent              # CPU 使用率
debughub_memory_used_bytes              # 内存使用
debughub_memory_peak_bytes              # 内存峰值
debughub_fps_current                    # 当前帧率
debughub_network_bytes_sent_total       # 网络发送字节
debughub_network_bytes_received_total   # 网络接收字节

# 事件计数
debughub_http_requests_total            # HTTP 请求总数
debughub_jank_events_total              # 卡顿事件总数
debughub_page_timing_events_total       # 页面耗时事件数

# App 启动
debughub_app_launch_total_seconds       # App 启动总时间
debughub_app_launch_premain_seconds     # pre-main 时间

# 系统指标
debughub_hub_uptime_seconds             # DebugHub 运行时间
debughub_hub_connections_active         # 活跃连接数
debughub_hub_database_size_bytes        # 数据库大小
```

**预估**: 0.5 天

---

### 1.2 实现 /metrics 端点

**目标**: 在 DebugHub 中添加 Prometheus 格式的 metrics 端点

**技术方案**:

```swift
// Sources/Controllers/MetricsController.swift

import Vapor

struct MetricsController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        routes.get("metrics", use: metrics)
    }
    
    /// GET /metrics - Prometheus 格式指标
    func metrics(req: Request) async throws -> Response {
        var output = ""
        
        // 系统指标
        output += formatMetric("debughub_hub_uptime_seconds", 
                               value: ProcessInfo.processInfo.systemUptime,
                               help: "DebugHub uptime in seconds")
        
        // 设备指标
        let devices = try await DeviceModel.query(on: req.db).all()
        for device in devices {
            let labels = "device_id=\"\(device.deviceId)\",device_name=\"\(device.deviceName)\""
            output += formatMetric("debughub_device_online", 
                                   labels: labels,
                                   value: device.isOnline ? 1 : 0)
        }
        
        // 数据库统计
        let httpCount = try await HTTPEventModel.query(on: req.db).count()
        output += formatMetric("debughub_http_requests_total", value: Double(httpCount))
        
        let response = Response(status: .ok)
        response.headers.contentType = HTTPMediaType(type: "text", subType: "plain")
        response.body = .init(string: output)
        return response
    }
    
    private func formatMetric(_ name: String, labels: String = "", value: Double, help: String? = nil) -> String {
        var result = ""
        if let help = help {
            result += "# HELP \(name) \(help)\n"
            result += "# TYPE \(name) gauge\n"
        }
        if labels.isEmpty {
            result += "\(name) \(value)\n"
        } else {
            result += "\(name){\(labels)} \(value)\n"
        }
        return result
    }
}
```

**预估**: 2 天

---

### 1.3 设备性能指标导出

**目标**: 导出每个设备的实时性能指标

**指标列表**:

```
# CPU
debughub_cpu_usage_percent{device_id="xxx"} 45.2

# 内存
debughub_memory_used_bytes{device_id="xxx"} 134217728
debughub_memory_peak_bytes{device_id="xxx"} 167772160

# FPS
debughub_fps_current{device_id="xxx"} 59.8
debughub_fps_dropped_frames_total{device_id="xxx"} 12

# 网络
debughub_network_bytes_sent_total{device_id="xxx"} 1048576
debughub_network_bytes_received_total{device_id="xxx"} 2097152

# App 启动
debughub_app_launch_total_seconds{device_id="xxx"} 2.345
debughub_app_launch_premain_seconds{device_id="xxx"} 0.876
```

**实现要点**:
- 从 `PerformanceBackendPlugin` 的内存缓存读取最新指标
- 支持标签过滤（按设备 ID、设备类型等）
- 考虑指标聚合（多个设备的平均值）

**预估**: 2 天

---

### 1.4 历史数据聚合指标

**目标**: 提供聚合后的统计指标

```
# 页面耗时分布
debughub_page_timing_p50_seconds{page_name="HomeViewController"} 0.234
debughub_page_timing_p90_seconds{page_name="HomeViewController"} 0.567
debughub_page_timing_p99_seconds{page_name="HomeViewController"} 1.234

# 卡顿统计
debughub_jank_events_total{device_id="xxx",severity="high"} 5
debughub_jank_duration_seconds_sum{device_id="xxx"} 2.5
```

**预估**: 2 天

---

### 1.5 配置与开关

**目标**: 允许用户配置 Prometheus exporter

```swift
// 环境变量配置
DEBUGHUB_PROMETHEUS_ENABLED=true
DEBUGHUB_PROMETHEUS_PATH=/metrics
DEBUGHUB_PROMETHEUS_AUTH_ENABLED=false
DEBUGHUB_PROMETHEUS_AUTH_TOKEN=xxx
```

**WebUI 配置页面**:
- 启用/禁用 Prometheus exporter
- 自定义 metrics 路径
- 启用 Basic Auth 认证
- 查看示例 prometheus.yml 配置

**预估**: 1.5 天

---

## Phase 2: Grafana Dashboard (优先级: 🟡 Medium)

### 2.1 Dashboard 模板设计

**目标**: 提供开箱即用的 Grafana Dashboard JSON 模板

**Dashboard 列表**:

1. **DebugHub Overview** - 平台概览
   - 在线设备数
   - 总请求数/日志数
   - 数据库大小
   - WebSocket 连接数

2. **Device Performance** - 设备性能
   - CPU/内存/FPS 实时曲线
   - 网络流量趋势
   - 告警历史

3. **App Launch Analysis** - 启动分析
   - 启动时间趋势
   - 各阶段耗时分布
   - 版本对比

4. **Page Timing** - 页面耗时
   - P50/P90/P99 趋势
   - 慢页面 Top 10
   - 页面耗时分布

**预估**: 2 天

---

### 2.2 告警规则模板

**目标**: 提供常用告警规则配置

```yaml
# grafana-alerts.yaml

groups:
  - name: debughub_alerts
    rules:
      - alert: HighCPUUsage
        expr: debughub_cpu_usage_percent > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.device_id }}"
          
      - alert: HighMemoryUsage
        expr: debughub_memory_used_bytes / 1073741824 > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Memory > 1GB on {{ $labels.device_id }}"
          
      - alert: FrequentJanks
        expr: rate(debughub_jank_events_total[5m]) > 1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Frequent janks on {{ $labels.device_id }}"
```

**预估**: 1 天

---

### 2.3 打包与分发

**目标**: 将 Dashboard 模板打包，方便用户导入

**分发方式**:
1. 📁 JSON 文件放在 `docs/grafana/` 目录
2. 📋 提供 Grafana Dashboard 导入指南
3. 🐳 提供 Docker Compose 一键部署示例

```yaml
# docker-compose.grafana.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
      
  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - ./grafana/provisioning:/etc/grafana/provisioning
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

**预估**: 1 天

---

## Phase 3: WebUI Grafana 集成 (优先级: 🟢 Low)

### 3.1 集成方案评估

| 方案 | 说明 | 难度 | 推荐度 |
|------|------|------|--------|
| **iframe 嵌入** | 直接嵌入 Grafana Panel | ⭐⭐ | ⭐⭐⭐⭐ |
| **Grafana SDK** | 使用 @grafana/data 等 SDK | ⭐⭐⭐⭐ | ⭐⭐ |
| **数据代理** | DebugHub 代理 Grafana API | ⭐⭐⭐ | ⭐⭐⭐ |

**推荐**: iframe 嵌入方案 - 实现简单，用户可直接使用完整 Grafana 功能

---

### 3.2 iframe 嵌入实现

**目标**: 在 WebUI 中嵌入 Grafana Dashboard

```tsx
// components/GrafanaEmbed.tsx

interface GrafanaEmbedProps {
  dashboardUid: string;
  panelId?: number;
  variables?: Record<string, string>;
}

export function GrafanaEmbed({ dashboardUid, panelId, variables }: GrafanaEmbedProps) {
  const { grafanaUrl, grafanaToken } = useSettings();
  
  if (!grafanaUrl) {
    return <GrafanaSetupGuide />;
  }
  
  // 构建嵌入 URL
  let url = `${grafanaUrl}/d/${dashboardUid}`;
  if (panelId) {
    url = `${grafanaUrl}/d-solo/${dashboardUid}?panelId=${panelId}`;
  }
  
  // 添加变量
  const params = new URLSearchParams();
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      params.set(`var-${key}`, value);
    });
  }
  params.set('theme', 'dark');
  params.set('kiosk', 'tv');
  
  return (
    <iframe
      src={`${url}?${params.toString()}`}
      className="w-full h-full border-0"
      title="Grafana Dashboard"
    />
  );
}
```

**预估**: 1 天

---

### 3.3 配置 UI

**目标**: 在 WebUI 设置中配置 Grafana 连接

**配置项**:
- Grafana URL（如 `http://localhost:3001`）
- API Token（用于认证）
- 默认 Dashboard UID
- 主题（跟随系统/强制暗色）

```tsx
// pages/SettingsPage.tsx

function GrafanaSettings() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  
  const testConnection = async () => {
    setTestStatus('testing');
    try {
      const response = await fetch(`${url}/api/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTestStatus(response.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  };
  
  return (
    <div className="space-y-4">
      <h3>Grafana 配置</h3>
      <Input label="Grafana URL" value={url} onChange={setUrl} placeholder="http://localhost:3001" />
      <Input label="API Token" value={token} onChange={setToken} type="password" />
      <Button onClick={testConnection}>测试连接</Button>
      {testStatus === 'success' && <span className="text-green-500">✓ 连接成功</span>}
      {testStatus === 'error' && <span className="text-red-500">✗ 连接失败</span>}
    </div>
  );
}
```

**预估**: 1 天

---

### 3.4 认证打通（可选）

**目标**: 实现 DebugHub 和 Grafana 的认证打通

**方案**:
1. **匿名访问** - Grafana 启用匿名访问，最简单
2. **API Token** - 使用 Service Account Token
3. **OAuth 代理** - 通过 DebugHub 代理认证

**注意**: 认证打通复杂度较高，建议初期使用匿名访问或 API Token 方案。

**预估**: 2 天（如需要）

---

## 📅 实施计划

### Sprint 1: 基础能力 (Week 1-2)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 设计指标命名规范 | - | ⬜ |
| 实现 /metrics 端点 | - | ⬜ |
| 导出设备性能指标 | - | ⬜ |
| 添加配置开关 | - | ⬜ |
| 编写集成文档 | - | ⬜ |

### Sprint 2: Grafana 支持 (Week 3)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| 设计 Dashboard 模板 | - | ⬜ |
| 创建告警规则模板 | - | ⬜ |
| 编写部署文档 | - | ⬜ |
| Docker Compose 示例 | - | ⬜ |

### Sprint 3: WebUI 集成 (Week 4, 可选)

| 任务 | 负责人 | 状态 |
|------|--------|------|
| iframe 嵌入实现 | - | ⬜ |
| Grafana 配置 UI | - | ⬜ |
| 测试与优化 | - | ⬜ |

---

## 📁 交付物

### 代码

```
DebugHub/
├── Sources/
│   └── Controllers/
│       └── MetricsController.swift     # Prometheus exporter
└── docs/
    └── grafana/
        ├── dashboards/
        │   ├── debughub-overview.json
        │   ├── device-performance.json
        │   └── page-timing.json
        ├── alerts/
        │   └── debughub-alerts.yaml
        └── docker-compose.yml
```

### 文档

1. **Prometheus 集成指南** - 如何配置 Prometheus 抓取 DebugHub 指标
2. **Grafana 部署指南** - 如何部署 Grafana 并导入 Dashboard
3. **告警配置指南** - 如何配置常用告警规则
4. **API 文档** - /metrics 端点的详细说明

---

## ❓ 开放问题

1. **是否需要支持 Push Gateway**？
   - 场景：DebugHub 无法被 Prometheus 直接访问时
   - 建议：初期不支持，按需添加

2. **指标保留策略**？
   - Prometheus 默认保留 15 天
   - 是否需要长期存储（如 Thanos、VictoriaMetrics）

3. **多实例部署**？
   - 如有多个 DebugHub 实例，如何聚合指标
   - 建议：通过标签区分实例

4. **安全性考虑**？
   - /metrics 端点是否需要认证
   - 建议：支持可选的 Bearer Token 认证

---

## 📚 参考资料

- [Prometheus Exposition Formats](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [Prometheus Naming Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Grafana Embedding](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/)
- [Vapor Metrics](https://docs.vapor.codes/advanced/metrics/)
