/**
 * protobufStore.ts
 * Protobuf 描述符和列映射配置管理
 * 
 * 数据结构：
 * - 描述符关联到表（dbId + tableName）
 * - 映射表存储 CSV 上传的类型映射（如 msgType -> protoTypeName）
 * - 列配置支持通过映射表确定消息类型
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProtobufDescriptor } from '@/utils/protobufDescriptor'
import { loadDescriptorFromFile, loadDescriptorFromBase64, decodeBlob, autoDetectMessageType } from '@/utils/protobufDescriptor'
import { 
    loadMappingTableFromFile, 
    matchWithProtobufTypes,
} from '@/utils/typeMappingTable'
import { decodeWithRules, presentDecoded } from '@/utils/protoDecodeEngine'
import { useProtoBundleStore, base64ToBytes } from '@/stores/protoBundleStore'

/** 描述符元信息（关联到表） */
interface DescriptorMeta {
    name: string
    messageTypes: string[]
    uploadedAt: string
    /** Base64 编码的原始文件数据 */
    rawData: string
    /** 关联的数据库 ID */
    dbId: string
    /** 关联的表名 */
    tableName: string
}

/** 映射表元信息（用于持久化存储） */
export interface MappingTableMeta {
    /** 表名（通常是文件名） */
    name: string
    /** 所有列名 */
    columns: string[]
    /** 原始数据行 */
    rows: Record<string, string>[]
    /** 上传时间 */
    uploadedAt: string
    /** 关联的数据库 ID */
    dbId: string
    /** 关联的表名 */
    tableName: string
    /** 选择作为键的列名（CSV 中的列） */
    keyColumn?: string
    /** 选择作为值的列名（CSV 中的列） */
    valueColumn?: string
    /** 关联的数据库表列名（用于查找键值） */
    dbSourceColumn?: string
}

/** 类型映射规则 */
export interface TypeMapping {
    /** 类型来源列的值（字符串形式） */
    sourceValue: string
    /** 对应的 Protobuf 消息类型全名 */
    messageType: string
}

/** 列配置 */
export interface ColumnConfig {
    dbId: string
    tableName: string
    columnName: string
    /** 关联的描述符名称 */
    descriptorName: string
    /** 类型来源列名（可选，如 msgType） */
    typeSourceColumn?: string
    /** 关联的映射表名称（可选，如果设置则从映射表获取类型映射） */
    mappingTableName?: string
    /** 类型映射规则（手动配置，当不使用映射表时使用） */
    typeMappings?: TypeMapping[]
}

interface ProtobufState {
    /** 已加载的描述符（关联到表） */
    descriptorMeta: DescriptorMeta[]

    /** 当前活动的描述符（包含解析后的 Root 对象，不持久化） */
    activeDescriptors: Map<string, ProtobufDescriptor>

    /** 映射表元信息（持久化） */
    mappingTables: MappingTableMeta[]

    /** 列配置 */
    columnConfigs: ColumnConfig[]

    /** 是否正在加载 */
    loading: boolean
    error: string | null

    // ===== Descriptor Actions =====
    /** 上传描述符文件（关联到表） */
    uploadDescriptor: (file: File, dbId: string, tableName: string) => Promise<void>

    /** 从存储的数据恢复描述符 */
    restoreDescriptor: (name: string) => Promise<ProtobufDescriptor | null>

    /** 删除描述符 */
    removeDescriptor: (name: string) => void

    /** 获取指定表的描述符列表 */
    getTableDescriptors: (dbId: string, tableName: string) => DescriptorMeta[]

    /** 添加列配置 */
    addColumnConfig: (config: ColumnConfig) => void

    /** 删除列配置 */
    removeColumnConfig: (dbId: string, tableName: string, columnName: string) => void

    /** 获取列的配置 */
    getColumnConfig: (dbId: string, tableName: string, columnName: string) => ColumnConfig | null

    /** 获取指定表的所有列配置 */
    getTableColumnConfigs: (dbId: string, tableName: string) => ColumnConfig[]

    /** 使用指定描述符自动检测 BLOB 数据匹配的消息类型 */
    autoDetectTypeWithDescriptor: (descriptorName: string, blobData: string) => Promise<string | null>

    /** 使用指定描述符和消息类型解码 BLOB */
    decodeBlobWithType: (descriptorName: string, messageType: string, blobData: string) => Promise<{ success: true; data: Record<string, unknown> } | { success: false; error: string }>

    /** 根据类型映射获取消息类型 */
    getMessageTypeByMapping: (config: ColumnConfig, rowData: Record<string, unknown>) => string | null

    /** 使用类型映射解码 BLOB（优先使用映射，回退到自动检测） */
    decodeBlobWithMapping: (
        config: ColumnConfig,
        blobData: string,
        rowData: Record<string, unknown>
    ) => Promise<{
        success: true
        data: Record<string, unknown>
        messageType: string
        source: 'mapping' | 'auto'
    } | {
        success: false
        error: string
    }>

    /** 获取描述符的消息类型列表 */
    getDescriptorMessageTypes: (descriptorName: string) => string[]

    // ===== Mapping Table Actions =====
    /** 上传映射表文件（CSV） */
    uploadMappingTable: (file: File, dbId: string, tableName: string) => Promise<void>

    /** 配置映射表的键值列和数据库列关联 */
    configureMappingTableColumns: (
        tableName: string,
        keyColumn: string,
        valueColumn: string,
        protoTypes: string[],
        dbSourceColumn?: string
    ) => void

    /** 删除映射表 */
    removeMappingTable: (name: string) => void

    /** 获取指定表的映射表列表 */
    getTableMappingTables: (dbId: string, tableName: string) => MappingTableMeta[]

    /** 获取映射表 */
    getMappingTable: (name: string) => MappingTableMeta | null

    /** 根据映射表获取消息类型 */
    getMessageTypeByMappingTable: (mappingTableName: string, sourceValue: string) => string | null

    /** 清空所有配置 */
    clearAll: () => void
}

// 将文件转为 Base64
async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            // 移除 data URL 前缀
            const base64 = result.split(',')[1] || result
            resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

export const useProtobufStore = create<ProtobufState>()(
    persist(
        (set, get) => ({
            descriptorMeta: [],
            activeDescriptors: new Map(),
            mappingTables: [],
            columnConfigs: [],
            loading: false,
            error: null,

            uploadDescriptor: async (file: File, dbId: string, tableName: string) => {
                set({ loading: true, error: null })

                try {
                    // 解析描述符
                    const descriptor = await loadDescriptorFromFile(file)

                    // 存储原始数据用于恢复
                    const rawData = await fileToBase64(file)

                    // 检查是否已存在同名描述符（同一表）
                    const existing = get().descriptorMeta.findIndex(
                        d => d.name === descriptor.name && d.dbId === dbId && d.tableName === tableName
                    )

                    set(state => {
                        const newMeta = [...state.descriptorMeta]
                        const meta: DescriptorMeta = {
                            name: descriptor.name,
                            messageTypes: descriptor.messageTypes,
                            uploadedAt: descriptor.uploadedAt.toISOString(),
                            rawData,
                            dbId,
                            tableName,
                        }

                        if (existing >= 0) {
                            newMeta[existing] = meta
                        } else {
                            newMeta.push(meta)
                        }

                        // 更新活动描述符
                        const newActive = new Map(state.activeDescriptors)
                        newActive.set(descriptor.name, descriptor)

                        return {
                            descriptorMeta: newMeta,
                            activeDescriptors: newActive,
                            loading: false,
                        }
                    })
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : String(error),
                        loading: false,
                    })
                }
            },

            restoreDescriptor: async (name: string) => {
                const { activeDescriptors, descriptorMeta } = get()

                // 检查是否已加载
                if (activeDescriptors.has(name)) {
                    return activeDescriptors.get(name)!
                }

                // 从存储的数据恢复
                const meta = descriptorMeta.find(d => d.name === name)
                if (!meta) {
                    return null
                }

                try {
                    const descriptor = await loadDescriptorFromBase64(meta.rawData, meta.name)

                    set(state => {
                        const newActive = new Map(state.activeDescriptors)
                        newActive.set(name, descriptor)
                        return { activeDescriptors: newActive }
                    })

                    return descriptor
                } catch (error) {
                    console.error('Failed to restore descriptor:', error)
                    return null
                }
            },

            removeDescriptor: (name: string) => {
                set(state => ({
                    descriptorMeta: state.descriptorMeta.filter(d => d.name !== name),
                    activeDescriptors: new Map([...state.activeDescriptors].filter(([k]) => k !== name)),
                    // 同时删除使用该描述符的列配置
                    columnConfigs: state.columnConfigs.filter(c => c.descriptorName !== name),
                }))
            },

            getTableDescriptors: (dbId: string, tableName: string) => {
                return get().descriptorMeta.filter(d => d.dbId === dbId && d.tableName === tableName)
            },

            addColumnConfig: (config: ColumnConfig) => {
                set(state => {
                    // 检查是否已存在相同配置
                    const existingIdx = state.columnConfigs.findIndex(
                        c => c.dbId === config.dbId &&
                            c.tableName === config.tableName &&
                            c.columnName === config.columnName
                    )

                    const newConfigs = [...state.columnConfigs]
                    if (existingIdx >= 0) {
                        newConfigs[existingIdx] = config
                    } else {
                        newConfigs.push(config)
                    }

                    return { columnConfigs: newConfigs }
                })
            },

            removeColumnConfig: (dbId: string, tableName: string, columnName: string) => {
                set(state => ({
                    columnConfigs: state.columnConfigs.filter(
                        c => !(c.dbId === dbId && c.tableName === tableName && c.columnName === columnName)
                    )
                }))
            },

            getColumnConfig: (dbId: string, tableName: string, columnName: string) => {
                return get().columnConfigs.find(
                    c => c.dbId === dbId && c.tableName === tableName && c.columnName === columnName
                ) || null
            },

            getTableColumnConfigs: (dbId: string, tableName: string) => {
                return get().columnConfigs.filter(c => c.dbId === dbId && c.tableName === tableName)
            },

            autoDetectTypeWithDescriptor: async (descriptorName: string, blobData: string) => {
                const descriptor = await get().restoreDescriptor(descriptorName)
                if (!descriptor) return null

                return autoDetectMessageType(descriptor, blobData)
            },

            decodeBlobWithType: async (descriptorName: string, messageType: string, blobData: string) => {
                const descriptor = await get().restoreDescriptor(descriptorName)
                if (!descriptor) {
                    return { success: false, error: `描述符 "${descriptorName}" 未找到` }
                }

                // 走递归引擎：BLOB 里嵌的 bytes 字段（信封套信封）也能一并展开。
                // 规则取自全局解码包；没有规则时引擎退化为单层解码，与旧行为一致。
                const rules = useProtoBundleStore.getState().rules
                try {
                    const outcome = decodeWithRules(
                        descriptor.root,
                        messageType,
                        base64ToBytes(blobData),
                        rules
                    )
                    if (!outcome.ok) {
                        return { success: false, error: outcome.error }
                    }
                    return {
                        success: true,
                        data: presentDecoded(outcome.value) as Record<string, unknown>,
                    }
                } catch {
                    // base64 解不开等输入问题，退回原先的单层实现处理
                    return decodeBlob(descriptor, messageType, blobData)
                }
            },

            getMessageTypeByMapping: (config: ColumnConfig, rowData: Record<string, unknown>) => {
                // 检查是否配置了类型映射
                if (!config.typeSourceColumn || !config.typeMappings || config.typeMappings.length === 0) {
                    return null
                }

                // 获取类型来源列的值
                const sourceValue = rowData[config.typeSourceColumn]
                if (sourceValue === null || sourceValue === undefined) {
                    return null
                }

                // 转为字符串进行匹配
                const sourceValueStr = String(sourceValue)

                // 1. 精确匹配
                let mapping = config.typeMappings.find(m => m.sourceValue === sourceValueStr)
                if (mapping) return mapping.messageType

                // 2. 模糊匹配：处理 "1_000" vs "1000" 格式差异
                // 将数据库值标准化（移除下划线）
                const normalizedDbValue = sourceValueStr.replace(/_/g, '')
                
                mapping = config.typeMappings.find(m => {
                    // 将 CSV 中的值也标准化
                    const normalizedCsvValue = m.sourceValue.replace(/_/g, '')
                    return normalizedCsvValue === normalizedDbValue
                })
                
                return mapping?.messageType || null
            },

            decodeBlobWithMapping: async (config: ColumnConfig, blobData: string, rowData: Record<string, unknown>) => {
                const { restoreDescriptor, getMessageTypeByMapping, autoDetectTypeWithDescriptor } = get()

                // 恢复描述符
                const descriptor = await restoreDescriptor(config.descriptorName)
                if (!descriptor) {
                    return { success: false, error: `描述符 "${config.descriptorName}" 未找到` }
                }

                // 1. 优先尝试类型映射
                const mappedType = getMessageTypeByMapping(config, rowData)
                if (mappedType) {
                    const result = decodeBlob(descriptor, mappedType, blobData)
                    if (result.success) {
                        return { ...result, messageType: mappedType, source: 'mapping' as const }
                    }
                    // 映射的类型解码失败，返回错误而不是回退
                    return { success: false, error: `类型 "${mappedType}" 解码失败: ${result.error}` }
                }

                // 2. 回退到自动检测
                const autoType = await autoDetectTypeWithDescriptor(config.descriptorName, blobData)
                if (autoType) {
                    const result = decodeBlob(descriptor, autoType, blobData)
                    if (result.success) {
                        return { ...result, messageType: autoType, source: 'auto' as const }
                    }
                }

                return { success: false, error: '无法确定消息类型' }
            },

            getDescriptorMessageTypes: (descriptorName: string) => {
                const meta = get().descriptorMeta.find(d => d.name === descriptorName)
                return meta?.messageTypes || []
            },

            // ===== Mapping Table Actions =====

            uploadMappingTable: async (file: File, dbId: string, tableName: string) => {
                set({ loading: true, error: null })

                try {
                    const parsed = await loadMappingTableFromFile(file)
                    
                    // 调试日志
                    console.log('[ProtobufStore] 映射表解析结果:', {
                        name: parsed.name,
                        columns: parsed.columns,
                        rowCount: parsed.rows.length,
                        firstRow: parsed.rows[0],
                    })

                    // 检查是否已存在同名映射表
                    const existing = get().mappingTables.findIndex(
                        t => t.name === parsed.name && t.dbId === dbId && t.tableName === tableName
                    )

                    set(state => {
                        const newTables = [...state.mappingTables]
                        const meta: MappingTableMeta = {
                            name: parsed.name,
                            columns: parsed.columns,
                            rows: parsed.rows,
                            uploadedAt: parsed.uploadedAt.toISOString(),
                            dbId,
                            tableName,
                        }

                        if (existing >= 0) {
                            newTables[existing] = meta
                        } else {
                            newTables.push(meta)
                        }

                        return {
                            mappingTables: newTables,
                            loading: false,
                        }
                    })
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : String(error),
                        loading: false,
                    })
                }
            },

            configureMappingTableColumns: (
                mappingTableName: string,
                keyColumn: string,
                valueColumn: string,
                protoTypes: string[],
                dbSourceColumn?: string
            ) => {
                const state = get()
                const tableIdx = state.mappingTables.findIndex(t => t.name === mappingTableName)
                
                console.log('[ProtobufStore] configureMappingTableColumns 调用:', {
                    mappingTableName,
                    keyColumn,
                    valueColumn,
                    dbSourceColumn,
                    tableIdx,
                    existingTables: state.mappingTables.map(t => t.name),
                })
                
                if (tableIdx < 0) {
                    console.error('[ProtobufStore] 找不到映射表:', mappingTableName)
                    return
                }

                const table = state.mappingTables[tableIdx]
                
                // 提取映射表中的值列数据
                const mappingValues = table.rows
                    .map(row => row[valueColumn])
                    .filter(Boolean)
                
                // 与 Protobuf 类型进行智能匹配
                const valueToProtoType = matchWithProtobufTypes(mappingValues, protoTypes)
                
                console.log('[ProtobufStore] 配置映射表:', {
                    mappingTableName,
                    keyColumn,
                    valueColumn,
                    dbSourceColumn,
                    mappingValuesCount: mappingValues.length,
                    matchedCount: valueToProtoType.size,
                })

                // 更新映射表配置
                const newTables = [...state.mappingTables]
                newTables[tableIdx] = {
                    ...table,
                    keyColumn,
                    valueColumn,
                    dbSourceColumn,
                }

                // 同时更新关联的列配置中的 typeMappings 和 typeSourceColumn
                const newConfigs = state.columnConfigs.map(config => {
                    if (config.mappingTableName !== mappingTableName) return config

                    // 根据映射表生成 typeMappings
                    const typeMappings: TypeMapping[] = []
                    for (const row of table.rows) {
                        const key = row[keyColumn]
                        const value = row[valueColumn]
                        const protoType = valueToProtoType.get(value)
                        if (key && protoType) {
                            typeMappings.push({
                                sourceValue: key,
                                messageType: protoType,
                            })
                        }
                    }

                    return {
                        ...config,
                        typeSourceColumn: dbSourceColumn, // 使用数据库列作为类型来源列
                        typeMappings,
                    }
                })

                // 使用 set 函数形式更新状态，确保触发重渲染
                set(() => ({
                    mappingTables: newTables,
                    columnConfigs: newConfigs,
                }))
                
                console.log('[ProtobufStore] 映射表配置已更新:', {
                    updatedTable: newTables[tableIdx],
                    hasKeyColumn: !!newTables[tableIdx].keyColumn,
                    hasValueColumn: !!newTables[tableIdx].valueColumn,
                    hasDbSourceColumn: !!newTables[tableIdx].dbSourceColumn,
                })
            },

            removeMappingTable: (name: string) => {
                set(state => ({
                    mappingTables: state.mappingTables.filter(t => t.name !== name),
                    // 清除使用该映射表的列配置中的引用
                    columnConfigs: state.columnConfigs.map(c => 
                        c.mappingTableName === name
                            ? { ...c, mappingTableName: undefined, typeMappings: undefined }
                            : c
                    ),
                }))
            },

            getTableMappingTables: (dbId: string, tableName: string) => {
                return get().mappingTables.filter(t => t.dbId === dbId && t.tableName === tableName)
            },

            getMappingTable: (name: string) => {
                return get().mappingTables.find(t => t.name === name) || null
            },

            getMessageTypeByMappingTable: (mappingTableName: string, sourceValue: string) => {
                const table = get().mappingTables.find(t => t.name === mappingTableName)
                if (!table || !table.keyColumn || !table.valueColumn) return null

                // 从列配置中查找预计算的映射
                // 注意：这里直接从 columnConfigs 中查找使用此映射表的配置
                const config = get().columnConfigs.find(c => c.mappingTableName === mappingTableName)
                if (!config?.typeMappings) return null

                const mapping = config.typeMappings.find(m => m.sourceValue === sourceValue)
                return mapping?.messageType || null
            },

            clearAll: () => {
                set({
                    descriptorMeta: [],
                    activeDescriptors: new Map(),
                    mappingTables: [],
                    columnConfigs: [],
                    error: null,
                })
            },
        }),
        {
            name: 'protobuf-store',
            // 只持久化元数据和配置，不持久化 activeDescriptors
            partialize: (state) => ({
                descriptorMeta: state.descriptorMeta,
                mappingTables: state.mappingTables,
                columnConfigs: state.columnConfigs,
            }),
        }
    )
)
