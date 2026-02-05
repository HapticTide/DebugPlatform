import { useMemo } from 'react'
import type { HTTPEventSummary } from '@/types'

export interface RedirectChainMeta {
  index: number
  total: number
  rootId: string
  prevId?: string
  nextId?: string
  chainIds: string[]
}

interface RedirectChainResult {
  chainMap: Map<string, RedirectChainMeta>
  redirectNextMap: Map<string, string>
  eventMap: Map<string, HTTPEventSummary>
}

export function useRedirectChain(events: HTTPEventSummary[]): RedirectChainResult {
  return useMemo(() => {
    const eventMap = new Map<string, HTTPEventSummary>()
    const redirectNextMap = new Map<string, string>()
    const redirectPrevMap = new Map<string, string>()

    for (const event of events) {
      eventMap.set(event.id, event)
      if (event.redirectFromId) {
        redirectNextMap.set(event.redirectFromId, event.id)
        redirectPrevMap.set(event.id, event.redirectFromId)
      }
    }

    const eventsByUrl = new Map<string, HTTPEventSummary[]>()
    const eventsBySeq = [...events]
      .filter((event) => typeof event.seqNum === 'number')
      .sort((a, b) => a.seqNum - b.seqNum)

    for (const event of eventsBySeq) {
      const list = eventsByUrl.get(event.url)
      if (list) {
        list.push(event)
      } else {
        eventsByUrl.set(event.url, [event])
      }
    }

    const maxRedirectGapMs = 5000
    const parseTime = (value: string | undefined | null) => {
      if (!value) return null
      const time = Date.parse(value)
      return Number.isNaN(time) ? null : time
    }

    for (const event of eventsBySeq) {
      if (redirectNextMap.has(event.id)) continue
      if (!event.redirectToUrl) continue
      if (!event.statusCode || event.statusCode < 300 || event.statusCode >= 400) continue

      const candidates = eventsByUrl.get(event.redirectToUrl)
      if (!candidates || candidates.length === 0) continue

      const sourceSeq = event.seqNum ?? 0
      const sourceTime = parseTime(event.startTime)
      let target: HTTPEventSummary | null = null
      for (const candidate of candidates) {
        if ((candidate.seqNum ?? 0) <= sourceSeq) continue
        if (redirectPrevMap.has(candidate.id)) continue

        if (sourceTime) {
          const candidateTime = parseTime(candidate.startTime)
          if (candidateTime && candidateTime - sourceTime > maxRedirectGapMs) {
            break
          }
        }

        target = candidate
        break
      }

      if (target) {
        redirectNextMap.set(event.id, target.id)
        redirectPrevMap.set(target.id, event.id)
      }
    }

    const chainMap = new Map<string, RedirectChainMeta>()

    const buildChain = (startId: string): string[] => {
      const chain: string[] = []
      const visited = new Set<string>()
      let current: string | undefined = startId
      while (current && !visited.has(current)) {
        visited.add(current)
        chain.push(current)
        const nextId = redirectNextMap.get(current)
        if (!nextId) break
        current = nextId
      }
      return chain
    }

    const resolveRoot = (eventId: string): string => {
      const visited = new Set<string>()
      let current = eventId
      while (true) {
        if (visited.has(current)) break
        visited.add(current)
        const prevId = redirectPrevMap.get(current) ?? eventMap.get(current)?.redirectFromId
        if (!prevId || !eventMap.has(prevId)) break
        current = prevId
      }
      return current
    }

    const assignChain = (chain: string[]) => {
      chain.forEach((id, index) => {
        if (chainMap.has(id)) return
        chainMap.set(id, {
          index: index + 1,
          total: chain.length,
          rootId: chain[0],
          prevId: index > 0 ? chain[index - 1] : undefined,
          nextId: index < chain.length - 1 ? chain[index + 1] : undefined,
          chainIds: chain,
        })
      })
    }

    // 先处理没有上一跳的请求作为链路起点
    for (const event of events) {
      const hasPrev = Boolean(event.redirectFromId && eventMap.has(event.redirectFromId))
      if (!hasPrev) {
        const chain = buildChain(event.id)
        if (chain.length > 0) {
          assignChain(chain)
        }
      }
    }

    // 补全剩余未归档的链路
    for (const event of events) {
      if (chainMap.has(event.id)) continue
      const rootId = resolveRoot(event.id)
      const chain = buildChain(rootId)
      if (chain.length > 0) {
        assignChain(chain)
      }
    }

    // 兜底：仍未设置的事件，按单节点处理
    for (const event of events) {
      if (chainMap.has(event.id)) continue
      chainMap.set(event.id, {
        index: 1,
        total: 1,
        rootId: event.id,
        prevId: redirectPrevMap.get(event.id) ?? event.redirectFromId ?? undefined,
        nextId: redirectNextMap.get(event.id),
        chainIds: [event.id],
      })
    }

    return { chainMap, redirectNextMap, eventMap }
  }, [events])
}
