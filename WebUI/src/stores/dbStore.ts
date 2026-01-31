// dbStore.ts
// Database Inspector State Management
//
// Created by Sun on 2025/12/05.
// Copyright © 2025 Sun. All rights reserved.
//

import { create } from 'zustand'
import type { DBInfo, DBTableInfo, DBColumnInfo, DBTablePageResult, DBQueryResponse, DBQueryError, DBSearchResponse } from '@/types'
import * as api from '@/services/api'

// 数据库排序方式
export type DBSortOrder = 'name' | 'size' | 'tableCount'

interface DBState {
    // 数据库列表
    databases: DBInfo[]
    dbLoading: boolean
    dbError: string | null

    // 数据库排序
    dbSortOrder: DBSortOrder
    dbSortAscending: boolean

    // 当前选中
    selectedDb: string | null
    selectedTable: string | null

    // 表列表
    tables: DBTableInfo[]
    tablesLoading: boolean

    // 表结构
    schema: DBColumnInfo[]
    showSchema: boolean

    // 表数据
    tableData: DBTablePageResult | null
    dataLoading: boolean
    dataError: string | null
    page: number
    pageSize: number
    orderBy: string | null
    ascending: boolean

    // SQL 查询
    queryMode: boolean
    queryInput: string
    queryResult: DBQueryResponse | null
    queryLoading: boolean
    queryError: DBQueryError | string | null  // 支持结构化错误或简单字符串

    // 跨表搜索
    globalSearchKeyword: string
    globalSearchResult: DBSearchResponse | null
    globalSearchLoading: boolean
    globalSearchError: string | null
    searchHistory: string[]  // 搜索历史记录
    highlightRowId: string | null  // 高亮的行 rowid（搜索结果跳转时使用）
    pendingTargetRowId: string | null  // 待定位的行 rowid

    // Actions
    loadDatabases: (deviceId: string) => Promise<void>
    loadTables: (deviceId: string, dbId: string) => Promise<void>
    loadSchema: (deviceId: string, dbId: string, table: string) => Promise<void>
    loadTableData: (deviceId: string, dbId: string, table: string, targetRowId?: string) => Promise<void>

    selectDb: (dbId: string | null) => void
    selectTable: (table: string | null) => void
    setShowSchema: (show: boolean) => void
    setPage: (page: number) => void
    setSort: (column: string) => void
    setSortAndReload: (deviceId: string, column: string) => Promise<void>
    setPageAndReload: (deviceId: string, page: number) => Promise<void>

    // 数据库排序 Actions
    setDbSortOrder: (order: DBSortOrder) => void
    toggleDbSortDirection: () => void

    // SQL 查询 Actions
    setQueryMode: (mode: boolean) => void
    setQueryInput: (input: string) => void
    executeQuery: (deviceId: string) => Promise<void>
    clearQueryResult: () => void

    // 跨表搜索 Actions
    setGlobalSearchKeyword: (keyword: string) => void
    executeGlobalSearch: (deviceId: string) => Promise<void>
    clearGlobalSearch: () => void
    navigateToSearchResult: (tableName: string, rowId?: string) => void
    jumpToSearchResultRow: (deviceId: string, dbId: string, tableName: string, rowId: string) => Promise<void>
    clearHighlightRow: () => void
    addToSearchHistory: (keyword: string) => void
    removeFromSearchHistory: (keyword: string) => void
    clearSearchHistory: () => void

    // 重置状态（切换设备时调用）
    reset: () => void

    // 获取排序后的数据库列表
    getSortedDatabases: () => DBInfo[]
}

const initialState = {
    databases: [],
    dbLoading: false,
    dbError: null,
    dbSortOrder: 'name' as DBSortOrder,
    dbSortAscending: true,
    selectedDb: null,
    selectedTable: null,
    tables: [],
    tablesLoading: false,
    schema: [],
    showSchema: false,
    tableData: null,
    dataLoading: false,
    dataError: null,
    page: 1,
    pageSize: 100,
    orderBy: null,
    ascending: true,
    // SQL 查询
    queryMode: false,
    queryInput: '',
    queryResult: null,
    queryLoading: false,
    queryError: null,
    // 跨表搜索
    globalSearchKeyword: '',
    globalSearchResult: null,
    globalSearchLoading: false,
    globalSearchError: null,
    searchHistory: [] as string[],
    highlightRowId: null,
    pendingTargetRowId: null,
}

export const useDBStore = create<DBState>((set, get) => ({
    ...initialState,

    loadDatabases: async (deviceId: string) => {
        // 刷新时清除当前选择和缓存数据
        set({
            dbLoading: true,
            dbError: null,
            selectedDb: null,
            selectedTable: null,
            tables: [],
            schema: [],
            tableData: null,
        })
        try {
            const response = await api.listDatabases(deviceId)
            set({ databases: response.databases, dbLoading: false })
        } catch (error) {
            let errorMessage = 'Failed to load databases'
            if (error instanceof Error) {
                // 针对常见错误提供友好提示
                if (error.message.includes('404')) {
                    errorMessage = '设备未连接或数据库功能未启用'
                } else if (error.message.includes('504') || error.message.includes('timeout')) {
                    errorMessage = '设备连接超时，请确保设备已连接且 DebugProbe SDK 已启用数据库功能'
                } else {
                    errorMessage = error.message
                }
            }
            set({
                dbError: errorMessage,
                dbLoading: false,
            })
        }
    },

    loadTables: async (deviceId: string, dbId: string) => {
        set({ tablesLoading: true, tables: [] })
        try {
            const response = await api.listTables(deviceId, dbId)
            set({ tables: response.tables, tablesLoading: false })
        } catch (error) {
            console.error('Failed to load tables:', error)
            set({ tablesLoading: false })
        }
    },

    loadSchema: async (deviceId: string, dbId: string, table: string) => {
        try {
            const response = await api.describeTable(deviceId, dbId, table)
            set({ schema: response.columns })
        } catch (error) {
            console.error('Failed to load schema:', error)
            set({ schema: [] })
        }
    },

    loadTableData: async (deviceId: string, dbId: string, table: string, targetRowId?: string) => {
        const { page, pageSize, orderBy, ascending, tables } = get()
        set({ dataLoading: true, dataError: null })
        try {
            const result = await api.fetchTablePage(deviceId, dbId, table, {
                page,
                pageSize,
                orderBy: orderBy ?? undefined,
                ascending,
                targetRowId,
            })
            
            // 如果使用了 targetRowId，更新当前页码
            if (targetRowId && result.page !== page) {
                set({ page: result.page })
            }

            // 同时更新 tables 列表中对应表的 rowCount
            const updatedTables = tables.map(t =>
                t.name === table && result.totalRows !== null
                    ? { ...t, rowCount: result.totalRows }
                    : t
            )
            set({
                tableData: result,
                dataLoading: false,
                tables: updatedTables,
                pendingTargetRowId: targetRowId ? null : get().pendingTargetRowId,
            })
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to load table data'
            console.error('Failed to load table data:', error)
            set({
                tableData: null,
                dataLoading: false,
                dataError: errorMsg,
                pendingTargetRowId: targetRowId ? null : get().pendingTargetRowId,
            })
        }
    },

    selectDb: (dbId: string | null) => {
        const current = get().selectedDb
        if (current !== dbId) {
            set({
                selectedDb: dbId,
                selectedTable: null,
                tables: [],
                schema: [],
                tableData: null,
                page: 1,
                orderBy: null,
                // 切换数据库时清除搜索状态
                globalSearchKeyword: '',
                globalSearchResult: null,
                globalSearchError: null,
            })
        }
    },

    selectTable: (table: string | null) => {
        const current = get().selectedTable
        if (current !== table) {
            set({
                selectedTable: table,
                schema: [],
                tableData: null,
                page: 1,
                orderBy: null,
                // 切换表时重置面板展开状态
                showSchema: false,
                queryMode: false,
                queryInput: '',
                queryResult: null,
                queryError: null,
            })
        }
    },

    setShowSchema: (show: boolean) => {
        set({ showSchema: show })
    },

    setPage: (page: number) => {
        set({ page })
    },

    setSort: (column: string) => {
        const { orderBy, ascending } = get()
        if (orderBy === column) {
            // 三态循环：升序 → 降序 → 默认
            if (ascending) {
                // 当前是升序，切换到降序
                set({ ascending: false, page: 1 })
            } else {
                // 当前是降序，切换到默认（无排序）
                set({ orderBy: null, ascending: true, page: 1 })
            }
        } else {
            // 点击新列，设置为升序
            set({ orderBy: column, ascending: true, page: 1 })
        }
    },

    // 带自动重载的排序
    setSortAndReload: async (deviceId: string, column: string) => {
        const { orderBy, ascending, selectedDb, selectedTable, pageSize } = get()

        let newOrderBy: string | null = column
        let newAscending = true

        if (orderBy === column) {
            // 三态循环：升序 → 降序 → 默认
            if (ascending) {
                // 当前是升序，切换到降序
                newAscending = false
            } else {
                // 当前是降序，切换到默认（无排序）
                newOrderBy = null
                newAscending = true
            }
        }

        set({
            orderBy: newOrderBy,
            ascending: newAscending,
            page: 1,
            dataLoading: true
        })

        if (selectedDb && selectedTable) {
            try {
                const result = await api.fetchTablePage(deviceId, selectedDb, selectedTable, {
                    page: 1,
                    pageSize: pageSize,
                    orderBy: newOrderBy ?? undefined,
                    ascending: newAscending,
                })
                set({ tableData: result, dataLoading: false })
            } catch (error) {
                console.error('Failed to load table data:', error)
                set({ dataLoading: false })
            }
        }
    },

    // 带自动重载的分页
    setPageAndReload: async (deviceId: string, newPage: number) => {
        const { selectedDb, selectedTable, pageSize, orderBy, ascending } = get()
        set({ page: newPage, dataLoading: true })

        if (selectedDb && selectedTable) {
            try {
                const result = await api.fetchTablePage(deviceId, selectedDb, selectedTable, {
                    page: newPage,
                    pageSize,
                    orderBy: orderBy ?? undefined,
                    ascending,
                })
                set({ tableData: result, dataLoading: false })
            } catch (error) {
                console.error('Failed to load table data:', error)
                set({ dataLoading: false })
            }
        }
    },

    // SQL 查询 Actions
    setQueryMode: (mode: boolean) => {
        set({ queryMode: mode, queryError: null })
        if (!mode) {
            // 退出查询模式时清除结果
            set({ queryResult: null })
        }
    },

    setQueryInput: (input: string) => {
        set({ queryInput: input })
    },

    executeQuery: async (deviceId: string) => {
        const { selectedDb, queryInput } = get()
        if (!selectedDb || !queryInput.trim()) {
            set({ queryError: '请选择数据库并输入 SQL 查询语句' })
            return
        }

        set({ queryLoading: true, queryError: null, queryResult: null })
        try {
            const result = await api.executeQuery(deviceId, selectedDb, queryInput)

            // 检查响应是否成功
            if (!result.success && result.error) {
                // SQL 执行失败，设置结构化错误
                set({
                    queryError: result.error,
                    queryLoading: false,
                })
            } else {
                // 成功
                set({ queryResult: result, queryLoading: false })
            }
        } catch (error) {
            // 网络错误或其他异常
            set({
                queryError: error instanceof Error ? error.message : 'Query execution failed',
                queryLoading: false,
            })
        }
    },

    clearQueryResult: () => {
        set({ queryResult: null, queryError: null })
    },

    // 数据库排序 Actions
    setDbSortOrder: (order: DBSortOrder) => {
        set({ dbSortOrder: order })
    },

    toggleDbSortDirection: () => {
        set((state) => ({ dbSortAscending: !state.dbSortAscending }))
    },

    // 获取排序后的数据库列表
    getSortedDatabases: () => {
        const { databases, dbSortOrder, dbSortAscending } = get()
        const sorted = [...databases].sort((a, b) => {
            let comparison = 0
            switch (dbSortOrder) {
                case 'name':
                    comparison = a.descriptor.name.localeCompare(b.descriptor.name)
                    break
                case 'size':
                    comparison = (a.fileSizeBytes ?? 0) - (b.fileSizeBytes ?? 0)
                    break
                case 'tableCount':
                    comparison = (a.tableCount ?? 0) - (b.tableCount ?? 0)
                    break
            }
            return dbSortAscending ? comparison : -comparison
        })
        return sorted
    },

    // 跨表搜索 Actions
    setGlobalSearchKeyword: (keyword: string) => {
        set({ globalSearchKeyword: keyword })
    },

    executeGlobalSearch: async (deviceId: string) => {
        const { selectedDb, globalSearchKeyword } = get()

        if (!selectedDb) {
            set({ globalSearchError: '请先选择数据库' })
            return
        }

        const keyword = globalSearchKeyword.trim()
        if (!keyword) {
            set({ globalSearchError: '请输入搜索关键词' })
            return
        }

        set({
            globalSearchLoading: true,
            globalSearchError: null,
            globalSearchResult: null,
        })

        try {
            const result = await api.searchDatabase(deviceId, selectedDb, {
                keyword,
                maxResultsPerTable: 10,
            })
            set({
                globalSearchResult: result,
                globalSearchLoading: false,
            })
            // 搜索成功后添加到历史记录
            get().addToSearchHistory(keyword)
        } catch (error) {
            set({
                globalSearchError: error instanceof Error ? error.message : '搜索失败',
                globalSearchLoading: false,
            })
        }
    },

    clearGlobalSearch: () => {
        set({
            globalSearchKeyword: '',
            globalSearchResult: null,
            globalSearchError: null,
        })
    },

    navigateToSearchResult: (tableName: string, rowId?: string) => {
        // 导航到搜索结果对应的表
        // 清除搜索结果，选中表，可选设置高亮行
        set((state) => {
            const isTableChanged = state.selectedTable !== tableName
            return {
                selectedTable: tableName,
                highlightRowId: rowId ?? null,
                pendingTargetRowId: null,
                ...(isTableChanged
                    ? {
                        schema: [],
                        tableData: null,
                        page: 1,
                        orderBy: null,
                        showSchema: false,
                        queryMode: false,
                        queryInput: '',
                        queryResult: null,
                        queryError: null,
                    }
                    : rowId
                        ? { tableData: null, page: 1 }
                        : {})
                // 保留搜索关键词，方便用户再次搜索
            }
        })
    },

    jumpToSearchResultRow: async (deviceId: string, dbId: string, tableName: string, rowId: string) => {
        const isTableChanged = get().selectedTable !== tableName
        set({
            selectedTable: tableName,
            highlightRowId: rowId,
            pendingTargetRowId: rowId,
            dataLoading: true,
            dataError: null,
            ...(isTableChanged
                ? {
                    schema: [],
                    tableData: null,
                    page: 1,
                    orderBy: null,
                    showSchema: false,
                    queryMode: false,
                    queryInput: '',
                    queryResult: null,
                    queryError: null,
                }
                : { tableData: null, page: 1 })
        })

        await get().loadSchema(deviceId, dbId, tableName)
        await get().loadTableData(deviceId, dbId, tableName, rowId)
    },

    clearHighlightRow: () => {
        set({ highlightRowId: null })
    },

    addToSearchHistory: (keyword: string) => {
        const { searchHistory } = get()
        const trimmed = keyword.trim()
        if (!trimmed) return

        // 移除已存在的相同关键词（如果有的话）
        const filtered = searchHistory.filter(k => k !== trimmed)
        // 添加到最前面，最多保留 10 条历史
        const newHistory = [trimmed, ...filtered].slice(0, 10)
        set({ searchHistory: newHistory })

        // 持久化到 localStorage
        try {
            localStorage.setItem('db_search_history', JSON.stringify(newHistory))
        } catch {
            // localStorage 可能不可用，忽略错误
        }
    },

    removeFromSearchHistory: (keyword: string) => {
        const { searchHistory } = get()
        const newHistory = searchHistory.filter(k => k !== keyword)
        set({ searchHistory: newHistory })

        // 持久化到 localStorage
        try {
            localStorage.setItem('db_search_history', JSON.stringify(newHistory))
        } catch {
            // localStorage 可能不可用，忽略错误
        }
    },

    clearSearchHistory: () => {
        set({ searchHistory: [] })
        try {
            localStorage.removeItem('db_search_history')
        } catch {
            // localStorage 可能不可用，忽略错误
        }
    },

    reset: () => {
        set(initialState)
    },
}))

// 初始化时从 localStorage 加载搜索历史
try {
    const savedHistory = localStorage.getItem('db_search_history')
    if (savedHistory) {
        const history = JSON.parse(savedHistory)
        if (Array.isArray(history)) {
            useDBStore.setState({ searchHistory: history.slice(0, 10) })
        }
    }
} catch {
    // localStorage 可能不可用，忽略错误
}
