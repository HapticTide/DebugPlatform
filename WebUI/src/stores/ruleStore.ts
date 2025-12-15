import { create } from 'zustand'
import { TrafficRule, HTTPEventSummary } from '@/types'
import { api } from '@/services/api'

interface RuleStore {
  rules: TrafficRule[]
  deviceRules: TrafficRule[] // Filtered by current device (for display purposes)
  isLoading: boolean

  // Actions
  fetchRules: () => Promise<void>
  fetchDeviceRules: (deviceId: string) => Promise<void>
  createOrUpdateRule: (rule: Partial<TrafficRule>) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  deleteAllRules: () => Promise<void>

  // Helpers
  getDomainRule: (domain: string, deviceId?: string) => TrafficRule | undefined
  matchRule: (event: HTTPEventSummary, deviceId?: string) => TrafficRule | undefined
}

export const useRuleStore = create<RuleStore>((set, get) => ({
  rules: [],
  deviceRules: [],
  isLoading: false,

  fetchRules: async () => {
    set({ isLoading: true })
    try {
      const rules = await api.get<TrafficRule[]>('/api/traffic-rules')
      set({ rules })
    } catch (error) {
      console.error('Failed to fetch traffic rules', error)
    } finally {
      set({ isLoading: false })
    }
  },

  fetchDeviceRules: async (deviceId: string) => {
    set({ isLoading: true })
    try {
      // Backend API supports getting all rules (global + device) via this endpoint
      const rules = await api.get<TrafficRule[]>(`/api/devices/${deviceId}/traffic-rules`)
      set({ deviceRules: rules })
    } catch (error) {
      console.error('Failed to fetch device traffic rules', error)
    } finally {
      set({ isLoading: false })
    }
  },

  createOrUpdateRule: async (rule) => {
    try {
      const saved = await api.post<TrafficRule>('/api/traffic-rules', rule)
      set((state) => {
        // Update in global list
        let newRules = state.rules
        if (state.rules.some(r => r.id === saved.id)) {
          newRules = state.rules.map(r => (r.id === saved.id ? saved : r))
        } else {
          newRules = [saved, ...state.rules] // Newest first
        }

        // Update in device list if applicable
        let newDeviceRules = state.deviceRules
        if (state.deviceRules.some(r => r.id === saved.id)) {
          newDeviceRules = state.deviceRules.map(r => (r.id === saved.id ? saved : r))
        } else if (saved.deviceId === null || (rule.deviceId && state.deviceRules.some(r => r.deviceId === rule.deviceId))) {
          newDeviceRules = [saved, ...state.deviceRules]
        }

        return {
          rules: newRules,
          deviceRules: newDeviceRules
        }
      })
    } catch (error) {
      console.error('Failed to save traffic rule', error)
      throw error
    }
  },

  deleteRule: async (id) => {
    try {
      await api.delete(`/api/traffic-rules/${id}`)
      set((state) => ({
        rules: state.rules.filter(r => r.id !== id),
        deviceRules: state.deviceRules.filter(r => r.id !== id)
      }))
    } catch (error) {
      console.error('Failed to delete traffic rule', error)
      throw error
    }
  },

  deleteAllRules: async () => {
    try {
      await api.delete('/api/traffic-rules')
      set({ rules: [], deviceRules: [] })
    } catch (error) {
      console.error('Failed to delete all traffic rules', error)
      throw error
    }
  },

  getDomainRule: (domain: string, deviceId?: string) => {
    const { deviceRules, rules } = get()
    // Check device rules first if deviceId provided, else fall back to rules (which might be all rules or just global depending on fetch)
    const source = deviceId ? deviceRules : rules

    return source.find(r =>
      r.isEnabled &&
      r.matchType === 'domain' &&
      r.matchValue === domain &&
      (deviceId ? (r.deviceId === deviceId || r.deviceId === null) : true)
    )
  },

  matchRule: (event: HTTPEventSummary, deviceId?: string) => {
    const { deviceRules, rules } = get()
    const source = deviceId ? deviceRules : rules

    // Find first matching rule (ordered by priority desc, createdAt desc)
    // Assuming backend returns sorted, but we can sort just in case
    // source.sort((a, b) => b.priority - a.priority) 

    return source.find(r => {
      if (!r.isEnabled) return false

      if (r.matchType === 'domain') {
        try {
          const url = new URL(event.url)
          return url.hostname === r.matchValue
        } catch { return false }
      }

      if (r.matchType === 'urlRegex') {
        try {
          const regex = new RegExp(r.matchValue)
          return regex.test(event.url)
        } catch { return false }
      }

      // Header matching requires detailed event info which summary might not have fully?
      // Actually HTTPEventSummary doesn't have headers. So 'header' match type 
      // only works if we load details or if summary is extended. 
      // For now, we skip header matching on list view filtering.
      if (r.matchType === 'header') {
        return false
      }

      return false
    })
  }
}))
