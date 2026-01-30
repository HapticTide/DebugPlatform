# Debug Platform WebUI

基于 React + TypeScript + Vite + Tailwind CSS 的调试平台前端。

> **最后更新**: 2025-12-17

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (localhost:3000)
npm run dev

# 开发时需要同时运行 DebugHub 后端 (localhost:9527)
# Vite 会自动代理 /api 和 /ws 请求到后端
```

## 构建与部署

```bash
# 方式 1: 使用 npm script
npm run deploy

# 方式 2: 使用 shell 脚本
./scripts/deploy.sh

# 构建产物会被复制到 ../DebugHub/Public/
```

## 项目结构

```
src/
├── App.tsx                    # 应用入口和路由配置
├── main.tsx                   # React 挂载点
├── index.css                  # 全局样式（Tailwind + 主题变量）
├── components/                # 可复用 UI 组件
│   ├── AdvancedSearch.tsx         # 高级搜索语法组件
│   ├── BatchSelectionBar.tsx      # 批量选择操作栏
│   ├── BlobCell.tsx               # BLOB 数据单元格
│   ├── BreakpointHitNotification.tsx  # 断点命中通知
│   ├── BreakpointHitPanel.tsx     # 断点命中详情面板
│   ├── Checkbox.tsx               # 复选框
│   ├── ConfirmDialog.tsx          # 确认对话框
│   ├── DangerConfirmDialog.tsx    # 危险操作确认对话框
│   ├── DBInspector.tsx            # 数据库检查器
│   ├── DeviceCard.tsx             # 设备卡片
│   ├── FilterPopover.tsx          # 过滤弹出框
│   ├── GroupedHTTPEventList.tsx   # HTTP 请求分组列表
│   ├── HTTPEventDetail.tsx        # HTTP 请求详情面板
│   ├── ImagePreview.tsx           # 图片响应预览
│   ├── JSONTree.tsx               # JSON 树形展示
│   ├── KeyboardShortcutsHelp.tsx  # 快捷键帮助面板
│   ├── ListLoadingOverlay.tsx     # 列表加载遮罩
│   ├── LoadMoreButton.tsx         # 加载更多按钮
│   ├── LogFilters.tsx             # 日志过滤器
│   ├── MockRuleEditor.tsx         # Mock 规则编辑器
│   ├── MockRuleList.tsx           # Mock 规则列表
│   ├── MockRulePopover.tsx        # Mock 规则弹出框
│   ├── PluginManager.tsx          # 插件管理界面
│   ├── ProtobufConfigPanel.tsx    # Protobuf 配置面板
│   ├── ProtobufViewer.tsx         # Protobuf 解析查看器
│   ├── RefreshIndicator.tsx       # 刷新指示器
│   ├── RequestDiff.tsx            # 请求对比组件
│   ├── ServerStatsPanel.tsx       # 服务器统计面板
│   ├── SessionActivityIndicator.tsx # 会话活动指示器
│   ├── Sidebar.tsx                # 侧边栏（设备列表 + 域名树）
│   ├── ThemeToggle.tsx            # 主题切换按钮
│   ├── TimingWaterfall.tsx        # 性能时间线瀑布图
│   ├── ToastContainer.tsx         # Toast 消息容器
│   ├── Toggle.tsx                 # 开关组件
│   ├── TokenConfirmDialog.tsx     # Token 确认对话框
│   ├── VirtualHTTPEventTable.tsx  # HTTP 虚拟滚动表格
│   ├── VirtualLogList.tsx         # 日志虚拟滚动列表
│   ├── WSSessionDetail.tsx        # WebSocket 会话详情
│   ├── WSSessionList.tsx          # WebSocket 会话列表
│   └── icons/                     # 图标组件
│       └── index.tsx
├── pages/                     # 页面组件
│   ├── ApiDocsPage.tsx            # API 文档页
│   ├── DeviceDetailPage.tsx       # 设备详情页
│   ├── DeviceListPage.tsx         # 设备列表页
│   ├── DevicePluginView.tsx       # 设备插件视图
│   ├── HealthPage.tsx             # 健康检查页
│   └── RulesPage.tsx              # 规则管理页
├── plugins/                   # 前端插件系统
│   ├── types.ts                   # 插件类型定义
│   ├── index.ts                   # 插件导出
│   ├── PluginRegistry.ts          # 插件注册中心
│   ├── PluginRenderer.tsx         # 插件渲染器
│   └── builtin/                   # 内置插件
│       ├── index.ts               # 内置插件导出
│       ├── HttpPlugin.tsx         # HTTP 网络插件
│       ├── WebSocketPlugin.tsx    # WebSocket 插件
│       ├── LogPlugin.tsx          # 日志插件
│       ├── DatabasePlugin.tsx     # 数据库插件
│       ├── MockPlugin.tsx         # Mock 规则插件
│       ├── BreakpointPlugin.tsx   # 断点调试插件
│       ├── ChaosPlugin.tsx        # Chaos 故障注入插件
│       └── PerformancePlugin.tsx  # 性能监控插件
├── stores/                    # Zustand 状态管理
│   ├── breakpointStore.ts         # 断点状态
│   ├── connectionStore.ts         # WebSocket 连接状态
│   ├── dbStore.ts                 # 数据库状态
│   ├── deviceStore.ts             # 设备状态
│   ├── domainStore.ts             # 域名策略状态
│   ├── favoriteUrlStore.ts        # 收藏 URL 状态
│   ├── httpStore.ts               # HTTP 事件状态
│   ├── logStore.ts                # 日志状态
│   ├── mockStore.ts               # Mock 规则状态
│   ├── performanceStore.ts        # 性能监控状态
│   ├── protobufStore.ts           # Protobuf 配置状态
│   ├── ruleStore.ts               # 流量规则状态
│   ├── sessionActivityStore.ts    # 会话活动状态
│   ├── themeStore.ts              # 主题状态
│   ├── toastStore.ts              # Toast 消息状态
│   └── wsStore.ts                 # WebSocket 状态
├── services/                  # API 服务
│   ├── api.ts                     # HTTP API 调用封装
│   └── realtime.ts                # WebSocket 实时通信
├── hooks/                     # 自定义 Hooks
│   └── useKeyboardShortcuts.ts    # 键盘快捷键 Hook
├── types/                     # TypeScript 类型定义
│   └── index.ts                   # 全局类型
└── utils/                     # 工具函数
    ├── deviceIcons.tsx            # 设备图标
    ├── format.ts                  # 格式化工具
    ├── logSearch.ts               # 日志搜索工具
    └── protobufDescriptor.ts      # Protobuf 描述符解析
```

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式
- **Zustand** - 状态管理
- **React Router** - 路由
- **@tanstack/react-virtual** - 虚拟滚动
- **Recharts** - 图表（性能监控）
- **date-fns** - 日期格式化

## 主要功能

### 插件系统

WebUI 采用插件化架构，每个功能模块都是独立的插件：

| 插件 | 功能 |
|------|------|
| HttpPlugin | HTTP/HTTPS 请求监控、搜索、导出 |
| WebSocketPlugin | WebSocket 连接和消息监控 |
| LogPlugin | 日志查看、过滤、搜索 |
| DatabasePlugin | SQLite 数据库浏览和查询 |
| MockPlugin | Mock 规则管理 |
| BreakpointPlugin | 请求断点调试 |
| ChaosPlugin | 故障注入规则管理 |
| PerformancePlugin | 性能监控仪表盘 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘K` | 搜索 |
| `⌘R` | 刷新 |
| `⌘T` | 切换主题 |
| `⌘/` | 快捷键帮助 |
| `F` | 收藏 |
| `Del` | 删除选中 |

## 环境要求

- Node.js 18+
- npm 9+
