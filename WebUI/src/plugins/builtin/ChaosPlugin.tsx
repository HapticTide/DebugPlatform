// 混沌工程前端插件

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { ChaosRule, ChaosType } from '@/types'
import {
    getChaosRules,
    createChaosRule,
    updateChaosRule,
    deleteChaosRule,
    deleteAllChaosRules,
} from '@/services/api'
import clsx from 'clsx'
import {
    ChaosIcon,
    TimerIcon,
    ClockIcon,
    PlugIcon,
    DiceIcon,
    BombIcon,
    SnailIcon,
    TrashIcon,
    EditIcon
} from '@/components/icons'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
    BuiltinPluginId,
} from '../types'

// ChaosType 的类型标识
type ChaosTypeKind = ChaosType['type']

// 插件实现类
class ChaosPluginImpl implements FrontendPlugin {
    metadata: PluginMetadata = {
        pluginId: BuiltinPluginId.CHAOS,
        displayName: 'Chaos',
        version: '1.0.0',
        description: '混沌工程测试',
        icon: <ChaosIcon size={16} />,
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
            ['chaos_triggered', 'chaos_config_change'],
            (event) => this.handleEvent(event)
        )

        this.state = 'ready'
    }

    render(props: PluginRenderProps): React.ReactNode {
        return <ChaosPluginView {...props} />
    }

    onActivate(): void {
        console.log('[ChaosPlugin] Activated')
    }

    onDeactivate(): void {
        console.log('[ChaosPlugin] Deactivated')
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
        console.log('[ChaosPlugin] Received event:', event.eventType)
    }
}

// 插件视图组件
function ChaosPluginView({ context, isActive }: PluginRenderProps) {
    const deviceId = context.deviceId

    const [rules, setRules] = useState<ChaosRule[]>([])
    const [loading, setLoading] = useState(false)
    const [editingRule, setEditingRule] = useState<Partial<ChaosRule> | null>(null)
    const [showEditor, setShowEditor] = useState(false)

    const fetchRules = useCallback(async () => {
        if (!deviceId) return
        setLoading(true)
        try {
            const data = await getChaosRules(deviceId)
            // 按创建时间倒序排序（最新创建的在前）
            const sortedData = [...data].sort((a, b) => {
                if (!a.createdAt && !b.createdAt) return 0
                if (!a.createdAt) return 1
                if (!b.createdAt) return -1
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            })
            setRules(sortedData)
        } catch (error) {
            console.error('Failed to fetch chaos rules:', error)
        } finally {
            setLoading(false)
        }
    }, [deviceId])

    useEffect(() => {
        if (isActive && deviceId) {
            fetchRules()
        }
    }, [isActive, deviceId, fetchRules])

    const handleCreate = () => {
        setEditingRule({
            name: '',
            urlPattern: '',
            chaos: { type: 'latency', minLatency: 500, maxLatency: 2000 },
            enabled: true,
            priority: 0,
            probability: 1.0,
        })
        setShowEditor(true)
    }

    const handleEdit = (rule: ChaosRule) => {
        setEditingRule({ ...rule })
        setShowEditor(true)
    }

    const handleSave = async () => {
        if (!editingRule || !deviceId) return

        try {
            if (editingRule.id) {
                await updateChaosRule(deviceId, editingRule.id, editingRule)
            } else {
                await createChaosRule(deviceId, editingRule as Omit<ChaosRule, 'id'>)
            }
            setShowEditor(false)
            setEditingRule(null)
            fetchRules()
        } catch (error) {
            console.error('Failed to save chaos rule:', error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除这条故障注入规则吗？')) return
        if (!deviceId) return
        try {
            await deleteChaosRule(deviceId, id)
            fetchRules()
        } catch (error) {
            console.error('Failed to delete chaos rule:', error)
        }
    }

    const handleClearAll = async () => {
        if (!confirm('确定要清空所有故障注入规则吗？此操作不可恢复。')) return
        if (!deviceId) return
        try {
            await deleteAllChaosRules(deviceId)
            fetchRules()
        } catch (error) {
            console.error('Failed to clear all chaos rules:', error)
        }
    }

    const handleToggleEnabled = async (rule: ChaosRule) => {
        if (!deviceId) return
        try {
            await updateChaosRule(deviceId, rule.id, { enabled: !rule.enabled })
            fetchRules()
        } catch (error) {
            console.error('Failed to toggle chaos rule:', error)
        }
    }

    // 统计启用的规则数量
    const enabledCount = useMemo(() => rules.filter(r => r.enabled).length, [rules])

    if (!isActive || !deviceId) {
        return null
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-4 py-2 border-b border-border bg-bg-medium">
                {/* 操作栏 */}
                <div className="flex items-center justify-between">
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
                        <button
                            onClick={handleCreate}
                            className="btn btn-primary text-xs px-2.5 py-1.5"
                        >
                            新建规则
                        </button>
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
            </div>

            {/* Rule List */}
            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-text-muted">加载中...</div>
                ) : rules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted py-12">
                        <ChaosIcon size={48} className="mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">暂无故障注入规则</p>
                        <p className="text-sm mb-6">创建规则来模拟网络故障和异常</p>
                        <button onClick={handleCreate} className="btn btn-primary">
                            创建第一条规则
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rules.map((rule) => (
                            <ChaosRuleCard
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

            {/* Editor Modal */}
            {showEditor && editingRule && (
                <ChaosRuleEditor
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

const chaosTypeConfig: Record<ChaosTypeKind, { label: string; color: string; icon: React.ReactNode; description: string }> = {
    latency: { label: '延迟', color: 'bg-yellow-500/20 text-yellow-400', icon: <TimerIcon size={16} />, description: '增加网络延迟' },
    timeout: { label: '超时', color: 'bg-orange-500/20 text-orange-400', icon: <ClockIcon size={16} />, description: '请求超时' },
    connectionReset: { label: '连接重置', color: 'bg-red-500/20 text-red-400', icon: <PlugIcon size={16} />, description: '模拟连接重置' },
    randomError: { label: '随机错误', color: 'bg-pink-500/20 text-pink-400', icon: <DiceIcon size={16} />, description: '返回随机错误码' },
    corruptResponse: { label: '数据损坏', color: 'bg-purple-500/20 text-purple-400', icon: <BombIcon size={16} />, description: '损坏响应数据' },
    slowNetwork: { label: '慢速网络', color: 'bg-blue-500/20 text-blue-400', icon: <SnailIcon size={16} />, description: '限制网络带宽' },
    dropRequest: { label: '丢弃请求', color: 'bg-gray-500/20 text-gray-400', icon: <TrashIcon size={16} />, description: '直接丢弃请求' },
}

function ChaosRuleCard({
    rule,
    onEdit,
    onDelete,
    onToggle,
}: {
    rule: ChaosRule
    onEdit: () => void
    onDelete: () => void
    onToggle: () => void
}) {
    const typeConfig = chaosTypeConfig[rule.chaos.type]

    const getParamDescription = () => {
        const chaos = rule.chaos
        switch (chaos.type) {
            case 'latency':
                return `延迟: ${chaos.minLatency}-${chaos.maxLatency}ms`
            case 'slowNetwork':
                return `带宽: ${chaos.bytesPerSecond} B/s`
            case 'randomError':
                return `错误码: ${chaos.errorCodes.join(', ')}`
            default:
                return null
        }
    }

    const paramDesc = getParamDescription()

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
                        <div className="font-medium text-text-primary flex items-center gap-2">
                            <span>{typeConfig.icon}</span>
                            {rule.name || '未命名规则'}
                        </div>
                        <div className="text-xs text-text-muted flex items-center gap-2 mt-1">
                            <span className={clsx('px-1.5 py-0.5 rounded text-2xs', typeConfig.color)}>
                                {typeConfig.label}
                            </span>
                            {rule.probability < 1 && (
                                <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-2xs">
                                    {Math.round(rule.probability * 100)}% 概率
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

            {/* Parameters */}
            {paramDesc && (
                <div className="mt-2 text-xs text-text-muted">
                    {paramDesc}
                </div>
            )}
        </div>
    )
}

function ChaosRuleEditor({
    rule,
    onChange,
    onSave,
    onCancel,
}: {
    rule: Partial<ChaosRule>
    onChange: (rule: Partial<ChaosRule>) => void
    onSave: () => void
    onCancel: () => void
}) {
    const chaosType = rule.chaos?.type || 'latency'

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

    const handleTypeChange = (newType: ChaosTypeKind) => {
        let newChaos: ChaosType
        switch (newType) {
            case 'latency':
                newChaos = { type: 'latency', minLatency: 500, maxLatency: 2000 }
                break
            case 'timeout':
                newChaos = { type: 'timeout' }
                break
            case 'connectionReset':
                newChaos = { type: 'connectionReset' }
                break
            case 'randomError':
                newChaos = { type: 'randomError', errorCodes: [500, 502, 503] }
                break
            case 'corruptResponse':
                newChaos = { type: 'corruptResponse' }
                break
            case 'slowNetwork':
                newChaos = { type: 'slowNetwork', bytesPerSecond: 1024 }
                break
            case 'dropRequest':
                newChaos = { type: 'dropRequest' }
                break
            default:
                newChaos = { type: 'latency', minLatency: 500, maxLatency: 2000 }
        }
        onChange({ ...rule, chaos: newChaos })
    }

    const updateChaosParams = (updates: Partial<ChaosType>) => {
        if (!rule.chaos) return
        onChange({ ...rule, chaos: { ...rule.chaos, ...updates } as ChaosType })
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

            {/* Modal */}
            <div className="relative bg-bg-dark border border-border rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-medium text-text-primary mb-4">
                    {rule.id ? '编辑故障注入规则' : '新建故障注入规则'}
                </h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-text-muted mb-1">规则名称</label>
                        <input
                            type="text"
                            value={rule.name || ''}
                            onChange={(e) => onChange({ ...rule, name: e.target.value })}
                            placeholder="例如：登录接口延迟"
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

                    <div>
                        <label className="block text-sm text-text-muted mb-2">故障注入类型</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(Object.entries(chaosTypeConfig) as [ChaosTypeKind, typeof chaosTypeConfig['latency']][]).map(
                                ([type, config]) => (
                                    <button
                                        key={type}
                                        onClick={() => handleTypeChange(type)}
                                        className={clsx(
                                            'p-3 rounded-lg border text-left transition-all',
                                            chaosType === type
                                                ? 'border-primary bg-primary/10'
                                                : 'border-border hover:border-border-hover'
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{config.icon}</span>
                                            <span className="font-medium text-text-primary">{config.label}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-1">{config.description}</p>
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {/* Type-specific parameters */}
                    {rule.chaos?.type === 'latency' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-text-muted mb-1">最小延迟 (ms)</label>
                                <input
                                    type="number"
                                    value={rule.chaos.minLatency}
                                    onChange={(e) => updateChaosParams({ minLatency: parseInt(e.target.value) || 0 })}
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-text-muted mb-1">最大延迟 (ms)</label>
                                <input
                                    type="number"
                                    value={rule.chaos.maxLatency}
                                    onChange={(e) => updateChaosParams({ maxLatency: parseInt(e.target.value) || 0 })}
                                    className="input w-full"
                                />
                            </div>
                        </div>
                    )}

                    {rule.chaos?.type === 'slowNetwork' && (
                        <div>
                            <label className="block text-sm text-text-muted mb-1">带宽限制 (B/s)</label>
                            <input
                                type="number"
                                value={rule.chaos.bytesPerSecond}
                                onChange={(e) => updateChaosParams({ bytesPerSecond: parseInt(e.target.value) || 1024 })}
                                className="input w-full"
                            />
                            <p className="text-xs text-text-muted mt-1">1024 = 1KB/s, 10240 = 10KB/s</p>
                        </div>
                    )}

                    {rule.chaos?.type === 'randomError' && (
                        <div>
                            <label className="block text-sm text-text-muted mb-1">错误状态码 (逗号分隔)</label>
                            <input
                                type="text"
                                value={rule.chaos.errorCodes.join(', ')}
                                onChange={(e) => {
                                    const codes = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
                                    updateChaosParams({ errorCodes: codes.length > 0 ? codes : [500] })
                                }}
                                placeholder="500, 502, 503"
                                className="input w-full"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-text-muted mb-1">触发概率</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={(rule.probability || 1) * 100}
                                    onChange={(e) => onChange({ ...rule, probability: parseInt(e.target.value) / 100 })}
                                    className="flex-1"
                                />
                                <span className="text-text-primary w-12 text-right">
                                    {Math.round((rule.probability || 1) * 100)}%
                                </span>
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
                        </div>
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

export const ChaosPlugin = new ChaosPluginImpl()
