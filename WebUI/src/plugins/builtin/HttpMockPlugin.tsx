// Mock 规则管理前端插件
// 使用 MockRuleList 和 MockRuleEditor 组件

import React, { useEffect, useCallback, useState } from 'react'
import {
    FrontendPlugin,
    PluginContext,
    PluginEvent,
    PluginMetadata,
    PluginRenderProps,
    PluginState,
    BuiltinPluginId,
} from '../types'
import { MockIcon, TrashIcon } from '@/components/icons'
import { useMockStore } from '@/stores/mockStore'
import { useToastStore } from '@/stores/toastStore'
import { MockRuleList } from '@/components/MockRuleList'
import { MockRuleEditor } from '@/components/MockRuleEditor'
import { ListLoadingOverlay } from '@/components/ListLoadingOverlay'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { MockRule } from '@/types'

// 插件实现类
class HttpMockPluginImpl implements FrontendPlugin {
    metadata: PluginMetadata = {
        pluginId: BuiltinPluginId.MOCK,
        displayName: 'Mock',
        version: '1.0.0',
        description: 'Mock 规则管理',
        icon: <MockIcon size={16} />,
        dependencies: [BuiltinPluginId.HTTP],
        isSubPlugin: true, // 作为 HTTP 的子插件
        parentPluginId: BuiltinPluginId.HTTP,
    }

    state: PluginState = 'uninitialized'
    isEnabled = true

    private pluginContext: PluginContext | null = null
    private unsubscribe: (() => void) | null = null

    async initialize(context: PluginContext): Promise<void> {
        this.pluginContext = context
        this.state = 'loading'

        this.unsubscribe = context.subscribeToEvents(['mock_rule_change'], (event) =>
            this.handleEvent(event)
        )

        this.state = 'ready'
    }

    render(props: PluginRenderProps): React.ReactNode {
        return <MockPluginView {...props} />
    }

    onActivate(): void {
        console.log('[MockPlugin] Activated')
    }

    onDeactivate(): void {
        console.log('[MockPlugin] Deactivated')
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
        if (event.eventType === 'mock_rule_change') {
            // 刷新规则列表
            const deviceId = this.pluginContext?.deviceId
            if (deviceId) {
                useMockStore.getState().fetchRules(deviceId)
            }
        }
    }
}

// 插件视图组件 - 包装器
function MockPluginView({ context, isActive }: PluginRenderProps) {
    if (!isActive || !context.deviceId) return null
    return <MockPluginContent deviceId={context.deviceId} isActive={isActive} />
}

// 导出内容组件供 HttpPlugin 使用
export function MockPluginContent({ deviceId, isActive }: { deviceId: string; isActive: boolean }) {
    // 从 mockStore 获取状态

    const {
        rules,
        loading,
        editingRule,
        isEditorOpen,
        fetchRules,
        createRule,
        updateRule,
        deleteRule,
        toggleRuleEnabled,
        openEditor,
        closeEditor,
        clearRules,
    } = useMockStore()

    const toast = useToastStore()

    // 确认对话框状态
    const [showClearConfirm, setShowClearConfirm] = useState(false)
    const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null)

    // 初始加载
    useEffect(() => {
        if (isActive && deviceId) {
            fetchRules(deviceId)
        }
    }, [isActive, deviceId, fetchRules])

    // 刷新
    const handleRefresh = useCallback(() => {
        if (!deviceId) return
        fetchRules(deviceId)
    }, [deviceId, fetchRules])

    // 清空
    const handleClear = useCallback(() => {
        clearRules()
        setShowClearConfirm(false)
        toast.show('success', '已清空 Mock 规则')
    }, [clearRules, toast])

    // 编辑规则
    const handleEdit = useCallback((rule: MockRule) => {
        openEditor(rule)
    }, [openEditor])

    // 删除规则
    const handleDelete = useCallback(async (ruleId: string) => {
        setDeleteRuleId(ruleId)
    }, [])

    const confirmDelete = useCallback(async () => {
        if (!deviceId || !deleteRuleId) return
        await deleteRule(deviceId, deleteRuleId)
        setDeleteRuleId(null)
        toast.show('success', '规则已删除')
    }, [deviceId, deleteRuleId, deleteRule, toast])

    // 切换规则状态
    const handleToggleEnabled = useCallback(async (ruleId: string) => {
        if (!deviceId) return
        await toggleRuleEnabled(deviceId, ruleId)
    }, [deviceId, toggleRuleEnabled])

    // 创建新规则
    const handleCreateNew = useCallback(() => {
        openEditor()
    }, [openEditor])

    // 保存规则
    const handleSaveRule = useCallback(async (ruleData: Omit<MockRule, 'id' | 'deviceId' | 'createdAt' | 'updatedAt'>) => {
        if (!deviceId) return
        try {
            if (editingRule?.id) {
                await updateRule(deviceId, editingRule.id, ruleData as MockRule)
                toast.show('success', '规则已更新')
            } else {
                await createRule(deviceId, ruleData)
                toast.show('success', '规则已创建')
            }
            closeEditor()
        } catch (error) {
            toast.show('error', '保存失败')
        }
    }, [deviceId, editingRule, createRule, updateRule, closeEditor, toast])

    return (
        <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex-shrink-0 px-4 py-1.5 border-b border-border bg-bg-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {/* 刷新按钮 */}
                    <button
                        onClick={handleRefresh}
                        className="btn btn-secondary text-xs px-2.5 py-1.5"
                        title="刷新"
                        disabled={loading}
                    >
                        刷新
                    </button>

                    {/* 分隔线 */}
                    <div className="w-px h-4 bg-border mx-1" />

                    {/* 新建规则按钮 */}
                    <button
                        onClick={handleCreateNew}
                        className="btn btn-primary text-xs px-2.5 py-1.5"
                    >
                        新建规则
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-secondary">
                    {/* 清空按钮 */}
                    {rules.length > 0 && (
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="btn btn-ghost text-red-400 hover:bg-red-500/10 text-xs px-2 py-1.5 flex-shrink-0 flex items-center"
                            title="清空所有规则"
                        >
                            <TrashIcon size={14} className="mr-1" />
                            清空规则
                        </button>
                    )}

                    {/* 分隔线 */}
                    {rules.length > 0 && <div className="w-px h-4 bg-border mx-1" />}

                    {/* 规则计数 */}
                    <span>共 {rules.length} 条规则</span>
                    <span className="text-text-muted">•</span>
                    <span className="text-status-success">
                        {rules.filter(r => r.enabled).length} 条启用
                    </span>
                </div>
            </div>

            {/* 规则列表 */}
            <div className="flex-1 overflow-auto relative">
                <MockRuleList
                    rules={rules}
                    loading={loading}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleEnabled={handleToggleEnabled}
                    onCreateNew={handleCreateNew}
                />
                <ListLoadingOverlay isLoading={loading} />
            </div>

            {/* 规则编辑器 */}
            <MockRuleEditor
                rule={editingRule}
                isOpen={isEditorOpen}
                onSave={handleSaveRule}
                onClose={closeEditor}
            />

            {/* 清空确认对话框 */}
            <ConfirmDialog
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={handleClear}
                title="清空 Mock 规则"
                message="确定要清空所有 Mock 规则吗？此操作无法撤销。"
                confirmText="清空"
                type="danger"
            />

            {/* 删除确认对话框 */}
            <ConfirmDialog
                isOpen={!!deleteRuleId}
                onClose={() => setDeleteRuleId(null)}
                onConfirm={confirmDelete}
                title="删除规则"
                message="确定要删除这条规则吗？此操作无法撤销。"
                confirmText="删除"
                type="danger"
            />
        </div>
    )
}

export const HttpMockPlugin = new HttpMockPluginImpl()
