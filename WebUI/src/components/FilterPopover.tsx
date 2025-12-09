import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { FilterIcon, ChevronDownIcon } from './icons'

interface FilterOption {
    key: string
    label: string
    shortLabel: string
    checked: boolean
    onChange: (checked: boolean) => void
}

interface FilterPopoverProps {
    options: FilterOption[]
    className?: string
}

/// 筛选弹窗组件，用于收拢多个筛选选项
export function FilterPopover({ options, className }: FilterPopoverProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    // 获取已选中的筛选项
    const activeFilters = options.filter(opt => opt.checked)
    const hasActiveFilters = activeFilters.length > 0

    return (
        <div ref={containerRef} className={clsx("relative", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors",
                    hasActiveFilters
                        ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
                        : "bg-bg-light text-text-secondary border-border hover:text-text-primary hover:border-text-muted"
                )}
            >
                <FilterIcon size={14} />
                {hasActiveFilters ? (
                    <span className="flex items-center gap-1">
                        {activeFilters.map(f => f.shortLabel).join('、')}
                    </span>
                ) : (
                    <span>更多筛选</span>
                )}
                <ChevronDownIcon size={12} className={clsx("transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-bg-medium border border-border rounded-lg shadow-lg py-1 min-w-[180px] whitespace-nowrap">
                    {options.map(opt => (
                        <label
                            key={opt.key}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bg-light transition-colors"
                        >
                            <input
                                type="checkbox"
                                checked={opt.checked}
                                onChange={(e) => opt.onChange(e.target.checked)}
                                className="accent-primary w-3.5 h-3.5 flex-shrink-0"
                            />
                            <span className="text-sm text-text-primary">{opt.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    )
}
