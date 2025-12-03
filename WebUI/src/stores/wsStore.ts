import { create } from 'zustand'
import type { WSSessionSummary, WSSessionDetail, WSFrame } from '@/types'
import { getWSSessions, getWSSessionDetail, getWSFrames, type WSSessionFilters } from '@/services/api'

interface WSStore {
  // 会话列表
  sessions: WSSessionSummary[]
  totalSessions: number
  sessionsLoading: boolean
  sessionsError: string | null

  // 选中的会话
  selectedSessionId: string | null
  selectedSession: WSSessionDetail | null
  sessionLoading: boolean

  // 帧列表
  frames: WSFrame[]
  totalFrames: number
  framesLoading: boolean
  framesError: string | null

  // 筛选和分页
  filters: WSSessionFilters
  framePage: number
  framePageSize: number
  frameDirection: string

  // 自动滚动
  autoScroll: boolean

  // Actions
  fetchSessions: (deviceId: string) => Promise<void>
  selectSession: (deviceId: string, sessionId: string) => Promise<void>
  fetchFrames: (deviceId: string, sessionId: string) => Promise<void>
  setFilter: <K extends keyof WSSessionFilters>(key: K, value: WSSessionFilters[K]) => void
  setFrameDirection: (direction: string) => void
  loadMoreFrames: (deviceId: string, sessionId: string) => Promise<void>
  clearSelection: () => void
  clearSessions: () => void
  setAutoScroll: (enabled: boolean) => void
  addRealtimeSession: (session: WSSessionSummary) => void
  updateSessionStatus: (sessionId: string, isOpen: boolean, closeCode?: number, closeReason?: string) => void
  addRealtimeFrame: (frame: WSFrame) => void
}

export const useWSStore = create<WSStore>((set, get) => ({
  // Initial state
  sessions: [],
  totalSessions: 0,
  sessionsLoading: false,
  sessionsError: null,

  selectedSessionId: null,
  selectedSession: null,
  sessionLoading: false,

  frames: [],
  totalFrames: 0,
  framesLoading: false,
  framesError: null,

  filters: {
    page: 1,
    pageSize: 50,
  },
  framePage: 1,
  framePageSize: 100,
  frameDirection: '',

  autoScroll: true,

  // Actions
  fetchSessions: async (deviceId: string) => {
    set({ sessionsLoading: true, sessionsError: null })
    try {
      const response = await getWSSessions(deviceId, get().filters)
      set({
        sessions: response.items,
        totalSessions: response.total,
        sessionsLoading: false,
      })
    } catch (error) {
      set({
        sessionsLoading: false,
        sessionsError: error instanceof Error ? error.message : '加载失败',
      })
    }
  },

  selectSession: async (deviceId: string, sessionId: string) => {
    set({ selectedSessionId: sessionId, sessionLoading: true, frames: [], totalFrames: 0 })
    try {
      const [detail] = await Promise.all([
        getWSSessionDetail(deviceId, sessionId),
        get().fetchFrames(deviceId, sessionId),
      ])
      set({ selectedSession: detail, sessionLoading: false })
    } catch (error) {
      set({ sessionLoading: false })
    }
  },

  fetchFrames: async (deviceId: string, sessionId: string) => {
    set({ framesLoading: true, framesError: null, framePage: 1 })
    try {
      const response = await getWSFrames(deviceId, sessionId, {
        page: 1,
        pageSize: get().framePageSize,
        direction: get().frameDirection || undefined,
      })
      set({
        frames: response.items,
        totalFrames: response.total,
        framesLoading: false,
      })
    } catch (error) {
      set({
        framesLoading: false,
        framesError: error instanceof Error ? error.message : '加载失败',
      })
    }
  },

  loadMoreFrames: async (deviceId: string, sessionId: string) => {
    const { framePage, framePageSize, frames, totalFrames } = get()
    if (frames.length >= totalFrames) return

    set({ framesLoading: true })
    try {
      const response = await getWSFrames(deviceId, sessionId, {
        page: framePage + 1,
        pageSize: framePageSize,
        direction: get().frameDirection || undefined,
      })
      set({
        frames: [...frames, ...response.items],
        framePage: framePage + 1,
        framesLoading: false,
      })
    } catch (error) {
      set({ framesLoading: false })
    }
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }))
  },

  setFrameDirection: (direction: string) => {
    set({ frameDirection: direction })
  },

  clearSelection: () => {
    set({
      selectedSessionId: null,
      selectedSession: null,
      frames: [],
      totalFrames: 0,
    })
  },

  clearSessions: () => {
    set({
      sessions: [],
      totalSessions: 0,
      selectedSessionId: null,
      selectedSession: null,
      frames: [],
      totalFrames: 0,
    })
  },

  setAutoScroll: (enabled: boolean) => {
    set({ autoScroll: enabled })
  },

  addRealtimeSession: (session: WSSessionSummary) => {
    set((state) => ({
      sessions: [session, ...state.sessions],
      totalSessions: state.totalSessions + 1,
    }))
  },

  updateSessionStatus: (sessionId: string, isOpen: boolean, closeCode?: number, closeReason?: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, isOpen, closeCode: closeCode ?? s.closeCode, closeReason: closeReason ?? s.closeReason }
          : s
      ),
      selectedSession:
        state.selectedSession?.id === sessionId
          ? { ...state.selectedSession, closeCode: closeCode ?? null, closeReason: closeReason ?? null }
          : state.selectedSession,
    }))
  },

  addRealtimeFrame: (frame: WSFrame & { sessionId?: string }) => {
    const { selectedSessionId } = get()
    // 只有当前选中的会话的帧才添加到列表
    if (frame.sessionId === selectedSessionId) {
      set((state) => ({
        frames: [...state.frames, frame],
        totalFrames: state.totalFrames + 1,
      }))
    }
  },
}))
