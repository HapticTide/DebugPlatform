// Toggle.tsx
// 统一的 Toggle Switch 组件
//
// Created by Sun on 2025/12/07.
// Copyright © 2025 Sun. All rights reserved.
//

import clsx from 'clsx'

interface ToggleProps {
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
    label?: string
    size?: 'sm' | 'md'
    className?: string
}

/**
 * Toggle Switch 组件
 * 
 * 用于开关类型的设置，如"自动滚动"
 */
export function Toggle({
    checked,
    onChange,
    disabled = false,
    label,
    size = 'sm',
    className,
}: ToggleProps) {
    const sizeClasses = size === 'sm'
        ? { track: 'w-7 h-4', thumb: 'h-3 w-3', thumbOn: 'left-[14px]', thumbOff: 'left-0.5' }
        : { track: 'w-9 h-5', thumb: 'h-4 w-4', thumbOn: 'left-[18px]', thumbOff: 'left-0.5' }

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!disabled) {
            onChange(!checked)
        }
    }

    return (
        <div
            className={clsx('flex items-center gap-1.5 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}
            onClick={handleClick}
        >
            {label && (
                <span className="text-xs text-text-secondary">{label}</span>
            )}
            <div
                className={clsx(
                    'relative inline-flex items-center rounded-full transition-colors duration-200',
                    sizeClasses.track,
                    checked ? 'bg-primary' : 'bg-bg-medium border border-border'
                )}
            >
                <div
                    className={clsx(
                        sizeClasses.thumb,
                        'absolute rounded-full transition-all duration-200',
                        checked ? clsx(sizeClasses.thumbOn, 'bg-white') : clsx(sizeClasses.thumbOff, 'bg-text-muted')
                    )}
                />
            </div>
        </div>
    )
}
