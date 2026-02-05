import { Link } from 'react-router-dom'
import { IPhoneIcon, HttpIcon, LogIcon, WebSocketIcon, MockIcon, BreakpointIcon, ChaosIcon, ExportIcon, LinkIcon, TrashIcon, CheckIcon, SearchIcon, RocketIcon } from '@/components/icons'

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WS'
  path: string
  description: string
}

interface EndpointSection {
  icon: React.ReactNode
  title: string
  endpoints: Endpoint[]
}

const apiSections: EndpointSection[] = [
  {
    icon: <IPhoneIcon size={20} />,
    title: '设备管理',
    endpoints: [
      { method: 'GET', path: '/api/devices', description: '获取在线设备列表' },
      { method: 'GET', path: '/api/devices/:deviceId', description: '获取设备详情' },
      { method: 'PUT', path: '/api/devices/:deviceId/nickname', description: '更新设备备注名' },
      { method: 'DELETE', path: '/api/devices/:deviceId/data', description: '清空设备数据' },
    ],
  },
  {
    icon: <HttpIcon size={20} />,
    title: 'Network 插件 - HTTP 事件',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/http-events', description: '获取 HTTP 事件列表（支持分页和过滤）' },
      { method: 'GET', path: '/api/devices/:deviceId/http-events/:eventId', description: '获取 HTTP 事件详情' },
      { method: 'DELETE', path: '/api/devices/:deviceId/http-events/:eventId', description: '删除单条 HTTP 事件' },
      { method: 'POST', path: '/api/devices/:deviceId/http-events/batch-delete', description: '批量删除 HTTP 事件' },
      { method: 'DELETE', path: '/api/devices/:deviceId/http-events', description: '删除全部 HTTP 事件' },
      { method: 'POST', path: '/api/devices/:deviceId/http-events/:eventId/replay', description: '重放 HTTP 请求' },
      { method: 'PUT', path: '/api/devices/:deviceId/http-events/:eventId/favorite', description: '收藏/取消收藏' },
      { method: 'GET', path: '/api/devices/:deviceId/http-events/:eventId/curl', description: '导出 cURL 命令' },
    ],
  },
  {
    icon: <WebSocketIcon size={20} />,
    title: 'Network 插件 - WebSocket 会话',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/ws-sessions', description: '获取 WebSocket 会话列表' },
      { method: 'GET', path: '/api/devices/:deviceId/ws-sessions/:sessionId/frames', description: '获取 WebSocket 帧数据' },
      { method: 'DELETE', path: '/api/devices/:deviceId/ws-sessions/:sessionId', description: '删除单条 WebSocket 会话' },
      { method: 'POST', path: '/api/devices/:deviceId/ws-sessions/batch-delete', description: '批量删除 WebSocket 会话' },
      { method: 'DELETE', path: '/api/devices/:deviceId/ws-sessions', description: '删除全部 WebSocket 会话' },
    ],
  },
  {
    icon: <LogIcon size={20} />,
    title: 'Log 插件 - 日志事件',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/log-events', description: '获取日志事件列表（支持分页和过滤）' },
      { method: 'GET', path: '/api/devices/:deviceId/log-events/filter-options', description: '获取日志过滤选项（subsystem/category）' },
      { method: 'DELETE', path: '/api/devices/:deviceId/log-events/:eventId', description: '删除单条日志' },
      { method: 'POST', path: '/api/devices/:deviceId/log-events/batch-delete', description: '批量删除日志' },
      { method: 'DELETE', path: '/api/devices/:deviceId/log-events', description: '删除全部日志' },
    ],
  },
  {
    icon: <MockIcon size={20} />,
    title: 'Mock 插件 - Mock 规则',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/mock-rules', description: '获取 Mock 规则列表' },
      { method: 'POST', path: '/api/devices/:deviceId/mock-rules', description: '创建 Mock 规则' },
      { method: 'PUT', path: '/api/devices/:deviceId/mock-rules/:ruleId', description: '更新 Mock 规则' },
      { method: 'DELETE', path: '/api/devices/:deviceId/mock-rules/:ruleId', description: '删除 Mock 规则' },
    ],
  },
  {
    icon: <BreakpointIcon size={20} />,
    title: 'Breakpoint 插件 - 断点调试',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/breakpoints', description: '获取断点规则列表' },
      { method: 'POST', path: '/api/devices/:deviceId/breakpoints', description: '创建断点规则' },
    ],
  },
  {
    icon: <ChaosIcon size={20} />,
    title: 'Chaos 插件 - 故障注入',
    endpoints: [
      { method: 'GET', path: '/api/devices/:deviceId/chaos-rules', description: '获取故障注入规则' },
      { method: 'POST', path: '/api/devices/:deviceId/chaos-rules', description: '创建故障注入规则' },
    ],
  },
  {
    icon: <ExportIcon size={20} />,
    title: '数据导出',
    endpoints: [
      { method: 'GET', path: '/api/export/har/:deviceId', description: '导出 HAR 文件' },
    ],
  },
  {
    icon: <LinkIcon size={20} />,
    title: 'WebSocket 连接',
    endpoints: [
      { method: 'WS', path: '/debug-bridge', description: '设备连接端点（App 连接）' },
      { method: 'WS', path: '/ws/live', description: '实时事件流订阅（Web UI 订阅）' },
    ],
  },
  {
    icon: <TrashIcon size={20} />,
    title: '数据管理',
    endpoints: [
      { method: 'GET', path: '/api/cleanup/config', description: '获取清理配置' },
      { method: 'PUT', path: '/api/cleanup/config', description: '更新清理配置' },
      { method: 'POST', path: '/api/cleanup/run', description: '执行过期数据清理' },
      { method: 'POST', path: '/api/cleanup/truncate', description: '清空所有数据（危险）' },
    ],
  },
  {
    icon: <CheckIcon size={20} />,
    title: '系统状态',
    endpoints: [
      { method: 'GET', path: '/api/health', description: '健康检查' },
    ],
  },
]

const methodColors: Record<string, string> = {
  GET: 'bg-green-500/20 text-green-400',
  POST: 'bg-blue-500/20 text-blue-400',
  PUT: 'bg-yellow-500/20 text-yellow-400',
  DELETE: 'bg-red-500/20 text-red-400',
  WS: 'bg-purple-500/20 text-purple-400',
}

export function ApiDocsPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="text-center mb-16">
          <div className="flex justify-center mb-4 text-primary">
            <SearchIcon size={64} />
          </div>
          <h1 className="text-4xl font-bold mb-2 text-text-primary">
            Debug Platform API
          </h1>
          <p className="text-text-secondary text-lg mb-4">网络和日志一体化调试平台</p>
          <span className="inline-block px-4 py-1 bg-bg-light rounded text-sm text-primary border border-border">
            1.2.4
          </span>
          <nav className="flex justify-center gap-4 mt-6">
            <Link to="/" className="flex items-center text-text-secondary hover:text-primary transition-colors px-4 py-2 rounded hover:bg-bg-light">
              <IPhoneIcon size={16} className="mr-2" />
              设备列表
            </Link>
            <Link to="/health" className="flex items-center text-text-secondary hover:text-primary transition-colors px-4 py-2 rounded hover:bg-bg-light">
              <CheckIcon size={16} className="mr-2" />
              健康检查
            </Link>
          </nav>
        </header>

        {/* API Sections */}
        <div className="space-y-6">
          {apiSections.map((section) => (
            <section key={section.title} className="bg-bg-dark border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 bg-bg-medium border-b border-border flex items-center gap-3">
                <span className="text-2xl">{section.icon}</span>
                <h2 className="text-lg font-semibold">{section.title}</h2>
              </div>
              <div className="p-2">
                {section.endpoints.map((endpoint) => (
                  <div
                    key={`${endpoint.method}-${endpoint.path}`}
                    className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-bg-medium transition-colors"
                  >
                    <span className={`font-mono text-xs font-bold px-2 py-1 rounded min-w-[60px] text-center ${methodColors[endpoint.method]}`}>
                      {endpoint.method}
                    </span>
                    <code className="font-mono text-sm text-text-primary flex-1">
                      {endpoint.path}
                    </code>
                    <span className="text-text-secondary text-sm">
                      {endpoint.description}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Quick Start */}
        <section className="mt-8 bg-bg-dark border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-bg-medium border-b border-border flex items-center gap-3">
            <span className="text-2xl"><RocketIcon size={20} /></span>
            <h2 className="text-lg font-semibold">快速开始</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <p className="text-text-secondary text-sm mb-2">获取设备列表：</p>
              <pre className="bg-bg-darkest border border-border rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <code>
                  <span className="text-info">curl</span>{' '}
                  <span className="text-green-400">http://localhost:9527/api/devices</span>
                </code>
              </pre>
            </div>
            <div>
              <p className="text-text-secondary text-sm mb-2">连接实时事件流：</p>
              <pre className="bg-bg-darkest border border-border rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <code>
                  <span className="text-info">websocat</span>{' '}
                  <span className="text-green-400">ws://localhost:9527/ws/live</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center mt-12 py-8 text-text-secondary text-sm">
          <p>Debug Platform © 2025 Sun. All rights reserved.</p>
        </footer>
      </div>
    </div>
  )
}
