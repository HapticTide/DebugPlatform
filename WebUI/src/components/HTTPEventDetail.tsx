import { useEffect, useMemo, useState } from 'react'
import type { HTTPEventDetail as HTTPEventDetailType, HTTPEventSummary, MockRule } from '@/types'
import {
  formatDuration,
  formatBytes,
  getStatusClass,
  getMethodClass,
  getDurationClass,
  getDurationBarClass,
  formatProtocolName,
} from '@/utils/format'
import { copyToClipboard } from '@/utils/clipboard'
import { getHTTPEventCurl, replayHTTPEvent, getHTTPEventDetail } from '@/services/api'
import { JSONViewer } from './JSONTree'
import { TimingWaterfall } from './TimingWaterfall'
import { ImagePreview, isImageContentType } from './ImagePreview'
import { ProtobufViewer, isProtobufContentType } from './ProtobufViewer'
import { MockRulePopover } from './MockRulePopover'
import { useFavoriteUrlStore } from '@/stores/favoriteUrlStore'
import { useHTTPStore } from '@/stores/httpStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { useRedirectChain } from '@/hooks/useRedirectChain'
import { formatErrorCategory } from '@/utils/httpEvent'
import clsx from 'clsx'
import { MockIcon, ClipboardIcon, CheckIcon, ArrowPathIcon, RefreshIcon, ChevronDownIcon, ChevronRightIcon } from './icons'
import { BinaryPreview } from './BinaryPreview'
import {
  decodeBodyForDisplay,
  getHeaderValue,
  parseContentDispositionFilename,
  type BodyDisplayResult,
} from '@/utils/httpBody'
import { BuiltinPluginId } from '@/plugins/types'
import { PluginRegistry } from '@/plugins/PluginRegistry'

/** 解析 URL 获取域名和路径 */
function parseUrlParts(url: string): { domain: string; path: string; query: string } {
  try {
    const urlObj = new URL(url)
    return {
      domain: urlObj.host,
      path: urlObj.pathname || '/',
      query: urlObj.search || ''
    }
  } catch {
    // 如果 URL 解析失败，返回原始 URL
    return { domain: '', path: url, query: '' }
  }
}

interface Props {
  event: HTTPEventDetailType | null
  deviceId: string
  onShowRelatedLogs?: (traceId: string) => void
  onFavoriteChange?: (eventId: string, isFavorite: boolean) => void
  /** Mock 规则列表，用于点击 Mock 标记时显示匹配的规则 */
  mockRules?: MockRule[]
  /** 点击编辑 Mock 规则 */
  onEditMockRule?: (rule: MockRule) => void
  /** 基于当前请求创建 Mock 规则 */
  onCreateMockFromRequest?: (url: string, method: string, responseBody?: string, responseHeaders?: Record<string, string>) => void
}

export function HTTPEventDetail({
  event,
  deviceId,
  onShowRelatedLogs,
  onFavoriteChange,
  mockRules = [],
  onEditMockRule,
  onCreateMockFromRequest,
}: Props) {
  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'timing' | 'diff'>('response')
  const [curlCommand, setCurlCommand] = useState<string | null>(null)
  const [curlLoading, setCurlLoading] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)
  const [replayStatus, setReplayStatus] = useState<string | null>(null)
  const [urlCopied, setUrlCopied] = useState(false)
  const [domainCopied, setDomainCopied] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [responseBodyCopied, setResponseBodyCopied] = useState(false)
  const [requestBodyCopied, setRequestBodyCopied] = useState(false)
  const [queryExpanded, setQueryExpanded] = useState(false)
  const [decodedRequest, setDecodedRequest] = useState<BodyDisplayResult | null>(null)
  const [decodedResponse, setDecodedResponse] = useState<BodyDisplayResult | null>(null)
  const [isDecodingRequest, setIsDecodingRequest] = useState(false)
  const [isDecodingResponse, setIsDecodingResponse] = useState(false)
  const [diffTarget, setDiffTarget] = useState<'prev' | 'next'>('prev')
  const [compareDetail, setCompareDetail] = useState<HTTPEventDetailType | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [, forceUpdate] = useState({})

  // 使用 URL 级别的收藏状态
  const { isFavorite: isUrlFavorite, toggleFavorite: toggleUrlFavorite } = useFavoriteUrlStore()
  const isFavorite = event ? isUrlFavorite(deviceId, event.url) : false

  useEffect(() => {
    return PluginRegistry.subscribe(() => forceUpdate({}))
  }, [forceUpdate])

  const isMockPluginEnabledOnDevice = useDeviceStore((state) => state.isPluginEnabled(BuiltinPluginId.MOCK))
  const isMockPluginEnabled = PluginRegistry.isPluginEnabled(BuiltinPluginId.MOCK) && isMockPluginEnabledOnDevice

  const httpEvents = useHTTPStore((state) => state.events)
  const { chainMap, eventMap } = useRedirectChain(httpEvents)
  const chainMeta = event ? chainMap.get(event.id) : undefined

  const maxDurationMs = useMemo(() => {
    let max = 0
    for (const item of httpEvents) {
      if (typeof item.duration === 'number') {
        const value = item.duration * 1000
        if (value > max) max = value
      }
    }
    return max
  }, [httpEvents])

  const finalEventSummary = useMemo(() => {
    if (!event) return null
    const chainIds = chainMeta?.chainIds
    if (chainIds && chainIds.length > 0) {
      const finalId = chainIds[chainIds.length - 1]
      return eventMap.get(finalId) ?? null
    }
    return eventMap.get(event.id) ?? null
  }, [event, chainMeta, eventMap])

  const chainDuration = useMemo(() => {
    if (!event) return null
    const chainIds = chainMeta?.chainIds
    if (!chainIds || chainIds.length === 0) return event.duration ?? null
    let total = 0
    let hasValue = false
    for (const id of chainIds) {
      const duration = eventMap.get(id)?.duration
      if (typeof duration === 'number') {
        total += duration
        hasValue = true
      }
    }
    return hasValue ? total : null
  }, [event, chainMeta, eventMap])

  const hasDiff = Boolean(chainMeta?.prevId || chainMeta?.nextId)
  const compareId = diffTarget === 'prev' ? chainMeta?.prevId : chainMeta?.nextId
  const compareSummary = useMemo(
    () => (compareId ? eventMap.get(compareId) ?? null : null),
    [compareId, eventMap]
  )

  useEffect(() => {
    if (!chainMeta) return
    if (diffTarget === 'prev' && !chainMeta.prevId && chainMeta.nextId) {
      setDiffTarget('next')
    }
    if (diffTarget === 'next' && !chainMeta.nextId && chainMeta.prevId) {
      setDiffTarget('prev')
    }
  }, [chainMeta, diffTarget])

  useEffect(() => {
    if (activeTab === 'diff' && !hasDiff) {
      setActiveTab('response')
    }
  }, [activeTab, hasDiff])

  useEffect(() => {
    setCompareDetail(null)
    setCompareError(null)
    setCompareLoading(false)
  }, [event?.id])

  useEffect(() => {
    setCompareDetail(null)
    setCompareError(null)
  }, [compareId])

  useEffect(() => {
    if (activeTab !== 'diff' || !compareId) return
    if (compareDetail?.id === compareId) return
    let cancelled = false
    setCompareLoading(true)
    setCompareError(null)
    getHTTPEventDetail(deviceId, compareId)
      .then((detail: HTTPEventDetailType) => {
        if (!cancelled) setCompareDetail(detail)
      })
      .catch(() => {
        if (!cancelled) setCompareError('加载失败')
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, compareId, deviceId, compareDetail?.id])

  const requestRawForCopy = useMemo(() => {
    if (decodedRequest?.kind !== 'text' || !decodedRequest.text) return ''
    try {
      return JSON.stringify(JSON.parse(decodedRequest.text), null, 2)
    } catch {
      return decodedRequest.text
    }
  }, [decodedRequest])
  const responseRawForCopy = useMemo(() => {
    if (decodedResponse?.kind !== 'text' || !decodedResponse.text) return ''
    try {
      return JSON.stringify(JSON.parse(decodedResponse.text), null, 2)
    } catch {
      return decodedResponse.text
    }
  }, [decodedResponse])

  // 检查响应内容类型
  const responseContentType = getHeaderValue(event?.responseHeaders ?? null, 'content-type')
  const responseContentEncoding = getHeaderValue(event?.responseHeaders ?? null, 'content-encoding')
  const hasResponseEncoding = Boolean(
    responseContentEncoding && responseContentEncoding.toLowerCase() !== 'identity'
  )
  const responseFilename = parseContentDispositionFilename(
    getHeaderValue(event?.responseHeaders ?? null, 'content-disposition')
  )
  const isImageResponse = isImageContentType(responseContentType)
  const isProtobufResponse = isProtobufContentType(responseContentType)
  const canPreviewImageResponse = isImageResponse && !hasResponseEncoding
  const canPreviewProtobufResponse = isProtobufResponse && !hasResponseEncoding
  const isResponsePending = Boolean(
    event?.responseBody && !canPreviewImageResponse && !canPreviewProtobufResponse && !decodedResponse && !isDecodingResponse
  )

  // 检查请求内容类型
  const requestContentType = getHeaderValue(event?.requestHeaders ?? null, 'content-type')
  const requestContentEncoding = getHeaderValue(event?.requestHeaders ?? null, 'content-encoding')
  const isProtobufRequest = isProtobufContentType(requestContentType)
  const isRequestPending = Boolean(
    event?.requestBody && !isProtobufRequest && !decodedRequest && !isDecodingRequest
  )

  useEffect(() => {
    let cancelled = false
    if (!event?.requestBody || isProtobufRequest) {
      setDecodedRequest(null)
      setIsDecodingRequest(false)
      return
    }
    setDecodedRequest(null)
    setIsDecodingRequest(true)
    decodeBodyForDisplay(event.requestBody, event.requestHeaders, {
      contentType: requestContentType,
    })
      .then((result) => {
        if (!cancelled) setDecodedRequest(result)
      })
      .finally(() => {
        if (!cancelled) setIsDecodingRequest(false)
      })
    return () => {
      cancelled = true
    }
  }, [event?.requestBody, event?.requestHeaders, requestContentType, requestContentEncoding, isProtobufRequest])

  useEffect(() => {
    setQueryExpanded(false)
    setCurlCommand(null)
    setCurlCopied(false)
  }, [event?.id])

  useEffect(() => {
    let cancelled = false
    if (!event?.responseBody || canPreviewImageResponse || canPreviewProtobufResponse) {
      setDecodedResponse(null)
      setIsDecodingResponse(false)
      return
    }
    setDecodedResponse(null)
    setIsDecodingResponse(true)
    decodeBodyForDisplay(event.responseBody, event.responseHeaders, {
      contentType: responseContentType,
    })
      .then((result) => {
        if (!cancelled) setDecodedResponse(result)
      })
      .finally(() => {
        if (!cancelled) setIsDecodingResponse(false)
      })
    return () => {
      cancelled = true
    }
  }, [event?.responseBody, event?.responseHeaders, responseContentType, responseContentEncoding, canPreviewImageResponse, canPreviewProtobufResponse])

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <span className="text-4xl mb-3 opacity-50">👈</span>
        <p className="text-sm">选择一个请求查看详情</p>
      </div>
    )
  }

  const handleCopyCurl = async () => {
    if (curlCommand) {
      await copyToClipboard(curlCommand)
      setCurlCopied(true)
      setTimeout(() => setCurlCopied(false), 2000)
      return
    }

    setCurlLoading(true)
    try {
      const response = await getHTTPEventCurl(deviceId, event.id)
      setCurlCommand(response.curl)
      await copyToClipboard(response.curl)
      setCurlCopied(true)
      setTimeout(() => setCurlCopied(false), 2000)
    } catch (error) {
      console.error('Failed to generate cURL:', error)
    } finally {
      setCurlLoading(false)
    }
  }

  const handleReplay = async () => {
    setReplayStatus('发送中...')
    try {
      const response = await replayHTTPEvent(deviceId, event.id)
      setReplayStatus(response.success ? '✓ 已发送' : '✗ 失败')
      setTimeout(() => setReplayStatus(null), 3000)
    } catch {
      setReplayStatus('✗ 失败')
      setTimeout(() => setReplayStatus(null), 3000)
    }
  }

  const handleToggleFavorite = () => {
    if (!event) return
    const newState = toggleUrlFavorite(deviceId, event.url)
    onFavoriteChange?.(event.id, newState)
  }

  const handleCopyUrl = async () => {
    await copyToClipboard(event.url)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }

  const handleCopyDomain = async () => {
    const { domain } = parseUrlParts(event.url)
    if (domain) {
      await copyToClipboard(domain)
      setDomainCopied(true)
      setTimeout(() => setDomainCopied(false), 2000)
    }
  }

  const handleCopyPath = async () => {
    const { path } = parseUrlParts(event.url)
    if (path) {
      await copyToClipboard(path)
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 2000)
    }
  }

  const handleCopyResponseBody = async () => {
    if (!responseRawForCopy) return
    await copyToClipboard(responseRawForCopy)
    setResponseBodyCopied(true)
    setTimeout(() => setResponseBodyCopied(false), 2000)
  }

  const handleCopyRequestBody = async () => {
    if (!requestRawForCopy) return
    await copyToClipboard(requestRawForCopy)
    setRequestBodyCopied(true)
    setTimeout(() => setRequestBodyCopied(false), 2000)
  }

  // 解析 URL 获取域名和路径
  const urlParts = parseUrlParts(event.url)
  const queryEntries = (() => {
    const entries = Object.entries(event.queryItems ?? {})
    if (entries.length > 0) return entries
    if (!urlParts.query) return []
    const params = new URLSearchParams(urlParts.query.startsWith('?') ? urlParts.query.slice(1) : urlParts.query)
    return Array.from(params.entries())
  })()
  const queryCount = queryEntries.length
  const chainLabel = chainMeta && chainMeta.total > 1 ? `${chainMeta.index}/${chainMeta.total}` : null
  const finalStatusCode = finalEventSummary?.statusCode ?? event.statusCode
  const resolveRedirectUrl = (location: string | null, baseUrl: string): string | null => {
    if (!location) return null
    const trimmed = location.trim()
    if (!trimmed) return null
    try {
      return new URL(trimmed, baseUrl).toString()
    } catch {
      return trimmed
    }
  }
  const locationFromHeaders = resolveRedirectUrl(
    getHeaderValue(event.responseHeaders ?? null, 'Location'),
    event.url
  )
  const redirectTargetUrl = resolveRedirectUrl(event.redirectToUrl, event.url) ?? locationFromHeaders
  const hasChain = Boolean(chainMeta && chainMeta.total > 1)
  const finalUrlCandidate = finalEventSummary?.url ?? event.url
  const finalUrl = redirectTargetUrl && (finalUrlCandidate === event.url || !hasChain)
    ? redirectTargetUrl
    : (finalEventSummary?.url ?? redirectTargetUrl ?? event.url)
  const chainDurationLabel = chainMeta && chainMeta.total > 1
    ? formatDuration(chainDuration)
    : formatDuration(event.duration)
  const errorMessage = event.error?.message ?? event.errorDescription

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 bg-bg-dark border-b border-border">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-text-muted shrink-0">域名</span>
              <span
                className="text-sm font-mono text-text-primary truncate max-w-[260px]"
                title={urlParts.domain || '-'}
              >
                {urlParts.domain || '-'}
              </span>
              <span className="text-xs text-text-muted shrink-0">路径</span>
              <span
                className="text-sm font-mono text-text-primary truncate flex-1"
                title={urlParts.path || '/'}
              >
                {urlParts.path || '/'}
              </span>
              {queryCount > 0 && (
                <button
                  type="button"
                  onClick={() => setQueryExpanded((prev) => !prev)}
                  className={clsx(
                    "text-xs font-mono shrink-0 whitespace-nowrap underline decoration-dotted underline-offset-4 transition-colors",
                    queryExpanded ? "text-primary" : "text-text-muted hover:text-text-primary"
                  )}
                  title={queryExpanded ? "收起查询参数" : "展开查询参数"}
                  aria-expanded={queryExpanded}
                >
                  参数 +{queryCount}
                </button>
              )}
            </div>

            <div className="mt-2">
              <div className="h-px bg-border-subtle" />
              <div className="flex flex-wrap items-center gap-2 text-xs pt-2">
                <button
                  onClick={handleCopyUrl}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-bg-light border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-lighter transition-colors leading-none whitespace-nowrap"
                  title="复制完整 URL"
                >
                  {urlCopied ? <CheckIcon size={12} /> : <ClipboardIcon size={12} />}
                  <span>{urlCopied ? '已复制 URL' : '复制 URL'}</span>
                </button>
                <button
                  onClick={handleCopyDomain}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-bg-light border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-lighter transition-colors leading-none whitespace-nowrap max-w-[240px]"
                  title={urlParts.domain || '域名'}
                >
                  {domainCopied ? <CheckIcon size={12} className="shrink-0" /> : <ClipboardIcon size={12} className="shrink-0" />}
                  <span className="text-text-muted shrink-0 whitespace-nowrap">域名</span>
                  <span className="font-mono text-text-primary truncate min-w-0">{urlParts.domain || '-'}</span>
                </button>
                <button
                  onClick={handleCopyPath}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-bg-light border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-lighter transition-colors leading-none whitespace-nowrap max-w-[320px]"
                  title={urlParts.path || '路径'}
                >
                  {pathCopied ? <CheckIcon size={12} className="shrink-0" /> : <ClipboardIcon size={12} className="shrink-0" />}
                  <span className="text-text-muted shrink-0 whitespace-nowrap">路径</span>
                  <span className="font-mono text-text-primary truncate min-w-0">{urlParts.path || '/'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                <button
                  onClick={handleCopyCurl}
                  disabled={curlLoading}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-bg-light border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-lighter transition-colors leading-none whitespace-nowrap disabled:opacity-50"
                >
                  {curlLoading ? '生成中...' : curlCopied ? <><CheckIcon size={12} className="mr-1" /> 已复制 cURL</> : <><ClipboardIcon size={12} className="mr-1" /> 复制 cURL</>}
                </button>
                <button
                  onClick={handleReplay}
                  disabled={replayStatus !== null}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-bg-light border border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-lighter transition-colors leading-none whitespace-nowrap disabled:opacity-50"
                >
                  {replayStatus || <><ArrowPathIcon size={12} className="mr-1" /> 重放请求</>}
                </button>
                {onCreateMockFromRequest && isMockPluginEnabled && (
                  <button
                    onClick={() => onCreateMockFromRequest(
                      event.url,
                      event.method,
                      event.responseBody ?? undefined,
                      event.responseHeaders ?? undefined
                    )}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-colors leading-none whitespace-nowrap"
                  >
                    <MockIcon size={12} className="mr-1" /> 创建 Mock 规则
                  </button>
                )}
              </div>

              {queryExpanded && queryCount > 0 && (
                <div className="mt-2 bg-bg-base/60 border border-border rounded-lg p-2 space-y-1">
                  {queryEntries.map(([key, value], index) => (
                    <div key={`${key}-${index}`} className="flex items-start gap-2 text-2xs font-mono">
                      <span className="text-text-muted">{key}</span>
                      <span className="text-text-primary break-all">{value || '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              {event.redirectFromId && (
                <div className="flex items-center gap-2 mt-2 text-xs">
                  <span className="text-text-muted w-12">来源</span>
                  <span className="font-mono text-text-primary flex-1 truncate">{event.redirectFromId}</span>
                </div>
              )}
              {redirectTargetUrl && (
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className="text-text-muted w-12">重定向</span>
                  <span className="font-mono text-text-primary flex-1 truncate">{redirectTargetUrl}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleToggleFavorite}
            className={clsx(
              'p-1.5 rounded transition-colors',
              isFavorite
                ? 'text-yellow-400 hover:text-yellow-300'
                : 'text-text-muted hover:text-yellow-400'
            )}
            title={isFavorite ? '取消收藏（URL 级别）' : '收藏（URL 级别）'}
          >
            {isFavorite ? (
              <StarFilledIcon className="w-5 h-5" />
            ) : (
              <StarOutlineIcon className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="mt-2">
          <div className="h-px bg-border-subtle" />
          <div className="pt-2 flex items-center gap-2 mb-0 flex-nowrap">
          <span
            className={clsx(
              'inline-flex items-center justify-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none min-w-[40px] cursor-default select-none',
              getMethodClass(event.method)
            )}
          >
            {event.method}
          </span>
          <span
            className={clsx(
              'inline-flex items-center justify-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none min-w-[40px] cursor-default select-none',
              getStatusClass(event.statusCode)
            )}
          >
            {event.statusCode ?? 'ERR'}
          </span>
          <div
            className={clsx(
              'relative inline-flex items-center h-6 px-2 rounded-full border border-border-subtle bg-bg-light min-w-[56px] cursor-default select-none',
              getDurationClass(event.duration)
            )}
          >
            <span
              className={clsx(
                'text-[10px] font-mono font-medium leading-none'
              )}
            >
              {formatDuration(event.duration)}
            </span>
            {(() => {
              if (typeof event.duration !== 'number' || maxDurationMs <= 0) return null
              const durationMs = event.duration * 1000
              const ratio = durationMs / maxDurationMs
              const showBar = durationMs >= 100 && ratio >= 0.03
              if (!showBar) return null
              return (
                <div className="absolute left-2 right-2 bottom-0.5 h-0.5 bg-bg-light/40 rounded-full overflow-hidden pointer-events-none">
                  <div
                    className={clsx('h-full rounded-full', getDurationBarClass(event.duration))}
                    style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                  />
                </div>
              )
            })()}
          </div>
          {event.isReplay && (
            <span className="inline-flex items-center justify-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none bg-blue-500/15 text-blue-300 border border-blue-500/20 cursor-default select-none">
              <RefreshIcon size={12} className="mr-1" /> Replay
            </span>
          )}
          {event.timing?.protocolName && (
            <span
              className={clsx(
                'inline-flex items-center justify-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none cursor-default select-none',
                getStatusClass(event.statusCode)
              )}
            >
              {formatProtocolName(event.timing.protocolName)}
            </span>
          )}
          </div>
        </div>
        {(chainLabel || event.isMocked || event.timing?.connectionReused) && (
          <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
            {chainLabel && (
              <span className="inline-flex items-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 cursor-default select-none">
                重定向 {chainLabel}
              </span>
            )}
            {event.isMocked && (
              <MockRulePopover
                url={event.url}
                mockRuleId={event.mockRuleId}
                rules={mockRules}
                onEditRule={onEditMockRule}
              >
                <span className="inline-flex items-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none bg-yellow-500/15 text-yellow-300 border border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors">
                  <MockIcon size={12} className="mr-1" /> Mocked
                </span>
              </MockRulePopover>
            )}
            {event.timing?.connectionReused && (
              <span className="inline-flex items-center h-6 px-2 rounded-full text-[10px] font-mono font-medium tracking-wider leading-none bg-green-500/15 text-green-300 border border-green-500/20 cursor-default select-none">
                复用连接
              </span>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="mt-2">
          <div className="h-px bg-border-subtle" />
          <div className="pt-2 mb-0">
          <button
            type="button"
            onClick={() => setSummaryExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors mb-0"
            aria-expanded={summaryExpanded}
          >
            {summaryExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
            摘要
          </button>
          {summaryExpanded && (
            <div className="grid grid-cols-2 gap-3 text-xs mt-2 bg-bg-base/60 border border-border rounded-lg p-3">
              <SummaryItem label="最终状态">
                <span
                  className={clsx(
                    'inline-flex items-center justify-center px-2 py-1 rounded text-xs font-mono font-semibold min-w-[40px] shadow-sm',
                    getStatusClass(finalStatusCode)
                  )}
                >
                  {finalStatusCode ?? 'ERR'}
                </span>
              </SummaryItem>
              <SummaryItem label="链路位置">
                <span className="font-mono text-text-primary">
                  {chainLabel ?? '-'}
                </span>
              </SummaryItem>
              <SummaryItem label="最终 URL" className="col-span-2">
                <span className="font-mono text-text-primary break-all whitespace-normal" title={finalUrl}>
                  {finalUrl}
                </span>
              </SummaryItem>
              <SummaryItem label="链路耗时">
                <span className="font-mono text-text-primary">
                  {chainDurationLabel}
                </span>
              </SummaryItem>
              <SummaryItem label="请求大小">
                <span className="font-mono text-text-primary">
                  {formatBytes(event.timing?.requestBodyBytesSent)}
                </span>
              </SummaryItem>
              <SummaryItem label="响应大小">
                <span className="font-mono text-text-primary">
                  {formatBytes(event.timing?.responseBodyBytesReceived)}
                </span>
              </SummaryItem>
              <SummaryItem label="协议">
                <span className="font-mono text-text-primary">
                  {formatProtocolName(event.timing?.protocolName)}
                </span>
              </SummaryItem>
              <SummaryItem label="连接复用">
                <span className="font-mono text-text-primary">
                  {event.timing?.connectionReused == null ? '-' : event.timing.connectionReused ? '是' : '否'}
                </span>
              </SummaryItem>
            </div>
          )}
          </div>
        </div>

        {/* TraceId */}
        {event.traceId && (
          <div className="mt-1 text-xs text-text-muted">
            TraceId: <span className="font-mono text-text-primary">{event.traceId}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-bg-dark">
        <TabButton active={activeTab === 'response'} onClick={() => setActiveTab('response')}>
          Response
        </TabButton>
        <TabButton active={activeTab === 'request'} onClick={() => setActiveTab('request')}>
          Request
        </TabButton>
        {event.timing && (
          <TabButton active={activeTab === 'timing'} onClick={() => setActiveTab('timing')}>
            Timing
          </TabButton>
        )}
        {hasDiff && (
          <TabButton active={activeTab === 'diff'} onClick={() => setActiveTab('diff')}>
            Diff
          </TabButton>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {/* Request Tab */}
        {activeTab === 'request' && (
          <div className="space-y-6">
            {/* Query Params */}
            <Section title="Query Params">
              <HeadersTable headers={event.queryItems || {}} />
            </Section>

            {/* Body */}
            <Section title="Body">
              <div className="space-y-2">
                {event.requestBody ? (
                  isProtobufRequest ? (
                    <ProtobufViewer
                      base64Data={event.requestBody}
                      contentType={requestContentType}
                    />
                  ) : isDecodingRequest || isRequestPending ? (
                    <div className="text-text-muted text-sm">解析中...</div>
                  ) : decodedRequest?.kind === 'binary' ? (
                    <BinaryPreview
                      base64Data={event.requestBody}
                      contentType={decodedRequest.contentType}
                      contentEncoding={decodedRequest.contentEncoding}
                      size={decodedRequest.size}
                      url={event.url}
                      suggestedName="request-body"
                      warning={
                        decodedRequest.warning ||
                        (decodedRequest.contentEncoding ? '请求体已压缩，暂不支持预览' : undefined)
                      }
                    />
                  ) : (
                    <JSONViewer content={decodedRequest?.text ?? ''} />
                  )
                ) : (
                  <div className="text-text-muted text-sm">无请求体</div>
                )}
                {decodedRequest?.warning && decodedRequest.kind === 'text' && (
                  <div className="text-xs text-yellow-400">{decodedRequest.warning}</div>
                )}
                {decodedRequest?.kind === 'text' && decodedRequest.text && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyRequestBody}
                      className="px-2 py-1 text-xs bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors flex items-center"
                      title="复制原始请求内容"
                    >
                      {requestBodyCopied ? (
                        <>
                          <CheckIcon size={12} className="mr-1" /> 已复制
                        </>
                      ) : (
                        <>
                          <ClipboardIcon size={12} className="mr-1" /> 复制
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </Section>

            {/* Headers */}
            <Section title="Headers">
              <HeadersTable headers={event.requestHeaders} enableRaw />
            </Section>
          </div>
        )}

        {/* Response Tab */}
        {activeTab === 'response' && (
          <div className="space-y-6">
            {/* Body */}
            <Section title="Body">
              <div className="space-y-2">
                {event.responseBody ? (
                  canPreviewImageResponse ? (
                    <ImagePreview
                      base64Data={event.responseBody}
                      contentType={responseContentType ?? null}
                    />
                  ) : canPreviewProtobufResponse ? (
                    <ProtobufViewer
                      base64Data={event.responseBody}
                      contentType={responseContentType}
                    />
                  ) : isDecodingResponse || isResponsePending ? (
                    <div className="text-text-muted text-sm">解析中...</div>
                  ) : decodedResponse?.kind === 'binary' ? (
                    <BinaryPreview
                      base64Data={event.responseBody}
                      contentType={decodedResponse.contentType}
                      contentEncoding={decodedResponse.contentEncoding}
                      size={decodedResponse.size}
                      filename={responseFilename}
                      url={event.url}
                      suggestedName="response-body"
                      warning={
                        decodedResponse.warning ||
                        (decodedResponse.contentEncoding ? '响应体已压缩，暂不支持预览' : undefined)
                      }
                    />
                  ) : (
                    <JSONViewer
                      content={decodedResponse?.text ?? ''}
                      initialViewMode="tree"
                      treeInitialExpanded={true}
                      treeMaxInitialDepth={Number.MAX_SAFE_INTEGER}
                      buttonOrder="tree-first"
                    />
                  )
                ) : (
                  <div className="text-text-muted text-sm">无响应体</div>
                )}
                {decodedResponse?.warning && decodedResponse.kind === 'text' && (
                  <div className="text-xs text-yellow-400">{decodedResponse.warning}</div>
                )}
                {decodedResponse?.kind === 'text' && decodedResponse.text && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleCopyResponseBody}
                      className="px-2 py-1 text-xs bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors flex items-center"
                      title="复制原始响应内容"
                    >
                      {responseBodyCopied ? (
                        <>
                          <CheckIcon size={12} className="mr-1" /> 已复制
                        </>
                      ) : (
                        <>
                          <ClipboardIcon size={12} className="mr-1" /> 复制
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </Section>

            {/* Headers */}
            {event.responseHeaders && (
              <Section title="Headers">
                <HeadersTable headers={event.responseHeaders} enableRaw />
              </Section>
            )}

            {/* Error */}
            {(errorMessage || event.error) && (
              <Section title="错误信息">
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <SummaryItem label="分类">
                      {formatErrorCategory(event.error?.category ?? null)}
                    </SummaryItem>
                    <SummaryItem label="网络错误">
                      {event.error?.isNetworkError == null
                        ? '-'
                        : event.error.isNetworkError
                          ? '是'
                          : '否'}
                    </SummaryItem>
                    <SummaryItem label="Domain">
                      <span className="font-mono">{event.error?.domain ?? '-'}</span>
                    </SummaryItem>
                    <SummaryItem label="Code">
                      <span className="font-mono">{event.error?.code ?? '-'}</span>
                    </SummaryItem>
                  </div>
                  {errorMessage && (
                    <pre className="text-xs font-mono bg-bg-dark p-3 rounded text-red-400 whitespace-pre-wrap">
                      {errorMessage}
                    </pre>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}

        {/* Timing Tab */}
        {activeTab === 'timing' && event.timing && (
          <Section title="性能时间线">
            <TimingWaterfall timing={event.timing} totalDuration={event.duration} />
          </Section>
        )}

        {/* Diff Tab */}
        {activeTab === 'diff' && (
          <div className="space-y-6">
            {!compareId && (
              <div className="text-text-muted text-sm">无可对比的重定向链路</div>
            )}
            {compareId && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-text-muted">对比对象</span>
                  {chainMeta?.prevId && (
                    <button
                      onClick={() => setDiffTarget('prev')}
                      className={clsx(
                        'px-2 py-1 rounded border text-xs',
                        diffTarget === 'prev'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-bg-light text-text-muted border-border hover:bg-bg-lighter'
                      )}
                    >
                      上一跳
                    </button>
                  )}
                  {chainMeta?.nextId && (
                    <button
                      onClick={() => setDiffTarget('next')}
                      className={clsx(
                        'px-2 py-1 rounded border text-xs',
                        diffTarget === 'next'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-bg-light text-text-muted border-border hover:bg-bg-lighter'
                      )}
                    >
                      下一跳
                    </button>
                  )}
                  {compareLoading && <span className="text-text-muted">加载中...</span>}
                  {compareError && <span className="text-red-400">{compareError}</span>}
                </div>

                <Section title="基本信息对比">
                  <BasicDiffTable current={event} compare={compareSummary} />
                </Section>

                <Section title="Headers 对比">
                  {compareDetail ? (
                    <div className="space-y-4">
                      <HeadersDiffBlock
                        title="请求头"
                        diffs={diffHeaders(event.requestHeaders, compareDetail.requestHeaders)}
                      />
                      <HeadersDiffBlock
                        title="响应头"
                        diffs={diffHeaders(event.responseHeaders ?? {}, compareDetail.responseHeaders ?? {})}
                      />
                    </div>
                  ) : compareLoading ? (
                    <div className="text-text-muted text-sm">加载对比详情中...</div>
                  ) : compareError ? (
                    <div className="text-red-400 text-sm">加载对比详情失败</div>
                  ) : (
                    <div className="text-text-muted text-sm">暂无对比详情</div>
                  )}
                </Section>
              </>
            )}
          </div>
        )}
      </div>

      {/* Related Logs */}
      {event.traceId && onShowRelatedLogs && (
        <div className="p-4 border-t border-border">
          <button
            onClick={() => onShowRelatedLogs(event.traceId!)}
            className="px-3 py-1.5 bg-bg-light border border-border rounded text-sm hover:bg-bg-lighter transition-colors"
          >
            查看 TraceId 关联日志
          </button>
        </div>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2 text-xs font-medium transition-colors',
        active ? 'text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text-primary'
      )}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-dark rounded-lg border border-border">
      <h4 className="text-xs uppercase text-text-muted px-3 py-2 border-b border-border font-medium">{title}</h4>
      <div className="p-3">{children}</div>
    </div>
  )
}

function SummaryItem({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1 min-w-0', className)}>
      <span className="text-2xs uppercase text-text-muted">{label}</span>
      <div className="text-xs text-text-primary min-w-0">{children}</div>
    </div>
  )
}

function BasicDiffTable({
  current,
  compare,
}: {
  current: HTTPEventDetailType
  compare: HTTPEventSummary | null
}) {
  const rows = [
    {
      label: 'Method',
      current: current.method,
      compare: compare?.method ?? '-',
      diff: compare ? current.method !== compare.method : false,
    },
    {
      label: 'URL',
      current: current.url,
      compare: compare?.url ?? '-',
      diff: compare ? current.url !== compare.url : false,
    },
    {
      label: 'Status',
      current: String(current.statusCode ?? 'ERR'),
      compare: String(compare?.statusCode ?? 'ERR'),
      diff: compare ? current.statusCode !== compare.statusCode : false,
    },
    {
      label: 'Duration',
      current: formatDuration(current.duration),
      compare: formatDuration(compare?.duration ?? null),
      diff: compare ? current.duration !== compare.duration : false,
    },
    {
      label: 'TraceId',
      current: current.traceId ?? '-',
      compare: compare?.traceId ?? '-',
      diff: compare ? current.traceId !== compare.traceId : false,
    },
  ]

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            <th className="py-2 w-24">字段</th>
            <th className="py-2">当前</th>
            <th className="py-2">对比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={clsx('border-b border-border/50', row.diff && 'bg-yellow-500/10')}>
              <td className="py-2 text-text-muted">{row.label}</td>
              <td className={clsx('py-2 font-mono break-all', row.diff && 'text-red-400')}>{row.current}</td>
              <td className={clsx('py-2 font-mono break-all', row.diff && 'text-green-400')}>{row.compare}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type HeaderDiffStatus = 'same' | 'modified' | 'added' | 'removed'

interface HeaderDiff {
  key: string
  current: string | null
  compare: string | null
  status: HeaderDiffStatus
}

function diffHeaders(current: Record<string, string>, compare: Record<string, string>): HeaderDiff[] {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(compare)])
  const diffs: HeaderDiff[] = []

  for (const key of allKeys) {
    const currentValue = current[key] ?? null
    const compareValue = compare[key] ?? null

    let status: HeaderDiffStatus = 'same'
    if (currentValue === null && compareValue !== null) {
      status = 'added'
    } else if (currentValue !== null && compareValue === null) {
      status = 'removed'
    } else if (currentValue !== compareValue) {
      status = 'modified'
    }

    diffs.push({ key, current: currentValue, compare: compareValue, status })
  }

  const order: Record<HeaderDiffStatus, number> = {
    removed: 0,
    modified: 1,
    added: 2,
    same: 3,
  }

  return diffs.sort((a, b) => order[a.status] - order[b.status])
}

function HeadersDiffBlock({ title, diffs }: { title: string; diffs: HeaderDiff[] }) {
  const visibleDiffs = diffs.filter((diff) => diff.status !== 'same')
  return (
    <div>
      <h5 className="text-xs uppercase text-text-muted mb-2">{title}</h5>
      <HeadersDiffTable diffs={visibleDiffs} />
    </div>
  )
}

function HeadersDiffTable({ diffs }: { diffs: HeaderDiff[] }) {
  if (diffs.length === 0) {
    return <div className="text-sm text-text-muted">无差异</div>
  }

  const statusLabel: Record<HeaderDiffStatus, string> = {
    added: '新增',
    removed: '缺失',
    modified: '变更',
    same: '相同',
  }

  const statusClass: Record<HeaderDiffStatus, string> = {
    added: 'bg-green-500/10 text-green-400',
    removed: 'bg-red-500/10 text-red-400',
    modified: 'bg-yellow-500/10 text-yellow-400',
    same: 'bg-bg-light text-text-muted',
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            <th className="py-2 w-28">状态</th>
            <th className="py-2 w-40">Header</th>
            <th className="py-2">当前</th>
            <th className="py-2">对比</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.key} className="border-b border-border/50">
              <td className="py-2">
                <span className={clsx('px-2 py-1 rounded text-2xs', statusClass[diff.status])}>
                  {statusLabel[diff.status]}
                </span>
              </td>
              <td className="py-2 text-primary break-all">{diff.key}</td>
              <td className={clsx('py-2 break-all', diff.status === 'removed' && 'text-red-400')}>
                {diff.current ?? '-'}
              </td>
              <td className={clsx('py-2 break-all', diff.status === 'added' && 'text-green-400')}>
                {diff.compare ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeadersTable({ headers, enableRaw = false }: { headers: Record<string, string>; enableRaw?: boolean }) {
  const entries = Object.entries(headers)
  const [viewMode, setViewMode] = useState<'kv' | 'raw'>('kv')
  const [copied, setCopied] = useState(false)
  const rawText = useMemo(
    () => entries.map(([key, value]) => `${key}: ${value}`).join('\n'),
    [entries]
  )

  if (entries.length === 0) {
    return <span className="text-text-muted text-sm">无</span>
  }

  return (
    <div className="space-y-2">
      {enableRaw && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('kv')}
              className={clsx(
                'px-2 py-1 text-xs rounded',
                viewMode === 'kv'
                  ? 'bg-primary text-white'
                  : 'bg-bg-light text-text-muted hover:bg-bg-lighter'
              )}
            >
              键值
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={clsx(
                'px-2 py-1 text-xs rounded',
                viewMode === 'raw'
                  ? 'bg-primary text-white'
                  : 'bg-bg-light text-text-muted hover:bg-bg-lighter'
              )}
            >
              原始
            </button>
          </div>
        </div>
      )}

      {viewMode === 'raw' && enableRaw ? (
        <pre className="text-xs font-mono whitespace-pre-wrap break-all">{rawText}</pre>
      ) : (
        <table className="w-full text-xs font-mono">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-4 text-primary align-top whitespace-nowrap">{key}</td>
                <td className="py-1.5 break-all">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            await copyToClipboard(rawText)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="px-2 py-1 text-xs bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors flex items-center"
          title="复制原始 Headers"
        >
          {copied ? (
            <>
              <CheckIcon size={12} className="mr-1" /> 已复制
            </>
          ) : (
            <>
              <ClipboardIcon size={12} className="mr-1" /> 复制
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// Icons
function StarFilledIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function StarOutlineIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  )
}
