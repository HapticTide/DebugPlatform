/**
 * SVG Icon Components
 * 
 * 为 DebugHub WebUI 设计的一套现代化 SVG 图标
 * 风格：线性图标，圆角，与深色主题配合
 */

import React from 'react'

interface IconProps {
    size?: number
    className?: string
    strokeWidth?: number
    style?: React.CSSProperties
}

const defaultProps: IconProps = {
    size: 20,
    strokeWidth: 1.5,
}

// ========== 功能标签图标 ==========

/** HTTP/网络请求图标 */
export const HttpIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** WebSocket 连接图标 */
export const WebSocketIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M9 12l-4-4.5M15 12l4-4.5M9 12v8M15 12v8M9 12h6"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M5 7.5L3 9M19 7.5L21 9"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 日志图标 */
export const LogIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14 2v6h6M16 13H8M16 17H8M10 9H8"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 断点图标 */
export const BreakpointIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M10 15V9M14 15V9"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** Mock 图标 */
export const MockIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10 10 10 0 0 1 10-10z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 故障注入/混沌工程图标 */
export const ChaosIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M12 9v4M12 17h.01"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 数据库图标 */
export const DatabaseIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        />
        <path
            d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        />
    </svg>
)

// ========== 设备图标 ==========

/** iPhone 图标 */
export const IPhoneIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="5" y="2" width="14" height="20" rx="3" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M9 2h6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
        <path d="M10 19h4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** iPad 图标 */
export const IPadIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M12 17h.01" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** Mac 电脑图标 */
export const MacIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** Apple Watch 图标 */
export const WatchIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="6" y="5" width="12" height="14" rx="4" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** Apple TV 图标 */
export const TVIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="2" y="7" width="20" height="12" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M12 7V3M8 3h8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** 模拟器图标 */
export const SimulatorIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
        <rect x="9" y="5" width="6" height="10" rx="1" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
)

// ========== 操作图标 ==========

/** 刷新图标 */
export const RefreshIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M3 3v5h5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M21 21v-5h-5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 清空/删除图标 */
export const ClearIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M10 11v6M14 11v6"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 导出图标 */
export const ExportIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M7 10l5 5 5-5M12 15V3"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 搜索图标 */
export const SearchIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M21 21l-4.35-4.35"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 过滤器图标 */
export const FilterIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 收藏/星标图标 */
export const StarIcon: React.FC<IconProps & { filled?: boolean }> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth,
    filled = false
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 高亮标记图标（荧光笔形状，区别于收藏星标） */
export const HighlightIcon: React.FC<IconProps & { filled?: boolean }> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth,
    filled = false
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 荧光笔笔尖 */}
        <path
            d="M9 11L15 5L19 9L13 15L9 11Z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={filled ? "currentColor" : "none"}
        />
        {/* 笔身 */}
        <path
            d="M15 5L18 2L22 6L19 9"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {/* 笔尖底部 */}
        <path
            d="M9 11L5 21L13 15"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {/* 高亮线条 */}
        <line
            x1="2"
            y1="22"
            x2="8"
            y2="22"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
        />
    </svg>
)

/** 复制图标 */
export const CopyIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 键盘快捷键图标 */
export const KeyboardIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M6 8h2M10 8h2M14 8h2M18 8h.01M6 12h2M10 12h2M14 12h2M18 12h.01M7 16h10" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
)

/** 更多/菜单图标 */
export const MoreIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="1" stroke="currentColor" strokeWidth={strokeWidth} />
        <circle cx="12" cy="5" r="1" stroke="currentColor" strokeWidth={strokeWidth} />
        <circle cx="12" cy="19" r="1" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
)

/** 返回图标 */
export const BackIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

// ========== 状态图标 ==========

/** 在线状态图标 */
export const OnlineIcon: React.FC<IconProps> = ({
    size = 10,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 10 10"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="5" cy="5" r="4" fill="#10B981" />
    </svg>
)

/** 离线状态图标 */
export const OfflineIcon: React.FC<IconProps> = ({
    size = 10,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 10 10"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="5" cy="5" r="4" fill="#6B7280" />
    </svg>
)

/** 向下箭头图标 */
export const ChevronDownIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 包/应用图标 */
export const PackageIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M12 12l8-4.5M12 12v9M12 12L4 7.5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 时钟/时间图标 */
export const ClockIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M12 6v6l4 2"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 设置/齿轮图标 */
export const SettingsIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 网络抓包图标 (别名) */
export const NetworkCaptureIcon = HttpIcon

/** 日志抓取图标 (别名) */
export const LogCaptureIcon = LogIcon

/** WebSocket 抓取图标 (别名) */
export const WSCaptureIcon = WebSocketIcon

/** 数据库调试图标 (别名) */
export const DBCaptureIcon = DatabaseIcon

/** 标签图标 */
export const TagIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <line x1="7" y1="7" x2="7.01" y2="7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

/** 编辑/笔图标 */
export const EditIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 删除/垃圾桶图标 */
export const TrashIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M3 6h18"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 勾选/成功图标 */
export const CheckIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 成功勾选图标 - 圆形绿色填充版本 */
export const SuccessCheckIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 渐变定义 */}
        <defs>
            <linearGradient id="successGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00d4aa" />
                <stop offset="100%" stopColor="#00b894" />
            </linearGradient>
        </defs>
        {/* 背景圆形 */}
        <circle cx="12" cy="12" r="10" fill="url(#successGrad)" />
        {/* 勾选符号 */}
        <path
            d="M17 9L10.5 15.5L7 12"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 大号绿色对勾图标（健康状态页面用） */
export const HealthyCheckIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 粗壮的对勾，带渐变效果 */}
        <defs>
            <linearGradient id="healthyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ade80" />
                <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
        </defs>
        <path
            d="M20 6L9 17L4 12"
            stroke="url(#healthyGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 大号红色叉号图标（健康状态页面用） */
export const UnhealthyXIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 粗壮的叉号，带渐变效果 */}
        <defs>
            <linearGradient id="unhealthyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
        </defs>
        <path
            d="M18 6L6 18"
            stroke="url(#unhealthyGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
        />
        <path
            d="M6 6L18 18"
            stroke="url(#unhealthyGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
        />
    </svg>
)

/** 书籍/文档图标 */
export const BookIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 链接图标 */
export const LinkIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 火箭/启动图标 */
export const RocketIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.48-.56.93-1.23 1.35-2h-4.35z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M9 9l-3.8 3.8a2.5 2.5 0 0 0 0 3.5l1.5 1.5a2.5 2.5 0 0 0 3.5 0L14 14"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

export const WarningIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
)

export const LockIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
)

export const KeyIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
)

export const ArrowUpIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
    </svg>
)

export const ArrowDownIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
    </svg>
)

export const LightningIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
)

export const PhoneOffIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
)

export const FolderIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
)

export const InfoIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
)

export const BugIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect x="8" y="6" width="8" height="12" rx="4" />
        <path d="M12 12h.01" />
        <path d="M16 10l2-2" />
        <path d="M16 14l2 2" />
        <path d="M8 10l-2-2" />
        <path d="M8 14l-2 2" />
    </svg>
)

export const FileTextIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
)

export const SparklesIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 3l1.912 5.813a2 2 0 0 0 1.272 1.272L21 12l-5.813 1.912a2 2 0 0 0-1.272 1.272L12 21l-1.912-5.813a2 2 0 0 0-1.272-1.272L3 12l5.813-1.912a2 2 0 0 0 1.272-1.272L12 3z" />
    </svg>
)

export const ArrowRightIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
    </svg>
)

export const PencilIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
)

export const UploadIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
)

export const DownloadIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
)

export const TrafficLightIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <rect x="7" y="2" width="10" height="20" rx="5" />
        <circle cx="12" cy="7" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
)



export const ChartBarIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
)

export const ClipboardIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
)

/** 播放/继续图标 */
export const PlayIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M5 3l14 9-14 9V3z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 暂停图标 */
export const PauseIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6 4h4v16H6zM14 4h4v16h-4z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 停止/禁止图标 */
export const StopIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M4.93 4.93l14.14 14.14"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 地球/网络图标 */
export const GlobeIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
            d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 向右箭头图标 */
export const ChevronRightIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M9 18l6-6-6-6"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 骰子/随机图标 */
export const DiceIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
        <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
)

/** 计时器图标 */
export const TimerIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M12 9v4l2 2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 3L2 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 6L19 3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 2v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

/** 插头/连接图标 */
export const PlugIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M12 22v-5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 8V2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8V2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8h12z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

/** 炸弹/爆炸图标 */
export const BombIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="11" cy="13" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M11 4a9 9 0 0 0-9 9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 5.5L22 2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 6l-1.5-1.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 2l-1.5 1.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

/** 蜗牛/慢速图标 */
export const SnailIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="13" r="8" stroke="currentColor" strokeWidth={strokeWidth} />
        <path d="M2 21h16c2.5 0 4-1.5 4-3v-2h-2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 14l2-2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 14l-2-2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

export const ArrowPathIcon = RefreshIcon

export const XMarkIcon = ({ size = 24, className = '' }: IconProps) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
)

/** Debug Hub Logo 图标 - 与 favicon.svg 一致 */
export const DebugHubLogo: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect width="64" height="64" rx="16" fill="url(#debugHubGrad)" />
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M32 14C26.4772 14 22 18.4772 22 24V26H18C16.8954 26 16 26.8954 16 28C16 29.1046 16.8954 30 18 30H22V34H16C14.8954 34 14 34.8954 14 36C14 37.1046 14.8954 38 16 38H22V42C22 47.5228 26.4772 52 32 52C37.5228 52 42 47.5228 42 42V38H48C49.1046 38 50 37.1046 50 36C50 34.8954 49.1046 34 48 34H42V30H46C47.1046 30 48 29.1046 48 28C48 26.8954 47.1046 26 46 26H42V24C42 18.4772 37.5228 14 32 14ZM26 24C26 20.6863 28.6863 18 32 18C35.3137 18 38 20.6863 38 24V26H26V24ZM26 30H38V34H26V30ZM26 38H38V42C38 45.3137 35.3137 48 32 48C28.6863 48 26 45.3137 26 42V38Z"
            fill="white"
        />
        <defs>
            <linearGradient id="debugHubGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00d4aa" />
                <stop offset="1" stopColor="#00b894" />
            </linearGradient>
        </defs>
    </svg>
)

/** X 叉号图标（错误/关闭） */
export const XIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className,
    strokeWidth = defaultProps.strokeWidth
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
)

/** 彩色红绿灯图标 - 用于流量规则 */
export const ColorfulTrafficLightIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 外壳 */}
        <rect x="7" y="2" width="10" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
        {/* 红灯 */}
        <circle cx="12" cy="6.5" r="2" fill="#ef4444" />
        {/* 黄灯 */}
        <circle cx="12" cy="12" r="2" fill="#eab308" />
        {/* 绿灯 */}
        <circle cx="12" cy="17.5" r="2" fill="#22c55e" />
    </svg>
)

/** 荧光笔图标 - 用于高亮标记 */
export const HighlighterIcon: React.FC<IconProps> = ({
    size = defaultProps.size,
    className
}) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* 笔身 - 黄色渐变 */}
        <path
            d="M14.5 3.5L20.5 9.5L9.5 20.5H3.5V14.5L14.5 3.5Z"
            fill="url(#highlighterGrad)"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        {/* 笔尖 */}
        <path
            d="M3.5 14.5L9.5 20.5L3.5 20.5V14.5Z"
            fill="#f59e0b"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
        {/* 分隔线 */}
        <line x1="11" y1="13" x2="17" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <defs>
            <linearGradient id="highlighterGrad" x1="3.5" y1="3.5" x2="20.5" y2="20.5" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fef08a" />
                <stop offset="1" stopColor="#fde047" />
            </linearGradient>
        </defs>
    </svg>
)
