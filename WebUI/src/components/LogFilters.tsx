import type { LogLevel } from '@/types'
import clsx from 'clsx'

interface Props {
  minLevel: LogLevel
  subsystems: string[]
  categories: string[]
  selectedSubsystem: string
  selectedCategory: string
  searchText: string
  onMinLevelChange: (level: LogLevel) => void
  onSubsystemChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onSearchChange: (value: string) => void
}

// 日志级别配置（从高到低排列，符合用户预期）
const logLevels: { level: LogLevel; label: string; emoji: string; bgClass: string; textClass: string }[] = [
  { level: 'error', label: 'Error', emoji: '❌', bgClass: 'bg-level-error', textClass: 'text-white' },
  { level: 'warning', label: 'Warning', emoji: '⚠️', bgClass: 'bg-level-warning', textClass: 'text-white' },
  { level: 'info', label: 'Info', emoji: 'ℹ️', bgClass: 'bg-level-info', textClass: 'text-white' },
  { level: 'debug', label: 'Debug', emoji: '🔍', bgClass: 'bg-level-debug', textClass: 'text-white' },
  { level: 'verbose', label: 'Verbose', emoji: '📝', bgClass: 'bg-level-verbose', textClass: 'text-white' },
]

// 日志级别优先级（用于显示提示）
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
}

export function LogFilters({
  minLevel,
  subsystems,
  categories,
  selectedSubsystem,
  selectedCategory,
  searchText,
  onMinLevelChange,
  onSubsystemChange,
  onCategoryChange,
  onSearchChange,
}: Props) {
  const currentPriority = LEVEL_PRIORITY[minLevel]

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Level Filters - 单选层级模式 */}
      <div className="flex gap-1">
        {logLevels.map(({ level, label, emoji, bgClass, textClass }) => {
          const isActive = level === minLevel
          const priority = LEVEL_PRIORITY[level]
          const isIncluded = priority >= currentPriority
          
          return (
            <button
              key={level}
              onClick={() => onMinLevelChange(level)}
              title={`显示 ${label} 及更高级别日志`}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                isActive
                  ? `${bgClass} ${textClass} shadow-sm`
                  : isIncluded
                    ? `${bgClass}/30 ${textClass.replace('text-white', 'text-' + level.replace('level-', ''))}`
                    : 'bg-bg-light/50 text-text-muted hover:bg-bg-light border border-transparent opacity-50'
              )}
            >
              <span>{emoji}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Subsystem Filter */}
      <select
        value={selectedSubsystem}
        onChange={(e) => onSubsystemChange(e.target.value)}
        className="select text-sm"
      >
        <option value="">所有 Subsystem</option>
        {subsystems.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {/* Category Filter */}
      <select
        value={selectedCategory}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="select text-sm"
      >
        <option value="">所有 Category</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* Search */}
      <input
        type="text"
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="🔍 搜索日志内容..."
        className="input min-w-[200px]"
      />
    </div>
  )
}
