// appSession.ts
// 「仅显示本次启动」的判定

export interface AppSessionFilter {
  currentAppSessionId?: string | null
  sessionStartTimestamp?: string | null
}

/**
 * 事件是否属于设备当前这次 App 启动。
 *
 * 优先按 Hub 入库时打的 appSessionId 判：时间戳来自设备时钟，而会话开始时间取的是浏览器
 * 收到重连通知的时刻，两者不在同一时钟上；App 启动时在 Probe 连上之前发出、连上后补发的
 * 那批事件也必然早于这个时刻，按时间判会被整批藏掉。
 * 旧数据和旧版 Hub 推送没有 appSessionId，退回按时间判。
 */
export function isInCurrentSession(
  appSessionId: string | null | undefined,
  timestamp: string | null | undefined,
  filter: AppSessionFilter
): boolean {
  if (appSessionId && filter.currentAppSessionId) {
    return appSessionId === filter.currentAppSessionId
  }
  if (filter.sessionStartTimestamp && timestamp) {
    return timestamp >= filter.sessionStartTimestamp
  }
  return true
}
