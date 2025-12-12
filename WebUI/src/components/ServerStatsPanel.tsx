import { useEffect, useState } from 'react'
import { getServerStats, truncateAllData } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'
import { useRuleStore } from '@/stores/ruleStore'
import { useHTTPStore } from '@/stores/httpStore'
import { useLogStore } from '@/stores/logStore'
import { useWSStore } from '@/stores/wsStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { TokenConfirmDialog } from './TokenConfirmDialog'
import type { ServerStats } from '@/types'
import {
  HttpIcon,
  LogIcon,
  WebSocketIcon,
  FileTextIcon,
  MockIcon,
  BreakpointIcon,
  ChaosIcon,
  TrafficLightIcon,
  IPhoneIcon,
  ClockIcon,
  DatabaseIcon,
  ChevronDownIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ClearIcon,
  PerformanceIcon,
  AlertIcon
} from './icons'

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-'
  if (bytes === 0) return '0 B'
  if (isNaN(bytes)) return '-'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  // 确保索引不超出数组范围
  const sizeIndex = Math.min(i, sizes.length - 1)

  return parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(1)) + ' ' + sizes[sizeIndex]
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function ServerStatsPanel() {
  const [stats, setStats] = useState<ServerStats | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showTruncateDialog, setShowTruncateDialog] = useState(false)
  const [isTruncating, setIsTruncating] = useState(false)
  const toast = useToastStore()

  // Traffic Rule store for refreshing after truncate
  const { fetchRules } = useRuleStore()

  // Data stores for clearing client-side data
  const httpStore = useHTTPStore()
  const logStore = useLogStore()
  const wsStore = useWSStore()
  const performanceStore = usePerformanceStore()

  const fetchStats = async () => {
    setIsLoading(true)
    try {
      const data = await getServerStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch server stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTruncateAll = async () => {
    setIsTruncating(true)
    try {
      await truncateAllData()

      // 清空客户端 store 数据
      httpStore.clearEvents()
      logStore.clearEvents()
      wsStore.clearSessions()
      performanceStore.clearData()

      toast.show('success', '已清空所有数据')
      setShowTruncateDialog(false)
      // 刷新统计和流量规则状态
      await Promise.all([
        fetchStats(),
        fetchRules(),
      ])
    } catch (error) {
      toast.show('error', '清空数据失败: ' + (error instanceof Error ? error.message : '未知错误'))
    } finally {
      setIsTruncating(false)
    }
  }

  useEffect(() => {
    fetchStats()
    // 每 30 秒刷新一次
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  if (!stats) {
    return null
  }

  const StatRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-text-muted flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  )

  return (
    <div className="border-t border-border">
      {/* Header - clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-bg-light transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChartBarIcon size={14} />
          <span className="text-xs font-medium text-text-primary">数据统计</span>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && stats && (
            <span className="text-xs text-text-muted">
              {formatNumber(stats.httpEventCount)} HTTP · {formatNumber(stats.logEventCount)} Log
            </span>
          )}
          <span className={`text-xs text-text-muted transition-transform ${isExpanded ? '' : 'rotate-180'}`}>
            <ChevronDownIcon size={12} />
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-3 text-xs space-y-0.5">
          {/* 数据统计 */}
          <div className="text-text-muted/60 text-2xs uppercase tracking-wider mt-1 mb-1">数据记录</div>
          <StatRow icon={<HttpIcon size={12} />} label="HTTP 事件" value={formatNumber(stats.httpEventCount)} />
          <StatRow icon={<LogIcon size={12} />} label="日志条目" value={formatNumber(stats.logEventCount)} />
          <StatRow icon={<WebSocketIcon size={12} />} label="WS 会话" value={formatNumber(stats.wsSessionCount)} />
          <StatRow icon={<FileTextIcon size={12} />} label="WS 帧" value={formatNumber(stats.wsFrameCount)} />

          {/* 性能统计 */}
          <div className="text-text-muted/60 text-2xs uppercase tracking-wider mt-2 mb-1">性能监控</div>
          <StatRow icon={<PerformanceIcon size={12} />} label="性能数据" value={formatNumber(stats.perfMetricsCount)} />
          <StatRow icon={<PerformanceIcon size={12} />} label="卡顿事件" value={formatNumber(stats.jankEventCount)} />
          <StatRow icon={<AlertIcon size={12} />} label="告警记录" value={formatNumber(stats.alertCount)} />

          {/* 规则统计 */}
          <div className="text-text-muted/60 text-2xs uppercase tracking-wider mt-2 mb-1">规则配置</div>
          <StatRow icon={<MockIcon size={12} />} label="Mock 规则" value={stats.mockRuleCount} />
          <StatRow icon={<BreakpointIcon size={12} />} label="断点规则" value={stats.breakpointRuleCount} />
          <StatRow icon={<ChaosIcon size={12} />} label="故障注入规则" value={stats.chaosRuleCount} />
          <StatRow icon={<TrafficLightIcon size={12} />} label="流量规则" value={stats.trafficRuleCount} />

          {/* 设备统计 */}
          <div className="text-text-muted/60 text-2xs uppercase tracking-wider mt-2 mb-1">设备连接</div>
          <StatRow icon={<IPhoneIcon size={12} />} label="在线设备" value={stats.onlineDeviceCount} />
          <StatRow icon={<ClockIcon size={12} />} label="历史会话" value={stats.deviceSessionCount} />

          {/* 数据库大小 + 清空按钮 */}
          {stats.databaseSizeBytes !== null && (
            <>
              <div className="text-text-muted/60 text-2xs uppercase tracking-wider mt-2 mb-1">存储</div>
              <div className="flex justify-between items-center py-1">
                <span className="text-text-muted flex items-center gap-1.5">
                  <DatabaseIcon size={12} />
                  数据库大小
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-primary">{formatBytes(stats.databaseSizeBytes)}</span>
                  <button
                    onClick={() => setShowTruncateDialog(true)}
                    className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="清空所有数据"
                  >
                    <ClearIcon size={12} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 刷新按钮 */}
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="mt-2 w-full py-1.5 text-center text-xs text-text-muted hover:text-text-primary hover:bg-bg-light rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {isLoading ? '刷新中...' : <><ArrowPathIcon size={12} /> 刷新统计</>}
          </button>
        </div>
      )}

      {/* Token 验证确认对话框 */}
      <TokenConfirmDialog
        isOpen={showTruncateDialog}
        onClose={() => setShowTruncateDialog(false)}
        onConfirm={handleTruncateAll}
        title="清空所有数据"
        message={`此操作将永久删除数据库中的所有数据，包括：
• HTTP 请求记录
• 日志条目
• WebSocket 会话和帧
• Mock/断点/故障注入规则
• 流量规则

此操作不可逆，请确认您已备份重要数据。`}
        confirmText="确认清空"
        loading={isTruncating}
      />
    </div>
  )
}
