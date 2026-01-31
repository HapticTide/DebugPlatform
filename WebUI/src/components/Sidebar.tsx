import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useConnectionStore } from '@/stores/connectionStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { useHTTPStore } from '@/stores/httpStore'
import { useWSStore } from '@/stores/wsStore'
import { useRuleStore } from '@/stores/ruleStore'
import { getPlatformIcon } from '@/utils/deviceIcons'
import { HttpIcon, WebSocketIcon, LogIcon, SearchIcon, IPhoneIcon, ClearIcon, DebugHubLogo, BookIcon, CheckIcon, PackageIcon, ColorfulTrafficLightIcon, HighlightIcon, TagIcon, ChevronRightIcon, ChevronLeftIcon } from '@/components/icons'
import { ServerStatsPanel } from './ServerStatsPanel'
import { ThemeToggle } from './ThemeToggle'
import clsx from 'clsx'

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isServerOnline } = useConnectionStore()

  // 侧边栏收起状态
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })

  // 侧边栏宽度（可调整）
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    // 从 localStorage 读取保存的宽度
    const saved = localStorage.getItem('sidebar-width')
    return saved ? parseInt(saved, 10) : 288 // 默认 288px (w-72)
  })
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // 收起时的宽度
  const COLLAPSED_WIDTH = 48
  // 最小和最大宽度
  const MIN_WIDTH = 240
  const MAX_WIDTH = 480

  // 切换收起状态
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const newValue = !prev
      localStorage.setItem('sidebar-collapsed', String(newValue))
      return newValue
    })
  }, [])

  // 处理拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCollapsed) return // 收起时不允许调整宽度
    e.preventDefault()
    setIsResizing(true)
  }, [isCollapsed])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        // 保存宽度到 localStorage
        localStorage.setItem('sidebar-width', sidebarWidth.toString())
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      // 拖拽时禁止选择文本
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, sidebarWidth])

  // Device Store
  const { devices, fetchDevices, currentDeviceId, selectDevice } = useDeviceStore()

  // HTTP Store (for Domain List) - 支持多选
  const { events, toggleDomain, clearDomains, filters: httpFilters } = useHTTPStore()

  // WebSocket Store (for Host List) - 保持单选
  const { sessions: wsSessions, setFilter: setWsFilter, filters: wsFilters } = useWSStore()

  // Rule Store - for domain highlighting/hiding and traffic rules
  const { rules, getDomainRule, createOrUpdateRule, deleteRule, fetchRules } = useRuleStore()

  // Get current plugin from URL
  const currentPlugin = useMemo(() => {
    const searchParams = new URLSearchParams(location.search)
    return searchParams.get('plugin') || 'http'
  }, [location.search])

  // Domain search filter
  const [domainSearch, setDomainSearch] = useState('')

  // Track recently updated domains for highlight effect
  const [highlightedDomains, setHighlightedDomains] = useState<Set<string>>(new Set())
  const prevEventsCountRef = useRef<Record<string, number>>({})

  useEffect(() => {
    fetchDevices()
    fetchRules() // Load traffic rules for domain filtering
  }, [])

  // 判断是否应该显示域名区域（只有 network 和 websocket 插件显示）
  const shouldShowDomains = currentPlugin === 'http' || currentPlugin === 'websocket'
  // 判断当前是否是 WebSocket 插件
  const isWebSocketPlugin = currentPlugin === 'websocket'

  // 展开的节点集合（支持域名和路径的展开）
  // key 格式: "domain" 或 "domain:/path/to"
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // 切换节点展开/收起
  const toggleNodeExpand = (nodeKey: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeKey)) {
        next.delete(nodeKey)
      } else {
        next.add(nodeKey)
      }
      return next
    })
  }

  // 检查节点是否展开
  const isNodeExpanded = (nodeKey: string) => expandedNodes.has(nodeKey)

  // 路径树节点类型（递归结构）
  interface PathNode {
    segment: string     // 当前路径段，如 "api"
    fullPath: string    // 完整路径，如 "/api"
    count: number       // 该路径下的请求数
    children: PathNode[] // 子路径节点
  }

  // 域名树节点类型
  interface DomainNode {
    domain: string
    count: number
    pathTree: PathNode[] // 路径树
  }

  // 构建路径树的辅助函数
  const buildPathTree = (pathCounts: Record<string, number>): PathNode[] => {
    const root: PathNode[] = []

    // 收集所有路径并解析
    const allPaths = Object.entries(pathCounts)

    // 按路径构建树
    for (const [fullPath, count] of allPaths) {
      const segments = fullPath.split('/').filter(Boolean)
      let currentLevel = root
      let currentPath = ''

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i]
        currentPath = currentPath + '/' + segment

        let existing = currentLevel.find(n => n.segment === segment)
        if (!existing) {
          existing = {
            segment,
            fullPath: currentPath,
            count: 0,
            children: []
          }
          currentLevel.push(existing)
        }

        // 只有在最后一层才累加计数
        if (i === segments.length - 1) {
          existing.count += count
        }

        currentLevel = existing.children
      }
    }

    // 计算每个节点的总计数（包括子节点）
    const calculateTotalCount = (nodes: PathNode[]): void => {
      for (const node of nodes) {
        calculateTotalCount(node.children)
        // 计算子节点总数
        const childTotal = node.children.reduce((sum, child) => sum + child.count, 0)
        // 如果有子节点但当前节点没有直接请求，count 为子节点总数
        if (childTotal > 0 && node.count === 0) {
          node.count = childTotal
        }
      }
    }

    calculateTotalCount(root)

    // 按计数排序
    const sortNodes = (nodes: PathNode[]): void => {
      nodes.sort((a, b) => b.count - a.count)
      for (const node of nodes) {
        sortNodes(node.children)
      }
    }

    sortNodes(root)

    return root
  }

  // Extract Domains/Hosts from Events based on current plugin (多级树状结构)
  const domainTree = useMemo((): DomainNode[] => {
    if (!shouldShowDomains) return []

    if (currentPlugin === 'websocket') {
      // Extract hosts from WebSocket sessions
      const stats: Record<string, { count: number; pathCounts: Record<string, number> }> = {}
      wsSessions.forEach(session => {
        try {
          const url = new URL(session.url)
          const host = url.hostname
          const path = url.pathname || '/'
          if (!stats[host]) {
            stats[host] = { count: 0, pathCounts: {} }
          }
          stats[host].count++
          stats[host].pathCounts[path] = (stats[host].pathCounts[path] || 0) + 1
        } catch { }
      })
      return Object.entries(stats)
        .map(([domain, data]) => ({
          domain,
          count: data.count,
          pathTree: buildPathTree(data.pathCounts)
        }))
        .sort((a, b) => b.count - a.count)
    } else {
      // Extract domains from HTTP events (多级树状结构)
      const stats: Record<string, { count: number; pathCounts: Record<string, number> }> = {}
      events.forEach(e => {
        try {
          const url = new URL(e.url)
          const hostname = url.hostname
          const path = url.pathname || '/'

          if (!stats[hostname]) {
            stats[hostname] = { count: 0, pathCounts: {} }
          }
          stats[hostname].count++
          stats[hostname].pathCounts[path] = (stats[hostname].pathCounts[path] || 0) + 1
        } catch { }
      })
      return Object.entries(stats)
        .map(([domain, data]) => ({
          domain,
          count: data.count,
          pathTree: buildPathTree(data.pathCounts)
        }))
        .sort((a, b) => b.count - a.count)
    }
  }, [events, wsSessions, currentPlugin, shouldShowDomains])

  // 兼容旧的 domainStats 格式（用于高亮检测等）
  const domainStats = useMemo(() => {
    return domainTree.map(({ domain, count }) => ({ domain, count }))
  }, [domainTree])

  // Track previous plugin to detect plugin switches
  const prevPluginRef = useRef<string>(currentPlugin)

  // Detect new requests and highlight domains
  useEffect(() => {
    if (!shouldShowDomains) return

    // If plugin changed, just update the ref without highlighting
    if (prevPluginRef.current !== currentPlugin) {
      prevPluginRef.current = currentPlugin
      // Reset the counts for the new plugin context
      const currentCounts: Record<string, number> = {}
      domainStats.forEach(({ domain, count }) => {
        currentCounts[domain] = count
      })
      prevEventsCountRef.current = currentCounts
      return
    }

    const currentCounts: Record<string, number> = {}
    domainStats.forEach(({ domain, count }) => {
      currentCounts[domain] = count
    })

    const newHighlights = new Set<string>()
    for (const [domain, count] of Object.entries(currentCounts)) {
      const prevCount = prevEventsCountRef.current[domain] || 0
      if (count > prevCount) {
        newHighlights.add(domain)
      }
    }

    if (newHighlights.size > 0) {
      setHighlightedDomains(prev => new Set([...prev, ...newHighlights]))

      // Remove highlights after animation
      setTimeout(() => {
        setHighlightedDomains(prev => {
          const next = new Set(prev)
          newHighlights.forEach(d => next.delete(d))
          return next
        })
      }, 1500)
    }

    prevEventsCountRef.current = currentCounts
  }, [domainStats, currentPlugin, shouldShowDomains])

  // Filter domains by search (树状结构)
  const filteredDomainTree = useMemo(() => {
    if (!domainSearch.trim()) return domainTree
    const searchLower = domainSearch.toLowerCase()

    // 递归检查路径树是否匹配搜索词
    const matchesSearch = (nodes: PathNode[]): boolean => {
      for (const node of nodes) {
        if (node.segment.toLowerCase().includes(searchLower)) return true
        if (matchesSearch(node.children)) return true
      }
      return false
    }

    return domainTree.filter(({ domain, pathTree }) =>
      domain.toLowerCase().includes(searchLower) ||
      matchesSearch(pathTree)
    )
  }, [domainTree, domainSearch])

  // 兼容旧的 filteredDomainStats 格式
  const filteredDomainStats = useMemo(() => {
    return filteredDomainTree.map(({ domain, count }) => ({ domain, count }))
  }, [filteredDomainTree])

  // Filter devices: show only current selected device
  const displayedDevices = useMemo(() => {
    if (!currentDeviceId) return []
    return devices.filter(d => d.deviceId === currentDeviceId)
  }, [devices, currentDeviceId])

  const handleDeviceClick = (deviceId: string) => {
    selectDevice(deviceId)
    // 保留当前的 plugin 参数
    const searchParams = new URLSearchParams(location.search)
    const pluginParam = searchParams.get('plugin')
    if (pluginParam) {
      navigate(`/device/${deviceId}?plugin=${pluginParam}`)
    } else {
      navigate(`/device/${deviceId}`)
    }
  }

  const handleDomainClick = (domain: string) => {
    if (currentPlugin === 'websocket') {
      // Toggle WebSocket host filter (单选)
      if (wsFilters.host === domain) {
        setWsFilter('host', '')
      } else {
        setWsFilter('host', domain)
      }
    } else {
      // Toggle HTTP domain filter (多选)
      toggleDomain(domain)
    }
  }

  // Handle path click - 设置 urlContains 筛选
  const handlePathClick = (domain: string, path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentPlugin === 'websocket') {
      // WebSocket: 设置 path 筛选（通过 urlContains）
      const currentPath = wsFilters.urlContains || ''
      const filterValue = `${domain}${path}`
      if (currentPath === filterValue) {
        setWsFilter('urlContains', '')
      } else {
        setWsFilter('urlContains', filterValue)
      }
    } else {
      // HTTP: 设置 urlContains 筛选
      const currentPath = httpFilters.urlContains || ''
      const filterValue = `${domain}${path}`
      if (currentPath === filterValue) {
        // 如果已经选中这个 path，取消选中
        useHTTPStore.getState().setFilter('urlContains', '')
      } else {
        // 同时选中域名和设置 path 筛选
        if (!httpFilters.domains.includes(domain)) {
          toggleDomain(domain)
        }
        useHTTPStore.getState().setFilter('urlContains', filterValue)
      }
    }
  }

  // Check if path is selected
  const isPathSelected = (domain: string, path: string) => {
    const filterValue = `${domain}${path}`
    if (currentPlugin === 'websocket') {
      return wsFilters.urlContains === filterValue
    }
    return httpFilters.urlContains === filterValue
  }

  // Handle "All Domains" click
  const handleAllDomainsClick = () => {
    if (currentPlugin === 'websocket') {
      setWsFilter('host', '')
      setWsFilter('urlContains', '') // 同时清除 path 筛选
    } else {
      clearDomains()
      useHTTPStore.getState().setFilter('urlContains', '') // 同时清除 path 筛选
    }
  }

  // Check if domain is currently selected as filter
  const isDomainSelected = (domain: string) => {
    if (currentPlugin === 'websocket') {
      return wsFilters.host === domain
    }
    return httpFilters.domains.includes(domain)
  }

  // Check if "All Domains" is selected
  const isAllDomainsSelected = () => {
    if (currentPlugin === 'websocket') {
      return !wsFilters.host
    }
    return httpFilters.domains.length === 0
  }

  // Cycle: None -> Highlight -> Mark -> Hide -> None
  const cycleDomainRule = async (e: React.MouseEvent, domain: string) => {
    e.stopPropagation()
    const current = getDomainRule(domain)

    if (!current) {
      // Create Highlight Rule
      await createOrUpdateRule({
        name: domain,
        matchType: 'domain',
        matchValue: domain,
        action: 'highlight',
        isEnabled: true,
        priority: 0
      })
    } else if (current.action === 'highlight') {
      // Update to Mark Rule
      await createOrUpdateRule({ ...current, action: 'mark' })
    } else if (current.action === 'mark') {
      // Update to Hide Rule
      await createOrUpdateRule({ ...current, action: 'hide' })
    } else {
      // Delete Rule
      if (current.id) await deleteRule(current.id)
    }
  }

  return (
    <aside
      ref={sidebarRef}
      className={clsx(
        "bg-bg-dark border-r border-border flex flex-col h-full relative flex-shrink-0 transition-all duration-300",
        isCollapsed && "overflow-hidden"
      )}
      style={{ width: isCollapsed ? COLLAPSED_WIDTH : sidebarWidth }}
    >
      {/* 收起/展开按钮 */}
      <button
        onClick={toggleCollapse}
        className={clsx(
          "absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 rounded-r-md",
          "bg-bg-medium border border-l-0 border-border",
          "flex items-center justify-center",
          "text-text-muted hover:text-primary hover:bg-bg-light transition-colors",
          isCollapsed ? "right-0" : "-right-5"
        )}
        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
      >
        {isCollapsed ? <ChevronRightIcon size={14} /> : <ChevronLeftIcon size={14} />}
      </button>

      {/* 拖拽调整宽度的手柄 - 收起时隐藏 */}
      {!isCollapsed && (
        <div
          className={clsx(
            "absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 transition-colors group/handle",
            "hover:bg-primary/50",
            isResizing && "bg-primary"
          )}
          onMouseDown={handleMouseDown}
          title="拖拽调整侧边栏宽度"
        >
          {/* 拖拽指示器 - 居中显示的竖线图标 */}
          <div className={clsx(
            "absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2",
            "flex flex-col gap-0.5 opacity-0 group-hover/handle:opacity-100 transition-opacity",
            isResizing && "opacity-100"
          )}>
            <div className="w-0.5 h-3 bg-primary/80 rounded-full" />
            <div className="w-0.5 h-3 bg-primary/80 rounded-full" />
            <div className="w-0.5 h-3 bg-primary/80 rounded-full" />
          </div>
        </div>
      )}

      {/* Header - 可点击跳转首页 */}
      <Link
        to="/"
        className={clsx(
          "border-b border-border flex items-center gap-3 hover:bg-bg-light/50 transition-colors",
          isCollapsed ? "p-2 justify-center" : "p-5"
        )}
      >
        <DebugHubLogo size={isCollapsed ? 32 : 40} />
        {!isCollapsed && (
          <div>
            <h1 className="font-semibold text-text-primary text-lg">Debug Platform</h1>
            <p className="text-2xs text-text-muted">调试平台</p>
          </div>
        )}
      </Link>

      {/* 收起状态下显示简化的图标导航 */}
      {isCollapsed ? (
        <div className="flex-1 flex flex-col items-center py-4 gap-2 overflow-hidden">
          <Link
            to="/api-docs"
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-primary hover:bg-bg-light rounded transition-colors"
            title="API 文档"
          >
            <BookIcon size={16} />
          </Link>
          <Link
            to="/health"
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-green-400 hover:bg-bg-light rounded transition-colors"
            title="健康检查"
          >
            <CheckIcon size={16} />
          </Link>
          <Link
            to="/rules"
            className={clsx(
              "w-8 h-8 flex items-center justify-center rounded transition-colors",
              location.pathname === '/rules'
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-primary hover:bg-bg-light"
            )}
            title="流量规则"
          >
            <ColorfulTrafficLightIcon size={16} />
          </Link>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Quick Links - API、健康、流量规则 */}
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link
                to="/api-docs"
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-primary hover:bg-bg-light rounded transition-colors"
                title="API 文档"
              >
                <BookIcon size={12} />
                <span>API</span>
              </Link>
              <Link
                to="/health"
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:text-green-400 hover:bg-bg-light rounded transition-colors"
                title="健康检查"
              >
                <CheckIcon size={12} />
                <span>健康</span>
              </Link>
            </div>
            <Link
              to="/rules"
              className={clsx(
                "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
                location.pathname === '/rules'
                  ? "text-primary bg-primary/10"
                  : "text-text-muted hover:text-amber-400 hover:bg-bg-light"
              )}
              title="全局流量规则"
            >
              <ColorfulTrafficLightIcon size={12} />
              <span>流量规则</span>
              {rules.length > 0 && (
                <span className="ml-1 text-2xs px-1 py-0.5 rounded bg-bg-medium text-text-muted">
                  {rules.length}
                </span>
              )}
            </Link>
          </div>

          {/* Device List Section - 仅显示当前选中设备 */}
          {currentDeviceId && (
            <div className="px-3 pt-4 pb-3">
              <div className="px-2 mb-3 text-xs font-semibold text-text-secondary uppercase tracking-wider flex justify-between items-center">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 hover:text-primary transition-colors"
                  title="查看设备列表"
                >
                  <IPhoneIcon size={14} />
                  当前设备
                </button>
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-2xs font-bold">{devices.length}</span>
              </div>

              <div className="space-y-1">
                {displayedDevices.map(device => {
                  const isSelected = currentDeviceId === device.deviceId
                  const isOffline = !device.isOnline
                  // 侧边栏展示名称：有别名则展示别名，否则展示原始设备名
                  const displayName = device.deviceAlias || device.deviceName
                  return (
                    <div
                      key={device.deviceId}
                      onClick={() => handleDeviceClick(device.deviceId)}
                      className={clsx(
                        "group relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                        isSelected
                          ? "bg-primary/15"
                          : isOffline
                            ? "text-text-muted hover:bg-bg-light/50"
                            : "text-text-secondary hover:bg-bg-light hover:text-text-primary"
                      )}
                    >
                      {/* 选中指示条 - 无圆角，宽度 3px */}
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                      )}
                      {/* 设备图标和模拟器标记 */}
                      <div className="flex flex-col items-center flex-shrink-0 gap-0.5">
                        <div className="relative">
                          <div className={clsx(
                            "w-8 h-8 rounded-lg flex items-center justify-center border",
                            isOffline
                              ? "bg-bg-medium/50 border-border"
                              : "bg-white/20 dark:bg-black/20 border-white/30 dark:border-white/10"
                          )}>
                            {getPlatformIcon(device.platform, 18, undefined, device.isSimulator)}
                          </div>
                          {device.isOnline ? (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border border-green-400/50 rounded-full status-dot-online" />
                          ) : (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-gray-500 border border-bg-dark rounded-full" />
                          )}
                        </div>
                        {/* 模拟器标记 - 图标下方 */}
                        {device.isSimulator && (
                          <span className="text-2xs px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 whitespace-nowrap">
                            模拟器
                          </span>
                        )}
                      </div>
                      <div className={clsx("min-w-0 flex-1", isOffline && "opacity-60")}>
                        {/* 设备名：有别名展示别名，否则展示设备名 */}
                        <div className={clsx(
                          "font-medium truncate text-xs",
                          isSelected ? "text-primary" : "text-text-primary"
                        )}>
                          {displayName}
                        </div>
                        <div className={clsx(
                          "text-2xs truncate",
                          isSelected ? "text-accent-blue/70" : "text-text-muted"
                        )} title={device.deviceModel}>
                          {device.deviceModel} · {device.platform} <span className="opacity-60">{device.systemVersion}</span>
                        </div>
                        {/* App 信息 - 与设备信息用分割线隔开 */}
                        <div className={clsx(
                          "text-2xs truncate mt-1 pt-1 border-t border-border flex items-center gap-1",
                          isSelected ? "text-accent-blue/70" : "text-text-muted"
                        )}>
                          {/* App 图标 */}
                          <div className="w-3.5 h-3.5 rounded overflow-hidden bg-bg-light flex items-center justify-center flex-shrink-0">
                            {device.appIcon ? (
                              <img
                                src={`data:image/png;base64,${device.appIcon}`}
                                alt={device.appName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <PackageIcon size={8} className="text-text-muted" />
                            )}
                          </div>
                          <span className="truncate">{device.appName}</span>
                          <span className="opacity-60 flex-shrink-0">{device.appVersion}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Separator - 与侧边栏同宽，紧贴设备列表 */}
          {currentDeviceId && shouldShowDomains && (
            <div className="h-px bg-border" />
          )}

          {/* Domain/Host List Section (Only for HTTP/WebSocket plugins) */}
          {currentDeviceId && shouldShowDomains && (
            <div className="px-3 py-3">
              <div className="px-2 mb-3 text-xs font-semibold text-text-secondary uppercase tracking-wider flex justify-between items-center">
                <span className="flex items-center gap-2">
                  {currentPlugin === 'websocket' ? <WebSocketIcon size={14} /> : <HttpIcon size={14} />}
                  {currentPlugin === 'websocket' ? 'WS Hosts' : 'Domains'}
                </span>
                <span className="bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full text-2xs font-bold">{domainStats.length}</span>
              </div>

              {/* Domain Search */}
              <div className="px-1 mb-3">
                <div className="relative">
                  <SearchIcon size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={domainSearch}
                    onChange={(e) => setDomainSearch(e.target.value)}
                    placeholder={currentPlugin === 'websocket' ? '搜索主机...' : '搜索域名...'}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-bg-medium border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-0.5 max-h-[400px] overflow-y-auto pr-1">
                {/* "All Domains" Option */}
                <div
                  onClick={handleAllDomainsClick}
                  className={clsx(
                    "flex items-center justify-between px-3 py-2 rounded cursor-pointer text-xs transition-colors group",
                    isAllDomainsSelected()
                      ? "bg-accent-blue text-white font-medium"
                      : "text-text-secondary hover:bg-bg-light"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LogIcon size={14} />
                    <span className="font-medium">
                      {currentPlugin === 'websocket' ? '全部主机' : '全部域名'}
                    </span>
                  </div>
                  <span className={clsx(
                    "font-mono text-2xs px-1.5 py-0.5 rounded",
                    isAllDomainsSelected()
                      ? "text-white font-bold bg-white/20"
                      : "opacity-60 bg-bg-medium"
                  )}>
                    {domainStats.reduce((sum, { count }) => sum + count, 0)}
                  </span>
                </div>

                {/* Divider */}
                {domainStats.length > 0 && (
                  <div className="border-t border-border-subtle my-1" />
                )}

                {filteredDomainTree.map(({ domain, count, pathTree }) => {
                  const rule = getDomainRule(domain)
                  const isHighlightRule = rule?.action === 'highlight'
                  const isMarkRule = rule?.action === 'mark'
                  const isHideRule = rule?.action === 'hide'
                  const isSelected = isDomainSelected(domain)
                  const isHighlighted = highlightedDomains.has(domain)
                  const domainKey = domain
                  const isExpanded = isNodeExpanded(domainKey)

                  // 递归渲染路径树
                  // 固定缩进值
                  const INDENT_SIZE = 16 // 每级固定缩进 16px

                  const renderPathTree = (nodes: PathNode[], depth: number = 0) => {
                    return nodes.map(node => {
                      const nodeKey = `${domain}:${node.fullPath}`
                      const nodeExpanded = isNodeExpanded(nodeKey)
                      const hasChildren = node.children.length > 0
                      const isPathSel = isPathSelected(domain, node.fullPath)

                      return (
                        <div key={node.fullPath}>
                          <div
                            onClick={(e) => handlePathClick(domain, node.fullPath, e)}
                            className={clsx(
                              "flex items-center justify-between py-1.5 cursor-pointer text-xs transition-colors group",
                              isPathSel
                                ? "bg-accent-blue/20 text-accent-blue font-medium"
                                : "text-text-muted hover:bg-bg-light hover:text-text-secondary"
                            )}
                            style={{ paddingLeft: `${INDENT_SIZE + 4}px`, paddingRight: '12px' }}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              {/* 展开/收起按钮 */}
                              {hasChildren ? (
                                <button
                                  onClick={(e) => toggleNodeExpand(nodeKey, e)}
                                  className={clsx(
                                    "w-4 h-4 flex items-center justify-center flex-shrink-0 transition-transform hover:bg-bg-medium rounded",
                                    nodeExpanded && "rotate-90"
                                  )}
                                >
                                  <ChevronRightIcon
                                    size={12}
                                    className={nodeExpanded ? "text-primary" : "text-text-muted"}
                                  />
                                </button>
                              ) : (
                                <span className="w-4 h-4 flex-shrink-0" />
                              )}
                              <span className="truncate font-mono text-2xs">/{node.segment}</span>
                            </div>
                            <span className={clsx(
                              "font-mono text-2xs px-1 py-0.5 rounded ml-2 flex-shrink-0",
                              isPathSel
                                ? "bg-accent-blue/30"
                                : "opacity-60 bg-bg-medium"
                            )}>{node.count}</span>
                          </div>
                          {/* 递归渲染子节点 - 固定缩进 */}
                          {nodeExpanded && hasChildren && (
                            <div className="border-l border-border-subtle" style={{ marginLeft: `${INDENT_SIZE}px` }}>
                              {renderPathTree(node.children, depth + 1)}
                            </div>
                          )}
                        </div>
                      )
                    })
                  }

                  return (
                    <div key={domain}>
                      {/* 域名行 */}
                      <div
                        onClick={() => handleDomainClick(domain)}
                        className={clsx(
                          "flex items-center justify-between px-3 py-2 rounded cursor-pointer text-xs transition-colors group",
                          isSelected
                            ? "bg-accent-blue text-white font-medium"
                            : "text-text-secondary hover:bg-bg-light",
                          isHighlighted && "animate-domain-highlight"
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* 展开/收起按钮 - 始终显示 */}
                          <button
                            onClick={(e) => toggleNodeExpand(domainKey, e)}
                            className={clsx(
                              "w-5 h-5 flex items-center justify-center flex-shrink-0 transition-transform hover:bg-bg-medium rounded",
                              isExpanded && "rotate-90"
                            )}
                            title={isExpanded ? "收起路径列表" : "展开路径列表"}
                          >
                            <ChevronRightIcon
                              size={14}
                              className={clsx(
                                isSelected ? "text-white" : isExpanded ? "text-primary" : "text-text-primary"
                              )}
                            />
                          </button>
                          <span className={clsx(
                            "truncate font-mono",
                            isHideRule && "opacity-50 line-through"
                          )}>
                            {domain}
                          </span>
                          {/* 流量规则图标 - 域名后面 */}
                          {(isHighlightRule || isMarkRule || isHideRule) && (
                            <span className="flex-shrink-0">
                              {isHighlightRule && <HighlightIcon size={12} filled className="text-yellow-500" />}
                              {isMarkRule && <TagIcon size={12} className="text-blue-400" />}
                              {isHideRule && <ClearIcon size={12} className="text-red-400" />}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "font-mono text-2xs px-1.5 py-0.5 rounded",
                            isHighlighted
                              ? "text-primary font-bold bg-primary/10"
                              : isSelected
                                ? "text-white bg-white/20"
                                : "opacity-60 bg-bg-medium"
                          )}>{count}</span>

                          {/* Quick Action on Hover - 设置流量规则 */}
                          <button
                            onClick={(e) => cycleDomainRule(e, domain)}
                            className={clsx(
                              "opacity-0 group-hover:opacity-100 p-1.5 hover:bg-bg-medium rounded transition-colors",
                              isSelected && "hover:bg-white/20"
                            )}
                            title="设置流量规则 (无 → 高亮 → 标记 → 隐藏)"
                          >
                            <ColorfulTrafficLightIcon size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Path 树 - 展开时显示 */}
                      {isExpanded && pathTree.length > 0 && (
                        <div className="ml-7 border-l border-border-subtle">
                          {renderPathTree(pathTree)}
                        </div>
                      )}
                    </div>
                  )
                })}

                {filteredDomainStats.length === 0 && domainSearch && (
                  <div className="px-4 py-4 text-center text-xs text-text-muted bg-bg-light/20 rounded border border-dashed border-border">
                    <SearchIcon size={24} className="block mb-1 opacity-50 mx-auto" />
                    {isWebSocketPlugin ? '未找到匹配的主机' : '未找到匹配的域名'}
                  </div>
                )}

                {domainStats.length === 0 && !domainSearch && (
                  <div className="px-4 py-4 text-center text-xs text-text-muted bg-bg-light/20 rounded border border-dashed border-border">
                    {isWebSocketPlugin ? <WebSocketIcon size={24} className="block mb-1 opacity-50 mx-auto" /> : <HttpIcon size={24} className="block mb-1 opacity-50 mx-auto" />}
                    {isWebSocketPlugin ? '暂无 WebSocket 主机' : '暂无域名记录'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Server Stats Panel - 收起时隐藏 */}
      {!isCollapsed && <ServerStatsPanel />}

      {/* Footer Status - 主题切换、在线状态、版本 */}
      <div className={clsx(
        "bg-bg-darker border-t border-border text-xs text-text-muted flex items-center",
        isCollapsed ? "flex-col gap-2 py-3 px-2" : "justify-between px-4 py-2"
      )}>
        <div className={clsx(
          "flex items-center",
          isCollapsed ? "flex-col gap-2" : "gap-3"
        )}>
          <ThemeToggle />
          {!isCollapsed && <div className="h-4 w-px bg-border" />}
          <div className="flex items-center gap-1.5">
            <span className={clsx(
              "w-2 h-2 rounded-full border",
              isServerOnline
                ? "bg-green-500 border-green-400/50 status-dot-online"
                : "bg-red-500 border-red-400/50"
            )} />
            {!isCollapsed && <span className="font-medium">{isServerOnline ? "在线" : "离线"}</span>}
          </div>
        </div>
        {!isCollapsed && <span className="text-text-muted/50">1.0.0</span>}
      </div>
    </aside>
  )
}
