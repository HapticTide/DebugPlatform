import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDeviceStore } from '@/stores/deviceStore'
import { useHTTPStore } from '@/stores/httpStore'
import { useLogStore } from '@/stores/logStore'
import { useWSStore } from '@/stores/wsStore'
import { useMockStore } from '@/stores/mockStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useThemeStore } from '@/stores/themeStore'
import { realtimeService, parseHTTPEvent, parseLogEvent, parseWSEvent } from '@/services/realtime'
import { HTTPEventTable } from '@/components/HTTPEventTable'
import { HTTPEventDetail } from '@/components/HTTPEventDetail'
import { LogList } from '@/components/LogList'
import { LogFilters } from '@/components/LogFilters'
import { BatchSelectionBar } from '@/components/BatchSelectionBar'
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcutsHelp'
import { WSSessionList } from '@/components/WSSessionList'
import { WSSessionDetail } from '@/components/WSSessionDetail'
import { MockRuleList } from '@/components/MockRuleList'
import { MockRuleEditor } from '@/components/MockRuleEditor'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { getExportHTTPUrl, getExportLogsUrl, getExportHARUrl } from '@/services/api'
import clsx from 'clsx'

type Tab = 'http' | 'logs' | 'websocket' | 'mock'

const tabConfig = [
  { id: 'http' as Tab, label: 'HTTP', icon: '🌐', description: 'HTTP/HTTPS 请求' },
  { id: 'websocket' as Tab, label: 'WebSocket', icon: '🔌', description: 'WS 连接' },
  { id: 'logs' as Tab, label: '日志', icon: '📝', description: '应用日志' },
  { id: 'mock' as Tab, label: 'Mock', icon: '🎭', description: '接口模拟' },
]

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  // 从 URL 参数读取初始 tab（支持旧的 network 参数向后兼容）
  const tabParam = searchParams.get('tab')
  const initialTab = (tabParam === 'network' ? 'http' : tabParam as Tab) || 'http'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [networkCapture, setNetworkCapture] = useState(true)
  const [logCapture, setLogCapture] = useState(true)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showClearDeviceDialog, setShowClearDeviceDialog] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  const { currentDevice, selectDevice, clearSelection, toggleCapture, clearDeviceData } =
    useDeviceStore()
  const { setConnected, setInDeviceDetail } = useConnectionStore()
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  // HTTP Store
  const httpStore = useHTTPStore()

  // Log Store
  const logStore = useLogStore()

  // WebSocket Store
  const wsStore = useWSStore()

  // Mock Store
  const mockStore = useMockStore()

  // 键盘快捷键
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: '搜索',
      action: () => {
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
        searchInput?.focus()
      },
    },
    {
      key: 'r',
      ctrl: true,
      description: '刷新',
      action: () => {
        if (deviceId) {
          if (activeTab === 'http') httpStore.fetchEvents(deviceId)
          else if (activeTab === 'logs') logStore.fetchEvents(deviceId)
          else if (activeTab === 'websocket') wsStore.fetchSessions(deviceId)
          else if (activeTab === 'mock') mockStore.fetchRules(deviceId)
        }
      },
    },
    {
      key: 'l',
      ctrl: true,
      description: '清空列表',
      action: () => {
        if (activeTab === 'http') {
          httpStore.clearEvents()
        } else if (activeTab === 'logs') {
          logStore.clearEvents()
        }
      },
    },
    {
      key: 't',
      ctrl: true,
      description: '切换主题',
      action: toggleTheme,
    },
    {
      key: '/',
      ctrl: true,
      description: '显示快捷键帮助',
      action: () => setShowShortcutsHelp(true),
    },
    {
      key: 'Escape',
      description: '取消选择',
      action: () => {
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false)
        } else if (mockStore.isEditorOpen) {
          mockStore.closeEditor()
        } else if (httpStore.isSelectMode) {
          httpStore.toggleSelectMode()
        } else {
          httpStore.clearSelection()
        }
      },
    },
    {
      key: 'a',
      ctrl: true,
      description: '全选',
      action: () => {
        if (activeTab === 'http' && httpStore.isSelectMode) {
          httpStore.selectAll()
        }
      },
    },
    {
      key: 'Backspace',
      description: '删除选中',
      action: () => {
        if (
          activeTab === 'http' &&
          httpStore.isSelectMode &&
          httpStore.selectedIds.size > 0 &&
          deviceId
        ) {
          httpStore.batchDelete(deviceId)
        }
      },
    },
    {
      key: 'f',
      description: '收藏',
      action: () => {
        if (
          activeTab === 'http' &&
          httpStore.isSelectMode &&
          httpStore.selectedIds.size > 0 &&
          deviceId
        ) {
          httpStore.batchFavorite(deviceId, true)
        }
      },
    },
  ])

  // 加载设备详情和数据
  useEffect(() => {
    if (!deviceId) return

    // 标记进入设备详情页
    setInDeviceDetail(true)

    selectDevice(deviceId)
    httpStore.fetchEvents(deviceId)
    logStore.fetchEvents(deviceId)
    logStore.fetchFilterOptions(deviceId)
    wsStore.fetchSessions(deviceId)
    mockStore.fetchRules(deviceId)

    // 连接实时流
    realtimeService.connect(deviceId)

    const unsubMessage = realtimeService.onMessage((message) => {
      if (message.deviceId !== deviceId) return

      switch (message.type) {
        case 'httpEvent':
          httpStore.addRealtimeEvent(parseHTTPEvent(message.payload))
          break
        case 'logEvent':
          logStore.addRealtimeEvent(parseLogEvent(message.payload))
          break
        case 'wsEvent': {
          const wsEvent = parseWSEvent(message.payload)
          if (wsEvent.type === 'sessionCreated') {
            const session = wsEvent.data as { id: string; url: string; connectTime: string }
            wsStore.addRealtimeSession({
              id: session.id,
              url: session.url,
              connectTime: session.connectTime,
              disconnectTime: null,
              closeCode: null,
              closeReason: null,
              isOpen: true,
            })
          } else if (wsEvent.type === 'sessionClosed') {
            const data = wsEvent.data as { sessionId: string; closeCode?: number; closeReason?: string }
            wsStore.updateSessionStatus(data.sessionId, false, data.closeCode, data.closeReason)
          } else if (wsEvent.type === 'frame') {
            const frame = wsEvent.data as {
              id: string
              sessionId: string
              direction: 'send' | 'receive'
              opcode: string
              payloadPreview?: string
              payloadSize: number
              timestamp: string
              isMocked: boolean
            }
            wsStore.addRealtimeFrame({
              id: frame.id,
              direction: frame.direction,
              opcode: frame.opcode,
              payloadPreview: frame.payloadPreview ?? null,
              payloadSize: frame.payloadSize,
              timestamp: frame.timestamp,
              isMocked: frame.isMocked,
            })
          }
          break
        }
        case 'deviceConnected': {
          const data = JSON.parse(message.payload)
          httpStore.addSessionDivider(data.sessionId, true)
          break
        }
        case 'deviceDisconnected':
          httpStore.addSessionDivider('', false)
          break
      }
    })

    const unsubConnection = realtimeService.onConnection(setConnected)

    return () => {
      unsubMessage()
      unsubConnection()
      realtimeService.disconnect()
      clearSelection()
      httpStore.clearEvents()
      logStore.clearEvents()
      wsStore.clearSessions()
      mockStore.clearRules()
      // 标记离开设备详情页
      setInDeviceDetail(false)
    }
  }, [deviceId])

  const handleBack = () => {
    navigate('/')
  }

  // 修复：正确处理捕获开关
  const handleNetworkCaptureChange = useCallback((checked: boolean) => {
    setNetworkCapture(checked)
    toggleCapture(checked, logCapture)
  }, [toggleCapture, logCapture])

  const handleLogCaptureChange = useCallback((checked: boolean) => {
    setLogCapture(checked)
    toggleCapture(networkCapture, checked)
  }, [toggleCapture, networkCapture])

  const handleClearDeviceData = useCallback(async () => {
    await clearDeviceData()
    httpStore.clearEvents()
    logStore.clearEvents()
    wsStore.clearSessions()
    setShowClearDeviceDialog(false)
  }, [clearDeviceData])

  const handleSelectHTTPEvent = useCallback(
    (eventId: string) => {
      if (deviceId) {
        httpStore.selectEvent(deviceId, eventId)
      }
    },
    [deviceId]
  )

  const handleShowRelatedLogs = useCallback((traceId: string) => {
    logStore.setFilter('traceId', traceId)
    setActiveTab('logs')
  }, [])

  const handleFavoriteChange = useCallback((eventId: string, isFavorite: boolean) => {
    httpStore.updateEventFavorite(eventId, isFavorite)
  }, [])

  if (!deviceId) return null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-4 bg-bg-dark/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            <span>返回</span>
          </button>
          
          <div className="h-6 w-px bg-border" />
          
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent-blue/20 flex items-center justify-center border border-border">
              <span className="text-lg">📱</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {currentDevice?.deviceInfo.deviceName || '加载中...'}
              </h1>
              {currentDevice && (
                <p className="text-xs text-text-muted">
                  {currentDevice.deviceInfo.platform} {currentDevice.deviceInfo.systemVersion} • {currentDevice.deviceInfo.appName}
                </p>
              )}
            </div>
            {currentDevice && (
              <span
                className={clsx(
                  'badge ml-2',
                  currentDevice.isOnline ? 'badge-success' : 'badge-danger'
                )}
              >
                <span className={clsx(
                  'w-1.5 h-1.5 rounded-full mr-1.5',
                  currentDevice.isOnline ? 'bg-green-400' : 'bg-red-400'
                )} />
                {currentDevice.isOnline ? '在线' : '离线'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Capture Toggles */}
            <div className="flex items-center gap-4 px-4 py-2 bg-bg-medium rounded-xl border border-border">
              <label className="flex items-center gap-2 text-sm cursor-pointer group">
                <input
                  type="checkbox"
                  checked={networkCapture}
                  onChange={(e) => handleNetworkCaptureChange(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                  🌐 网络
                </span>
              </label>
              <div className="w-px h-4 bg-border" />
              <label className="flex items-center gap-2 text-sm cursor-pointer group">
                <input
                  type="checkbox"
                  checked={logCapture}
                  onChange={(e) => handleLogCaptureChange(e.target.checked)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                  📝 日志
                </span>
              </label>
            </div>
            
            <button
              onClick={() => setShowShortcutsHelp(true)}
              className="btn btn-ghost px-3"
              title="快捷键 (Ctrl+/)"
            >
              ⌨️
            </button>
            
            {/* More Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="btn btn-ghost px-3"
                title="更多操作"
              >
                ⋯
              </button>
              {showMoreMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowMoreMenu(false)} 
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-bg-dark border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => {
                        setShowMoreMenu(false)
                        setShowClearDeviceDialog(true)
                      }}
                      className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                    >
                      <span>🗑️</span>
                      <span>清空设备数据</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-3 bg-bg-dark border-b border-border">
        <div className="flex gap-2">
          {tabConfig.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'tab flex items-center gap-2',
                activeTab === tab.id && 'active'
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'http' && (
          <HTTPTab
            deviceId={deviceId}
            httpStore={httpStore}
            onSelectEvent={handleSelectHTTPEvent}
            onShowRelatedLogs={handleShowRelatedLogs}
            onFavoriteChange={handleFavoriteChange}
            onRefresh={() => httpStore.fetchEvents(deviceId)}
          />
        )}

        {activeTab === 'websocket' && (
          <WebSocketTab deviceId={deviceId} wsStore={wsStore} />
        )}

        {activeTab === 'logs' && (
          <LogsTab
            deviceId={deviceId}
            logStore={logStore}
            onRefresh={() => logStore.fetchEvents(deviceId)}
          />
        )}

        {activeTab === 'mock' && (
          <MockTab deviceId={deviceId} mockStore={mockStore} />
        )}
      </div>

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />

      {/* Clear Device Data Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearDeviceDialog}
        onClose={() => setShowClearDeviceDialog(false)}
        onConfirm={handleClearDeviceData}
        title="清空设备数据"
        message={`确定要清空 "${currentDevice?.deviceInfo.deviceName || '该设备'}" 的所有数据吗？\n\n这将删除：\n• 所有 HTTP 请求记录\n• 所有日志事件\n• 所有 WebSocket 会话\n\n此操作不可恢复。`}
        confirmText="确认清空"
        cancelText="取消"
        type="danger"
      />
    </div>
  )
}

// HTTP Tab Component
function HTTPTab({
  deviceId,
  httpStore,
  onSelectEvent,
  onShowRelatedLogs,
  onFavoriteChange,
  onRefresh,
}: {
  deviceId: string
  httpStore: ReturnType<typeof useHTTPStore.getState>
  onSelectEvent: (id: string) => void
  onShowRelatedLogs: (traceId: string) => void
  onFavoriteChange: (eventId: string, isFavorite: boolean) => void
  onRefresh: () => void
}) {
  const handleExportSelected = () => {
    const ids = Array.from(httpStore.selectedIds)
    if (ids.length > 0) {
      window.open(getExportHARUrl(deviceId, ids), '_blank')
    }
  }

  // 显示的记录数（过滤后）
  const filteredCount = httpStore.filteredItems.filter(
    (item) => !('type' in item && item.type === 'session-divider')
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-bg-medium/50 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="btn btn-secondary"
            title="刷新列表 (Ctrl+R)"
          >
            刷新
          </button>
          
          <div className="h-6 w-px bg-border" />
          
          <select
            value={httpStore.filters.method}
            onChange={(e) => httpStore.setFilter('method', e.target.value)}
            className="select"
          >
            <option value="">所有方法</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>
          
          <input
            type="text"
            value={httpStore.filters.urlContains}
            onChange={(e) => httpStore.setFilter('urlContains', e.target.value)}
            placeholder="搜索 URL..."
            className="input w-56"
            data-search-input
          />
          
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              checked={httpStore.filters.mockedOnly}
              onChange={(e) => httpStore.setFilter('mockedOnly', e.target.checked)}
              className="accent-primary"
            />
            仅 Mock
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              checked={httpStore.filters.favoritesOnly}
              onChange={(e) => httpStore.setFilter('favoritesOnly', e.target.checked)}
              className="accent-primary"
            />
            仅收藏
          </label>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted bg-bg-light px-2 py-1 rounded-lg">
            {filteredCount !== httpStore.events.length
              ? `${filteredCount} / ${httpStore.events.length}`
              : `${httpStore.events.length}`}{' '}
            条记录
          </span>
          
          <button
            onClick={() => httpStore.toggleSelectMode()}
            className={clsx(
              'btn',
              httpStore.isSelectMode
                ? 'bg-primary/20 text-primary border-primary/30'
                : 'btn-secondary'
            )}
          >
            {httpStore.isSelectMode ? '退出批量' : '批量选择'}
          </button>
          
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              checked={httpStore.autoScroll}
              onChange={(e) => httpStore.setAutoScroll(e.target.checked)}
              className="accent-primary"
            />
            自动滚动
          </label>
          
          <div className="h-6 w-px bg-border" />
          
          <a
            href={getExportHTTPUrl(deviceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            导出
          </a>
          
          <button
            onClick={() => httpStore.clearEvents()}
            className="btn btn-ghost text-text-muted hover:text-text-secondary"
            title="清空当前列表（不删除数据库）"
          >
            清屏
          </button>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-[400px] border-r border-border flex flex-col">
          <HTTPEventTable
            items={httpStore.filteredItems}
            selectedId={httpStore.selectedEventId}
            onSelect={onSelectEvent}
            autoScroll={httpStore.autoScroll}
            isSelectMode={httpStore.isSelectMode}
            selectedIds={httpStore.selectedIds}
            onToggleSelect={httpStore.toggleSelectId}
          />
        </div>
        <div className="w-[45%] min-w-[400px] bg-bg-dark/50">
          <HTTPEventDetail
            event={httpStore.selectedEvent}
            deviceId={deviceId}
            onShowRelatedLogs={onShowRelatedLogs}
            onFavoriteChange={onFavoriteChange}
          />
        </div>
      </div>

      {/* Batch Selection Bar */}
      <BatchSelectionBar
        selectedCount={httpStore.selectedIds.size}
        totalCount={httpStore.events.length}
        isVisible={httpStore.isSelectMode && httpStore.selectedIds.size > 0}
        onSelectAll={httpStore.selectAll}
        onClearSelection={httpStore.clearSelectedIds}
        onDelete={() => httpStore.batchDelete(deviceId)}
        onFavorite={() => httpStore.batchFavorite(deviceId, true)}
        onUnfavorite={() => httpStore.batchFavorite(deviceId, false)}
        onExport={handleExportSelected}
      />
    </div>
  )
}

// Logs Tab Component
function LogsTab({
  deviceId,
  logStore,
  onRefresh,
}: {
  deviceId: string
  logStore: ReturnType<typeof useLogStore.getState>
  onRefresh: () => void
}) {
  // 计算过滤后的数量
  const filteredCount = logStore.filteredEvents.length
  const totalCount = logStore.events.length

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-bg-medium/50 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onRefresh} className="btn btn-secondary" title="刷新列表 (Ctrl+R)">
            刷新
          </button>

          <div className="h-6 w-px bg-border" />

          <LogFilters
            levels={logStore.filters.levels}
            subsystems={logStore.subsystems}
            categories={logStore.categories}
            selectedSubsystem={logStore.filters.subsystem}
            selectedCategory={logStore.filters.category}
            searchText={logStore.filters.text}
            onToggleLevel={logStore.toggleLevel}
            onSubsystemChange={(v) => logStore.setFilter('subsystem', v)}
            onCategoryChange={(v) => logStore.setFilter('category', v)}
            onSearchChange={(v) => logStore.setFilter('text', v)}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted bg-bg-light px-2 py-1 rounded-lg">
            {filteredCount !== totalCount ? `${filteredCount} / ${totalCount}` : `${totalCount}`} 条记录
          </span>

          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              checked={logStore.autoScroll}
              onChange={(e) => logStore.setAutoScroll(e.target.checked)}
              className="accent-primary"
            />
            自动滚动
          </label>

          <div className="h-6 w-px bg-border" />

          <a
            href={getExportLogsUrl(deviceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            导出
          </a>

          <button
            onClick={() => logStore.clearEvents()}
            className="btn btn-ghost text-text-muted hover:text-text-secondary"
            title="清空当前列表（不删除数据库）"
          >
            清屏
          </button>
        </div>
      </div>

      {/* Log List */}
      <LogList events={logStore.filteredEvents} autoScroll={logStore.autoScroll} />
    </div>
  )
}

// WebSocket Tab Component
function WebSocketTab({
  deviceId,
  wsStore,
}: {
  deviceId: string
  wsStore: ReturnType<typeof useWSStore.getState>
}) {
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      wsStore.selectSession(deviceId, sessionId)
    },
    [deviceId]
  )

  const handleLoadMoreFrames = useCallback(() => {
    if (wsStore.selectedSessionId) {
      wsStore.loadMoreFrames(deviceId, wsStore.selectedSessionId)
    }
  }, [deviceId, wsStore.selectedSessionId])

  const handleFrameDirectionChange = useCallback(
    (direction: string) => {
      wsStore.setFrameDirection(direction)
      if (wsStore.selectedSessionId) {
        wsStore.fetchFrames(deviceId, wsStore.selectedSessionId)
      }
    },
    [deviceId, wsStore.selectedSessionId]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-bg-medium/50 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => wsStore.fetchSessions(deviceId)}
            className="btn btn-secondary"
          >
            刷新
          </button>
          
          <div className="h-6 w-px bg-border" />
          
          <input
            type="text"
            value={wsStore.filters.urlContains || ''}
            onChange={(e) => wsStore.setFilter('urlContains', e.target.value)}
            placeholder="搜索 URL..."
            className="input w-56"
          />
          
          <select
            value={wsStore.filters.isOpen === undefined ? '' : String(wsStore.filters.isOpen)}
            onChange={(e) =>
              wsStore.setFilter(
                'isOpen',
                e.target.value === '' ? undefined : e.target.value === 'true'
              )
            }
            className="select"
          >
            <option value="">所有状态</option>
            <option value="true">连接中</option>
            <option value="false">已关闭</option>
          </select>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted bg-bg-light px-2 py-1 rounded-lg">
            {wsStore.totalSessions} 个会话
          </span>
          
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
            <input
              type="checkbox"
              checked={wsStore.autoScroll}
              onChange={(e) => wsStore.setAutoScroll(e.target.checked)}
              className="accent-primary"
            />
            自动滚动
          </label>
        </div>
      </div>

      {/* Split Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[40%] min-w-[300px] border-r border-border">
          <WSSessionList
            sessions={wsStore.sessions}
            selectedId={wsStore.selectedSessionId}
            onSelect={handleSelectSession}
            loading={wsStore.sessionsLoading}
            autoScroll={wsStore.autoScroll}
          />
        </div>
        <div className="flex-1 min-w-[400px] bg-bg-dark/50">
          <WSSessionDetail
            session={wsStore.selectedSession}
            frames={wsStore.frames}
            loading={wsStore.framesLoading}
            onLoadMore={handleLoadMoreFrames}
            hasMore={wsStore.frames.length < wsStore.totalFrames}
            frameDirection={wsStore.frameDirection}
            onFrameDirectionChange={handleFrameDirectionChange}
          />
        </div>
      </div>
    </div>
  )
}

// Mock Tab Component
function MockTab({
  deviceId,
  mockStore,
}: {
  deviceId: string
  mockStore: ReturnType<typeof useMockStore.getState>
}) {
  const handleCreateNew = useCallback(() => {
    mockStore.openEditor()
  }, [])

  const handleEdit = useCallback((rule: typeof mockStore.rules[0]) => {
    mockStore.openEditor(rule)
  }, [])

  const handleDelete = useCallback(
    (ruleId: string) => {
      mockStore.deleteRule(deviceId, ruleId)
    },
    [deviceId]
  )

  const handleToggleEnabled = useCallback(
    (ruleId: string) => {
      mockStore.toggleRuleEnabled(deviceId, ruleId)
    },
    [deviceId]
  )

  const handleSave = useCallback(
    async (ruleData: Parameters<typeof mockStore.createRule>[1]) => {
      if (mockStore.editingRule) {
        await mockStore.updateRule(deviceId, mockStore.editingRule.id, ruleData)
      } else {
        await mockStore.createRule(deviceId, ruleData)
      }
    },
    [deviceId, mockStore.editingRule]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 bg-bg-medium/50 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => mockStore.fetchRules(deviceId)}
            className="btn btn-secondary"
          >
            刷新
          </button>
          
          <span className="text-xs text-text-muted bg-bg-light px-2 py-1 rounded-lg">
            {mockStore.rules.length} 条规则
          </span>
        </div>
        
        <button onClick={handleCreateNew} className="btn bg-primary text-white hover:bg-primary-dark">
          + 创建规则
        </button>
      </div>

      {/* Rule List */}
      <div className="flex-1 overflow-auto">
        <MockRuleList
          rules={mockStore.rules}
          loading={mockStore.loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleEnabled={handleToggleEnabled}
          onCreateNew={handleCreateNew}
        />
      </div>

      {/* Rule Editor Modal */}
      <MockRuleEditor
        rule={mockStore.editingRule}
        isOpen={mockStore.isEditorOpen}
        onClose={mockStore.closeEditor}
        onSave={handleSave}
        loading={mockStore.loading}
      />
    </div>
  )
}
