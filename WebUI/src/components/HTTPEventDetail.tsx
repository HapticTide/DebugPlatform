import { useEffect, useMemo, useState } from 'react'
import type { HTTPEventDetail as HTTPEventDetailType, MockRule } from '@/types'
import {
  formatDuration,
  getStatusClass,
  getMethodClass,
} from '@/utils/format'
import { copyToClipboard } from '@/utils/clipboard'
import { getHTTPEventCurl, replayHTTPEvent } from '@/services/api'
import { JSONViewer } from './JSONTree'
import { TimingWaterfall } from './TimingWaterfall'
import { ImagePreview, isImageContentType } from './ImagePreview'
import { ProtobufViewer, isProtobufContentType } from './ProtobufViewer'
import { MockRulePopover } from './MockRulePopover'
import { useFavoriteUrlStore } from '@/stores/favoriteUrlStore'
import clsx from 'clsx'
import { MockIcon, ClipboardIcon, CheckIcon, ArrowPathIcon, RefreshIcon } from './icons'
import { BinaryPreview } from './BinaryPreview'
import {
  decodeBodyForDisplay,
  getHeaderValue,
  parseContentDispositionFilename,
  type BodyDisplayResult,
} from '@/utils/httpBody'

/** 解析 URL 获取域名和路径 */
function parseUrlParts(url: string): { domain: string; path: string } {
  try {
    const urlObj = new URL(url)
    return {
      domain: urlObj.host,
      path: urlObj.pathname + urlObj.search
    }
  } catch {
    // 如果 URL 解析失败，返回原始 URL
    return { domain: '', path: url }
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
  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'timing'>('response')
  const [curlCommand, setCurlCommand] = useState<string | null>(null)
  const [curlLoading, setCurlLoading] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)
  const [replayStatus, setReplayStatus] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [responseBodyCopied, setResponseBodyCopied] = useState(false)
  const [requestBodyCopied, setRequestBodyCopied] = useState(false)
  const [decodedRequest, setDecodedRequest] = useState<BodyDisplayResult | null>(null)
  const [decodedResponse, setDecodedResponse] = useState<BodyDisplayResult | null>(null)
  const [isDecodingRequest, setIsDecodingRequest] = useState(false)
  const [isDecodingResponse, setIsDecodingResponse] = useState(false)

  // 使用 URL 级别的收藏状态
  const { isFavorite: isUrlFavorite, toggleFavorite: toggleUrlFavorite } = useFavoriteUrlStore()
  const isFavorite = event ? isUrlFavorite(deviceId, event.url) : false

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

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="p-4 bg-bg-dark border-b border-border">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-medium break-all flex-1">{event.url}</h3>
          <button
            onClick={handleToggleFavorite}
            className={clsx(
              'ml-2 p-1.5 rounded transition-colors',
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

        {/* Domain and Path with copy buttons */}
        <div className="flex flex-col gap-1 mb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-text-muted w-12">域名</span>
            <span className="font-mono text-text-primary flex-1 truncate">{urlParts.domain}</span>
            <button
              onClick={handleCopyDomain}
              className="px-2 py-1 bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors flex items-center"
              title="复制域名"
            >
              {domainCopied ? <><CheckIcon size={12} className="mr-1" /> 已复制</> : <><ClipboardIcon size={12} className="mr-1" /> 复制</>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted w-12">路径</span>
            <span className="font-mono text-text-primary flex-1 truncate">{urlParts.path}</span>
            <button
              onClick={handleCopyPath}
              className="px-2 py-1 bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors flex items-center"
              title="复制路径"
            >
              {pathCopied ? <><CheckIcon size={12} className="mr-1" /> 已复制</> : <><ClipboardIcon size={12} className="mr-1" /> 复制</>}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs mb-3">
          <span
            className={clsx(
              'px-1.5 py-0.5 rounded font-mono',
              getMethodClass(event.method)
            )}
          >
            {event.method}
          </span>
          <span
            className={clsx(
              'px-1.5 py-0.5 rounded font-mono',
              getStatusClass(event.statusCode)
            )}
          >
            {event.statusCode ?? 'ERR'}
          </span>
          <span className="text-text-muted">{formatDuration(event.duration)}</span>
          {event.isMocked && (
            <MockRulePopover
              url={event.url}
              mockRuleId={event.mockRuleId}
              rules={mockRules}
              onEditRule={onEditMockRule}
            >
              <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center cursor-pointer hover:bg-yellow-500/30 transition-colors">
                <MockIcon size={12} className="mr-1" /> Mocked
              </span>
            </MockRulePopover>
          )}
          {event.isReplay && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 flex items-center">
              <RefreshIcon size={12} className="mr-1" /> Replay
            </span>
          )}
          {event.timing?.protocolName && (
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {event.timing.protocolName}
            </span>
          )}
          {event.timing?.connectionReused && (
            <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
              复用连接
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCopyCurl}
            disabled={curlLoading}
            className="px-3 py-1.5 bg-bg-light border border-border-subtle rounded text-xs hover:bg-bg-lighter transition-colors disabled:opacity-50 flex items-center"
          >
            {curlLoading ? '生成中...' : curlCopied ? <><CheckIcon size={12} className="mr-1" /> 已复制</> : <><ClipboardIcon size={12} className="mr-1" /> 复制 cURL</>}
          </button>
          <button
            onClick={handleReplay}
            disabled={replayStatus !== null}
            className="px-3 py-1.5 bg-bg-light border border-border-subtle rounded text-xs hover:bg-bg-lighter transition-colors disabled:opacity-50 flex items-center"
          >
            {replayStatus || <><ArrowPathIcon size={12} className="mr-1" /> 重放请求</>}
          </button>
          {onCreateMockFromRequest && (
            <button
              onClick={() => onCreateMockFromRequest(
                event.url,
                event.method,
                event.responseBody ?? undefined,
                event.responseHeaders ?? undefined
              )}
              className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded text-xs hover:bg-purple-500/30 transition-colors flex items-center"
            >
              <MockIcon size={12} className="mr-1" /> 创建 Mock 规则
            </button>
          )}
        </div>

        {/* TraceId */}
        {event.traceId && (
          <div className="mt-2 text-xs text-text-muted">
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
            {event.errorDescription && (
              <Section title="错误信息">
                <pre className="text-xs font-mono bg-bg-dark p-3 rounded text-red-400">
                  {event.errorDescription}
                </pre>
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
