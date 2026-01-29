import { useState, useMemo } from 'react'
import type { HTTPEventDetail } from '@/types'
import { formatTime, formatDuration, getStatusClass, getMethodClass } from '@/utils/format'
import { summarizeBodyForDiff } from '@/utils/httpBody'
import clsx from 'clsx'

interface Props {
  eventA: HTTPEventDetail
  eventB: HTTPEventDetail
  onClose: () => void
}

type DiffViewMode = 'side-by-side' | 'inline'

export function RequestDiff({ eventA, eventB, onClose }: Props) {
  const [viewMode, setViewMode] = useState<DiffViewMode>('side-by-side')
  const [activeSection, setActiveSection] = useState<'url' | 'headers' | 'body'>('url')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-base w-[95vw] h-[90vh] rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-dark">
          <h2 className="text-lg font-medium">请求对比</h2>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('side-by-side')}
                className={clsx(
                  'px-3 py-1 text-xs rounded',
                  viewMode === 'side-by-side'
                    ? 'bg-primary text-white'
                    : 'bg-bg-light text-text-muted hover:bg-bg-lighter'
                )}
              >
                并排
              </button>
              <button
                onClick={() => setViewMode('inline')}
                className={clsx(
                  'px-3 py-1 text-xs rounded',
                  viewMode === 'inline'
                    ? 'bg-primary text-white'
                    : 'bg-bg-light text-text-muted hover:bg-bg-lighter'
                )}
              >
                行内
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-2 gap-4 px-4 py-3 border-b border-border bg-bg-dark">
          <RequestSummary event={eventA} label="请求 A" />
          <RequestSummary event={eventB} label="请求 B" />
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-border bg-bg-dark px-4">
          <TabButton active={activeSection === 'url'} onClick={() => setActiveSection('url')}>
            URL & 基本信息
          </TabButton>
          <TabButton active={activeSection === 'headers'} onClick={() => setActiveSection('headers')}>
            Headers
          </TabButton>
          <TabButton active={activeSection === 'body'} onClick={() => setActiveSection('body')}>
            Body
          </TabButton>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-hidden">
          {activeSection === 'url' && (
            <URLDiff eventA={eventA} eventB={eventB} mode={viewMode} />
          )}
          {activeSection === 'headers' && (
            <HeadersDiff eventA={eventA} eventB={eventB} mode={viewMode} />
          )}
          {activeSection === 'body' && (
            <BodyDiff eventA={eventA} eventB={eventB} mode={viewMode} />
          )}
        </div>
      </div>
    </div>
  )
}

function RequestSummary({ event, label }: { event: HTTPEventDetail; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className={clsx('px-1.5 py-0.5 rounded text-xs font-mono', getMethodClass(event.method))}>
          {event.method}
        </span>
        <span className={clsx('px-1.5 py-0.5 rounded text-xs font-mono', getStatusClass(event.statusCode))}>
          {event.statusCode ?? 'ERR'}
        </span>
        <span className="text-xs text-text-muted">{formatDuration(event.duration)}</span>
        <span className="text-xs text-text-muted">{formatTime(event.startTime)}</span>
      </div>
      <span className="text-xs font-mono truncate" title={event.url}>{event.url}</span>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'text-primary border-b-2 border-primary'
          : 'text-text-muted hover:text-text'
      )}
    >
      {children}
    </button>
  )
}

// URL Diff
function URLDiff({ eventA, eventB, mode }: { eventA: HTTPEventDetail; eventB: HTTPEventDetail; mode: DiffViewMode }) {
  const diffs = useMemo(() => {
    const items: { label: string; a: string; b: string; isDifferent: boolean }[] = [
      { label: 'Method', a: eventA.method, b: eventB.method, isDifferent: eventA.method !== eventB.method },
      { label: 'URL', a: eventA.url, b: eventB.url, isDifferent: eventA.url !== eventB.url },
      { label: 'Status', a: String(eventA.statusCode ?? 'N/A'), b: String(eventB.statusCode ?? 'N/A'), isDifferent: eventA.statusCode !== eventB.statusCode },
      { label: 'Duration', a: formatDuration(eventA.duration), b: formatDuration(eventB.duration), isDifferent: eventA.duration !== eventB.duration },
      { label: 'TraceId', a: eventA.traceId ?? 'N/A', b: eventB.traceId ?? 'N/A', isDifferent: eventA.traceId !== eventB.traceId },
      { label: 'Mocked', a: eventA.isMocked ? 'Yes' : 'No', b: eventB.isMocked ? 'Yes' : 'No', isDifferent: eventA.isMocked !== eventB.isMocked },
    ]
    return items
  }, [eventA, eventB])

  if (mode === 'side-by-side') {
    return (
      <div className="h-full overflow-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border">
              <th className="py-2 w-32">字段</th>
              <th className="py-2">请求 A</th>
              <th className="py-2">请求 B</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((diff) => (
              <tr key={diff.label} className={clsx('border-b border-border/50', diff.isDifferent && 'bg-yellow-500/10')}>
                <td className="py-2 text-text-muted">{diff.label}</td>
                <td className={clsx('py-2 font-mono', diff.isDifferent && 'text-red-400')}>{diff.a}</td>
                <td className={clsx('py-2 font-mono', diff.isDifferent && 'text-green-400')}>{diff.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-2">
      {diffs.map((diff) => (
        <div key={diff.label} className={clsx('p-2 rounded', diff.isDifferent ? 'bg-yellow-500/10' : 'bg-bg-dark')}>
          <div className="text-xs text-text-muted mb-1">{diff.label}</div>
          {diff.isDifferent ? (
            <div className="space-y-1">
              <div className="text-sm font-mono">
                <span className="text-red-400">- {diff.a}</span>
              </div>
              <div className="text-sm font-mono">
                <span className="text-green-400">+ {diff.b}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm font-mono text-text-muted">{diff.a}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// Headers Diff
function HeadersDiff({ eventA, eventB, mode }: { eventA: HTTPEventDetail; eventB: HTTPEventDetail; mode: DiffViewMode }) {
  const { requestDiffs, responseDiffs } = useMemo(() => {
    const requestDiffs = diffHeaders(eventA.requestHeaders, eventB.requestHeaders)
    const responseDiffs = diffHeaders(eventA.responseHeaders ?? {}, eventB.responseHeaders ?? {})
    return { requestDiffs, responseDiffs }
  }, [eventA, eventB])

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">请求头</h3>
        <HeadersDiffTable diffs={requestDiffs} mode={mode} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">响应头</h3>
        <HeadersDiffTable diffs={responseDiffs} mode={mode} />
      </div>
    </div>
  )
}

interface HeaderDiff {
  key: string
  valueA: string | null
  valueB: string | null
  status: 'same' | 'modified' | 'added' | 'removed'
}

function diffHeaders(a: Record<string, string>, b: Record<string, string>): HeaderDiff[] {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
  const diffs: HeaderDiff[] = []

  for (const key of allKeys) {
    const valueA = a[key] ?? null
    const valueB = b[key] ?? null

    let status: HeaderDiff['status']
    if (valueA === null) {
      status = 'added'
    } else if (valueB === null) {
      status = 'removed'
    } else if (valueA !== valueB) {
      status = 'modified'
    } else {
      status = 'same'
    }

    diffs.push({ key, valueA, valueB, status })
  }

  return diffs.sort((a, b) => {
    const order = { removed: 0, modified: 1, added: 2, same: 3 }
    return order[a.status] - order[b.status]
  })
}

function HeadersDiffTable({ diffs, mode }: { diffs: HeaderDiff[]; mode: DiffViewMode }) {
  if (diffs.length === 0) {
    return <div className="text-sm text-text-muted">无 Headers</div>
  }

  const getStatusColor = (status: HeaderDiff['status']) => {
    switch (status) {
      case 'added': return 'bg-green-500/10 text-green-400'
      case 'removed': return 'bg-red-500/10 text-red-400'
      case 'modified': return 'bg-yellow-500/10 text-yellow-400'
      default: return ''
    }
  }

  const getStatusIcon = (status: HeaderDiff['status']) => {
    switch (status) {
      case 'added': return '+'
      case 'removed': return '-'
      case 'modified': return '~'
      default: return ' '
    }
  }

  if (mode === 'side-by-side') {
    return (
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-text-muted border-b border-border">
            <th className="py-1 w-6"></th>
            <th className="py-1 w-48">Key</th>
            <th className="py-1">A</th>
            <th className="py-1">B</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.key} className={clsx('border-b border-border/30', getStatusColor(diff.status))}>
              <td className="py-1">{getStatusIcon(diff.status)}</td>
              <td className="py-1 text-primary">{diff.key}</td>
              <td className="py-1 break-all">{diff.valueA ?? '-'}</td>
              <td className="py-1 break-all">{diff.valueB ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="space-y-1">
      {diffs.map((diff) => (
        <div key={diff.key} className={clsx('p-2 rounded text-xs font-mono', getStatusColor(diff.status))}>
          <span className="text-primary">{diff.key}:</span>
          {diff.status === 'modified' ? (
            <div className="ml-4">
              <div className="text-red-400">- {diff.valueA}</div>
              <div className="text-green-400">+ {diff.valueB}</div>
            </div>
          ) : (
            <span className="ml-2">{diff.valueA ?? diff.valueB}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Body Diff
function BodyDiff({ eventA, eventB, mode }: { eventA: HTTPEventDetail; eventB: HTTPEventDetail; mode: DiffViewMode }) {
  const requestBodyA = summarizeBodyForDiff(eventA.requestBody, eventA.requestHeaders)
  const requestBodyB = summarizeBodyForDiff(eventB.requestBody, eventB.requestHeaders)
  const responseBodyA = summarizeBodyForDiff(eventA.responseBody, eventA.responseHeaders)
  const responseBodyB = summarizeBodyForDiff(eventB.responseBody, eventB.responseHeaders)

  return (
    <div className="h-full overflow-auto p-4 space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">请求体</h3>
        <TextDiff textA={requestBodyA} textB={requestBodyB} mode={mode} />
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">响应体</h3>
        <TextDiff textA={responseBodyA} textB={responseBodyB} mode={mode} />
      </div>
    </div>
  )
}

function TextDiff({ textA, textB, mode }: { textA: string | null; textB: string | null; mode: DiffViewMode }) {
  if (!textA && !textB) {
    return <div className="text-sm text-text-muted">无内容</div>
  }

  // 尝试格式化 JSON
  const formatJSON = (text: string | null): string[] => {
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      return JSON.stringify(parsed, null, 2).split('\n')
    } catch {
      return text.split('\n')
    }
  }

  const linesA = formatJSON(textA)
  const linesB = formatJSON(textB)

  // 简单的行级别差异
  const maxLines = Math.max(linesA.length, linesB.length)
  const diffs: { lineA: string | null; lineB: string | null; isDifferent: boolean }[] = []

  for (let i = 0; i < maxLines; i++) {
    const lineA = linesA[i] ?? null
    const lineB = linesB[i] ?? null
    diffs.push({ lineA, lineB, isDifferent: lineA !== lineB })
  }

  if (mode === 'side-by-side') {
    return (
      <div className="grid grid-cols-2 gap-4">
        <pre className="text-xs font-mono bg-bg-dark p-3 rounded overflow-x-auto max-h-96 overflow-y-auto">
          {diffs.map((diff, i) => (
            <div key={i} className={clsx(diff.isDifferent && 'bg-red-500/20')}>
              {diff.lineA ?? ''}
            </div>
          ))}
        </pre>
        <pre className="text-xs font-mono bg-bg-dark p-3 rounded overflow-x-auto max-h-96 overflow-y-auto">
          {diffs.map((diff, i) => (
            <div key={i} className={clsx(diff.isDifferent && 'bg-green-500/20')}>
              {diff.lineB ?? ''}
            </div>
          ))}
        </pre>
      </div>
    )
  }

  return (
    <pre className="text-xs font-mono bg-bg-dark p-3 rounded overflow-x-auto max-h-96 overflow-y-auto">
      {diffs.map((diff, i) => (
        <div key={i}>
          {diff.isDifferent ? (
            <>
              {diff.lineA !== null && <div className="bg-red-500/20 text-red-400">- {diff.lineA}</div>}
              {diff.lineB !== null && <div className="bg-green-500/20 text-green-400">+ {diff.lineB}</div>}
            </>
          ) : (
            <div className="text-text-muted">  {diff.lineA}</div>
          )}
        </div>
      ))}
    </pre>
  )
}
