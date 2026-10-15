import { describe, expect, it } from 'vitest'
import { isInCurrentSession } from './appSession'

describe('isInCurrentSession', () => {
  const filter = {
    currentAppSessionId: 'launch-2',
    sessionStartTimestamp: '2026-10-15T02:23:25.050Z',
  }

  it('同一启动会话里、早于浏览器收到重连通知时刻的启动请求仍算本次', () => {
    expect(isInCurrentSession('launch-2', '2026-10-15T02:23:24.195Z', filter)).toBe(true)
  })

  it('设备时钟被调到未来的上次启动记录不算本次', () => {
    expect(isInCurrentSession('launch-1', '2026-11-01T06:10:11.642Z', filter)).toBe(false)
  })

  it('没有 appSessionId 的旧数据退回按时间判', () => {
    expect(isInCurrentSession(null, '2026-10-15T02:23:24.195Z', filter)).toBe(false)
    expect(isInCurrentSession(undefined, '2026-10-15T02:23:26.000Z', filter)).toBe(true)
  })

  it('还不知道当前会话时退回按时间判', () => {
    const noSession = { sessionStartTimestamp: filter.sessionStartTimestamp }
    expect(isInCurrentSession('launch-1', '2026-10-15T02:23:24.195Z', noSession)).toBe(false)
  })
})
