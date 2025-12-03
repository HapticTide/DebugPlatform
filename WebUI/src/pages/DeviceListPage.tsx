import { useEffect } from 'react'
import { useDeviceStore } from '@/stores/deviceStore'
import { DeviceCard } from '@/components/DeviceCard'

export function DeviceListPage() {
  const { devices, isLoading, fetchDevices } = useDeviceStore()
  const onlineCount = devices.filter(d => d.isOnline).length

  useEffect(() => {
    fetchDevices()

    // 定期刷新设备列表
    const interval = setInterval(fetchDevices, 5000)
    return () => clearInterval(interval)
  }, [fetchDevices])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-5 bg-bg-dark/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent">
              设备列表
            </h1>
            <p className="text-sm text-text-muted mt-1">
              管理已连接的调试设备 · {onlineCount} 在线 / {devices.length} 总计
            </p>
          </div>
          <button
            onClick={fetchDevices}
            disabled={isLoading}
            className="btn btn-primary disabled:opacity-50"
          >
            <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
            <span>刷新</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {devices.map((device, index) => (
              <DeviceCard 
                key={device.deviceId} 
                device={device} 
                style={{ animationDelay: `${index * 50}ms` }}
              />
            ))}
          </div>
        ) : (
          <EmptyState isLoading={isLoading} />
        )}
      </div>
    </div>
  )
}

function EmptyState({ isLoading }: { isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="glass-card p-12 text-center max-w-md">
        {isLoading ? (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-light animate-pulse" />
            <div className="h-6 bg-bg-light rounded w-48 mx-auto mb-3 animate-pulse" />
            <div className="h-4 bg-bg-light rounded w-64 mx-auto animate-pulse" />
          </>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-bg-light flex items-center justify-center">
              <span className="text-4xl opacity-50">📱</span>
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              暂无在线设备
            </h2>
            <p className="text-sm text-text-muted mb-6">
              请确保 iOS App 已集成 DebugProbe 并连接到 Debug Hub
            </p>
            <div className="text-left bg-bg-medium rounded-xl p-4 text-xs font-mono text-text-secondary overflow-x-auto">
              <p className="text-text-muted mb-2">// 在 AppDelegate 中初始化</p>
              <p><span className="text-purple-400">let</span> config = <span className="text-primary">DebugProbe.Configuration</span>(</p>
              <p className="pl-4">hubURL: <span className="text-green-400">"ws://{'<'}host{'>'}:8080/debug-bridge"</span></p>
              <p>)</p>
              <p className="mt-1"><span className="text-primary">DebugProbe</span>.shared.start(configuration: config)</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
