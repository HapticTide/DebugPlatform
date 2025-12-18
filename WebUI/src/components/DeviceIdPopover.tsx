// DeviceIdPopover.tsx
// 设备 ID 弹窗组件，点击显示完整设备 ID 并提供复制功能

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-hot-toast'
import { CopyIcon, CheckIcon } from '@/components/icons'
import { copyToClipboard } from '@/utils/clipboard'
import clsx from 'clsx'

interface DeviceIdPopoverProps {
    deviceId: string
    children: React.ReactNode
}

export function DeviceIdPopover({ deviceId, children }: DeviceIdPopoverProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const popoverRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLSpanElement>(null)

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        // ESC 键关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            document.addEventListener('keydown', handleKeyDown)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen])

    // 关闭时重置复制状态
    useEffect(() => {
        if (!isOpen) {
            setCopied(false)
        }
    }, [isOpen])

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsOpen(!isOpen)
    }

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await copyToClipboard(deviceId)
            setCopied(true)
            toast.success('设备 ID 已复制')
            // 1.5 秒后重置状态
            setTimeout(() => setCopied(false), 1500)
        } catch (err) {
            toast.error('复制失败')
        }
    }

    // 计算弹窗位置
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
    useLayoutEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            // 默认在下方显示
            let top = rect.bottom + 4
            let left = rect.left

            // 如果下方空间不足，显示在上方
            if (top + 80 > viewportHeight) {
                top = rect.top - 80 - 4
            }

            // 如果右边超出视口，调整位置
            if (left + 280 > viewportWidth) {
                left = viewportWidth - 280 - 8
            }

            setPopoverPosition({ top, left })
        }
    }, [isOpen])

    // 渲染弹窗内容（通过 Portal 渲染到 body）
    const popoverContent = isOpen ? createPortal(
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                top: popoverPosition.top,
                left: popoverPosition.left,
            }}
            className="z-[300] min-w-[200px] max-w-[320px]"
        >
            <div className="bg-bg-dark border border-border rounded-lg shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-3 py-2 border-b border-border bg-bg-medium/50">
                    <span className="text-xs font-medium text-text-secondary">设备 ID</span>
                </div>

                {/* 内容 */}
                <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono text-text-primary bg-bg-light px-2 py-1.5 rounded select-all break-all">
                            {deviceId}
                        </code>
                        <button
                            onClick={handleCopy}
                            className={clsx(
                                'p-1.5 rounded transition-colors flex-shrink-0',
                                copied
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-bg-light hover:bg-primary/20 text-text-muted hover:text-primary'
                            )}
                            title={copied ? '已复制' : '复制'}
                        >
                            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    ) : null

    return (
        <>
            <span
                ref={triggerRef}
                onClick={handleTriggerClick}
                className="cursor-pointer"
            >
                {children}
            </span>
            {popoverContent}
        </>
    )
}
