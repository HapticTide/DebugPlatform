import { useState } from 'react'
import type { HTTPEventDetail as HTTPEventDetailType, MockRule } from '@/types'
import {
  formatDuration,
  getStatusClass,
  getMethodClass,
  decodeBase64,
} from '@/utils/format'
import { getHTTPEventCurl, replayHTTPEvent } from '@/services/api'
import { JSONViewer } from './JSONTree'
import { TimingWaterfall } from './TimingWaterfall'
import { ImagePreview, isImageContentType } from './ImagePreview'
import { ProtobufViewer, isProtobufContentType } from './ProtobufViewer'
import { MockRulePopover } from './MockRulePopover'
import { useFavoriteUrlStore } from '@/stores/favoriteUrlStore'
import clsx from 'clsx'
import { MockIcon, ClipboardIcon, CheckIcon, ArrowPathIcon, RefreshIcon } from './icons'

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

/**
 * 将嵌套 JSON 对象展平为键值对
 * 例如: { user: { name: "test" } } => { "user.name": "test" }
 */
function flattenJSON(obj: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}

  if (obj === null || obj === undefined) {
    return result
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const key = `${prefix}[${index}]`
      const nested = flattenJSON(item, key)
      Object.assign(result, nested)
    })
  } else if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newKey = prefix ? `${prefix}.${key}` : key
      const nested = flattenJSON(value, newKey)
      Object.assign(result, nested)
    }
  } else {
    result[prefix] = String(obj)
  }

  return result
}

/**
 * 解析请求体为键值对参数
 * 支持 JSON 和 form-urlencoded 格式
 */
function parseBodyParams(
  body: string | null,
  contentType: string | undefined
): Record<string, string> | null {
  if (!body || !body.trim()) {
    return null
  }

  const ct = (contentType || '').toLowerCase()

  // 尝试解析 JSON
  if (ct.includes('application/json') || ct.includes('text/json')) {
    try {
      const parsed = JSON.parse(body)
      const flattened = flattenJSON(parsed)
      return Object.keys(flattened).length > 0 ? flattened : null
    } catch {
      return null
    }
  }

  // 尝试解析 form-urlencoded
  if (ct.includes('application/x-www-form-urlencoded')) {
    try {
      const params = new URLSearchParams(body)
      const result: Record<string, string> = {}
      params.forEach((value, key) => {
        result[key] = value
      })
      return Object.keys(result).length > 0 ? result : null
    } catch {
      return null
    }
  }

  // 尝试自动检测格式（当 content-type 未知时）
  // 先尝试 JSON
  try {
    const parsed = JSON.parse(body)
    if (typeof parsed === 'object' && parsed !== null) {
      const flattened = flattenJSON(parsed)
      return Object.keys(flattened).length > 0 ? flattened : null
    }
  } catch {
    // 不是 JSON，尝试 form-urlencoded
  }

  // 尝试 form-urlencoded
  if (body.includes('=')) {
    try {
      const params = new URLSearchParams(body)
      const result: Record<string, string> = {}
      params.forEach((value, key) => {
        result[key] = value
      })
      if (Object.keys(result).length > 0) {
        return result
      }
    } catch {
      // 解析失败
    }
  }

  return null
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
  const [activeTab, setActiveTab] = useState<'headers' | 'params' | 'body' | 'timing'>('headers')
  const [curlCommand, setCurlCommand] = useState<string | null>(null)
  const [curlLoading, setCurlLoading] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)
  const [replayStatus, setReplayStatus] = useState<string | null>(null)
  const [domainCopied, setDomainCopied] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)

  // 使用 URL 级别的收藏状态
  const { isFavorite: isUrlFavorite, toggleFavorite: toggleUrlFavorite } = useFavoriteUrlStore()
  const isFavorite = event ? isUrlFavorite(deviceId, event.url) : false

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <span className="text-4xl mb-3 opacity-50">👈</span>
        <p className="text-sm">选择一个请求查看详情</p>
      </div>
    )
  }

  const requestBody = event.requestBody ? decodeBase64(event.requestBody) : null
  const responseBody = event.responseBody ? decodeBase64(event.responseBody) : null

  // 检查响应内容类型
  const responseContentType = event.responseHeaders?.['Content-Type'] || event.responseHeaders?.['content-type']
  const isImageResponse = isImageContentType(responseContentType)
  const isProtobufResponse = isProtobufContentType(responseContentType)

  // 检查请求内容类型
  const requestContentType = event.requestHeaders?.['Content-Type'] || event.requestHeaders?.['content-type']
  const isProtobufRequest = isProtobufContentType(requestContentType)

  // 解析 Body Params（优先使用后端解析的，fallback 到前端解析）
  const parsedBodyParams = event.bodyParams && Object.keys(event.bodyParams).length > 0
    ? event.bodyParams
    : parseBodyParams(requestBody, requestContentType)

  const handleCopyCurl = async () => {
    if (curlCommand) {
      await navigator.clipboard.writeText(curlCommand)
      setCurlCopied(true)
      setTimeout(() => setCurlCopied(false), 2000)
      return
    }

    setCurlLoading(true)
    try {
      const response = await getHTTPEventCurl(deviceId, event.id)
      setCurlCommand(response.curl)
      await navigator.clipboard.writeText(response.curl)
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
      await navigator.clipboard.writeText(domain)
      setDomainCopied(true)
      setTimeout(() => setDomainCopied(false), 2000)
    }
  }

  const handleCopyPath = async () => {
    const { path } = parseUrlParts(event.url)
    if (path) {
      await navigator.clipboard.writeText(path)
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 2000)
    }
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
        <TabButton active={activeTab === 'headers'} onClick={() => setActiveTab('headers')}>
          Headers
        </TabButton>
        <TabButton active={activeTab === 'params'} onClick={() => setActiveTab('params')}>
          Params
        </TabButton>
        <TabButton active={activeTab === 'body'} onClick={() => setActiveTab('body')}>
          Body
        </TabButton>
        {event.timing && (
          <TabButton active={activeTab === 'timing'} onClick={() => setActiveTab('timing')}>
            Timing
          </TabButton>
        )}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'headers' && (
          <div className="space-y-6">
            <Section title="请求头">
              <HeadersTable headers={event.requestHeaders} />
            </Section>

            {event.responseHeaders && (
              <Section title="响应头">
                <HeadersTable headers={event.responseHeaders} />
              </Section>
            )}
          </div>
        )}

        {activeTab === 'params' && (
          <div className="space-y-6">
            <Section title="Query Params">
              <HeadersTable headers={event.queryItems || {}} />
            </Section>

            <Section title="Body Params">
              {parsedBodyParams ? (
                <HeadersTable headers={parsedBodyParams} />
              ) : (
                <div className="text-text-muted text-sm">
                  {requestBody ? '无法解析请求体为参数格式' : '无请求体'}
                </div>
              )}
            </Section>
          </div>
        )}

        {activeTab === 'body' && (
          <div className="space-y-6">
            {event.requestBody && (
              <Section title="请求体">
                {isProtobufRequest ? (
                  <ProtobufViewer
                    base64Data={event.requestBody}
                    contentType={requestContentType}
                  />
                ) : (
                  <JSONViewer content={requestBody ?? ''} />
                )}
              </Section>
            )}

            {event.responseBody && (
              <Section title="响应体">
                {isImageResponse ? (
                  <ImagePreview
                    base64Data={event.responseBody}
                    contentType={responseContentType ?? null}
                  />
                ) : isProtobufResponse ? (
                  <ProtobufViewer
                    base64Data={event.responseBody}
                    contentType={responseContentType}
                  />
                ) : (
                  <JSONViewer content={responseBody ?? ''} />
                )}
              </Section>
            )}

            {!event.requestBody && !event.responseBody && (
              <div className="text-text-muted text-sm">无请求体或响应体</div>
            )}

            {event.errorDescription && (
              <Section title="错误信息">
                <pre className="text-xs font-mono bg-bg-dark p-3 rounded text-red-400">
                  {event.errorDescription}
                </pre>
              </Section>
            )}
          </div>
        )}

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
    <div>
      <h4 className="text-xs uppercase text-text-muted mb-2">{title}</h4>
      {children}
    </div>
  )
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)

  if (entries.length === 0) {
    return <span className="text-text-muted text-sm">无</span>
  }

  return (
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
