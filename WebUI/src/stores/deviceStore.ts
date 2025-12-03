import { create } from 'zustand'
import type { DeviceListItem, DeviceDetail } from '@/types'
import * as api from '@/services/api'
import { useHTTPStore } from './httpStore'
import { useLogStore } from './logStore'

interface DeviceState {
  devices: DeviceListItem[]
  currentDeviceId: string | null
  currentDevice: DeviceDetail | null
  isLoading: boolean
  error: string | null

  // Actions
  fetchDevices: () => Promise<void>
  selectDevice: (deviceId: string) => Promise<void>
  clearSelection: () => void
  toggleCapture: (network: boolean, log: boolean) => Promise<void>
  clearDeviceData: () => Promise<void>
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  currentDeviceId: null,
  currentDevice: null,
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    set({ isLoading: true, error: null })
    try {
      const devices = await api.getDevices()
      set({ devices, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  selectDevice: async (deviceId: string) => {
    set({ currentDeviceId: deviceId, isLoading: true, error: null })
    try {
      const detail = await api.getDevice(deviceId)
      set({ currentDevice: detail, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  clearSelection: () => {
    set({ currentDeviceId: null, currentDevice: null })
  },

  toggleCapture: async (network: boolean, log: boolean) => {
    const { currentDeviceId } = get()
    if (!currentDeviceId) return

    try {
      await api.toggleCapture(currentDeviceId, network, log)
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  clearDeviceData: async () => {
    const { currentDeviceId } = get()
    if (!currentDeviceId) return

    try {
      await api.clearDeviceData(currentDeviceId)
      // 清除前端 store 状态（包括会话分隔符）
      useHTTPStore.getState().clearEvents()
      useLogStore.getState().clearEvents()
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },
}))

