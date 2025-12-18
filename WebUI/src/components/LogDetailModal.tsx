import React, { useCallback, useEffect, useRef, useState } from 'react'
import { XMarkIcon, ClipboardIcon, CheckIcon } from './icons'
import { LogEvent } from '../types'
import { copyToClipboard as copyText } from '@/utils/clipboard'
import clsx from 'clsx'

interface Props {
    event: LogEvent
    onClose: () => void
}

// 日志级别样式
const getLevelStyle = (level: string) => {
    switch (level?.toLowerCase()) {
        case 'debug': return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
        case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        case 'notice': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
        case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30'
        case 'fault':
        case 'critical': return 'bg-red-600/20 text-red-300 border-red-600/30'
        default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
}

/**
 * 日志详情弹窗
 * - 支持拖动
 * - ESC 键关闭
 */
export const LogDetailModal: React.FC<Props> = ({ event, onClose }) => {
    const modalRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [copiedField, setCopiedField] = useState<string | null>(null)

    // ESC 键关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // 初始居中
    useEffect(() => {
        if (modalRef.current) {
            const rect = modalRef.current.getBoundingClientRect()
            setPosition({
                x: (window.innerWidth - rect.width) / 2,
                y: (window.innerHeight - rect.height) / 2
            })
        }
    }, [])

    // 拖动处理
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.modal-header')) {
            setIsDragging(true)
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            })
        }
    }, [position])

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragOffset.x,
                y: e.clientY - dragOffset.y
            })
        }
    }, [isDragging, dragOffset])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
            return () => {
                window.removeEventListener('mousemove', handleMouseMove)
                window.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [isDragging, handleMouseMove, handleMouseUp])

    // 复制功能
    const copyToClipboard = useCallback(async (text: string, field: string) => {
        try {
            await copyText(text)
            setCopiedField(field)
            setTimeout(() => setCopiedField(null), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }, [])

    // 格式化时间戳
    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp)
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
    }

    // 复制按钮组件
    const CopyButton = ({ text, fieldKey }: { text: string, fieldKey: string }) => (
        <button
            onClick={() => copyToClipboard(text, fieldKey)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-bg-light rounded"
            title="复制"
        >
            {copiedField === fieldKey ? (
                <CheckIcon size={14} className="text-green-400" />
            ) : (
                <ClipboardIcon size={14} className="text-text-muted hover:text-text-primary" />
            )}
        </button>
    )

    // 字段渲染
    const renderField = (label: string, value: string | number | undefined | null, fieldKey: string, mono = false) => {
        const displayValue = value?.toString() || '-'
        const hasValue = value !== undefined && value !== null && value !== ''

        return (
            <div className="flex items-start gap-3 py-2 border-b border-border last:border-b-0 group">
                <div className="w-24 flex-shrink-0 text-text-secondary text-xs font-medium">
                    {label}
                </div>
                <div className={clsx(
                    'flex-1 text-xs break-all',
                    mono ? 'font-mono' : '',
                    hasValue ? 'text-text-primary' : 'text-text-muted'
                )}>
                    {displayValue}
                </div>
                {hasValue && <CopyButton text={displayValue} fieldKey={fieldKey} />}
            </div>
        )
    }

    // 渲染 tags
    const renderTags = () => {
        if (!event.tags || event.tags.length === 0) {
            return <span className="text-text-muted">-</span>
        }

        return (
            <div className="flex flex-wrap gap-1.5">
                {event.tags.map((tag: string, index: number) => (
                    <span
                        key={index}
                        className="px-2 py-0.5 text-2xs bg-bg-light rounded-full text-text-secondary"
                    >
                        {tag}
                    </span>
                ))}
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 背景遮罩 - 点击关闭 */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* 弹窗内容 */}
            <div
                ref={modalRef}
                className="absolute bg-bg-dark rounded-lg shadow-2xl border border-border min-w-[500px] max-w-[700px] max-h-[80vh] flex flex-col"
                style={{
                    left: position.x,
                    top: position.y,
                    cursor: isDragging ? 'grabbing' : 'default'
                }}
                onMouseDown={handleMouseDown}
            >
                {/* Header - 可拖动区域 */}
                <div className="modal-header flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-text-primary">日志详情</h3>
                        <span className={clsx(
                            'px-2 py-0.5 text-2xs font-medium rounded border',
                            getLevelStyle(event.level)
                        )}>
                            {event.level?.toUpperCase() || 'UNKNOWN'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-bg-light rounded-md transition-colors"
                        title="关闭 (ESC)"
                    >
                        <XMarkIcon size={20} className="text-text-muted hover:text-text-primary" />
                    </button>
                </div>

                {/* Body - 滚动区域 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {renderField('ID', event.id, 'id', true)}
                    {renderField('序号', event.seqNum, 'seqNum')}
                    {renderField('时间', formatTimestamp(event.timestamp), 'timestamp')}
                    {renderField('级别', event.level, 'level')}
                    {renderField('来源', event.source, 'source')}
                    {renderField('子系统', event.subsystem, 'subsystem')}
                    {renderField('分类', event.category, 'category')}
                    {renderField('Logger', event.loggerName, 'loggerName')}
                    {renderField('线程', event.thread, 'thread')}
                    {renderField('文件', event.file, 'file')}
                    {renderField('函数', event.function, 'function')}
                    {renderField('行号', event.line, 'line')}
                    {renderField('Trace ID', event.traceId, 'traceId', true)}

                    {/* Message - 多行显示 */}
                    <div className="py-2 border-b border-border group">
                        <div className="flex items-start gap-3">
                            <div className="w-24 flex-shrink-0 text-text-secondary text-xs font-medium">
                                消息
                            </div>
                            <div className="flex-1" />
                            {event.message && <CopyButton text={event.message} fieldKey="message" />}
                        </div>
                        <div className="mt-2 p-3 bg-bg-medium rounded-md">
                            <pre className="text-xs text-text-primary whitespace-pre-wrap break-all font-mono">
                                {event.message || '-'}
                            </pre>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="py-2">
                        <div className="flex items-start gap-3">
                            <div className="w-24 flex-shrink-0 text-text-secondary text-xs font-medium">
                                标签
                            </div>
                            <div className="flex-1">
                                {renderTags()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-border bg-bg-medium/50 rounded-b-lg">
                    <p className="text-2xs text-text-muted text-center">
                        按 ESC 或点击外部区域关闭 • 拖动标题栏可移动窗口
                    </p>
                </div>
            </div>
        </div>
    )
}
