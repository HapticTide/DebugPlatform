/**
 * protoBundleStore.ts
 * 全局 Protobuf 解码包（descriptor + 解码规则），托管在 Hub，所有页面共用一份。
 *
 * 与 protobufStore 的分工：那个管的是「DB 里某张表某一列按什么类型解」的**人工配置**，
 * 这个管的是「解码能力本身」——descriptor 从哪来、规则是什么。抓包详情页和 DB Inspector
 * 都从这里取解码能力。
 */

import { create } from 'zustand'
import protobuf from 'protobufjs'
import 'protobufjs/ext/descriptor'
import { api } from '@/services/api'
import {
    decodeWithRules,
    lookupTypeForUrl,
    type DecodeOutcome,
    type DecodeRules,
} from '@/utils/protoDecodeEngine'

declare module 'protobufjs' {
    namespace Root {
        function fromDescriptor(descriptor: Uint8Array | ArrayBuffer | unknown): protobuf.Root
    }
}

export interface ProtoBundleSummary {
    id: string
    name: string
    descriptorFilename: string
    descriptorSize: number
    rulesFilename: string | null
    hasRules: boolean
    isActive: boolean
    note: string | null
    createdAt: string | null
}

interface ProtoBundleDetail extends Omit<ProtoBundleSummary, 'descriptorSize' | 'hasRules'> {
    descriptorBase64: string
    rulesJSON: string | null
}

export interface UploadBundleInput {
    name: string
    descriptorFile: File
    rulesFile?: File | null
    note?: string
    activate?: boolean
}

interface ProtoBundleState {
    bundles: ProtoBundleSummary[]
    /** 当前生效包的元信息 */
    active: ProtoBundleSummary | null
    /** 当前生效包解析出的 Root（不持久化，进程内存活） */
    root: protobuf.Root | null
    rules: DecodeRules | null
    /** Root 里所有消息类型的全名，供手动选型 */
    messageTypes: string[]

    loading: boolean
    loaded: boolean
    error: string | null

    /** 拉取列表并加载当前生效包。重复调用是幂等的。 */
    load: (options?: { force?: boolean }) => Promise<void>
    uploadBundle: (input: UploadBundleInput) => Promise<void>
    activateBundle: (id: string) => Promise<void>
    deleteBundle: (id: string) => Promise<void>

    /** 按消息类型解一段 base64 数据 */
    decode: (messageType: string, base64: string) => DecodeOutcome
    /** 按 URL 在规则表里找类型再解；没有映射时返回 null 而不是瞎猜 */
    decodeForUrl: (url: string, direction: 'req' | 'rsp' | 'deliver', base64: string) => DecodeOutcome | null
    /** 查 URL 对应的消息类型（供界面显示「将按 X 解析」） */
    typeForUrl: (url: string, direction: 'req' | 'rsp' | 'deliver') => string | null
}

export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    // 分块避免大文件时 apply 的参数个数上限
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
}

function collectMessageTypes(root: protobuf.Root): string[] {
    const types: string[] = []

    const traverse = (namespace: protobuf.NamespaceBase, prefix: string) => {
        for (const nested of namespace.nestedArray) {
            const fullName = prefix ? `${prefix}.${nested.name}` : nested.name
            if (nested instanceof protobuf.Type) {
                types.push(fullName)
                traverse(nested, fullName)
            } else if (nested instanceof protobuf.Namespace) {
                traverse(nested, fullName)
            }
        }
    }

    traverse(root, '')
    return types.sort()
}

function parseDetail(detail: ProtoBundleDetail): {
    root: protobuf.Root
    rules: DecodeRules | null
    messageTypes: string[]
} {
    const root = protobuf.Root.fromDescriptor(base64ToBytes(detail.descriptorBase64))

    let rules: DecodeRules | null = null
    if (detail.rulesJSON) {
        try {
            rules = JSON.parse(detail.rulesJSON) as DecodeRules
        } catch (error) {
            // 规则坏掉不该连累 descriptor——没有规则仍能按单一类型解最外层
            console.warn('[protoBundle] 解码规则解析失败，将只做单层解码', error)
        }
    }

    return { root, rules, messageTypes: collectMessageTypes(root) }
}

export const useProtoBundleStore = create<ProtoBundleState>()((set, get) => ({
    bundles: [],
    active: null,
    root: null,
    rules: null,
    messageTypes: [],
    loading: false,
    loaded: false,
    error: null,

    load: async (options) => {
        const { loading, loaded } = get()
        if (loading) return
        if (loaded && !options?.force) return

        set({ loading: true, error: null })
        try {
            const bundles = await api.get<ProtoBundleSummary[]>('/api/proto-bundles')
            const active = bundles.find((b) => b.isActive) ?? null

            if (!active) {
                set({ bundles, active: null, root: null, rules: null, messageTypes: [], loading: false, loaded: true })
                return
            }

            const detail = await api.get<ProtoBundleDetail>(`/api/proto-bundles/${active.id}`)
            const parsed = parseDetail(detail)

            set({
                bundles,
                active,
                root: parsed.root,
                rules: parsed.rules,
                messageTypes: parsed.messageTypes,
                loading: false,
                loaded: true,
            })
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : String(error),
                loading: false,
                loaded: true,
            })
        }
    },

    uploadBundle: async (input) => {
        set({ loading: true, error: null })
        try {
            const descriptorBase64 = await fileToBase64(input.descriptorFile)
            const rulesJSON = input.rulesFile ? await input.rulesFile.text() : null

            await api.post('/api/proto-bundles', {
                name: input.name,
                descriptorFilename: input.descriptorFile.name,
                descriptorBase64,
                rulesFilename: input.rulesFile?.name ?? null,
                rulesJSON,
                note: input.note ?? null,
                activate: input.activate ?? true,
            })

            set({ loading: false })
            await get().load({ force: true })
        } catch (error) {
            set({ error: error instanceof Error ? error.message : String(error), loading: false })
            throw error
        }
    },

    activateBundle: async (id) => {
        await api.put(`/api/proto-bundles/${id}/activate`)
        await get().load({ force: true })
    },

    deleteBundle: async (id) => {
        await api.delete(`/api/proto-bundles/${id}`)
        await get().load({ force: true })
    },

    decode: (messageType, base64) => {
        const { root, rules } = get()
        if (!root) return { ok: false, error: '尚未加载 Protobuf 解码包' }

        try {
            return decodeWithRules(root, messageType, base64ToBytes(base64), rules)
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
    },

    typeForUrl: (url, direction) => {
        const { rules } = get()
        if (!rules) return null
        return lookupTypeForUrl(rules, url, direction)
    },

    decodeForUrl: (url, direction, base64) => {
        const messageType = get().typeForUrl(url, direction)
        if (!messageType) return null
        return get().decode(messageType, base64)
    },
}))
