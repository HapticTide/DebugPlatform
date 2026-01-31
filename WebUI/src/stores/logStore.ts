import { create } from 'zustand'
import type { LogEvent, LogLevel } from '@/types'
import * as api from '@/services/api'
import { parseLogSearchQuery, filterLogsWithSearch } from '@/utils/logSearch'

// 日志级别优先级（从低到高）: verbose < debug < info < warning < error
// 选中某个级别时，显示该级别及更高级别的日志
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
}

interface Filters {
  minLevel: LogLevel  // 最低显示级别（单选层级模式）
  subsystem: string
  category: string
  text: string
  traceId: string
  searchQuery: string  // 高级搜索查询
}

// 清屏和会话过滤选项
interface FilterOptions {
  clearedBeforeTimestamp?: string | null
  showCurrentSessionOnly?: boolean
  sessionStartTimestamp?: string | null
}

// 基础过滤逻辑（不含高级搜索）
function basicFilterEvents(events: LogEvent[], filters: Filters, options?: FilterOptions): LogEvent[] {
  const minPriority = LEVEL_PRIORITY[filters.minLevel]

  return events.filter((event) => {
    // 清屏过滤：只显示清屏时间之后的日志
    if (options?.clearedBeforeTimestamp && event.timestamp) {
      if (event.timestamp < options.clearedBeforeTimestamp) return false
    }

    // 本次启动过滤：只显示会话开始时间之后的日志
    if (options?.showCurrentSessionOnly && options?.sessionStartTimestamp && event.timestamp) {
      if (event.timestamp < options.sessionStartTimestamp) return false
    }

    // Level 过滤: 只显示大于等于最低级别的日志
    const eventPriority = LEVEL_PRIORITY[event.level] ?? 0
    if (eventPriority < minPriority) return false

    // Subsystem 过滤
    if (filters.subsystem && event.subsystem !== filters.subsystem) return false

    // Category 过滤
    if (filters.category && event.category !== filters.category) return false

    // 文本搜索（非高级搜索模式）
    if (filters.text && !filters.searchQuery) {
      if (!event.message.toLowerCase().includes(filters.text.toLowerCase())) {
        return false
      }
    }

    // TraceId 过滤
    if (filters.traceId && event.traceId !== filters.traceId) return false

    return true
  })
}

// 综合过滤（包含高级搜索）
function filterEvents(events: LogEvent[], filters: Filters, options?: FilterOptions): LogEvent[] {
  // 先应用基础过滤
  let filtered = basicFilterEvents(events, filters, options)

  // 如果有高级搜索查询，应用高级搜索
  if (filters.searchQuery) {
    const parsedSearch = parseLogSearchQuery(filters.searchQuery)
    filtered = filterLogsWithSearch(filtered, parsedSearch, filters.minLevel)
  }

  return filtered
}

interface LogState {
  events: LogEvent[]
  filteredEvents: LogEvent[]
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  autoScroll: boolean

  // 单选
  selectedId: string | null

  // 批量选择
  selectedIds: Set<string>
  isSelectMode: boolean

  // 清屏相关
  showCurrentSessionOnly: boolean // 是否只显示本次启动的日志
  clearedBeforeTimestamp: string | null // 清屏时间戳
  sessionStartTimestamp: string | null // 会话开始时间
  currentAppSessionId: string | null // App 会话 ID

  // Filter options
  subsystems: string[]
  categories: string[]

  // Filters
  filters: Filters

  // Actions
  fetchEvents: (deviceId: string) => Promise<void>
  fetchFilterOptions: (deviceId: string) => Promise<void>
  addRealtimeEvent: (event: LogEvent) => void
  clearEvents: () => void
  setFilter: (key: string, value: unknown) => void
  setMinLevel: (level: LogLevel) => void
  setSearchQuery: (query: string) => void
  setAutoScroll: (value: boolean) => void
  applyFilters: () => void

  // 单选
  selectEvent: (id: string | null) => void

  // 批量选择
  toggleSelectMode: () => void
  toggleSelectId: (id: string) => void
  selectAll: () => void
  clearSelectedIds: () => void
  batchDelete: (deviceId: string) => Promise<void>

  // 清屏相关
  clearScreen: () => void
  setShowCurrentSessionOnly: (value: boolean) => void
  setSessionStartTimestamp: (timestamp: string) => void
  setCurrentAppSessionId: (sessionId: string | null) => void

  // 分页
  loadMore: (deviceId: string) => Promise<void>
  hasMore: () => boolean
}

export const useLogStore = create<LogState>((set, get) => ({
  events: [],
  filteredEvents: [],
  total: 0,
  page: 1,
  pageSize: 500,
  isLoading: false,
  autoScroll: true,
  selectedId: null,
  selectedIds: new Set(),
  isSelectMode: false,

  // 清屏相关
  showCurrentSessionOnly: true, // 默认只显示本次启动的日志
  clearedBeforeTimestamp: null,
  sessionStartTimestamp: null,
  currentAppSessionId: null,

  subsystems: [],
  categories: [],

  filters: {
    minLevel: 'verbose' as LogLevel,  // 默认显示所有级别
    subsystem: '',
    category: '',
    text: '',
    traceId: '',
    searchQuery: '',  // 高级搜索查询
  },

  fetchEvents: async (deviceId: string) => {
    const { pageSize, showCurrentSessionOnly, clearedBeforeTimestamp, sessionStartTimestamp } = get()
    set({ isLoading: true })

    try {
      // 从服务器获取所有日志（不带过滤），客户端过滤
      const response = await api.getLogEvents(deviceId, { pageSize })
      const { filters } = get()
      const filteredEvents = filterEvents(response.items, filters, {
        clearedBeforeTimestamp,
        showCurrentSessionOnly,
        sessionStartTimestamp,
      })
      set({
        events: response.items,
        filteredEvents,
        total: response.total,
        page: response.page,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to fetch log events:', error)
      set({ isLoading: false })
    }
  },

  fetchFilterOptions: async (deviceId: string) => {
    try {
      const [subsystems, categories] = await Promise.all([
        api.getLogSubsystems(deviceId),
        api.getLogCategories(deviceId),
      ])
      set({ subsystems, categories })
    } catch (error) {
      console.error('Failed to fetch filter options:', error)
    }
  },

  addRealtimeEvent: (event: LogEvent) => {
    set((state) => {
      // 添加到原始事件列表
      const events = [event, ...state.events].slice(0, 5000)
      // 重新过滤
      const filteredEvents = filterEvents(events, state.filters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: state.sessionStartTimestamp,
      })
      return { events, filteredEvents, total: state.total + 1 }
    })
  },

  clearEvents: () => {
    set({
      events: [],
      filteredEvents: [],
      total: 0,
      // 不重置清屏状态，保留用户的过滤设置
      // clearedBeforeTimestamp: null,
      // showCurrentSessionOnly: true,
      // sessionStartTimestamp: null,
      currentAppSessionId: null,
    })
  },

  setFilter: (key: string, value: unknown) => {
    set((state) => {
      const newFilters = { ...state.filters, [key]: value } as Filters
      const filteredEvents = filterEvents(state.events, newFilters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: state.sessionStartTimestamp,
      })
      return { filters: newFilters, filteredEvents }
    })
  },

  setMinLevel: (level: LogLevel) => {
    set((state) => {
      const newFilters = { ...state.filters, minLevel: level }
      const filteredEvents = filterEvents(state.events, newFilters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: state.sessionStartTimestamp,
      })
      return { filters: newFilters, filteredEvents }
    })
  },

  setSearchQuery: (query: string) => {
    set((state) => {
      const newFilters = { ...state.filters, searchQuery: query }
      const filteredEvents = filterEvents(state.events, newFilters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: state.sessionStartTimestamp,
      })
      return { filters: newFilters, filteredEvents }
    })
  },

  applyFilters: () => {
    set((state) => ({
      filteredEvents: filterEvents(state.events, state.filters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: state.sessionStartTimestamp,
      }),
    }))
  },

  setAutoScroll: (value: boolean) => {
    set({ autoScroll: value })
  },

  // 单选事件
  selectEvent: (id: string | null) => {
    set((state) => ({
      selectedId: state.selectedId === id ? null : id,  // 点击同一行取消选中
    }))
  },

  toggleSelectMode: () => {
    set((state) => ({
      isSelectMode: !state.isSelectMode,
      selectedIds: state.isSelectMode ? new Set() : state.selectedIds,
      selectedId: null,  // 进入/退出批量选择模式时清除单选
    }))
  },

  toggleSelectId: (id: string) => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedIds)
      if (newSelectedIds.has(id)) {
        newSelectedIds.delete(id)
      } else {
        newSelectedIds.add(id)
      }
      return { selectedIds: newSelectedIds }
    })
  },

  selectAll: () => {
    set((state) => {
      const filteredIds = new Set(state.filteredEvents.map((e) => e.id))
      const allSelected = state.selectedIds.size === filteredIds.size &&
        [...state.selectedIds].every(id => filteredIds.has(id))
      return { selectedIds: allSelected ? new Set() : filteredIds }
    })
  },

  clearSelectedIds: () => {
    set({ selectedIds: new Set() })
  },

  batchDelete: async (deviceId: string) => {
    const { selectedIds, events, filters, clearedBeforeTimestamp, showCurrentSessionOnly, sessionStartTimestamp } = get()
    if (selectedIds.size === 0) return

    try {
      await api.batchDeleteLogs(deviceId, Array.from(selectedIds))
      const newEvents = events.filter((e) => !selectedIds.has(e.id))
      set({
        events: newEvents,
        filteredEvents: filterEvents(newEvents, filters, {
          clearedBeforeTimestamp,
          showCurrentSessionOnly,
          sessionStartTimestamp,
        }),
        selectedIds: new Set(),
        total: get().total - selectedIds.size,
      })
    } catch (error) {
      console.error('Failed to batch delete logs:', error)
      throw error
    }
  },

  // 清屏：设置清屏时间戳
  clearScreen: () => {
    const timestamp = new Date().toISOString()
    set({
      clearedBeforeTimestamp: timestamp,
      filteredEvents: [],
      selectedId: null,
      selectedIds: new Set(),
    })
  },

  // 切换是否只显示本次启动的日志
  setShowCurrentSessionOnly: (value: boolean) => {
    set((state) => {
      const filteredEvents = filterEvents(state.events, state.filters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: value,
        sessionStartTimestamp: state.sessionStartTimestamp,
      })
      return { showCurrentSessionOnly: value, filteredEvents }
    })
  },

  // 设置会话开始时间
  setSessionStartTimestamp: (timestamp: string) => {
    set((state) => {
      const filteredEvents = filterEvents(state.events, state.filters, {
        clearedBeforeTimestamp: state.clearedBeforeTimestamp,
        showCurrentSessionOnly: state.showCurrentSessionOnly,
        sessionStartTimestamp: timestamp,
      })
      return { sessionStartTimestamp: timestamp, filteredEvents }
    })
  },

  setCurrentAppSessionId: (sessionId: string | null) => {
    set({ currentAppSessionId: sessionId })
  },

  loadMore: async (deviceId: string) => {
    const { pageSize, page, total, events, filters, isLoading, clearedBeforeTimestamp, showCurrentSessionOnly, sessionStartTimestamp } = get()

    // 如果正在加载或已经加载完所有数据，不再加载
    if (isLoading || events.length >= total) return

    const nextPage = page + 1
    set({ isLoading: true })

    try {
      const response = await api.getLogEvents(deviceId, { page: nextPage, pageSize })
      const newEvents = response.items
      const allEvents = [...events, ...newEvents]
      const filteredEvents = filterEvents(allEvents, filters, {
        clearedBeforeTimestamp,
        showCurrentSessionOnly,
        sessionStartTimestamp,
      })

      set({
        events: allEvents,
        filteredEvents,
        page: nextPage,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to load more log events:', error)
      set({ isLoading: false })
    }
  },

  hasMore: () => {
    const { events, total } = get()
    return events.length < total
  },
}))
