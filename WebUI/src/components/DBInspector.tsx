// DBInspector.tsx
// Database Inspector Component
//
// Created by Sun on 2025/12/05.
// Copyright © 2025 Sun. All rights reserved.
//

import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import clsx from 'clsx'
import { useDBStore } from '@/stores/dbStore'
import { useProtobufStore } from '@/stores/protobufStore'
import { ProtobufConfigPanel } from './ProtobufConfigPanel'
import { BlobCell, isBase64Blob } from './BlobCell'
import { SQLEditor } from './SQLEditor'
import { ListLoadingOverlay } from './ListLoadingOverlay'
import { TextPopover } from './TextPopover'
import { LogIcon, LightningIcon, DatabaseIcon, WarningIcon, LockIcon, UnlockIcon, ArrowUpIcon, ArrowDownIcon, ClipboardIcon, PackageIcon, SearchIcon, XIcon, FolderIcon, CheckIcon, SQLIcon, ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon, ClockIcon, TrashIcon } from './icons'
import { useToastStore } from '@/stores/toastStore'
import type { DatabaseLocation, DBInfo, DBQueryError, DBRow } from '@/types'
import { fetchSearchRows } from '@/services/api'
import { getDbSearchWarningThresholds } from '@/utils/dbSearchConfig'
interface DBInspectorProps {
    deviceId: string
}

// 高亮文本中的关键词
function highlightKeyword(text: string, keyword: string): React.ReactNode {
    if (!keyword || !text) return text
    const trimmedKeyword = keyword.trim().toLowerCase()
    if (!trimmedKeyword) return text

    const parts: React.ReactNode[] = []
    const lowerText = text.toLowerCase()
    let lastIndex = 0
    let index = lowerText.indexOf(trimmedKeyword)

    while (index !== -1) {
        // 添加未匹配部分
        if (index > lastIndex) {
            parts.push(text.substring(lastIndex, index))
        }
        // 添加高亮部分
        parts.push(
            <mark key={index} className="bg-yellow-400/40 text-inherit px-0.5 rounded">
                {text.substring(index, index + trimmedKeyword.length)}
            </mark>
        )
        lastIndex = index + trimmedKeyword.length
        index = lowerText.indexOf(trimmedKeyword, lastIndex)
    }

    // 添加剩余部分
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex))
    }

    return parts.length > 0 ? parts : text
}

const SEARCH_MATCH_PAGE_SIZE = 50

// 格式化文件大小
function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 获取数据库类型图标
function getDbKindIcon(kind: string): React.ReactNode {
    switch (kind) {
        case 'log': return <LogIcon size={16} />
        case 'cache': return <LightningIcon size={16} />
        default: return <DatabaseIcon size={16} />
    }
}

// SQL 查询错误类型图标映射
const errorTypeIcons: Record<string, React.FC<{ size?: number; className?: string }>> = {
    syntax_error: WarningIcon,
    table_not_found: DatabaseIcon,
    column_not_found: DatabaseIcon,
    access_denied: LockIcon,
    timeout: LogIcon,
    invalid_query: WarningIcon,
    internal_error: WarningIcon,
}

// SQL 查询错误类型标题映射
const errorTypeTitles: Record<string, string> = {
    syntax_error: '语法错误',
    table_not_found: '表不存在',
    column_not_found: '列不存在',
    access_denied: '访问被拒绝',
    timeout: '查询超时',
    invalid_query: '无效查询',
    internal_error: '内部错误',
}

/// SQL 查询错误展示组件
interface SQLQueryErrorDisplayProps {
    error: DBQueryError | string
    onApplySuggestion?: (suggestion: string) => void
}

function SQLQueryErrorDisplay({ error, onApplySuggestion }: SQLQueryErrorDisplayProps) {
    // 如果是简单字符串错误，使用原来的简单样式
    if (typeof error === 'string') {
        return (
            <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                {error}
            </div>
        )
    }

    const ErrorIcon = errorTypeIcons[error.type] || WarningIcon
    const errorTitle = errorTypeTitles[error.type] || '查询错误'

    return (
        <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg overflow-hidden">
            {/* 错误标题区域 */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/20 bg-red-500/5">
                <ErrorIcon size={14} className="text-red-400 flex-shrink-0" />
                <span className="text-xs font-medium text-red-400">{errorTitle}</span>
            </div>

            {/* 错误描述 */}
            <div className="px-3 py-2 space-y-2">
                <p className="text-xs text-red-300">{error.description}</p>

                {/* 原始错误消息（可折叠） */}
                <details className="group">
                    <summary className="text-xs text-red-400/70 cursor-pointer hover:text-red-400 select-none">
                        查看详细错误
                    </summary>
                    <pre className="mt-1 p-2 bg-red-500/5 rounded text-xs text-red-400/80 font-mono whitespace-pre-wrap break-all">
                        {error.message}
                    </pre>
                </details>
            </div>

            {/* 建议区域 */}
            {error.suggestions && error.suggestions.length > 0 && (
                <div className="px-3 py-2 border-t border-red-500/20 bg-amber-500/5">
                    <div className="flex items-center gap-1.5 mb-2">
                        <LightningIcon size={12} className="text-amber-400" />
                        <span className="text-xs font-medium text-amber-400">建议</span>
                    </div>
                    <ul className="space-y-1.5">
                        {error.suggestions.map((suggestion, idx) => {
                            // 检查建议是否看起来像 SQL 语句（以 SELECT 开头或包含 FROM 等关键字）
                            const isSQLSuggestion = /^(SELECT|INSERT|UPDATE|DELETE)\s/i.test(suggestion.trim()) ||
                                (suggestion.includes('SELECT') && suggestion.includes('FROM'))

                            return (
                                <li key={idx} className="flex items-start gap-2">
                                    <span className="text-amber-500/60 text-xs mt-0.5">•</span>
                                    <div className="flex-1 min-w-0">
                                        {isSQLSuggestion ? (
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 px-2 py-1 bg-amber-500/10 rounded text-xs font-mono text-amber-300 break-all">
                                                    {suggestion}
                                                </code>
                                                {onApplySuggestion && (
                                                    <button
                                                        onClick={() => onApplySuggestion(suggestion)}
                                                        className="flex-shrink-0 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded text-xs text-amber-300 transition-colors"
                                                        title="应用此建议"
                                                    >
                                                        应用
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-amber-300/90">{suggestion}</span>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
        </div>
    )
}

export function DBInspector({ deviceId }: DBInspectorProps) {
    const {
        // State
        databases,
        dbLoading,
        dbError,
        selectedDb,
        selectedTable,
        tables,
        tablesLoading,
        schema,
        showSchema,
        tableData,
        dataLoading,
        dataError,
        page,
        pageSize,
        orderBy,
        ascending,
        // SQL 查询状态
        queryMode,
        queryInput,
        queryResult,
        queryLoading,
        queryError,
        // 数据库排序状态
        dbSortOrder,
        dbSortAscending,
        // 跨表搜索状态
        globalSearchKeyword,
        globalSearchResult,
        globalSearchLoading,
        globalSearchError,
        searchHistory,
        highlightRowId,
        pendingTargetRowId,
        isJumpingToMatch,
        // Actions
        loadDatabases,
        loadTables,
        loadSchema,
        loadTableData,
        selectDb,
        selectTable,
        setShowSchema,
        setSortAndReload,
        setPageAndReload,
        // SQL 查询 Actions
        setQueryMode,
        setQueryInput,
        executeQuery,
        // 数据库排序 Actions
        setDbSortOrder,
        toggleDbSortDirection,
        getSortedDatabases,
        // 跨表搜索 Actions
        setGlobalSearchKeyword,
        executeGlobalSearch,
        clearGlobalSearch,
        navigateToSearchResult,
        jumpToSearchResultRow,
        clearHighlightRow,
        removeFromSearchHistory,
        clearSearchHistory,
        // 重置 Action
        reset,
    } = useDBStore()

    // 搜索历史下拉菜单状态
    const [showSearchHistory, setShowSearchHistory] = useState(false)
    const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false)
    const searchInputRef = useRef<HTMLInputElement | null>(null)

    // 搜索结果分页与导航状态
    const [currentMatchTable, setCurrentMatchTable] = useState<string | null>(null)
    const [currentMatchRowIndex, setCurrentMatchRowIndex] = useState(0)
    const [matchPageByTable, setMatchPageByTable] = useState<Record<string, number>>({})
    const [matchRowsByTable, setMatchRowsByTable] = useState<Record<string, DBRow[]>>({})
    const [matchRowsLoadingByTable, setMatchRowsLoadingByTable] = useState<Record<string, boolean>>({})
    const [matchRowsErrorByTable, setMatchRowsErrorByTable] = useState<Record<string, string | null>>({})

    // Protobuf 配置
    const { descriptorMeta, getColumnConfig } = useProtobufStore()
    const [showProtobufConfig, setShowProtobufConfig] = useState(false)

    // 切换表时重置 Protobuf 面板状态
    useEffect(() => {
        setShowProtobufConfig(false)
    }, [selectedTable])

    // 搜索结果变化时重置导航与分页缓存
    useEffect(() => {
        setCurrentMatchTable(null)
        setCurrentMatchRowIndex(0)
        setMatchPageByTable({})
        setMatchRowsByTable({})
        setMatchRowsLoadingByTable({})
        setMatchRowsErrorByTable({})
    }, [globalSearchResult?.keyword, globalSearchResult?.dbId])

    useEffect(() => {
        if (!isSearchPanelOpen) return
        const timer = setTimeout(() => {
            searchInputRef.current?.focus()
        }, 0)
        return () => clearTimeout(timer)
    }, [isSearchPanelOpen])

    const searchTableResults = useMemo(() => {
        const rawResults = globalSearchResult?.tableResults ?? []
        return rawResults.map(result => ({
            ...result,
            matchRowIds: result.matchRowIds ?? [],
        }))
    }, [globalSearchResult])

    const searchWarning = useMemo(() => {
        if (!globalSearchResult) return null
        const thresholds = getDbSearchWarningThresholds()
        const totalOver = thresholds.totalMatches > 0 && globalSearchResult.totalMatches >= thresholds.totalMatches
        const tableOver = globalSearchResult.tableResults.filter(result =>
            thresholds.perTableMatches > 0 && result.matchCount >= thresholds.perTableMatches
        )

        if (!totalOver && tableOver.length === 0) return null

        return {
            thresholds,
            totalOver,
            tableOver,
        }
    }, [globalSearchResult])

    const getSearchResultByTable = useCallback((tableName: string) => {
        return searchTableResults.find(result => result.tableName === tableName) || null
    }, [searchTableResults])

    const loadMatchRows = useCallback(async (tableName: string, pageToLoad: number) => {
        if (!globalSearchResult || !selectedDb) return
        const result = getSearchResultByTable(tableName)
        if (!result) return

        const rowIds = result.matchRowIds || []
        const start = (pageToLoad - 1) * SEARCH_MATCH_PAGE_SIZE
        const slice = rowIds.slice(start, start + SEARCH_MATCH_PAGE_SIZE)

        setMatchRowsLoadingByTable(prev => ({ ...prev, [tableName]: true }))
        setMatchRowsErrorByTable(prev => ({ ...prev, [tableName]: null }))

        if (slice.length === 0) {
            setMatchRowsByTable(prev => ({ ...prev, [tableName]: [] }))
            setMatchRowsLoadingByTable(prev => ({ ...prev, [tableName]: false }))
            return
        }

        try {
            const response = await fetchSearchRows(deviceId, selectedDb, { tableName, rowIds: slice })
            setMatchRowsByTable(prev => ({ ...prev, [tableName]: response.rows }))
            setMatchRowsLoadingByTable(prev => ({ ...prev, [tableName]: false }))
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : '加载匹配结果失败'
            setMatchRowsErrorByTable(prev => ({ ...prev, [tableName]: errorMsg }))
            setMatchRowsLoadingByTable(prev => ({ ...prev, [tableName]: false }))
        }
    }, [deviceId, getSearchResultByTable, globalSearchResult, selectedDb])

    const ensureMatchPageForRow = useCallback((tableName: string, rowIndex: number) => {
        const pageToLoad = Math.floor(rowIndex / SEARCH_MATCH_PAGE_SIZE) + 1
        setMatchPageByTable(prev => {
            if (prev[tableName] === pageToLoad) return prev
            return { ...prev, [tableName]: pageToLoad }
        })
        loadMatchRows(tableName, pageToLoad)
    }, [loadMatchRows])

    const searchNavState = useMemo(() => {
        if (!currentMatchTable) {
            return {
                currentTableIndex: -1,
                totalTables: searchTableResults.length,
                totalMatchesInTable: 0,
                hasPrevMatch: searchTableResults.length > 0,
                hasNextMatch: searchTableResults.length > 0,
                hasPrevTable: searchTableResults.length > 0,
                hasNextTable: searchTableResults.length > 0,
            }
        }

        const tableIndex = searchTableResults.findIndex(result => result.tableName === currentMatchTable)
        const totalTables = searchTableResults.length
        const currentTableResult = tableIndex >= 0 ? searchTableResults[tableIndex] : null
        const totalMatchesInTable = currentTableResult?.matchRowIds.length ?? 0

        let hasPrevMatch = currentMatchRowIndex > 0
        if (!hasPrevMatch) {
            for (let i = tableIndex - 1; i >= 0; i -= 1) {
                if (searchTableResults[i].matchRowIds.length > 0) {
                    hasPrevMatch = true
                    break
                }
            }
        }

        let hasNextMatch = currentMatchRowIndex + 1 < totalMatchesInTable
        if (!hasNextMatch) {
            for (let i = tableIndex + 1; i < searchTableResults.length; i += 1) {
                if (searchTableResults[i].matchRowIds.length > 0) {
                    hasNextMatch = true
                    break
                }
            }
        }

        let hasPrevTable = false
        for (let i = tableIndex - 1; i >= 0; i -= 1) {
            if (searchTableResults[i].matchRowIds.length > 0) {
                hasPrevTable = true
                break
            }
        }

        let hasNextTable = false
        for (let i = tableIndex + 1; i < searchTableResults.length; i += 1) {
            if (searchTableResults[i].matchRowIds.length > 0) {
                hasNextTable = true
                break
            }
        }

        return {
            currentTableIndex: tableIndex,
            totalTables,
            totalMatchesInTable,
            hasPrevMatch,
            hasNextMatch,
            hasPrevTable,
            hasNextTable,
        }
    }, [currentMatchRowIndex, currentMatchTable, searchTableResults])

    // 当前表的描述符数量
    const currentTableDescriptorCount = useMemo(() => {
        if (!selectedDb || !selectedTable) return 0
        return descriptorMeta.filter(d => d.dbId === selectedDb && d.tableName === selectedTable).length
    }, [descriptorMeta, selectedDb, selectedTable])

    const showSearchNav = Boolean(
        globalSearchResult &&
        currentMatchTable &&
        selectedTable === currentMatchTable &&
        searchNavState.currentTableIndex >= 0
    )
    const showSearchPanel = isSearchPanelOpen

    // 列筛选状态：columnName -> filterValue
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
    // 展开的筛选列
    const [expandedFilterColumn, setExpandedFilterColumn] = useState<string | null>(null)
    // 展开的 BLOB 单元格（用于高亮标记）
    const [expandedBlobCell, setExpandedBlobCell] = useState<{ rowIndex: number; columnName: string } | null>(null)

    // 切换表时重置列筛选状态和展开的 BLOB 单元格
    useEffect(() => {
        setColumnFilters({})
        setExpandedFilterColumn(null)
        setExpandedBlobCell(null)
    }, [selectedTable])

    // 自动滚动到高亮行并在一段时间后清除高亮
    useEffect(() => {
        if (!highlightRowId || !tableData?.rows) return

        let clearTimer: ReturnType<typeof setTimeout> | null = null

        // 等待 DOM 更新后滚动
        const timer = setTimeout(() => {
            const highlightedRow = document.querySelector(`tr[data-rowid="${highlightRowId}"]`)
            if (highlightedRow) {
                highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' })
                // 仅当定位成功时才清除高亮
                clearTimer = setTimeout(() => {
                    clearHighlightRow()
                }, 3000)
            }
        }, 100)

        return () => {
            clearTimeout(timer)
            if (clearTimer) {
                clearTimeout(clearTimer)
            }
        }
    }, [highlightRowId, tableData?.rows, clearHighlightRow])

    // 面板区域高度调整状态
    const [panelHeight, setPanelHeight] = useState(300) // 默认 300px
    const [isPanelResizing, setIsPanelResizing] = useState(false)
    const panelResizeState = useRef<{ startY: number; startHeight: number } | null>(null)

    // 面板高度调整的鼠标事件
    const startPanelResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        panelResizeState.current = { startY: e.clientY, startHeight: panelHeight }
        setIsPanelResizing(true)
    }, [panelHeight])

    useEffect(() => {
        if (!isPanelResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!panelResizeState.current) return
            const deltaY = e.clientY - panelResizeState.current.startY
            const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, panelResizeState.current.startHeight + deltaY))
            setPanelHeight(newHeight)
        }

        const handleMouseUp = () => {
            setIsPanelResizing(false)
            panelResizeState.current = null
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isPanelResizing])

    // 动态列宽状态：columnName -> width
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
    const [isResizing, setIsResizing] = useState(false)
    const resizeState = useRef<{ columnName: string; startX: number; startWidth: number } | null>(null)

    // 开始调整列宽
    const startColumnResize = useCallback((e: React.MouseEvent, columnName: string) => {
        e.preventDefault()
        e.stopPropagation()
        const startWidth = columnWidths[columnName] || 150
        resizeState.current = { columnName, startX: e.clientX, startWidth }
        setIsResizing(true)
    }, [columnWidths])

    // 列宽调整的鼠标移动和抬起事件
    useEffect(() => {
        if (!isResizing) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeState.current) return
            const { columnName, startX, startWidth } = resizeState.current
            const delta = e.clientX - startX
            const newWidth = Math.max(80, Math.min(600, startWidth + delta))
            setColumnWidths(prev => ({ ...prev, [columnName]: newWidth }))
        }

        const handleMouseUp = () => {
            setIsResizing(false)
            resizeState.current = null
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing])

    // 数据库路径弹窗状态
    const [pathPopupDbId, setPathPopupDbId] = useState<string | null>(null)
    const [pathCopied, setPathCopied] = useState(false)

    // 数据库分组展开状态
    const [sharedDbExpanded, setSharedDbExpanded] = useState(true)
    const [currentUserDbExpanded, setCurrentUserDbExpanded] = useState(true)
    const [otherUserDbExpanded, setOtherUserDbExpanded] = useState(false)

    // 双击单元格弹出框状态


    // 跟踪 deviceId 变化
    const prevDeviceIdRef = useRef(deviceId)

    // 切换表时清空筛选
    const prevTableRef = useRef(selectedTable)
    useEffect(() => {
        if (prevTableRef.current !== selectedTable) {
            setColumnFilters({})
            setExpandedFilterColumn(null)
            prevTableRef.current = selectedTable
        }
    }, [selectedTable])

    // 路径弹窗：ESC 键和点击外部关闭
    useEffect(() => {
        if (!pathPopupDbId) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPathPopupDbId(null)
            }
        }

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            // 检查点击是否在弹窗内部或文件夹图标按钮上
            if (!target.closest('[data-path-popup]') && !target.closest('[data-path-button]')) {
                setPathPopupDbId(null)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('mousedown', handleClickOutside)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [pathPopupDbId])

    // 设备切换时重置状态并重新加载
    useEffect(() => {
        if (prevDeviceIdRef.current !== deviceId) {
            // 设备切换，重置所有状态
            reset()
            prevDeviceIdRef.current = deviceId
        }
        // 加载数据库列表
        loadDatabases(deviceId)
    }, [deviceId, reset, loadDatabases])

    // 选中数据库后加载表（仅当表列表为空时）
    useEffect(() => {
        if (selectedDb && tables.length === 0) {
            loadTables(deviceId, selectedDb)
        }
    }, [deviceId, selectedDb, tables.length, loadTables])

    // 选中表后加载数据和结构
    useEffect(() => {
        if (selectedDb && selectedTable && (!tableData && !pendingTargetRowId)) {
            loadSchema(deviceId, selectedDb, selectedTable)
            loadTableData(deviceId, selectedDb, selectedTable)
        }
    }, [deviceId, selectedDb, selectedTable, tableData, pendingTargetRowId, loadSchema, loadTableData])

    // 处理选择数据库
    const handleSelectDb = useCallback((dbId: string) => {
        selectDb(dbId)
        // 选择后立即加载表
        loadTables(deviceId, dbId)
    }, [selectDb, loadTables, deviceId])

    // 处理选择表
    const handleSelectTable = useCallback((table: string) => {
        selectTable(table)
        // 选择后立即加载数据和 schema
        if (selectedDb) {
            loadSchema(deviceId, selectedDb, table)
            loadTableData(deviceId, selectedDb, table)
        }
    }, [selectTable, selectedDb, deviceId, loadSchema, loadTableData])

    const jumpToMatch = useCallback((tableName: string, rowIndex: number, rowId: string) => {
        setCurrentMatchTable(tableName)
        setCurrentMatchRowIndex(rowIndex)
        ensureMatchPageForRow(tableName, rowIndex)
        if (selectedDb) {
            jumpToSearchResultRow(deviceId, selectedDb, tableName, rowId)
        } else {
            navigateToSearchResult(tableName, rowId)
        }
    }, [deviceId, ensureMatchPageForRow, jumpToSearchResultRow, navigateToSearchResult, selectedDb])

    const handleSelectSearchTable = useCallback((tableName: string) => {
        const result = getSearchResultByTable(tableName)
        if (!result || result.matchRowIds.length === 0) {
            navigateToSearchResult(tableName)
            return
        }
        const firstRowId = result.matchRowIds[0]
        jumpToMatch(tableName, 0, firstRowId)
    }, [getSearchResultByTable, jumpToMatch, navigateToSearchResult])

    const handleSelectSearchRow = useCallback((tableName: string, rowIndex: number, rowId: string) => {
        jumpToMatch(tableName, rowIndex, rowId)
    }, [jumpToMatch])

    const handleMatchPageChange = useCallback((tableName: string, nextPage: number) => {
        setMatchPageByTable(prev => ({ ...prev, [tableName]: nextPage }))
        loadMatchRows(tableName, nextPage)
    }, [loadMatchRows])

    const handleNextMatch = useCallback(() => {
        if (!globalSearchResult || searchTableResults.length === 0) return
        let tableIndex = currentMatchTable
            ? searchTableResults.findIndex(result => result.tableName === currentMatchTable)
            : 0

        if (tableIndex < 0) tableIndex = 0
        let rowIndex = currentMatchTable ? currentMatchRowIndex : -1

        while (tableIndex < searchTableResults.length) {
            const rowIds = searchTableResults[tableIndex].matchRowIds
            if (rowIds.length === 0) {
                tableIndex += 1
                rowIndex = -1
                continue
            }

            if (rowIndex + 1 < rowIds.length) {
                rowIndex += 1
                jumpToMatch(searchTableResults[tableIndex].tableName, rowIndex, rowIds[rowIndex])
                return
            }

            tableIndex += 1
            rowIndex = -1
        }
    }, [currentMatchRowIndex, currentMatchTable, globalSearchResult, jumpToMatch, searchTableResults])

    const handlePrevMatch = useCallback(() => {
        if (!globalSearchResult || searchTableResults.length === 0) return

        if (!currentMatchTable) {
            // 未定位时，跳到最后一条匹配
            for (let idx = searchTableResults.length - 1; idx >= 0; idx -= 1) {
                const rowIds = searchTableResults[idx].matchRowIds
                if (rowIds.length > 0) {
                    const lastIndex = rowIds.length - 1
                    jumpToMatch(searchTableResults[idx].tableName, lastIndex, rowIds[lastIndex])
                    return
                }
            }
            return
        }

        let tableIndex = searchTableResults.findIndex(result => result.tableName === currentMatchTable)
        if (tableIndex < 0) tableIndex = searchTableResults.length - 1

        while (tableIndex >= 0) {
            const rowIds = searchTableResults[tableIndex].matchRowIds
            if (rowIds.length === 0) {
                tableIndex -= 1
                continue
            }

            if (tableIndex === searchTableResults.findIndex(result => result.tableName === currentMatchTable)) {
                if (currentMatchRowIndex - 1 >= 0) {
                    const prevIndex = currentMatchRowIndex - 1
                    jumpToMatch(searchTableResults[tableIndex].tableName, prevIndex, rowIds[prevIndex])
                    return
                }
                tableIndex -= 1
                continue
            }

            const lastIndex = rowIds.length - 1
            jumpToMatch(searchTableResults[tableIndex].tableName, lastIndex, rowIds[lastIndex])
            return
        }
    }, [currentMatchRowIndex, currentMatchTable, globalSearchResult, jumpToMatch, searchTableResults])

    const handleNextTable = useCallback(() => {
        if (!globalSearchResult || searchTableResults.length === 0) return
        let tableIndex = currentMatchTable
            ? searchTableResults.findIndex(result => result.tableName === currentMatchTable)
            : -1
        tableIndex += 1

        while (tableIndex < searchTableResults.length) {
            const rowIds = searchTableResults[tableIndex].matchRowIds
            if (rowIds.length > 0) {
                jumpToMatch(searchTableResults[tableIndex].tableName, 0, rowIds[0])
                return
            }
            tableIndex += 1
        }
    }, [currentMatchTable, globalSearchResult, jumpToMatch, searchTableResults])

    const handlePrevTable = useCallback(() => {
        if (!globalSearchResult || searchTableResults.length === 0) return
        let tableIndex = currentMatchTable
            ? searchTableResults.findIndex(result => result.tableName === currentMatchTable)
            : searchTableResults.length
        tableIndex -= 1

        while (tableIndex >= 0) {
            const rowIds = searchTableResults[tableIndex].matchRowIds
            if (rowIds.length > 0) {
                jumpToMatch(searchTableResults[tableIndex].tableName, 0, rowIds[0])
                return
            }
            tableIndex -= 1
        }
    }, [currentMatchTable, globalSearchResult, jumpToMatch, searchTableResults])

    // 处理排序
    const handleSort = useCallback((column: string) => {
        setSortAndReload(deviceId, column)
    }, [setSortAndReload, deviceId])

    // 处理分页
    const handlePageChange = useCallback((newPage: number) => {
        setPageAndReload(deviceId, newPage)
    }, [setPageAndReload, deviceId])

    // 处理列筛选
    const handleColumnFilter = useCallback((column: string, value: string) => {
        setColumnFilters(prev => {
            if (value === '') {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { [column]: _, ...rest } = prev
                return rest
            }
            return { ...prev, [column]: value }
        })
    }, [])

    // 清除单列筛选
    const clearColumnFilter = useCallback((column: string) => {
        setColumnFilters(prev => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [column]: _, ...rest } = prev
            return rest
        })
        setExpandedFilterColumn(null)
    }, [])

    // 清除所有筛选
    const clearAllFilters = useCallback(() => {
        setColumnFilters({})
        setExpandedFilterColumn(null)
    }, [])

    // 复制文本到剪贴板（带回退机制和错误处理）
    const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
        try {
            // 首选：使用现代 Clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text)
                return true
            }
            // 回退：使用 execCommand（已废弃但兼容性好）
            const textArea = document.createElement('textarea')
            textArea.value = text
            textArea.style.position = 'fixed'
            textArea.style.left = '-9999px'
            textArea.style.top = '-9999px'
            document.body.appendChild(textArea)
            textArea.focus()
            textArea.select()
            const success = document.execCommand('copy')
            document.body.removeChild(textArea)
            return success
        } catch (err) {
            console.error('Failed to copy:', err)
            return false
        }
    }, [])

    // 格式化数据库位置为路径字符串
    const formatLocationPath = useCallback((location: DatabaseLocation): string => {
        if (location.appSupport) {
            return `Application Support/${location.appSupport.relative}`
        }
        if (location.documents) {
            return `Documents/${location.documents.relative}`
        }
        if (location.caches) {
            return `Caches/${location.caches.relative}`
        }
        if (location.group) {
            return `AppGroup(${location.group.containerId})/${location.group.relative}`
        }
        if (location.custom) {
            return location.custom.description
        }
        return 'Unknown location'
    }, [])

    // 获取数据库显示路径（优先使用绝对路径）
    const getDisplayPath = useCallback((db: DBInfo): string => {
        return db.absolutePath || formatLocationPath(db.descriptor.location)
    }, [formatLocationPath])

    const toast = useToastStore()

    // 复制数据库路径并显示反馈
    const handleCopyPath = useCallback(async (db: DBInfo) => {
        const path = getDisplayPath(db)
        const success = await copyToClipboard(path)
        if (success) {
            setPathCopied(true)
            toast.show('success', '路径已复制到剪贴板')
            setTimeout(() => setPathCopied(false), 2000)
        } else {
            toast.show('error', '复制失败，请手动复制')
        }
    }, [getDisplayPath, copyToClipboard, toast])

    // 根据筛选条件过滤数据（客户端筛选）
    const filteredRows = useMemo(() => {
        if (!tableData?.rows) return []
        const filterEntries = Object.entries(columnFilters)
        if (filterEntries.length === 0) return tableData.rows

        return tableData.rows.filter(row => {
            return filterEntries.every(([column, filterValue]) => {
                const cellValue = row.values[column]
                if (cellValue === null || cellValue === undefined) {
                    return filterValue.toLowerCase() === 'null'
                }
                return String(cellValue).toLowerCase().includes(filterValue.toLowerCase())
            })
        })
    }, [tableData?.rows, columnFilters])

    if (dbLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        )
    }

    if (dbError) {
        // 检查是否是设备未连接的错误
        const isNotConnected = dbError.includes('未连接') || dbError.includes('404')
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
                {isNotConnected ? (
                    <>
                        <DatabaseIcon size={48} className="mb-4 opacity-30" />
                        <p className="text-base font-medium mb-2">设备未连接</p>
                        <p className="text-sm text-text-muted mb-4 text-center max-w-md">
                            请确保设备已连接到 DebugHub，且 DebugProbe SDK 已启用数据库功能
                        </p>
                    </>
                ) : (
                    <>
                        <WarningIcon size={36} className="mb-3 opacity-50" />
                        <p className="text-sm mb-3">{dbError}</p>
                    </>
                )}
                <button
                    onClick={() => loadDatabases(deviceId)}
                    className="px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                >
                    重试
                </button>
            </div>
        )
    }

    if (databases.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <DatabaseIcon size={36} className="mb-3 opacity-50" />
                <p className="text-sm">没有注册的数据库</p>
                <p className="text-xs mt-2 text-text-muted">
                    在 App 中使用 DatabaseRegistry.shared.register() 注册数据库
                </p>
            </div>
        )
    }

    return (
        <div className="flex h-full">
            {/* 左侧 - 数据库和表列表 */}
            <div className="w-64 flex-shrink-0 border-r border-border bg-bg-dark flex flex-col">
                {/* 数据库列表 */}
                <div className="p-3 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            数据库
                        </h3>
                        {/* 刷新和排序控件 */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => loadDatabases(deviceId)}
                                disabled={dbLoading}
                                className="px-2 py-1 bg-bg-light text-text-secondary rounded text-xs hover:bg-bg-lighter transition-colors disabled:opacity-50"
                                title="刷新所有数据库"
                            >
                                刷新
                            </button>
                            <select
                                value={dbSortOrder}
                                onChange={(e) => setDbSortOrder(e.target.value as 'name' | 'size' | 'tableCount')}
                                className="text-2xs bg-bg-light border border-border rounded px-1.5 py-0.5 text-text-secondary focus:outline-none focus:border-primary"
                                title="排序方式"
                            >
                                <option value="name">名称</option>
                                <option value="size">大小</option>
                                <option value="tableCount">表数</option>
                            </select>
                            <button
                                onClick={toggleDbSortDirection}
                                className="p-1 rounded hover:bg-bg-light text-text-muted hover:text-text-secondary transition-colors"
                                title={dbSortAscending ? '升序' : '降序'}
                            >
                                {dbSortAscending ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1">
                        {/* 共享数据库分组 - 第一个分组 */}
                        {(() => {
                            const sharedDbs = getSortedDatabases().filter(db => (db.descriptor.ownership || 'shared') === 'shared')
                            if (sharedDbs.length === 0) return null
                            return (
                                <div>
                                    <button
                                        onClick={() => setSharedDbExpanded(!sharedDbExpanded)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-2xs text-accent-blue font-medium hover:text-accent-blue/80 transition-colors"
                                    >
                                        {sharedDbExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                                        <span>共享</span>
                                        <span className="opacity-60">({sharedDbs.length})</span>
                                    </button>
                                    {sharedDbExpanded && (
                                        <div className="mt-1 space-y-1">
                                            {sharedDbs.map((db) => (
                                                <DatabaseItem
                                                    key={db.descriptor.id}
                                                    db={db}
                                                    isSelected={selectedDb === db.descriptor.id}
                                                    pathPopupDbId={pathPopupDbId}
                                                    pathCopied={pathCopied}
                                                    onSelect={handleSelectDb}
                                                    onTogglePathPopup={(id) => setPathPopupDbId(pathPopupDbId === id ? null : id)}
                                                    onClosePathPopup={() => setPathPopupDbId(null)}
                                                    onCopyPath={handleCopyPath}
                                                    getDisplayPath={getDisplayPath}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {/* 当前账户数据库分组 - 第二个分组 */}
                        {(() => {
                            const currentUserDbs = getSortedDatabases().filter(db => (db.descriptor.ownership || 'shared') === 'currentUser')
                            if (currentUserDbs.length === 0) return null
                            // 判断前面是否有共享分组，决定是否显示分割线
                            const hasSharedDbs = getSortedDatabases().some(db => (db.descriptor.ownership || 'shared') === 'shared')
                            // 优先使用 ownerDisplayName 作为分组标题
                            const displayName = currentUserDbs[0]?.descriptor.ownerDisplayName || '当前账户'
                            return (
                                <div className={hasSharedDbs ? 'mt-2 pt-2 border-t border-border' : ''}>
                                    <button
                                        onClick={() => setCurrentUserDbExpanded(!currentUserDbExpanded)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-2xs text-primary font-medium hover:text-primary/80 transition-colors"
                                    >
                                        {currentUserDbExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                                        <span>{displayName}</span>
                                        <span className="opacity-60">({currentUserDbs.length})</span>
                                    </button>
                                    {currentUserDbExpanded && (
                                        <div className="mt-1 space-y-1">
                                            {currentUserDbs.map((db) => (
                                                <DatabaseItem
                                                    key={db.descriptor.id}
                                                    db={db}
                                                    isSelected={selectedDb === db.descriptor.id}
                                                    pathPopupDbId={pathPopupDbId}
                                                    pathCopied={pathCopied}
                                                    onSelect={handleSelectDb}
                                                    onTogglePathPopup={(id) => setPathPopupDbId(pathPopupDbId === id ? null : id)}
                                                    onClosePathPopup={() => setPathPopupDbId(null)}
                                                    onCopyPath={handleCopyPath}
                                                    getDisplayPath={getDisplayPath}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {/* 其他账户数据库分组 - 第三个分组，按 ownerIdentifier 再分组 */}
                        {(() => {
                            const otherUserDbs = getSortedDatabases().filter(db => (db.descriptor.ownership || 'shared') === 'otherUser')
                            if (otherUserDbs.length === 0) return null

                            // 按 ownerIdentifier 分组
                            const groupedByOwner = otherUserDbs.reduce((acc, db) => {
                                const owner = db.descriptor.ownerIdentifier || '未知'
                                if (!acc[owner]) {
                                    acc[owner] = []
                                }
                                acc[owner].push(db)
                                return acc
                            }, {} as Record<string, typeof otherUserDbs>)

                            // 判断前面是否有其他分组，决定是否显示分割线
                            const hasSharedDbs = getSortedDatabases().some(db => (db.descriptor.ownership || 'shared') === 'shared')
                            const hasCurrentUserDbs = getSortedDatabases().some(db => (db.descriptor.ownership || 'shared') === 'currentUser')
                            const hasPreviousGroups = hasSharedDbs || hasCurrentUserDbs

                            return (
                                <div className={hasPreviousGroups ? 'mt-2 pt-2 border-t border-border' : ''}>
                                    <button
                                        onClick={() => setOtherUserDbExpanded(!otherUserDbExpanded)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-2xs text-text-muted font-medium hover:text-text-secondary transition-colors"
                                    >
                                        {otherUserDbExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                                        <span>其他账户</span>
                                        <span className="opacity-60">({otherUserDbs.length})</span>
                                    </button>
                                    {otherUserDbExpanded && (
                                        <div className="mt-1 space-y-2 opacity-50">
                                            {Object.entries(groupedByOwner).map(([ownerId, dbs]) => {
                                                // 优先使用 ownerDisplayName 作为显示名称
                                                const displayName = dbs[0]?.descriptor.ownerDisplayName || null
                                                const hasDisplayName = !!displayName
                                                return (
                                                    <div key={ownerId} className="space-y-1">
                                                        <TextPopover text={ownerId} title="账户 ID" trigger="dblclick">
                                                            <div className={`px-2 py-0.5 text-2xs text-text-muted/70 truncate hover:text-text-muted transition-colors ${hasDisplayName ? '' : 'font-mono'}`} title={hasDisplayName ? `账户 ID: ${ownerId}` : '双击查看完整 ID'}>
                                                                {hasDisplayName
                                                                    ? displayName
                                                                    : (ownerId.length > 20 ? `${ownerId.slice(0, 8)}...${ownerId.slice(-8)}` : ownerId)}
                                                            </div>
                                                        </TextPopover>
                                                        {dbs.map((db) => (
                                                            <DatabaseItem
                                                                key={db.descriptor.id}
                                                                db={db}
                                                                isSelected={selectedDb === db.descriptor.id}
                                                                pathPopupDbId={pathPopupDbId}
                                                                pathCopied={pathCopied}
                                                                onSelect={handleSelectDb}
                                                                onTogglePathPopup={(id) => setPathPopupDbId(pathPopupDbId === id ? null : id)}
                                                                onClosePathPopup={() => setPathPopupDbId(null)}
                                                                onCopyPath={handleCopyPath}
                                                                getDisplayPath={getDisplayPath}
                                                            />
                                                        ))}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                </div>

                {/* 表列表 */}
                <div className="flex-1 overflow-auto p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            表 {tables.length > 0 && `(${tables.length})`}
                        </h3>
                        <div className="flex items-center gap-1">
                            {selectedDb && (
                                <button
                                    onClick={() => selectedDb && loadTables(deviceId, selectedDb)}
                                    disabled={tablesLoading}
                                    className="px-2 py-1 bg-bg-light text-text-secondary rounded text-xs hover:bg-bg-lighter transition-colors disabled:opacity-50"
                                    title="刷新当前数据库的所有表"
                                >
                                    刷新
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mb-3">
                        <button
                            onClick={() => setIsSearchPanelOpen(true)}
                            disabled={!selectedDb}
                            className={clsx(
                                'w-full px-3 py-2 rounded text-xs flex items-center justify-center gap-1 transition-colors',
                                selectedDb
                                    ? 'bg-primary text-bg-darkest hover:bg-primary/90'
                                    : 'bg-bg-light text-text-muted cursor-not-allowed'
                            )}
                            title={selectedDb ? '打开跨表搜索' : '请先选择数据库'}
                        >
                            <SearchIcon size={12} />
                            跨表搜索
                            {globalSearchResult && (
                                <span className="ml-1 px-1.5 py-0.5 rounded bg-bg-darkest/20 text-[10px]">
                                    {globalSearchResult.totalMatches}
                                </span>
                            )}
                        </button>
                    </div>

                    {tablesLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                    ) : selectedDb ? (
                        <div className="space-y-1">
                            {tables.map((table) => (
                                <button
                                    key={table.name}
                                    onClick={() => handleSelectTable(table.name)}
                                    className={clsx(
                                        'w-full px-3 py-2 rounded-lg text-left text-xs transition-all',
                                        selectedTable === table.name
                                            ? 'bg-accent-blue text-white shadow-sm shadow-accent-blue/30'
                                            : 'text-text-secondary hover:bg-bg-light'
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono truncate">{table.name}</span>
                                        <span className={clsx(
                                            'tabular-nums',
                                            selectedTable === table.name ? 'text-white/70' : 'text-text-muted'
                                        )}>
                                            {table.rowCount !== null ? table.rowCount.toLocaleString() : '?'}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-text-muted text-center py-4">
                            请先选择数据库
                        </p>
                    )}
                </div>
            </div>

            {showSearchPanel && (
                <div className="w-[360px] min-w-[320px] max-w-[420px] flex-shrink-0 border-r border-border bg-bg-dark/70 flex flex-col">
                    <div className="px-3 py-2 border-b border-border bg-bg-dark/80 flex items-center justify-between">
                        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            跨表搜索
                        </span>
                        <button
                            onClick={() => setIsSearchPanelOpen(false)}
                            className="px-2 py-1 rounded text-2xs text-text-muted hover:text-text-secondary hover:bg-bg-light transition-colors"
                        >
                            关闭
                        </button>
                    </div>
                    <div className="px-3 py-2 border-b border-border bg-bg-dark/60">
                        <div className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={globalSearchKeyword}
                                onChange={(e) => setGlobalSearchKeyword(e.target.value)}
                                onFocus={() => setShowSearchHistory(true)}
                                onBlur={() => {
                                    setTimeout(() => setShowSearchHistory(false), 200)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && globalSearchKeyword.trim()) {
                                        executeGlobalSearch(deviceId)
                                        setShowSearchHistory(false)
                                    }
                                }}
                                placeholder="搜索所有表..."
                                className="w-full px-3 py-1.5 pl-8 text-xs bg-bg-light border border-border rounded focus:outline-none focus:border-primary transition-colors"
                            />
                            <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                            {globalSearchKeyword && (
                                <button
                                    onClick={clearGlobalSearch}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                                    title="清除搜索"
                                >
                                    <XIcon size={12} />
                                </button>
                            )}

                            {showSearchHistory && searchHistory.length > 0 && !globalSearchKeyword && (
                                <div className="absolute z-50 w-full mt-1 bg-bg-dark border border-border rounded-lg shadow-xl overflow-hidden">
                                    <div className="flex items-center justify-between px-2 py-1.5 bg-bg-tertiary border-b border-border">
                                        <span className="text-2xs text-text-muted flex items-center gap-1">
                                            <ClockIcon size={10} />
                                            搜索历史
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                clearSearchHistory()
                                            }}
                                            className="text-2xs text-text-muted hover:text-red-400 flex items-center gap-0.5"
                                            title="清除所有历史"
                                        >
                                            <TrashIcon size={10} />
                                            清除
                                        </button>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto bg-bg-dark">
                                        {searchHistory.map((keyword, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between px-2 py-1.5 hover:bg-bg-lighter cursor-pointer group"
                                                onMouseDown={(e) => {
                                                    e.preventDefault()
                                                    setGlobalSearchKeyword(keyword)
                                                    setShowSearchHistory(false)
                                                    setTimeout(() => executeGlobalSearch(deviceId), 0)
                                                }}
                                            >
                                                <span className="text-xs text-text-secondary truncate flex-1">
                                                    {keyword}
                                                </span>
                                                <button
                                                    onMouseDown={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        removeFromSearchHistory(keyword)
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 ml-2"
                                                    title="删除此记录"
                                                >
                                                    <XIcon size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {globalSearchKeyword.trim() && (
                            <button
                                onClick={() => executeGlobalSearch(deviceId)}
                                disabled={globalSearchLoading}
                                className="w-full mt-2 px-3 py-1.5 bg-primary text-bg-darkest rounded text-xs hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                                {globalSearchLoading ? (
                                    <>
                                        <div className="animate-spin w-3 h-3 border-2 border-bg-darkest border-t-transparent rounded-full" />
                                        搜索中...
                                    </>
                                ) : (
                                    <>
                                        <SearchIcon size={12} />
                                        搜索全部表
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden p-3">
                        {globalSearchLoading && !globalSearchResult && (
                            <div className="h-full flex items-center justify-center text-text-muted">
                                <div className="flex items-center gap-2 text-xs">
                                    <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
                                    搜索中...
                                </div>
                            </div>
                        )}

                        {globalSearchError && (
                            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                                {globalSearchError}
                            </div>
                        )}

                        {globalSearchResult && (
                            <div className="h-full flex flex-col bg-bg-light border border-border rounded-lg overflow-hidden">
                                <div className="px-3 py-2 border-b border-border bg-bg-tertiary flex items-center justify-between">
                                    <span className="text-xs font-medium text-primary">
                                        找到 {globalSearchResult.totalMatches} 条匹配
                                    </span>
                                    <span className="text-2xs text-text-muted">
                                        {globalSearchResult.searchDurationMs.toFixed(0)}ms
                                    </span>
                                </div>
                                <div className="flex-1 overflow-auto p-2 space-y-2">
                                    {searchWarning && (
                                        <div className="px-2 py-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-2xs text-yellow-300 flex items-start gap-2">
                                            <WarningIcon size={12} className="mt-0.5" />
                                            <div className="space-y-0.5">
                                                <div className="text-yellow-200">
                                                    结果过大，建议缩小关键词/缩小表范围
                                                </div>
                                                <div className="text-yellow-200/70">
                                                    阈值：总匹配 ≥ {searchWarning.thresholds.totalMatches.toLocaleString()}，单表 ≥ {searchWarning.thresholds.perTableMatches.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {searchTableResults.length === 0 ? (
                                        <p className="text-xs text-text-muted text-center py-4">
                                            未找到匹配结果
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {searchTableResults.map((result) => (
                                                <div key={result.tableName} className="border border-border rounded overflow-hidden">
                                                    {(() => {
                                                        const isActiveSearchTable = currentMatchTable === result.tableName
                                                        const matchRowIds = result.matchRowIds || []
                                                        const matchCount = matchRowIds.length
                                                        const isOversizedTable = Boolean(
                                                            searchWarning && searchWarning.tableOver.some(item => item.tableName === result.tableName)
                                                        )
                                                        const currentMatchPage = matchPageByTable[result.tableName] || 1
                                                        const totalMatchPages = Math.max(1, Math.ceil(matchCount / SEARCH_MATCH_PAGE_SIZE))
                                                        const matchRows = matchRowsByTable[result.tableName] || []
                                                        const matchLoading = matchRowsLoadingByTable[result.tableName]
                                                        const matchError = matchRowsErrorByTable[result.tableName]
                                                        const displayColumns = result.matchedColumns.length > 0
                                                            ? result.matchedColumns.slice(0, 2)
                                                            : result.columns.slice(0, 2).map(col => col.name)

                                                        return (
                                                            <>
                                                                <button
                                                                    onClick={() => {
                                                                        handleSelectSearchTable(result.tableName)
                                                                    }}
                                                                    className={clsx(
                                                                        'w-full px-2 py-1.5 text-left text-xs transition-colors',
                                                                        selectedTable === result.tableName
                                                                            ? 'bg-accent-blue/20 text-accent-blue'
                                                                            : 'text-text-secondary hover:bg-bg-lighter bg-bg-tertiary'
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="font-mono truncate">{result.tableName}</span>
                                                                        <div className="flex items-center gap-1">
                                                                            {isOversizedTable && (
                                                                                <span className="text-2xs text-yellow-300 bg-yellow-500/10 px-1 py-0.5 rounded border border-yellow-500/40">
                                                                                    过大
                                                                                </span>
                                                                            )}
                                                                            <span className="text-2xs text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">
                                                                                {result.matchCount}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-2xs text-text-muted mt-0.5 truncate">
                                                                        匹配列: {result.matchedColumns.join(', ')}
                                                                    </div>
                                                                </button>
                                                                {isActiveSearchTable ? (
                                                                    <div className="bg-bg-secondary/50 border-t border-border">
                                                                        <div className="flex items-center justify-between px-2 py-1 text-2xs text-text-muted border-b border-border">
                                                                            <span>
                                                                                {matchCount > 0
                                                                                    ? `显示 ${Math.min((currentMatchPage - 1) * SEARCH_MATCH_PAGE_SIZE + 1, matchCount)}-${Math.min(currentMatchPage * SEARCH_MATCH_PAGE_SIZE, matchCount)} / ${matchCount}`
                                                                                    : '暂无匹配'}
                                                                            </span>
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    onClick={() => handleMatchPageChange(result.tableName, Math.max(1, currentMatchPage - 1))}
                                                                                    disabled={currentMatchPage <= 1 || matchLoading}
                                                                                    className="px-1.5 py-0.5 rounded border border-border text-text-muted hover:text-text-secondary hover:bg-bg-lighter disabled:opacity-40"
                                                                                >
                                                                                    上一页
                                                                                </button>
                                                                                <span className="tabular-nums">
                                                                                    {currentMatchPage}/{totalMatchPages}
                                                                                </span>
                                                                                <button
                                                                                    onClick={() => handleMatchPageChange(result.tableName, Math.min(totalMatchPages, currentMatchPage + 1))}
                                                                                    disabled={currentMatchPage >= totalMatchPages || matchLoading}
                                                                                    className="px-1.5 py-0.5 rounded border border-border text-text-muted hover:text-text-secondary hover:bg-bg-lighter disabled:opacity-40"
                                                                                >
                                                                                    下一页
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        {matchLoading ? (
                                                                            <div className="py-3 flex items-center justify-center">
                                                                                <div className="animate-spin w-3 h-3 border-2 border-primary border-t-transparent rounded-full" />
                                                                            </div>
                                                                        ) : matchError ? (
                                                                            <div className="px-2 py-2 text-2xs text-red-400">
                                                                                {matchError}
                                                                            </div>
                                                                        ) : matchRows.length === 0 ? (
                                                                            <div className="px-2 py-2 text-2xs text-text-muted">暂无匹配</div>
                                                                        ) : (
                                                                            <div className="max-h-56 overflow-auto">
                                                                                {matchRows.map((row, rowIdx) => {
                                                                                    const rowId = row.values['_rowid'] ?? null
                                                                                    const resolvedIndex = rowId ? matchRowIds.indexOf(String(rowId)) : -1
                                                                                    const globalRowIndex = resolvedIndex >= 0
                                                                                        ? resolvedIndex
                                                                                        : (currentMatchPage - 1) * SEARCH_MATCH_PAGE_SIZE + rowIdx
                                                                                    const isCurrent = currentMatchTable === result.tableName && globalRowIndex === currentMatchRowIndex
                                                                                    return (
                                                                                        <div
                                                                                            key={`${result.tableName}-${globalRowIndex}`}
                                                                                            onClick={() => {
                                                                                                if (rowId) {
                                                                                                    handleSelectSearchRow(result.tableName, globalRowIndex, rowId)
                                                                                                }
                                                                                            }}
                                                                                            className={clsx(
                                                                                                'px-2 py-1 text-2xs border-b border-border last:border-b-0 truncate font-mono cursor-pointer flex items-center gap-2',
                                                                                                isCurrent
                                                                                                    ? 'bg-accent-blue/15 text-accent-blue'
                                                                                                    : 'text-text-muted hover:bg-bg-lighter'
                                                                                            )}
                                                                                        >
                                                                                            {rowId && (
                                                                                                <span className="text-accent-blue/70 min-w-[2.5rem] text-right" title="Row ID">
                                                                                                    #{rowId}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="flex-1 truncate">
                                                                                                {displayColumns.map((colName) => (
                                                                                                    <span key={colName} className="mr-3">
                                                                                                        <span className="text-text-secondary">{colName}:</span>{' '}
                                                                                                        <span className="text-text-primary">
                                                                                                            {highlightKeyword(String(row.values[colName] ?? 'NULL'), globalSearchKeyword)}
                                                                                                        </span>
                                                                                                    </span>
                                                                                                ))}
                                                                                            </span>
                                                                                        </div>
                                                                                    )
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    result.previewRows && result.previewRows.length > 0 && (
                                                                        <div className="bg-bg-secondary/50 border-t border-border max-h-32 overflow-auto">
                                                                            {result.previewRows.slice(0, 3).map((row, rowIdx) => {
                                                                                const rowId = row.values['_rowid'] ?? null
                                                                                const resolvedIndex = rowId ? matchRowIds.indexOf(String(rowId)) : rowIdx
                                                                                return (
                                                                                    <div
                                                                                        key={rowIdx}
                                                                                        onClick={() => {
                                                                                            if (rowId) {
                                                                                                handleSelectSearchRow(result.tableName, resolvedIndex, rowId)
                                                                                            } else {
                                                                                                handleSelectSearchTable(result.tableName)
                                                                                            }
                                                                                        }}
                                                                                        className="px-2 py-1 text-2xs text-text-muted border-b border-border last:border-b-0 truncate font-mono hover:bg-bg-lighter cursor-pointer flex items-center gap-2"
                                                                                    >
                                                                                        {rowId && (
                                                                                            <span className="text-accent-blue/70 min-w-[2.5rem] text-right" title="Row ID">
                                                                                                #{rowId}
                                                                                            </span>
                                                                                        )}
                                                                                        <span className="flex-1 truncate">
                                                                                            {result.matchedColumns.slice(0, 2).map((colName) => (
                                                                                                <span key={colName} className="mr-3">
                                                                                                    <span className="text-text-secondary">{colName}:</span>{' '}
                                                                                                    <span className="text-text-primary">
                                                                                                        {highlightKeyword(String(row.values[colName] ?? 'NULL'), globalSearchKeyword)}
                                                                                                    </span>
                                                                                                </span>
                                                                                            ))}
                                                                                        </span>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                            {matchCount > result.previewRows.length && (
                                                                                <div className="px-2 py-1 text-2xs text-text-muted bg-bg-secondary/70">
                                                                                    点击表名查看全部匹配
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                )}
                                                            </>
                                                        )
                                                    })()}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 右侧 - 表数据（带可选 SQL 查询面板） */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedTable ? (
                    <>
                        {/* 工具栏 */}
                        <div className="px-4 py-2 border-b border-border bg-bg-dark/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h3 className="font-mono text-sm text-text-primary">{selectedTable}</h3>
                                {tableData && (
                                    <span className="text-xs text-text-muted">
                                        {tableData.totalRows?.toLocaleString() ?? '?'} 行
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowProtobufConfig(!showProtobufConfig)}
                                    className={clsx(
                                        'px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1 whitespace-nowrap',
                                        showProtobufConfig
                                            ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'  // 展开时：紫色背景+边框
                                            : currentTableDescriptorCount > 0
                                                ? 'text-purple-400 hover:bg-purple-500/10'  // 已配置但未展开：紫色字，无背景
                                                : 'text-text-secondary hover:bg-bg-light'  // 未配置：灰色字，无背景
                                    )}
                                    title="Protobuf 配置"
                                >
                                    <PackageIcon size={12} />
                                    Protobuf
                                    {currentTableDescriptorCount > 0 && (
                                        <span className="ml-0.5 px-1 py-0.5 rounded text-2xs bg-purple-500/20 text-purple-400">
                                            {currentTableDescriptorCount}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowSchema(!showSchema)}
                                    className={clsx(
                                        'px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1',
                                        showSchema
                                            ? 'bg-[rgba(0,212,170,0.2)] text-primary ring-1 ring-[rgba(0,212,170,0.4)]'  // 展开时：绿色背景+边框
                                            : 'text-text-secondary hover:bg-bg-light'  // 未展开：灰色字，无背景
                                    )}
                                >
                                    <ClipboardIcon size={12} /> Schema
                                </button>
                                <button
                                    onClick={() => {
                                        if (!queryMode) {
                                            setQueryInput(`SELECT * FROM ${selectedTable} LIMIT 100`)
                                        }
                                        setQueryMode(!queryMode)
                                    }}
                                    className={clsx(
                                        'px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-1',
                                        queryMode
                                            ? 'bg-[rgba(74,144,217,0.2)] text-accent-blue ring-1 ring-[rgba(74,144,217,0.4)]'  // 展开时：蓝色背景+边框
                                            : 'text-text-secondary hover:bg-bg-light'  // 未展开：灰色字，无背景
                                    )}
                                    title="SQL 查询"
                                >
                                    <SQLIcon size={12} /> SQL 查询
                                </button>
                                <button
                                    onClick={() => selectedDb && selectedTable && loadTableData(deviceId, selectedDb, selectedTable)}
                                    disabled={dataLoading}
                                    className="px-3 py-1.5 bg-bg-light text-text-secondary rounded text-xs hover:bg-bg-lighter transition-colors disabled:opacity-50"
                                >
                                    刷新
                                </button>
                            </div>
                        </div>

                        {showSearchNav && (
                            <div className="px-4 py-2 border-b border-border bg-bg-dark/40 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-2xs text-text-muted">
                                    <span className="px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue">
                                        搜索: {globalSearchResult?.keyword}
                                    </span>
                                    <span className="tabular-nums">
                                        表 {searchNavState.currentTableIndex + 1}/{searchNavState.totalTables}
                                    </span>
                                    <span className="tabular-nums">
                                        匹配 {searchNavState.totalMatchesInTable > 0 ? currentMatchRowIndex + 1 : 0}/{searchNavState.totalMatchesInTable}
                                    </span>
                                    {isJumpingToMatch && (
                                        <span className="flex items-center gap-1 text-accent-blue">
                                            <div className="animate-spin w-3 h-3 border-2 border-accent-blue border-t-transparent rounded-full" />
                                            定位中...
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-2xs">
                                    <button
                                        onClick={handlePrevMatch}
                                        disabled={!searchNavState.hasPrevMatch || isJumpingToMatch}
                                        className="px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-lighter disabled:opacity-40 flex items-center gap-1"
                                    >
                                        <ChevronLeftIcon size={10} />
                                        上一条
                                    </button>
                                    <button
                                        onClick={handleNextMatch}
                                        disabled={!searchNavState.hasNextMatch || isJumpingToMatch}
                                        className="px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-lighter disabled:opacity-40 flex items-center gap-1"
                                    >
                                        下一条
                                        <ChevronRightIcon size={10} />
                                    </button>
                                    <div className="w-px h-4 bg-border" />
                                    <button
                                        onClick={handlePrevTable}
                                        disabled={!searchNavState.hasPrevTable || isJumpingToMatch}
                                        className="px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-lighter disabled:opacity-40 flex items-center gap-1"
                                    >
                                        <ChevronLeftIcon size={10} />
                                        上一表
                                    </button>
                                    <button
                                        onClick={handleNextTable}
                                        disabled={!searchNavState.hasNextTable || isJumpingToMatch}
                                        className="px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-lighter disabled:opacity-40 flex items-center gap-1"
                                    >
                                        下一表
                                        <ChevronRightIcon size={10} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 面板区域 - 可滚动并可调整高度 */}
                        {(showProtobufConfig || showSchema || queryMode) && (
                            <div className="relative border-b border-border bg-bg-dark/30 flex flex-col">
                                <div
                                    className="overflow-auto"
                                    style={{ maxHeight: panelHeight }}
                                >
                                    {/* Protobuf 配置面板 */}
                                    {showProtobufConfig && (
                                        <div className="px-4 py-3">
                                            <ProtobufConfigPanel
                                                dbId={selectedDb}
                                                tableName={selectedTable}
                                                columns={schema.map(col => ({ name: col.name, type: col.type }))}
                                                onClose={() => setShowProtobufConfig(false)}
                                            />
                                        </div>
                                    )}

                                    {/* Schema 面板 */}
                                    {showSchema && schema.length > 0 && (
                                        <div className="px-4 py-3">
                                            <div className="bg-bg-dark rounded-lg border border-border shadow-lg">
                                                {/* 标题栏 */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                                    <div className="flex items-center gap-2">
                                                        <ClipboardIcon size={16} className="text-primary" />
                                                        <h3 className="font-medium text-primary text-sm">Schema</h3>
                                                        <span className="text-xs text-text-muted">({schema.length} 列)</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setShowSchema(false)}
                                                        className="px-2 py-1 rounded text-xs hover:bg-bg-light text-text-muted hover:text-text-secondary transition-colors"
                                                    >
                                                        收起
                                                    </button>
                                                </div>
                                                {/* 内容区 */}
                                                <div className="max-h-[200px] overflow-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="sticky top-0 bg-bg-dark">
                                                            <tr className="text-left text-text-muted">
                                                                <th className="px-4 py-2 font-medium border-b border-border">列名</th>
                                                                <th className="px-4 py-2 font-medium border-b border-border">类型</th>
                                                                <th className="px-4 py-2 font-medium border-b border-border">主键</th>
                                                                <th className="px-4 py-2 font-medium border-b border-border">非空</th>
                                                                <th className="px-4 py-2 font-medium border-b border-border">默认值</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="font-mono">
                                                            {schema.map((col) => (
                                                                <tr key={col.name} className="hover:bg-bg-light/30 transition-colors">
                                                                    <td className="px-4 py-1.5 text-primary">{col.name}</td>
                                                                    <td className="px-4 py-1.5 text-text-secondary">{col.type || '-'}</td>
                                                                    <td className="px-4 py-1.5">{col.primaryKey ? '✓' : ''}</td>
                                                                    <td className="px-4 py-1.5">{col.notNull ? '✓' : ''}</td>
                                                                    <td className="px-4 py-1.5 text-text-muted">{col.defaultValue || '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* SQL 查询面板 */}
                                    {queryMode && (
                                        <div className="px-4 py-3">
                                            <div className="bg-bg-dark rounded-lg border border-border shadow-lg">
                                                {/* 标题栏 */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                                    <div className="flex items-center gap-2">
                                                        <SQLIcon size={16} className="text-accent-blue" />
                                                        <h3 className="text-sm font-medium text-accent-blue">SQL 查询</h3>
                                                        <span className="text-xs text-text-muted">（仅支持 SELECT）</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setQueryMode(false)}
                                                        className="px-2 py-1 rounded text-xs hover:bg-bg-light text-text-muted hover:text-text-secondary transition-colors"
                                                    >
                                                        收起
                                                    </button>
                                                </div>
                                                {/* 查询输入区 */}
                                                <div className="p-4">
                                                    <SQLEditor
                                                        value={queryInput}
                                                        onChange={setQueryInput}
                                                        onExecute={() => executeQuery(deviceId)}
                                                        placeholder="SELECT * FROM table_name LIMIT 100"
                                                        height={100}
                                                        tables={tables.map(t => t.name)}
                                                        tableColumns={schema ? { [selectedTable || '']: schema.map(c => c.name) } : {}}
                                                        disabled={queryLoading}
                                                    />
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className="text-xs text-text-muted">
                                                            {queryResult && queryResult.success && queryResult.rowCount != null && queryResult.executionTimeMs != null && (
                                                                <>
                                                                    {queryResult.rowCount} 行 • {queryResult.executionTimeMs.toFixed(2)} ms
                                                                </>
                                                            )}
                                                        </span>
                                                        <button
                                                            onClick={() => executeQuery(deviceId)}
                                                            disabled={queryLoading || !queryInput.trim()}
                                                            className="px-3 py-1 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                        >
                                                            {queryLoading ? '执行中...' : '执行 (⌘↵)'}
                                                        </button>
                                                    </div>
                                                    {queryError && (
                                                        <SQLQueryErrorDisplay
                                                            error={queryError}
                                                            onApplySuggestion={(suggestion) => setQueryInput(suggestion)}
                                                        />
                                                    )}
                                                </div>

                                                {/* 查询结果 */}
                                                {(queryLoading || queryResult) && (
                                                    <div className="max-h-[200px] overflow-auto border-t border-border">
                                                        {queryLoading ? (
                                                            <div className="flex items-center justify-center py-8">
                                                                <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                                                            </div>
                                                        ) : queryResult && queryResult.success && queryResult.rows && queryResult.rows.length > 0 ? (
                                                            <table className="w-full text-xs">
                                                                <thead className="sticky top-0 bg-bg-dark">
                                                                    <tr>
                                                                        {queryResult.columns?.map((col) => (
                                                                            <th
                                                                                key={col.name}
                                                                                className="px-3 py-2 text-left font-medium text-text-muted border-b border-border"
                                                                            >
                                                                                {col.name}
                                                                            </th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="font-mono">
                                                                    {queryResult.rows.map((row, idx) => (
                                                                        <tr
                                                                            key={idx}
                                                                            className="border-b border-border hover:bg-bg-light/30 transition-colors"
                                                                        >
                                                                            {queryResult.columns?.map((col) => (
                                                                                <td
                                                                                    key={col.name}
                                                                                    className="px-3 py-1.5 text-text-secondary max-w-xs truncate"
                                                                                    title={row.values[col.name] ?? ''}
                                                                                >
                                                                                    {row.values[col.name] === null ? (
                                                                                        <span className="text-text-muted italic">NULL</span>
                                                                                    ) : (
                                                                                        row.values[col.name]
                                                                                    )}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        ) : queryResult && queryResult.success ? (
                                                            <div className="flex items-center justify-center py-4 text-text-muted text-xs">
                                                                查询结果为空
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* 拖动手柄 */}
                                <div
                                    onMouseDown={startPanelResize}
                                    className={clsx(
                                        'h-1.5 cursor-ns-resize flex items-center justify-center transition-colors',
                                        isPanelResizing ? 'bg-primary/30' : 'hover:bg-bg-lighter'
                                    )}
                                    title="拖动调整面板高度"
                                >
                                    <div className={clsx(
                                        'w-10 h-0.5 rounded-full transition-colors',
                                        isPanelResizing ? 'bg-primary' : 'bg-text-muted/50'
                                    )} />
                                </div>
                            </div>
                        )}

                        {/* 筛选状态提示 */}
                        {Object.keys(columnFilters).length > 0 && (
                            <div className="px-4 py-2 border-b border-border bg-primary/10 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-primary flex-wrap">
                                    <SearchIcon size={14} className="flex-shrink-0" />
                                    <span className="flex-shrink-0">
                                        已筛选 {Object.keys(columnFilters).length} 列，
                                        显示 {filteredRows.length} / {tableData?.rows.length ?? 0} 行
                                    </span>
                                    <span className="text-text-muted mx-1">|</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {Object.entries(columnFilters).map(([colName, filterValue]) => (
                                            <span
                                                key={colName}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 rounded text-primary"
                                            >
                                                <span className="font-medium">{colName}</span>
                                                <span className="text-text-muted">=</span>
                                                <span className="max-w-[120px] truncate" title={filterValue}>
                                                    "{filterValue}"
                                                </span>
                                                <button
                                                    onClick={() => setColumnFilters(prev => {
                                                        const next = { ...prev }
                                                        delete next[colName]
                                                        return next
                                                    })}
                                                    className="ml-0.5 text-text-muted hover:text-primary"
                                                    title={`清除 ${colName} 筛选`}
                                                >
                                                    <XIcon size={10} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={clearAllFilters}
                                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 flex-shrink-0"
                                >
                                    <XIcon size={12} />
                                    清除全部
                                </button>
                            </div>
                        )}

                        {/* 表数据 */}
                        <div className={clsx('flex-1 overflow-auto relative', isResizing && 'select-none')}>
                            {/* 刷新加载覆盖层 */}
                            <ListLoadingOverlay isLoading={dataLoading} text="刷新表数据..." />

                            {tableData ? (
                                <table className="text-xs table-fixed" style={{ minWidth: '100%' }}>
                                    <thead className="sticky top-0 bg-bg-dark z-10">
                                        {/* 列名行 */}
                                        <tr>
                                            {tableData.columns.map((col, colIndex) => {
                                                const isFiltered = columnFilters[col.name] !== undefined
                                                const isExpanded = expandedFilterColumn === col.name
                                                const colWidth = columnWidths[col.name] || 150
                                                const isLastColumn = colIndex === tableData.columns.length - 1

                                                return (
                                                    <th
                                                        key={col.name}
                                                        className="px-3 py-2 text-left font-medium text-text-muted border-b border-border relative"
                                                        style={{ width: isLastColumn ? 'auto' : colWidth, minWidth: 80 }}
                                                    >
                                                        <div className="flex items-center gap-1">
                                                            {/* 列名（点击排序） */}
                                                            <span
                                                                onClick={() => handleSort(col.name)}
                                                                className={clsx(
                                                                    'cursor-pointer hover:text-text-secondary transition-colors truncate',
                                                                    col.primaryKey ? 'text-primary' : ''
                                                                )}
                                                            >
                                                                {col.name}
                                                            </span>

                                                            {/* 排序图标（点击也可排序） */}
                                                            {orderBy === col.name && (
                                                                <span
                                                                    onClick={() => handleSort(col.name)}
                                                                    className="text-primary cursor-pointer hover:opacity-70 transition-opacity flex-shrink-0"
                                                                    title={ascending ? '点击降序' : '点击升序'}
                                                                >
                                                                    {ascending ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />}
                                                                </span>
                                                            )}

                                                            {/* 筛选按钮 */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setExpandedFilterColumn(isExpanded ? null : col.name)
                                                                }}
                                                                className={clsx(
                                                                    'ml-auto p-0.5 rounded hover:bg-bg-light/50 transition-colors flex-shrink-0',
                                                                    isFiltered ? 'text-primary' : 'text-text-muted opacity-50 hover:opacity-100'
                                                                )}
                                                                title="筛选"
                                                            >
                                                                <SearchIcon size={12} />
                                                            </button>
                                                        </div>

                                                        {/* 筛选输入框（展开时显示） */}
                                                        {isExpanded && (
                                                            <div className="mt-2 flex items-center gap-1">
                                                                <input
                                                                    type="text"
                                                                    value={columnFilters[col.name] ?? ''}
                                                                    onChange={(e) => handleColumnFilter(col.name, e.target.value)}
                                                                    placeholder={`筛选 ${col.name}...`}
                                                                    className="flex-1 px-2 py-1 text-xs bg-bg-light border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary text-text-secondary"
                                                                    autoFocus
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            setExpandedFilterColumn(null)
                                                                        } else if (e.key === 'Escape') {
                                                                            // ESC 键：清空筛选并关闭
                                                                            clearColumnFilter(col.name)
                                                                            setExpandedFilterColumn(null)
                                                                        }
                                                                    }}
                                                                />
                                                                {isFiltered && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            clearColumnFilter(col.name)
                                                                        }}
                                                                        className="p-1 text-text-muted hover:text-red-400 transition-colors"
                                                                        title="清除筛选"
                                                                    >
                                                                        <XIcon size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* 列分割线和拖动手柄 */}
                                                        {!isLastColumn && (
                                                            <div
                                                                className={clsx(
                                                                    'absolute right-0 top-0 bottom-0 w-px cursor-col-resize bg-border hover:bg-primary/50 transition-colors',
                                                                    isResizing && resizeState.current?.columnName === col.name && 'bg-primary w-0.5'
                                                                )}
                                                                onMouseDown={(e) => startColumnResize(e, col.name)}
                                                            >
                                                                {/* 更大的点击区域 */}
                                                                <div className="absolute -left-1.5 -right-1.5 top-0 bottom-0" />
                                                            </div>
                                                        )}
                                                    </th>
                                                )
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono">
                                        {filteredRows.map((row, idx) => {
                                            const isExpandedRow = expandedBlobCell?.rowIndex === idx
                                            const rowId = row.values['_rowid']
                                            const isHighlightedRow = highlightRowId !== null && rowId === highlightRowId
                                            return (
                                                <tr
                                                    key={idx}
                                                    data-rowid={rowId}
                                                    className={clsx(
                                                        "border-b border-border transition-colors",
                                                        isHighlightedRow
                                                            ? "bg-primary/25 ring-2 ring-primary/80 ring-inset"
                                                            : isExpandedRow
                                                                ? "bg-purple-500/10"
                                                                : "hover:bg-bg-light/30"
                                                    )}
                                                >
                                                    {tableData.columns.map((col, colIndex) => {
                                                        const cellValue = row.values[col.name]
                                                        const isBlobColumn = col.type?.toLowerCase() === 'blob'
                                                        const hasProtobufConfig = selectedDb && selectedTable && getColumnConfig(selectedDb, selectedTable, col.name)
                                                        const shouldTreatAsBlob = isBlobColumn || (cellValue && isBase64Blob(cellValue) && hasProtobufConfig)
                                                        const colWidth = columnWidths[col.name] || 150
                                                        const isLastColumn = colIndex === tableData.columns.length - 1
                                                        const isExpandedCell = isExpandedRow && expandedBlobCell?.columnName === col.name

                                                        return (
                                                            <td
                                                                key={col.name}
                                                                className={clsx(
                                                                    "px-3 py-2 text-text-secondary border-r border-border last:border-r-0 overflow-hidden",
                                                                    isExpandedCell && "bg-purple-500/20 ring-1 ring-purple-500/50 ring-inset"
                                                                )}
                                                                style={{ width: isLastColumn ? 'auto' : colWidth, minWidth: 80, maxWidth: colWidth }}
                                                            >
                                                                {cellValue === null ? (
                                                                    <span className="text-text-muted italic">NULL</span>
                                                                ) : shouldTreatAsBlob ? (
                                                                    <BlobCell
                                                                        value={cellValue}
                                                                        columnName={col.name}
                                                                        dbId={selectedDb}
                                                                        tableName={selectedTable}
                                                                        rowData={row.values}
                                                                        onExpandChange={(expanded) => {
                                                                            setExpandedBlobCell(expanded ? { rowIndex: idx, columnName: col.name } : null)
                                                                        }}
                                                                        isHighlighted={isExpandedCell}
                                                                    />
                                                                ) : (
                                                                    <TextPopover
                                                                        text={String(cellValue)}
                                                                        title={col.name}
                                                                        trigger="dblclick"
                                                                    >
                                                                        <span className="truncate block cursor-pointer" title="双击查看完整内容">
                                                                            {globalSearchKeyword
                                                                                ? highlightKeyword(String(cellValue), globalSearchKeyword)
                                                                                : cellValue}
                                                                        </span>
                                                                    </TextPopover>
                                                                )}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            ) : dataError ? (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                                    <WarningIcon size={36} className="mb-3 opacity-50" />
                                    <p className="text-sm text-red-400 mb-2">{dataError}</p>
                                    <button
                                        onClick={() => selectedDb && selectedTable && loadTableData(deviceId, selectedDb, selectedTable)}
                                        className="px-4 py-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors text-xs"
                                    >
                                        重试
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full text-text-muted">
                                    无数据
                                </div>
                            )}
                        </div>

                        {/* 分页 */}
                        {tableData && tableData.totalRows !== null && tableData.totalRows > pageSize && (
                            <div className="px-4 py-2 border-t border-border bg-bg-dark/50 flex items-center justify-between">
                                <span className="text-xs text-text-muted">
                                    第 {page} 页 / 共 {Math.ceil(tableData.totalRows / pageSize)} 页
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handlePageChange(Math.max(1, page - 1))}
                                        disabled={page <= 1 || isJumpingToMatch}
                                        className="px-3 py-1 bg-bg-light text-text-secondary rounded text-xs hover:bg-bg-lighter disabled:opacity-50 transition-colors"
                                    >
                                        上一页
                                    </button>
                                    <button
                                        onClick={() => handlePageChange(page + 1)}
                                        disabled={page >= Math.ceil(tableData.totalRows / pageSize) || isJumpingToMatch}
                                        className="px-3 py-1 bg-bg-light text-text-secondary rounded text-xs hover:bg-bg-lighter disabled:opacity-50 transition-colors"
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-text-muted">
                        <div className="text-center flex flex-col items-center">
                            <span className="text-4xl mb-3 opacity-50">👈</span>
                            <p className="text-sm">
                                {selectedDb ? '选择一个表查看数据' : '选择一个数据库'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// 数据库列表项组件
interface DatabaseItemProps {
    db: DBInfo
    isSelected: boolean
    pathPopupDbId: string | null
    pathCopied: boolean
    onSelect: (id: string) => void
    onTogglePathPopup: (id: string) => void
    onClosePathPopup: () => void
    onCopyPath: (db: DBInfo) => void
    getDisplayPath: (db: DBInfo) => string
}

function DatabaseItem({
    db,
    isSelected,
    pathPopupDbId,
    pathCopied,
    onSelect,
    onTogglePathPopup,
    onClosePathPopup,
    onCopyPath,
    getDisplayPath,
}: DatabaseItemProps) {
    return (
        <div className="relative">
            <button
                onClick={() => onSelect(db.descriptor.id)}
                className={clsx(
                    'w-full px-3 py-2 rounded-lg text-left text-xs transition-all',
                    isSelected
                        ? 'bg-primary text-bg-darkest shadow-sm shadow-primary/30'
                        : 'text-text-secondary hover:bg-bg-light'
                )}
            >
                <div className="flex items-center gap-2">
                    <span className={clsx(isSelected ? 'text-bg-darkest' : 'text-text-secondary')}>
                        {getDbKindIcon(db.descriptor.kind)}
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                            {db.descriptor.name}
                        </div>
                        <div className={clsx(
                            'text-2xs',
                            isSelected ? 'text-bg-darkest/70' : 'text-text-muted'
                        )}>
                            {db.tableCount} 表 • {formatBytes(db.fileSizeBytes)}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* 加密状态图标 */}
                        {db.encryptionStatus === 'unlocked' && (
                            <span
                                className={clsx(
                                    isSelected ? 'text-bg-darkest/70' : 'text-emerald-500'
                                )}
                                title={`已解锁 (${db.descriptor.encryptionType || 'SQLCipher'})`}
                            >
                                <UnlockIcon size={12} />
                            </span>
                        )}
                        {db.encryptionStatus === 'locked' && (
                            <span
                                className={clsx(
                                    isSelected ? 'text-red-300' : 'text-red-500'
                                )}
                                title={`已锁定 - 需要密钥 (${db.descriptor.encryptionType || 'SQLCipher'})`}
                            >
                                <LockIcon size={12} />
                            </span>
                        )}
                        {db.descriptor.isSensitive && (
                            <span className="text-yellow-500" title="敏感数据"><LockIcon size={12} /></span>
                        )}
                        <span
                            data-path-button
                            onClick={(e) => {
                                e.stopPropagation()
                                onTogglePathPopup(db.descriptor.id)
                            }}
                            className={clsx(
                                'p-1 rounded transition-colors cursor-pointer',
                                isSelected
                                    ? 'hover:bg-white/20 text-bg-darkest/70 hover:text-bg-darkest'
                                    : 'hover:bg-bg-lighter text-text-muted hover:text-text-secondary'
                            )}
                            title="查看路径"
                        >
                            <FolderIcon size={12} />
                        </span>
                    </div>
                </div>
            </button>
            {/* 路径弹窗 */}
            {pathPopupDbId === db.descriptor.id && (
                <div data-path-popup className="absolute left-0 right-0 mt-1 p-2 bg-bg-dark border border-border rounded-lg shadow-lg z-10">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-2xs text-text-muted">数据库路径</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onClosePathPopup()
                            }}
                            className="p-0.5 rounded hover:bg-bg-light text-text-muted hover:text-text-secondary transition-colors"
                        >
                            <XIcon size={10} />
                        </button>
                    </div>
                    <div className="text-xs text-text-primary font-mono break-all bg-bg-light p-2 rounded">
                        {getDisplayPath(db)}
                    </div>
                    <div className="mt-2 flex gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onCopyPath(db)
                            }}
                            className={clsx(
                                'flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                                pathCopied
                                    ? 'bg-accent-green/20 text-accent-green'
                                    : 'bg-bg-light text-text-secondary hover:bg-bg-lighter'
                            )}
                        >
                            {pathCopied ? (
                                <>
                                    <CheckIcon size={12} />
                                    已复制
                                </>
                            ) : (
                                <>
                                    <ClipboardIcon size={12} />
                                    复制路径
                                </>
                            )}
                        </button>
                    </div>
                    <p className="mt-2 text-2xs text-text-muted italic">
                        此路径指向目标设备上的数据库文件位置
                    </p>
                </div>
            )}
        </div>
    )
}
