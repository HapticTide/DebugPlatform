/**
 * ProtoSchemaViewer.tsx
 * 带 schema 的 Protobuf 展示：用托管的 descriptor + 解码规则把消息解成带字段名的树。
 *
 * 与 ProtobufViewer 的 wire format 模式的区别：那个不需要 schema，但只能给出
 * `field_3: 1735...`；这个能给出 `clientStamp: 1735...`，并且会沿着 bytes 字段一层层往下解。
 */

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { JSONTree } from './JSONTree'
import { CheckIcon, ClipboardIcon, PackageIcon } from './icons'
import { useProtoBundleStore, base64ToBytes } from '@/stores/protoBundleStore'
import { copyToClipboard } from '@/utils/clipboard'
import {
    buildDecodeEvidence,
    presentDecoded,
    unwrapBase64Layer,
    type DecodeOutcome,
    type DecodeStats,
} from '@/utils/protoDecodeEngine'

interface ProtoSchemaViewerProps {
    /** base64 编码的原始报文 */
    base64Data: string
    /** 请求 URL，用于在规则表里查类型 */
    url?: string
    /** 查表方向：请求体 / 响应体 / 下行投递体 */
    direction?: 'req' | 'rsp' | 'deliver'
    className?: string
}

export function ProtoSchemaViewer({ base64Data, url, direction = 'req', className }: ProtoSchemaViewerProps) {
    const { root, rules, messageTypes, active, loading, loaded, error, load, decode, typeForUrl } =
        useProtoBundleStore()

    const [manualType, setManualType] = useState<string>('')
    const [typeFilter, setTypeFilter] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        void load()
    }, [load])

    /** 规则表按 URL 命中的类型；命中不了就要人来选 */
    const matchedType = useMemo(() => {
        if (!url || !rules) return null
        return typeForUrl(url, direction)
    }, [url, rules, direction, typeForUrl])

    const effectiveType = manualType || matchedType || ''

    // 换了一条请求就把手选的类型清掉，避免拿上一条的类型解这一条
    useEffect(() => {
        setManualType('')
    }, [base64Data])

    /** 有的端会把 proto body 再 base64 一次，解码前先剥掉 */
    const payload = useMemo(() => {
        try {
            const raw = base64ToBytes(base64Data)
            const unwrapped = unwrapBase64Layer(raw)
            let b64 = base64Data
            if (unwrapped.unwrapped) {
                let binary = ''
                for (let i = 0; i < unwrapped.bytes.length; i++) {
                    binary += String.fromCharCode(unwrapped.bytes[i])
                }
                b64 = btoa(binary)
            }
            return { base64: b64, doubleEncoded: unwrapped.unwrapped, size: unwrapped.bytes.length }
        } catch {
            return { base64: base64Data, doubleEncoded: false, size: 0 }
        }
    }, [base64Data])

    const outcome: DecodeOutcome | null = useMemo(() => {
        if (!root || !effectiveType) return null
        return decode(effectiveType, payload.base64)
    }, [root, effectiveType, payload.base64, decode])

    /**
     * 把这一次解码打包成证据 JSON 送进剪贴板。
     *
     * 带上 descriptor 与规则表版本、原始 base64，是因为这份 JSON 的用途就是拿去和服务端
     * 对账「这段字节到底是什么」：少了版本，两边按不同 proto 解出的字段名不可比；少了
     * 原始字节，对方只能信我们的截图，没法自己重解一遍。
     */
    const handleCopyJSON = async () => {
        if (!outcome?.ok) return

        const json = buildDecodeEvidence({
            messageType: outcome.messageType,
            value: outcome.value,
            stats: outcome.stats,
            base64: payload.base64,
            sizeBytes: payload.size,
            url,
            direction,
            descriptor: active?.name,
            rules: rules?.generatedFrom,
            doubleEncodedBase64: payload.doubleEncoded || undefined,
        })

        if (await copyToClipboard(json)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const filteredTypes = useMemo(() => {
        if (!typeFilter) return messageTypes.slice(0, 200)
        const needle = typeFilter.toLowerCase()
        return messageTypes.filter((t) => t.toLowerCase().includes(needle)).slice(0, 200)
    }, [messageTypes, typeFilter])

    if (loading && !loaded) {
        return <div className={clsx('text-xs text-gray-500 p-3', className)}>正在加载 Protobuf 解码包…</div>
    }

    if (error) {
        return (
            <div className={clsx('text-xs text-red-400 p-3', className)}>
                加载解码包失败：{error}
            </div>
        )
    }

    if (!active || !root) {
        return (
            <div className={clsx('text-xs text-gray-500 p-3 space-y-1', className)}>
                <div className="flex items-center gap-1.5">
                    <PackageIcon className="w-3.5 h-3.5" />
                    <span>尚未上传 Protobuf 解码包</span>
                </div>
                <div>在侧边栏「Proto」页上传 descriptor（.desc）与解码规则后，这里会按字段名展示。</div>
            </div>
        )
    }

    return (
        <div className={clsx('space-y-2', className)}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="flex items-center gap-1 text-gray-400">
                    <PackageIcon className="w-3.5 h-3.5" />
                    {active.name}
                </span>

                {matchedType && !manualType ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                        按 {matchedType} 解析（规则表命中）
                    </span>
                ) : (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                        {rules ? '规则表未命中此 path' : '未配置解码规则'}，请手动选择类型
                    </span>
                )}

                {payload.doubleEncoded && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
                        已剥离外层 base64
                    </span>
                )}

                {outcome?.ok && (
                    <button
                        onClick={handleCopyJSON}
                        title="复制解码结果 JSON（含消息类型、descriptor / 规则表版本、未解段清单与原始 base64，可直接贴给服务端）"
                        className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-full bg-gray-800
                                   border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-700
                                   transition-colors leading-none whitespace-nowrap"
                    >
                        {copied ? <CheckIcon size={11} /> : <ClipboardIcon size={11} />}
                        <span>{copied ? '已复制' : '复制 JSON'}</span>
                    </button>
                )}
            </div>

            <div className="flex items-center gap-2">
                <input
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    placeholder="筛选消息类型…"
                    className="flex-1 min-w-0 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded
                               text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <select
                    value={effectiveType}
                    onChange={(e) => setManualType(e.target.value)}
                    className="px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200
                               max-w-[260px] focus:outline-none focus:border-blue-500"
                >
                    <option value="">选择消息类型…</option>
                    {matchedType && <option value={matchedType}>{matchedType}（规则表）</option>}
                    {filteredTypes.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </select>
                {manualType && (
                    <button
                        onClick={() => setManualType('')}
                        className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200"
                    >
                        重置
                    </button>
                )}
            </div>

            {!effectiveType && (
                <div className="text-xs text-gray-500 p-3 bg-gray-900/50 rounded border border-gray-800">
                    选择一个消息类型以解析这 {payload.size} 字节。
                </div>
            )}

            {outcome && !outcome.ok && (
                <div className="text-xs text-red-400 p-3 bg-red-500/5 rounded border border-red-500/20">
                    按 {effectiveType} 解码失败：{outcome.error}
                </div>
            )}

            {outcome && outcome.ok && (
                <>
                    <div className="bg-gray-900/50 rounded border border-gray-800 p-2 overflow-auto">
                        <JSONTree data={presentDecoded(outcome.value)} maxInitialDepth={4} />
                    </div>
                    <DecodeSummary stats={outcome.stats} />
                </>
            )}
        </div>
    )
}

function DecodeSummary({ stats }: { stats: DecodeStats }) {
    const [expanded, setExpanded] = useState(false)

    if (stats.expanded === 0 && stats.undecoded === 0) return null

    return (
        <div className="text-[11px] text-gray-500">
            <button onClick={() => setExpanded(!expanded)} className="hover:text-gray-300">
                展开了 {stats.expanded} 段嵌套
                {stats.undecoded > 0 && ` · ${stats.undecoded} 段未解`}
                {' '}
                {expanded ? '▾' : '▸'}
            </button>

            {expanded && (
                <ul className="mt-1 space-y-0.5 font-mono">
                    {stats.trace.map((entry, index) => (
                        <li key={`${entry.path}-${index}`} className={entry.ok ? 'text-gray-400' : 'text-amber-500/80'}>
                            {entry.path} → {entry.messageType ?? '—'}
                            {!entry.ok && entry.reason ? `（${entry.reason}）` : ''}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
