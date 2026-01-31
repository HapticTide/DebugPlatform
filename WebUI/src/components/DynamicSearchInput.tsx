// 动态宽度搜索输入框组件
// 根据输入内容自动扩展宽度，最大不超过初始宽度的 3 倍

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import clsx from 'clsx'

interface DynamicSearchInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    className?: string
    minWidth?: number // 最小宽度（也是默认宽度）
    maxWidthMultiplier?: number // 最大宽度是最小宽度的倍数
}

// 使用 Canvas 测量文本宽度（更准确且同步）
function getTextWidth(text: string, font: string): number {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 0
    context.font = font
    return context.measureText(text).width
}

export function DynamicSearchInput({
    value,
    onChange,
    placeholder = '搜索...',
    className = '',
    minWidth = 160, // 默认 160px (w-40)
    maxWidthMultiplier = 5, // 默认最大 5 倍
}: DynamicSearchInputProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [inputWidth, setInputWidth] = useState(minWidth)
    const [font, setFont] = useState('')

    // 获取输入框的实际字体样式
    useEffect(() => {
        if (!inputRef.current) return
        const computed = window.getComputedStyle(inputRef.current)
        const fontStyle = `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`
        setFont(fontStyle)
    }, [])

    // 同步计算并更新宽度（使用 useLayoutEffect 避免闪烁）
    useLayoutEffect(() => {
        if (!font) return

        const textToMeasure = value || placeholder
        const textWidth = getTextWidth(textToMeasure, font)

        // padding: px-2.5 = 10px * 2 = 20px
        // border: 1px * 2 = 2px
        // 额外安全边距: 16px（防止光标被遮挡）
        const padding = 38
        const desiredWidth = textWidth + padding

        // 限制在 minWidth 和 maxWidth 之间
        const maxWidth = minWidth * maxWidthMultiplier
        const newWidth = Math.max(minWidth, Math.min(desiredWidth, maxWidth))

        setInputWidth(newWidth)
    }, [value, placeholder, font, minWidth, maxWidthMultiplier])

    // 处理输入变化：先测量再更新
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        onChange(newValue)
    }, [onChange])

    return (
        <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            className={clsx(
                'input text-xs py-1.5 px-2.5 transition-[width] duration-150 ease-out',
                className
            )}
            style={{ width: inputWidth }}
        />
    )
}
