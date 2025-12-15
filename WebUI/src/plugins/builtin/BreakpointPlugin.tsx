// 断点调试前端插件

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { BreakpointRule, BreakpointPhase, BreakpointAction, BreakpointHit } from '@/types'
import {
    getBreakpointRules,
    createBreakpointRule,
    updateBreakpointRule,
    deleteBreakpointRule,
    deleteAllBreakpointRules,
} from '@/services/api'
import { BreakpointHitPanel } from '@/components/BreakpointHitPanel'
import clsx from 'clsx'
import { PauseIcon, EditIcon, TrashIcon, BreakpointIcon } from '@/components/icons'
import { useBreakpointStore } from '@/stores/breakpointStore'
import { useToastStore } from '@/stores/toastStore'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
    BuiltinPluginId,
} from '../types'

// 插件实现类
class BreakpointPluginImpl implements FrontendPlugin {
    metadata: PluginMetadata = {
        pluginId: BuiltinPluginId.BREAKPOINT,
        displayName: 'Breakpoint',
        version: '1.0.0',
        description: '请求断点调试',
        icon: <BreakpointIcon size={16} />,
        dependencies: [BuiltinPluginId.HTTP],
    }

    state: PluginState = 'uninitialized'
    isEnabled = true

    private pluginContext: PluginContext | null = null
    private unsubscribe: (() => void) | null = null

    async initialize(context: PluginContext): Promise<void> {
        this.pluginContext = context
        this.state = 'loading'

        this.unsubscribe = context.subscribeToEvents(
            ['breakpoint_hit', 'breakpoint_rule_change'],
            (event) => this.handleEvent(event)
        )

        this.state = 'ready'
    }

    render(props: PluginRenderProps): React.ReactNode {
        return <BreakpointPluginView {...props} />
    }

    onActivate(): void {
        console.log('[BreakpointPlugin] Activated')
    }

    onDeactivate(): void {
        console.log('[BreakpointPlugin] Deactivated')
    }

    onEvent(event: PluginEvent): void {
        this.handleEvent(event)
    }

    destroy(): void {
        this.unsubscribe?.()
        this.pluginContext = null
        this.state = 'uninitialized'
    }

    get context(): PluginContext | null {
        return this.pluginContext
    }

    private handleEvent(event: PluginEvent): void {
        if (event.eventType === 'breakpoint_hit' && event.payload) {
            const hit = event.payload as BreakpointHit
            useBreakpointStore.getState().addHit(hit)
        } else if (event.eventType === 'breakpoint_rule_change') {
            const deviceId = this.pluginContext?.deviceId
            if (deviceId) {
                useBreakpointStore.getState().fetchPendingHits(deviceId)
            }
        }
    }
}

// 插件视图组件
function BreakpointPluginView({ context, isActive }: PluginRenderProps) {
    const deviceId = context.deviceId
    const { pendingHits, fetchPendingHits, resumeBreakpoint: storeResumeBreakpoint } = useBreakpointStore()
    const toast = useToastStore()

    const [rules, setRules] = useState<BreakpointRule[]>([])
    const [loading, setLoading] = useState(false)
    const [editingRule, setEditingRule] = useState<Partial<BreakpointRule> | null>(null)
    const [showEditor, setShowEditor] = useState(false)
    const [activeTab, setActiveTab] = useState<'rules' | 'pending'>('rules')
    const [resuming, setResuming] = useState(false)

    const fetchRules = useCallback(async () => {
        if (!deviceId) return
        setLoading(true)
        try {
            const data = await getBreakpointRules(deviceId)
            // 按创建时间倒序排序（最新创建的在前）
            const sortedData = [...data].sort((a, b) => {
                if (!a.createdAt && !b.createdAt) return 0
                if (!a.createdAt) return 1
                if (!b.createdAt) return -1
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            })
            setRules(sortedData)
        } catch (error) {
            console.error('Failed to fetch breakpoint rules:', error)
        } finally {
            setLoading(false)
        }
    }, [deviceId])

    // 初始加载
    useEffect(() => {
        if (isActive && deviceId) {
            fetchRules()
            fetchPendingHits(deviceId)
        }
    }, [isActive, deviceId, fetchRules, fetchPendingHits])

    // 定期轮询 pending hits
    useEffect(() => {
        if (!isActive || !deviceId) return
        const interval = setInterval(() => fetchPendingHits(deviceId), 2000)
        return () => clearInterval(interval)
    }, [isActive, deviceId, fetchPendingHits])

    // 当有 pending hits 时自动切换到 pending tab
    useEffect(() => {
        if (pendingHits.length > 0) {
            setActiveTab('pending')
        }
    }, [pendingHits.length])

    const handleCreate = () => {
        setEditingRule({
            name: '',
            urlPattern: '',
            method: '',
            phase: 'request',
            enabled: true,
            priority: 0,
        })
        setShowEditor(true)
    }

    const handleEdit = (rule: BreakpointRule) => {
        setEditingRule({ ...rule })
        setShowEditor(true)
    }

    const handleSave = async () => {
        if (!editingRule || !deviceId) return

        try {
            if (editingRule.id) {
                await updateBreakpointRule(deviceId, editingRule.id, editingRule)
            } else {
                await createBreakpointRule(deviceId, editingRule as Omit<BreakpointRule, 'id'>)
            }
            setShowEditor(false)
            setEditingRule(null)
            fetchRules()
        } catch (error) {
            console.error('Failed to save breakpoint rule:', error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除这条断点规则吗？')) return
        if (!deviceId) return
        try {
            await deleteBreakpointRule(deviceId, id)
            fetchRules()
        } catch (error) {
            console.error('Failed to delete breakpoint rule:', error)
        }
    }

    const handleClearAll = async () => {
        if (!confirm('确定要清空所有断点规则吗？此操作不可恢复。')) return
        if (!deviceId) return
        try {
            await deleteAllBreakpointRules(deviceId)
            fetchRules()
        } catch (error) {
            console.error('Failed to clear all breakpoint rules:', error)
        }
    }

    const handleToggleEnabled = async (rule: BreakpointRule) => {
        if (!deviceId) return
        try {
            await updateBreakpointRule(deviceId, rule.id, { enabled: !rule.enabled })
            fetchRules()
        } catch (error) {
            console.error('Failed to toggle breakpoint rule:', error)
        }
    }

    const handleResumeBreakpoint = useCallback(async (requestId: string, action: BreakpointAction) => {
        if (!deviceId) return
        setResuming(true)
        try {
            await storeResumeBreakpoint(deviceId, requestId, action)
            toast.show('success', '断点已处理')
        } catch (error) {
            toast.show('error', '处理断点失败')
        } finally {
            setResuming(false)
        }
    }, [deviceId, storeResumeBreakpoint, toast])

    // 统计启用的规则数量
    const enabledCount = useMemo(() => rules.filter(r => r.enabled).length, [rules])

    if (!isActive || !deviceId) {
        return null
    }

    return (
        <div className="h-full flex flex-col">
            {/* 操作栏 */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-bg-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* 刷新按钮 */}
                    <button
                        onClick={fetchRules}
                        className="btn btn-secondary text-xs px-2.5 py-1.5"
                        title="刷新规则列表"
                        disabled={loading}
                    >
                        刷新
                    </button>

                    {/* 分隔线 */}
                    <div className="w-px h-4 bg-border mx-1" />

                    {/* 新建规则按钮 */}
                    {activeTab === 'rules' && (
                        <button
                            onClick={handleCreate}
                            className="btn btn-primary text-xs px-2.5 py-1.5"
                        >
                            新建规则
                        </button>
                    )}
                </div>

                {/* 右侧：清空规则 + 规则统计 */}
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {/* 清空规则按钮 */}
                    {rules.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            className="btn btn-ghost text-red-400 hover:bg-red-500/10 text-xs px-2 py-1.5 flex-shrink-0 flex items-center"
                            title="清空所有规则"
                        >
                            <TrashIcon size={14} className="mr-1" />
                            清空规则
                        </button>
                    )}

                    {/* 分隔线 */}
                    {rules.length > 0 && <div className="w-px h-4 bg-border mx-1" />}

                    {/* 规则统计 */}
                    <span>共 {rules.length} 条规则</span>
                    <span className="text-text-muted">•</span>
                    <span className="text-status-success">{enabledCount} 条启用</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-bg-medium">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={clsx(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            activeTab === 'rules'
                                ? 'bg-bg-light text-text-primary'
                                : 'text-text-muted hover:text-text-secondary hover:bg-bg-light/50'
                        )}
                    >
                        规则列表 ({rules.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={clsx(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-colors relative',
                            activeTab === 'pending'
                                ? 'bg-bg-light text-text-primary'
                                : 'text-text-muted hover:text-text-secondary hover:bg-bg-light/50'
                        )}
                    >
                        等待处理
                        {pendingHits.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                                {pendingHits.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'rules' ? (
                    /* Rule List */
                    <div className="h-full overflow-auto p-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-text-muted">加载中...</div>
                        ) : rules.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
                                <PauseIcon size={48} className="mb-4 opacity-50" />
                                <p className="text-lg font-medium mb-2">暂无断点规则</p>
                                <p className="text-sm mb-6">创建规则来拦截和调试请求</p>
                                <button onClick={handleCreate} className="btn btn-primary">
                                    创建第一条规则
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {rules.map((rule) => (
                                    <BreakpointRuleCard
                                        key={rule.id}
                                        rule={rule}
                                        onEdit={() => handleEdit(rule)}
                                        onDelete={() => handleDelete(rule.id)}
                                        onToggle={() => handleToggleEnabled(rule)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Pending Hits Panel */
                    <BreakpointHitPanel
                        hits={pendingHits}
                        onResume={handleResumeBreakpoint}
                        loading={resuming}
                    />
                )}
            </div>

            {/* Editor Modal */}
            {showEditor && editingRule && (
                <BreakpointRuleEditor
                    rule={editingRule}
                    onChange={setEditingRule}
                    onSave={handleSave}
                    onCancel={() => {
                        setShowEditor(false)
                        setEditingRule(null)
                    }}
                />
            )}
        </div>
    )
}

function BreakpointRuleCard({
    rule,
    onEdit,
    onDelete,
    onToggle,
}: {
    rule: BreakpointRule
    onEdit: () => void
    onDelete: () => void
    onToggle: () => void
}) {
    const phaseLabels: Record<BreakpointPhase, string> = {
        request: '请求阶段',
        response: '响应阶段',
        both: '双向拦截',
    }

    return (
        <div
            className={clsx(
                'p-4 bg-bg-dark border border-border rounded-xl transition-all',
                !rule.enabled && 'opacity-50'
            )}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button
                        onClick={onToggle}
                        className={clsx(
                            'w-10 h-6 rounded-full transition-colors relative',
                            rule.enabled ? 'bg-primary' : 'bg-bg-light'
                        )}
                    >
                        <span
                            className={clsx(
                                'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                                rule.enabled ? 'left-5' : 'left-1'
                            )}
                        />
                    </button>

                    <div>
                        <div className="font-medium text-text-primary">{rule.name || '未命名规则'}</div>
                        <div className="text-xs text-text-muted flex items-center gap-2">
                            <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-2xs">
                                {phaseLabels[rule.phase]}
                            </span>
                            {rule.method && (
                                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-2xs">
                                    {rule.method}
                                </span>
                            )}
                            {rule.urlPattern && (
                                <code className="text-text-secondary truncate max-w-[200px]">{rule.urlPattern}</code>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-light rounded-lg transition-colors"
                    >
                        <EditIcon size={16} />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                        <TrashIcon size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}

function BreakpointRuleEditor({
    rule,
    onChange,
    onSave,
    onCancel,
}: {
    rule: Partial<BreakpointRule>
    onChange: (rule: Partial<BreakpointRule>) => void
    onSave: () => void
    onCancel: () => void
}) {
    // ESC 键关闭弹窗（输入框激活时不响应，与 Mock 弹窗行为一致）
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const target = e.target as HTMLElement
                const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
                if (!isInput) {
                    e.stopPropagation()
                    onCancel()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [onCancel])

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

            {/* Modal */}
            <div className="relative bg-bg-dark border border-border rounded-2xl w-full max-w-lg p-6">
                <h3 className="text-lg font-medium text-text-primary mb-4">
                    {rule.id ? '编辑断点规则' : '新建断点规则'}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-text-muted mb-1">规则名称</label>
                        <input
                            type="text"
                            value={rule.name || ''}
                            onChange={(e) => onChange({ ...rule, name: e.target.value })}
                            placeholder="例如：拦截登录接口"
                            className="input w-full"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-text-muted mb-1">URL 匹配模式</label>
                        <input
                            type="text"
                            value={rule.urlPattern || ''}
                            onChange={(e) => onChange({ ...rule, urlPattern: e.target.value })}
                            placeholder="例如：*/api/login* 或留空匹配所有"
                            className="input w-full font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-text-muted mb-1">HTTP 方法</label>
                            <select
                                value={rule.method || ''}
                                onChange={(e) => onChange({ ...rule, method: e.target.value || null })}
                                className="select w-full"
                            >
                                <option value="">全部方法</option>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                                <option value="PATCH">PATCH</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-text-muted mb-1">拦截阶段</label>
                            <select
                                value={rule.phase || 'request'}
                                onChange={(e) => onChange({ ...rule, phase: e.target.value as BreakpointPhase })}
                                className="select w-full"
                            >
                                <option value="request">请求阶段</option>
                                <option value="response">响应阶段</option>
                                <option value="both">双向拦截</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-text-muted mb-1">优先级</label>
                        <input
                            type="number"
                            value={rule.priority || 0}
                            onChange={(e) => onChange({ ...rule, priority: parseInt(e.target.value) || 0 })}
                            className="input w-full"
                        />
                        <p className="text-xs text-text-muted mt-1">数值越大优先级越高</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onCancel} className="btn btn-secondary">
                        取消
                    </button>
                    <button onClick={onSave} className="btn btn-primary">
                        保存
                    </button>
                </div>
            </div>
        </div>
    )
}

export const BreakpointPlugin = new BreakpointPluginImpl()
