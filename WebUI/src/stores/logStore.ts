import { create } from 'zustand'
import type { LogEvent, LogLevel } from '@/types'
import * as api from '@/services/api'

interface Filters {
  levels: LogLevel[]
  subsystem: string
  category: string
  text: string
  traceId: string
}

// 过滤逻辑
function filterEvents(events: LogEvent[], filters: Filters): LogEvent[] {
  return events.filter((event) => {
    // Level 过滤
    if (!filters.levels.includes(event.level)) return false

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
  toggleLevel: (level: LogLevel) => void
  setAutoScroll: (value: boolean) => void
  applyFilters: () => void
}

const ALL_LEVELS: LogLevel[] = ['debug', 'info', 'warning', 'error', 'fault']

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
    levels: [...ALL_LEVELS],
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

  toggleLevel: (level: LogLevel) => {
    set((state) => {
      const levels = state.filters.levels.includes(level)
        ? state.filters.levels.filter((l) => l !== level)
        : [...state.filters.levels, level]
      const newFilters = { ...state.filters, levels }
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

