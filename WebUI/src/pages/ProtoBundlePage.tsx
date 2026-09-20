/**
 * ProtoBundlePage.tsx
 * Protobuf 解码包管理：上传 descriptor 与配套的解码规则，托管在 Hub 供所有人共用。
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useProtoBundleStore } from '@/stores/protoBundleStore'
import { BackIcon, PackageIcon, TrashIcon, CheckIcon, FolderIcon } from '@/components/icons'
import { formatBytes } from '@/utils/format'

export function ProtoBundlePage() {
    const {
        bundles,
        active,
        messageTypes,
        rules,
        loading,
        error,
        load,
        uploadBundle,
        activateBundle,
        deleteBundle,
    } = useProtoBundleStore()

    const descriptorInputRef = useRef<HTMLInputElement>(null)
    const rulesInputRef = useRef<HTMLInputElement>(null)

    const [descriptorFile, setDescriptorFile] = useState<File | null>(null)
    const [rulesFile, setRulesFile] = useState<File | null>(null)
    const [name, setName] = useState('')
    const [note, setNote] = useState('')
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        void load({ force: true })
    }, [load])

    // 包名默认取 descriptor 文件名（去扩展名），通常已经带着来源 commit
    const handlePickDescriptor = (file: File | null) => {
        setDescriptorFile(file)
        if (file && !name) {
            setName(file.name.replace(/\.desc$/i, ''))
        }
    }

    const handleUpload = async () => {
        if (!descriptorFile) {
            setUploadError('请选择 descriptor（.desc）文件')
            return
        }

        setSubmitting(true)
        setUploadError(null)
        try {
            await uploadBundle({
                name: name.trim() || descriptorFile.name,
                descriptorFile,
                rulesFile,
                note: note.trim() || undefined,
                activate: true,
            })
            setDescriptorFile(null)
            setRulesFile(null)
            setName('')
            setNote('')
            if (descriptorInputRef.current) descriptorInputRef.current.value = ''
            if (rulesInputRef.current) rulesInputRef.current.value = ''
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : String(e))
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: string, bundleName: string) => {
        if (!confirm(`确定删除解码包「${bundleName}」？`)) return
        await deleteBundle(id)
    }

    const pathCount = rules ? Object.keys(rules.pathTypes ?? {}).length : 0
    const nestedCount = rules ? (rules.nested ?? []).length : 0

    return (
        <div className="h-full flex flex-col">
            <header className="px-6 py-4 bg-bg-dark border-b border-border">
                <div className="flex items-center gap-4">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform"><BackIcon size={16} /></span>
                        <span>返回</span>
                    </Link>

                    <div className="h-6 w-px bg-border" />

                    <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center border border-border text-purple-400">
                            <PackageIcon size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-text-primary">Protobuf 解码包</h1>
                            <p className="text-xs text-text-muted">
                                上传 descriptor 与解码规则后，抓包详情与 DB Inspector 会按字段名展示 protobuf 报文
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {error && (
                    <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-sm text-red-400">
                        {error}
                    </div>
                )}

                {/* 当前生效 */}
                <section className="rounded-lg border border-border bg-bg-dark p-4">
                    <h2 className="text-sm font-medium text-text-primary mb-3">当前生效</h2>
                    {active ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-xs">
                                    生效中
                                </span>
                                <span className="text-text-primary font-medium">{active.name}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-text-muted md:grid-cols-4">
                                <div>消息类型：{messageTypes.length}</div>
                                <div>path 映射：{pathCount}</div>
                                <div>嵌套规则：{nestedCount}</div>
                                <div>descriptor：{formatBytes(active.descriptorSize)}</div>
                            </div>
                            {!active.hasRules && (
                                <p className="text-xs text-amber-400">
                                    这份包没有解码规则，只能按手选的类型解最外层，bytes 字段不会展开。
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-text-muted">还没有解码包。上传一份后即可按字段名解析。</p>
                    )}
                </section>

                {/* 上传 */}
                <section className="rounded-lg border border-border bg-bg-dark p-4 space-y-3">
                    <h2 className="text-sm font-medium text-text-primary">上传新的解码包</h2>
                    <p className="text-xs text-text-muted">
                        descriptor 由 <code className="text-text-secondary">protoc --descriptor_set_out --include_imports</code> 生成；
                        解码规则是配套生成的 JSON，描述 bytes 字段该按什么类型展开。两者应取自同一次生成，
                        否则规则里的类型名可能在 descriptor 里不存在。
                    </p>

                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-xs text-text-secondary">Descriptor（.desc，必填）</span>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={descriptorInputRef}
                                    type="file"
                                    accept=".desc,.pb,.bin"
                                    onChange={(e) => handlePickDescriptor(e.target.files?.[0] ?? null)}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => descriptorInputRef.current?.click()}
                                    className="btn btn-ghost text-xs"
                                >
                                    <FolderIcon size={14} className="mr-1" />
                                    选择文件
                                </button>
                                <span className="text-xs text-text-muted truncate">
                                    {descriptorFile ? `${descriptorFile.name}（${formatBytes(descriptorFile.size)}）` : '未选择'}
                                </span>
                            </div>
                        </label>

                        <label className="space-y-1">
                            <span className="text-xs text-text-secondary">解码规则（.json，可选）</span>
                            <div className="flex items-center gap-2">
                                <input
                                    ref={rulesInputRef}
                                    type="file"
                                    accept=".json"
                                    onChange={(e) => setRulesFile(e.target.files?.[0] ?? null)}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => rulesInputRef.current?.click()}
                                    className="btn btn-ghost text-xs"
                                >
                                    <FolderIcon size={14} className="mr-1" />
                                    选择文件
                                </button>
                                <span className="text-xs text-text-muted truncate">
                                    {rulesFile ? `${rulesFile.name}（${formatBytes(rulesFile.size)}）` : '未选择'}
                                </span>
                            </div>
                        </label>

                        <label className="space-y-1">
                            <span className="text-xs text-text-secondary">名称</span>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例如 proto@abc1234"
                                className="w-full px-2 py-1.5 text-sm bg-bg-medium border border-border rounded
                                           text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
                            />
                        </label>

                        <label className="space-y-1">
                            <span className="text-xs text-text-secondary">备注（可选）</span>
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm bg-bg-medium border border-border rounded
                                           text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
                            />
                        </label>
                    </div>

                    {uploadError && <div className="text-xs text-red-400">{uploadError}</div>}

                    <button
                        onClick={handleUpload}
                        disabled={submitting || !descriptorFile}
                        className="btn btn-primary disabled:opacity-50"
                    >
                        {submitting ? '上传中…' : '上传并启用'}
                    </button>
                </section>

                {/* 历史 */}
                <section className="rounded-lg border border-border bg-bg-dark p-4">
                    <h2 className="text-sm font-medium text-text-primary mb-3">
                        全部解码包{bundles.length > 0 && `（${bundles.length}）`}
                    </h2>

                    {loading && bundles.length === 0 ? (
                        <p className="text-sm text-text-muted">加载中…</p>
                    ) : bundles.length === 0 ? (
                        <p className="text-sm text-text-muted">还没有上传过解码包。</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {bundles.map((bundle) => (
                                <li key={bundle.id} className="py-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-text-primary truncate">{bundle.name}</span>
                                            {bundle.isActive && (
                                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-2xs">
                                                    生效中
                                                </span>
                                            )}
                                            {!bundle.hasRules && (
                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-2xs">
                                                    无规则
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-text-muted truncate">
                                            {bundle.descriptorFilename} · {formatBytes(bundle.descriptorSize)}
                                            {bundle.rulesFilename ? ` · ${bundle.rulesFilename}` : ''}
                                            {bundle.note ? ` · ${bundle.note}` : ''}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => activateBundle(bundle.id)}
                                        disabled={bundle.isActive}
                                        className={clsx(
                                            'btn btn-ghost text-xs',
                                            bundle.isActive && 'opacity-40 cursor-default'
                                        )}
                                        title={bundle.isActive ? '已生效' : '设为生效'}
                                    >
                                        <CheckIcon size={14} className="mr-1" />
                                        启用
                                    </button>

                                    <button
                                        onClick={() => handleDelete(bundle.id, bundle.name)}
                                        className="btn btn-ghost text-xs text-red-400 hover:bg-red-500/10"
                                        title="删除"
                                    >
                                        <TrashIcon size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    )
}
