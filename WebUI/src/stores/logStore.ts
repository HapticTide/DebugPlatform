import { create } from 'zustand'
import type { LogEvent, LogLevel } from '@/types'
import * as api from '@/services/api'

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
}

// 过滤逻辑
function filterEvents(events: LogEvent[], filters: Filters): LogEvent[] {
  const minPriority = LEVEL_PRIORITY[filters.minLevel]
  
  return events.filter((event) => {
    // Level 过滤: 只显示大于等于最低级别的日志
    const eventPriority = LEVEL_PRIORITY[event.level] ?? 0
    if (eventPriority < minPriority) return false

    // Subsystem 过滤
    if (filters.subsystem && event.subsystem !== filters.subsystem) return false

    // Category 过滤
    if (filters.category && event.category !== filters.category) return false

    // 文本搜索
    if (filters.text && !event.message.toLowerCase().includes(filters.text.toLowerCase())) {
      return false
    }

    // TraceId 过滤
    if (filters.traceId && event.traceId !== filters.traceId) return false

    return true
  })
}

interface LogState {
  events: LogEvent[]
  filteredEvents: LogEvent[]
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  autoScroll: boolean

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
  setAutoScroll: (value: boolean) => void
  applyFilters: () => void
}

export const useLogStore = create<LogState>((set, get) => ({
  events: [],
  filteredEvents: [],
  total: 0,
  page: 1,
  pageSize: 500,
  isLoading: false,
  autoScroll: true,

  subsystems: [],
  categories: [],

  filters: {
    minLevel: 'verbose' as LogLevel,  // 默认显示所有级别
    subsystem: '',
    category: '',
    text: '',
    traceId: '',
  },

  fetchEvents: async (deviceId: string) => {
    const { pageSize } = get()
    set({ isLoading: true })

    try {
      // 从服务器获取所有日志（不带过滤），客户端过滤
      const response = await api.getLogEvents(deviceId, { pageSize })
      const { filters } = get()
      const filteredEvents = filterEvents(response.items, filters)
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
      const filteredEvents = filterEvents(events, state.filters)
      return { events, filteredEvents, total: state.total + 1 }
    })
  },

  clearEvents: () => {
    set({ events: [], filteredEvents: [], total: 0 })
  },

  setFilter: (key: string, value: unknown) => {
    set((state) => {
      const newFilters = { ...state.filters, [key]: value } as Filters
      const filteredEvents = filterEvents(state.events, newFilters)
      return { filters: newFilters, filteredEvents }
    })
  },

  setMinLevel: (level: LogLevel) => {
    set((state) => {
      const newFilters = { ...state.filters, minLevel: level }
      const filteredEvents = filterEvents(state.events, newFilters)
      return { filters: newFilters, filteredEvents }
    })
  },

  applyFilters: () => {
    set((state) => ({
      filteredEvents: filterEvents(state.events, state.filters),
    }))
  },

  setAutoScroll: (value: boolean) => {
    set({ autoScroll: value })
  },
}))

