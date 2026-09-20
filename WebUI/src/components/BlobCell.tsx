/**
 * BlobCell.tsx
 * BLOB 数据单元格渲染组件
 * 
 * 支持：
 * 1. 配置的列自动检测并匹配 Protobuf 类型（每行独立检测）
 * 2. 使用配置的 Protobuf Schema 解码显示
 * 3. 手动选择 Protobuf 类型
 * 4. 自动 Wire Format 解析
 * 5. 原始 Hex 展示
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import clsx from 'clsx'
import { useProtobufStore } from '@/stores/protobufStore'
import { useProtoBundleStore } from '@/stores/protoBundleStore'
import { presentDecoded } from '@/utils/protoDecodeEngine'
import { WarningIcon, PackageIcon, SparklesIcon, ClipboardIcon, CheckIcon } from './icons'
import { tryAutoDecode, formatDecodedMessage } from '@/utils/protobufDescriptor'
import { GroupedFilterSelect } from './GroupedFilterSelect'
import { useDraggable } from '@/hooks/useDraggable'
import { copyToClipboard } from '@/utils/clipboard'

interface BlobCellProps {
    /** Base64 编码的 BLOB 数据 */
    value: string
    /** 列名 */
    columnName: string
    /** 数据库 ID */
    dbId: string | null
    /** 表名 */
    tableName: string | null
    /** 当前行的所有列数据（用于类型映射） */
    rowData?: Record<string, unknown>
    /** 展开状态变化回调 */
    onExpandChange?: (isExpanded: boolean) => void
    /** 是否处于高亮选中状态 */
    isHighlighted?: boolean
}

type ViewMode = 'decoded' | 'wire' | 'hex'

/** 简化 protobuf 类型名称，移除前缀 */
function simplifyTypeName(fullName: string): string {
    // 只保留最后一个 . 之后的部分
    const lastDot = fullName.lastIndexOf('.')
    return lastDot >= 0 ? fullName.slice(lastDot + 1) : fullName
}

export function BlobCell({
    value,
    columnName,
    dbId,
    tableName,
    rowData,
    onExpandChange,
    isHighlighted = false,
}: BlobCellProps) {
    const {
        getColumnConfig,
        autoDetectTypeWithDescriptor,
        decodeBlobWithType,
        getDescriptorMessageTypes,
        getMessageTypeByMapping,
    } = useProtobufStore()

    // 全局解码包：列没有单独配置 descriptor 时的兜底来源，省掉逐表重复上传
    const globalBundle = useProtoBundleStore((s) => s.active)
    const globalMessageTypes = useProtoBundleStore((s) => s.messageTypes)
    const decodeWithGlobalBundle = useProtoBundleStore((s) => s.decode)
    const loadGlobalBundle = useProtoBundleStore((s) => s.load)

    useEffect(() => {
        void loadGlobalBundle()
    }, [loadGlobalBundle])

    const [isExpanded, setIsExpanded] = useState(false)
    const [viewMode, setViewMode] = useState<ViewMode>('decoded')
    const [decodedData, setDecodedData] = useState<Record<string, unknown> | null>(null)
    const [decodeError, setDecodeError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    // 拖动功能
    const { position, isDragging, dragHandleProps, resetPosition } = useDraggable({
        enabled: isExpanded,
    })

    // 关闭弹窗时重置位置
    const handleClose = useCallback(() => {
        setIsExpanded(false)
        resetPosition()
        onExpandChange?.(false)
    }, [resetPosition, onExpandChange])

    // 自动检测相关状态
    const [autoDetecting, setAutoDetecting] = useState(false)
    const [autoDetectedType, setAutoDetectedType] = useState<string | null>(null)

    // 通过类型映射获取的类型
    const [mappedType, setMappedType] = useState<string | null>(null)

    // 用户手动选择的类型（覆盖自动检测）
    const [manualSelectedType, setManualSelectedType] = useState<string>('')

    // 是否禁用描述符解析（用户点击 X 时设为 true）
    const [disableDescriptorDecode, setDisableDescriptorDecode] = useState(false)

    // 获取当前列的配置
    const columnConfig = dbId && tableName ? getColumnConfig(dbId, tableName, columnName) : null
    const descriptorName = columnConfig?.descriptorName || null

    // 是否配置了类型映射
    const hasTypeMapping = !!(columnConfig?.typeSourceColumn && columnConfig?.typeMappings?.length)

    // 本列是否落在全局解码包上（没有为这一列单独配过 descriptor）
    const usingGlobalBundle = !descriptorName && !!globalBundle

    // 获取可选的消息类型：列自己的描述符优先，否则用全局解码包的
    const availableMessageTypes = descriptorName
        ? getDescriptorMessageTypes(descriptorName)
        : usingGlobalBundle
            ? globalMessageTypes
            : []

    // 当前使用的类型：手动选择 > 映射类型 > 自动检测（禁用时都为空）
    const currentMessageType = disableDescriptorDecode ? '' : (manualSelectedType || mappedType || autoDetectedType || '')

    // 空选项的显示文本：有映射配置时显示"映射匹配"，否则显示"自动匹配"
    const emptyOptionText = hasTypeMapping ? '映射匹配' : '自动匹配'

    // 当前显示的简化类型名（用于计算宽度）
    // 如果没有手动选择类型，显示空选项文本
    const displayTypeName = manualSelectedType ? simplifyTypeName(manualSelectedType) : emptyOptionText

    // 展开时检测类型：先检查类型映射，然后回退到自动检测
    useEffect(() => {
        if (!isExpanded || !value || !descriptorName || !columnConfig) return

        // 禁用描述符解析或手动选择时跳过
        if (disableDescriptorDecode || manualSelectedType) return

        // 1. 优先检查类型映射
        if (hasTypeMapping && rowData) {
            const mapped = getMessageTypeByMapping(columnConfig, rowData)
            if (mapped) {
                setMappedType(mapped)
                setAutoDetectedType(null)
                return
            }
        }

        // 2. 回退到自动检测
        setMappedType(null)
        setAutoDetecting(true)
        autoDetectTypeWithDescriptor(descriptorName, value).then(result => {
            setAutoDetecting(false)
            if (result) {
                setAutoDetectedType(result)
            }
        })
    }, [isExpanded, value, descriptorName, columnConfig, rowData, hasTypeMapping, manualSelectedType, disableDescriptorDecode, getMessageTypeByMapping, autoDetectTypeWithDescriptor])

    // 解码数据
    useEffect(() => {
        if (!value || !isExpanded) return
        if (viewMode !== 'decoded') return

        setIsLoading(true)
        setDecodeError(null)
        setDecodedData(null)

        const decodeWithType = async () => {
            const typeToUse = manualSelectedType || mappedType || autoDetectedType

            if (typeToUse && descriptorName) {
                // 使用 Schema 解码
                const result = await decodeBlobWithType(descriptorName, typeToUse, value)
                setIsLoading(false)
                if (result.success) {
                    setDecodedData(result.data)
                    setDecodeError(null)
                } else {
                    setDecodedData(null)
                    setDecodeError(result.error)
                }
                return
            }

            // 这一列没配 descriptor，但有全局解码包：用它按手选的类型解
            if (typeToUse && usingGlobalBundle) {
                const outcome = decodeWithGlobalBundle(typeToUse, value)
                setIsLoading(false)
                if (outcome.ok) {
                    setDecodedData(presentDecoded(outcome.value) as Record<string, unknown>)
                    setDecodeError(null)
                } else {
                    setDecodedData(null)
                    setDecodeError(outcome.error)
                }
                return
            }

            // 尝试 Wire Format 解析
            const autoDecoded = tryAutoDecode(value)
            setDecodedData(autoDecoded)
            setDecodeError(autoDecoded ? null : '无法自动解析')
            setIsLoading(false)
        }

        decodeWithType()
    }, [value, isExpanded, viewMode, manualSelectedType, mappedType, autoDetectedType, descriptorName, disableDescriptorDecode, decodeBlobWithType, usingGlobalBundle, decodeWithGlobalBundle])

    // 处理选择类型（包括选择"自动匹配"选项）
    const handleTypeChange = (type: string) => {
        // 选择空字符串表示选择"自动匹配"选项，启用自动检测
        setManualSelectedType(type)
        setDisableDescriptorDecode(false)
    }

    // 处理点击 X 清除按钮：禁用描述符解析
    const handleClearType = () => {
        setManualSelectedType('')
        setDisableDescriptorDecode(true)
    }

    // 计算 BLOB 大小
    const blobSize = useMemo(() => {
        try {
            const binaryString = atob(value)
            return binaryString.length
        } catch {
            return 0
        }
    }, [value])

    // Hex 视图
    const hexView = useMemo(() => {
        try {
            const binaryString = atob(value)
            const bytes: string[] = []
            for (let i = 0; i < Math.min(binaryString.length, 256); i++) {
                bytes.push(binaryString.charCodeAt(i).toString(16).padStart(2, '0'))
            }
            return bytes
        } catch {
            return []
        }
    }, [value])

    // Wire Format 自动解析结果
    const wireDecoded = useMemo(() => {
        if (viewMode !== 'wire' || !isExpanded) return null
        return tryAutoDecode(value)
    }, [value, viewMode, isExpanded])

    // 计算弹窗宽度：根据 Protobuf 类型行的实际内容动态计算
    const dialogWidth = useMemo(() => {
        // 基础宽度（无 Protobuf 配置时使用）
        const baseWidth = 400

        // 如果没有描述符或消息类型，使用基础宽度
        if (!descriptorName || availableMessageTypes.length === 0) {
            return baseWidth
        }

        // 计算类型选择行的宽度：
        // 布局: [padding] [标签] [gap] [选择框] [gap] [状态标签?] [padding]

        // 1. 左右 padding: 16px * 2 = 32px (px-4)
        const padding = 32

        // 2. "Protobuf 类型:" 标签宽度 (约 85px)
        const labelWidth = 85

        // 3. 标签和选择框之间的 gap: 12px (gap-3)
        const gap1 = 12

        // 4. 选择框宽度：
        //    - 类型名文字（等宽字体，每字符约 7.5px）
        //    - 左右内边距: 12px * 2 = 24px
        //    - X 清除按钮（有值时显示）: 20px
        //    - 下拉箭头: 20px
        //    - 边框和额外间距: 8px
        const typeNameWidth = displayTypeName.length * 7.5
        const selectPadding = 24
        // 清除按钮仅在手动选择类型时显示
        const clearButton = manualSelectedType ? 20 : 0
        const dropdownArrow = 20
        const selectExtra = 8
        const selectWidth = typeNameWidth + selectPadding + clearButton + dropdownArrow + selectExtra

        // 5. 选择框和状态标签之间的 gap: 12px
        const gap2 = 12

        // 6. 状态标签宽度（根据显示内容）
        //    - "检测中...": 约 70px
        //    - "→ xxx": 根据实际类型名长度计算
        let statusLabelWidth = 0
        if (!disableDescriptorDecode && !manualSelectedType) {
            if (autoDetecting) {
                statusLabelWidth = 75 // "✨ 检测中..."
            } else if (mappedType || autoDetectedType) {
                // 显示实际匹配到的类型名，计算其宽度
                const actualType = mappedType || autoDetectedType || ''
                const actualTypeName = simplifyTypeName(actualType)
                // "→ " + 类型名，每字符约 7px
                statusLabelWidth = 20 + actualTypeName.length * 7
            }
        }

        // 计算总宽度
        const totalWidth = padding + labelWidth + gap1 + selectWidth + (statusLabelWidth > 0 ? gap2 + statusLabelWidth : 0)

        // 确保宽度在合理范围内
        return Math.max(baseWidth, Math.min(totalWidth, 800))
    }, [descriptorName, availableMessageTypes.length, displayTypeName, currentMessageType, disableDescriptorDecode, autoDetecting, mappedType, autoDetectedType, manualSelectedType])

    // ESC 键关闭弹窗
    useEffect(() => {
        if (!isExpanded) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isExpanded, handleClose])

    // 复制状态
    const [copied, setCopied] = useState(false)

    // 复制内容到剪贴板
    const handleCopy = useCallback((content: string) => {
        copyToClipboard(content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }, [])

    // 获取当前可复制的内容
    const copyableContent = useMemo(() => {
        if (viewMode === 'decoded' && decodedData) {
            return formatDecodedMessage(decodedData)
        }
        if (viewMode === 'wire' && wireDecoded) {
            return formatDecodedMessage(wireDecoded)
        }
        if (viewMode === 'hex') {
            return hexView.join(' ')
        }
        return ''
    }, [viewMode, decodedData, wireDecoded, hexView])

    // 处理展开
    const handleExpand = useCallback(() => {
        setIsExpanded(true)
        onExpandChange?.(true)
    }, [onExpandChange])

    // 单元格内的预览按钮（始终显示）
    const previewButton = (
        <button
            onClick={handleExpand}
            className={clsx(
                "flex items-center gap-1 text-xs transition-colors",
                isHighlighted
                    ? "text-white"
                    : "text-purple-400 hover:text-purple-300"
            )}
            title="点击展开查看详情"
        >
            <PackageIcon size={14} className="opacity-70" />
            <span className="font-mono">
                [BLOB {blobSize}B]
            </span>
        </button>
    )

    // 折叠状态：只显示预览
    if (!isExpanded) {
        return previewButton
    }

    // 展开状态：显示预览 + 弹窗
    return (
        <>
            {previewButton}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                onClick={handleClose}
            >
                <div
                    className={clsx(
                        'bg-bg-dark rounded-lg border border-border shadow-2xl max-h-[80vh] flex flex-col',
                        isDragging ? '' : 'transition-[width] duration-200'
                    )}
                    style={{
                        width: `${dialogWidth}px`,
                        ...(position ? { transform: `translate(${position.x}px, ${position.y}px)` } : {}),
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 头部 - 可拖动 */}
                    <div
                        className="flex items-center justify-between px-4 py-3 border-b border-border select-none"
                        {...dragHandleProps}
                    >
                        <div className="flex items-center gap-2">
                            <PackageIcon size={16} className="text-purple-400" />
                            <span className="font-mono text-sm text-text-primary">{columnName}</span>
                            <span className="text-xs text-text-muted">({blobSize} bytes)</span>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-1 rounded hover:bg-bg-light text-text-muted hover:text-text-secondary transition-colors"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            ✕
                        </button>
                    </div>

                    {/* 类型选择器 - 仅当列已配置描述符时显示 */}
                    {descriptorName && availableMessageTypes.length > 0 && (
                        <div className="px-4 py-2 border-b border-border bg-bg-darker/50">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-text-muted shrink-0">Protobuf 类型:</span>
                                {disableDescriptorDecode ? (
                                    // 禁用状态：显示恢复按钮
                                    <button
                                        onClick={() => setDisableDescriptorDecode(false)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-primary bg-bg-medium hover:bg-bg-light rounded-lg border border-border transition-colors"
                                    >
                                        <SparklesIcon size={12} />
                                        启用 Protobuf 解析
                                    </button>
                                ) : (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <GroupedFilterSelect
                                                options={availableMessageTypes}
                                                value={manualSelectedType}
                                                placeholder={emptyOptionText}
                                                formatOption={simplifyTypeName}
                                                showEmptyOption
                                                onChange={handleTypeChange}
                                                onClear={handleClearType}
                                            />
                                        </div>
                                        {autoDetecting && (
                                            <span className="flex items-center gap-1 text-2xs text-primary shrink-0">
                                                <SparklesIcon size={12} className="animate-pulse" />
                                                检测中...
                                            </span>
                                        )}
                                        {/* 当选中空选项（映射匹配/自动匹配）时，显示实际匹配到的类型 */}
                                        {!manualSelectedType && !autoDetecting && (mappedType || autoDetectedType) && (
                                            <span className={clsx(
                                                "flex items-center gap-1 text-2xs shrink-0",
                                                mappedType ? "text-blue-400" : "text-green-400"
                                            )}>
                                                →
                                                <span className="font-mono">{simplifyTypeName(mappedType || autoDetectedType || '')}</span>
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 视图切换 */}
                    <div className="flex gap-1 px-4 py-2 border-b border-border">
                        <button
                            onClick={() => setViewMode('decoded')}
                            className={clsx(
                                'px-3 py-1 text-xs rounded transition-colors',
                                viewMode === 'decoded'
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-light'
                            )}
                        >
                            {currentMessageType ? 'Schema 解码' : '自动解析'}
                        </button>
                        <button
                            onClick={() => setViewMode('wire')}
                            className={clsx(
                                'px-3 py-1 text-xs rounded transition-colors',
                                viewMode === 'wire'
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-light'
                            )}
                        >
                            Wire Format
                        </button>
                        <button
                            onClick={() => setViewMode('hex')}
                            className={clsx(
                                'px-3 py-1 text-xs rounded transition-colors',
                                viewMode === 'hex'
                                    ? 'bg-primary/20 text-primary'
                                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-light'
                            )}
                        >
                            Hex
                        </button>

                        {/* 复制按钮 - 靠右 */}
                        <div className="flex-1" />
                        {copyableContent && (
                            <button
                                onClick={() => handleCopy(copyableContent)}
                                className={clsx(
                                    'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                                    copied
                                        ? 'text-green-400 bg-green-400/10'
                                        : 'text-text-muted hover:text-text-secondary hover:bg-bg-light'
                                )}
                                title={copied ? '已复制' : '复制内容'}
                            >
                                {copied ? (
                                    <>
                                        <CheckIcon size={12} />
                                        已复制
                                    </>
                                ) : (
                                    <>
                                        <ClipboardIcon size={12} />
                                        复制
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                            </div>
                        ) : viewMode === 'decoded' ? (
                            decodedData ? (
                                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all">
                                    {formatDecodedMessage(decodedData)}
                                </pre>
                            ) : decodeError ? (
                                <div className="text-center py-8">
                                    <div className="text-yellow-400 mb-2 flex justify-center"><WarningIcon size={24} /></div>
                                    <p className="text-sm text-text-muted">{decodeError}</p>
                                    {!descriptorName && (
                                        <p className="text-xs text-text-muted/50 mt-2">
                                            请在 Protobuf 配置中添加此列的描述符
                                        </p>
                                    )}
                                    {descriptorName && !currentMessageType && (
                                        <p className="text-xs text-text-muted/50 mt-2">
                                            请在上方选择 Protobuf 消息类型
                                        </p>
                                    )}
                                </div>
                            ) : null
                        ) : viewMode === 'wire' ? (
                            wireDecoded ? (
                                <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap break-all">
                                    {formatDecodedMessage(wireDecoded)}
                                </pre>
                            ) : (
                                <div className="text-center py-8 text-text-muted">
                                    无法解析 Wire Format
                                </div>
                            )
                        ) : (
                            // Hex 视图
                            <div className="font-mono text-xs">
                                <div className="flex flex-wrap gap-1">
                                    {hexView.map((byte, idx) => (
                                        <span
                                            key={idx}
                                            className={clsx(
                                                'px-1 py-0.5 rounded',
                                                idx % 16 < 8 ? 'bg-bg-light' : 'bg-bg-lighter'
                                            )}
                                        >
                                            {byte}
                                        </span>
                                    ))}
                                    {blobSize > 256 && (
                                        <span className="text-text-muted px-2">
                                            ... 还有 {blobSize - 256} bytes
                                        </span>
                                    )}
                                </div>
                                <div className="mt-4 text-text-muted">
                                    共 {blobSize} bytes
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 底部提示 */}
                    {!descriptorName && viewMode === 'decoded' && (
                        <div className="px-4 py-2 border-t border-border text-xs text-text-muted bg-bg-darker">
                            💡 提示：在 Protobuf 配置中为此列添加描述符可启用自动类型检测
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

/**
 * 检测值是否是 Base64 编码的 BLOB
 */
export function isBase64Blob(value: string | null): boolean {
    if (!value || typeof value !== 'string') return false

    // 检查是否是有效的 Base64（长度是 4 的倍数，只包含 Base64 字符）
    if (value.length < 4 || value.length % 4 !== 0) return false

    // Base64 字符集
    const base64Regex = /^[A-Za-z0-9+/]+=*$/
    if (!base64Regex.test(value)) return false

    // 尝试解码并检查是否包含非打印字符（表示是二进制数据）
    try {
        const decoded = atob(value)
        let binaryCount = 0
        for (let i = 0; i < Math.min(decoded.length, 100); i++) {
            const code = decoded.charCodeAt(i)
            if (code < 32 || code > 126) {
                binaryCount++
            }
        }
        // 如果超过 30% 是非打印字符，认为是二进制数据
        return binaryCount / Math.min(decoded.length, 100) > 0.3
    } catch {
        return false
    }
}
