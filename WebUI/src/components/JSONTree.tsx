import { useState, useMemo } from 'react'
import clsx from 'clsx'

interface JSONTreeProps {
  data: unknown
  initialExpanded?: boolean
  maxInitialDepth?: number
}

export function JSONTree({ data, initialExpanded = true, maxInitialDepth = 2 }: JSONTreeProps) {
  return (
    <div className="font-mono text-xs">
      <JSONNode value={data} depth={0} initialExpanded={initialExpanded} maxInitialDepth={maxInitialDepth} />
    </div>
  )
}

interface JSONNodeProps {
  keyName?: string
  value: unknown
  depth: number
  initialExpanded: boolean
  maxInitialDepth: number
  isLast?: boolean
}

function JSONNode({ keyName, value, depth, initialExpanded, maxInitialDepth, isLast = true }: JSONNodeProps) {
  const shouldAutoExpand = initialExpanded && depth < maxInitialDepth
  const [expanded, setExpanded] = useState(shouldAutoExpand)

  const type = useMemo(() => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value
  }, [value])

  const isExpandable = type === 'object' || type === 'array'
  const isEmpty = isExpandable && (type === 'array' ? (value as unknown[]).length === 0 : Object.keys(value as object).length === 0)

  const renderValue = () => {
    switch (type) {
      case 'string':
        return <span className="text-emerald-400">"{String(value)}"</span>
      case 'number':
        return <span className="text-amber-400">{String(value)}</span>
      case 'boolean':
        return <span className="text-purple-400">{String(value)}</span>
      case 'null':
        return <span className="text-gray-500">null</span>
      case 'undefined':
        return <span className="text-gray-500">undefined</span>
      default:
        return null
    }
  }

  const renderExpandable = () => {
    const entries = type === 'array'
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as object)

    const bracket = type === 'array' ? ['[', ']'] : ['{', '}']
    const preview = type === 'array'
      ? `Array(${(value as unknown[]).length})`
      : `Object(${Object.keys(value as object).length})`

    if (isEmpty) {
      return (
        <span className="text-gray-500">
          {bracket[0]}{bracket[1]}
        </span>
      )
    }

    return (
      <>
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center hover:bg-bg-light rounded px-0.5 -ml-0.5"
        >
          <span className="w-4 text-center text-gray-500">
            {expanded ? '▼' : '▶'}
          </span>
          {!expanded && <span className="text-gray-500 ml-1">{preview}</span>}
        </button>
        {expanded ? (
          <>
            <span className="text-gray-400">{bracket[0]}</span>
            <div className="pl-4 border-l border-border ml-1">
              {entries.map(([k, v], i) => (
                <JSONNode
                  key={k}
                  keyName={type === 'array' ? undefined : k}
                  value={v}
                  depth={depth + 1}
                  initialExpanded={initialExpanded}
                  maxInitialDepth={maxInitialDepth}
                  isLast={i === entries.length - 1}
                />
              ))}
            </div>
            <span className="text-gray-400">{bracket[1]}</span>
          </>
        ) : null}
      </>
    )
  }

  return (
    <div className={clsx('leading-relaxed', !isLast && 'mb-0.5')}>
      {keyName !== undefined && (
        <>
          <span className="text-sky-400">{keyName}</span>
          <span className="text-gray-500">: </span>
        </>
      )}
      {isExpandable ? renderExpandable() : renderValue()}
      {!isLast && !expanded && <span className="text-gray-500">,</span>}
    </div>
  )
}

// 尝试解析 JSON 字符串并渲染树形结构
interface JSONViewerProps {
  content: string
  className?: string
  initialViewMode?: 'tree' | 'raw'
  treeInitialExpanded?: boolean
  treeMaxInitialDepth?: number
  buttonOrder?: 'raw-first' | 'tree-first'
}

export function JSONViewer({
  content,
  className,
  initialViewMode = 'raw',
  treeInitialExpanded = true,
  treeMaxInitialDepth = 2,
  buttonOrder = 'raw-first',
}: JSONViewerProps) {
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>(initialViewMode)
  const toggleButtonClass = (active: boolean) => clsx(
    'btn !px-2 !py-1 !text-xs',
    active ? 'btn-primary' : 'btn-secondary'
  )

  const parsedData = useMemo(() => {
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }, [content])

  const isJSON = parsedData !== null

  if (!isJSON) {
    return (
      <pre className={clsx('text-xs font-mono whitespace-pre-wrap break-all', className)}>
        {content}
      </pre>
    )
  }

  return (
    <div className={className}>
      <div className="flex gap-2 mb-2">
        {buttonOrder === 'tree-first' ? (
          <>
            <button
              onClick={() => setViewMode('tree')}
              className={toggleButtonClass(viewMode === 'tree')}
            >
              树形
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={toggleButtonClass(viewMode === 'raw')}
            >
              原始
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setViewMode('raw')}
              className={toggleButtonClass(viewMode === 'raw')}
            >
              原始
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={toggleButtonClass(viewMode === 'tree')}
            >
              树形
            </button>
          </>
        )}
      </div>
      {viewMode === 'tree' ? (
        <div className="bg-bg-dark p-3 rounded overflow-x-auto max-h-96 overflow-y-auto">
          <JSONTree
            data={parsedData}
            initialExpanded={treeInitialExpanded}
            maxInitialDepth={treeMaxInitialDepth}
          />
        </div>
      ) : (
        <pre className="text-xs font-mono bg-bg-dark p-3 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      )}
    </div>
  )
}
