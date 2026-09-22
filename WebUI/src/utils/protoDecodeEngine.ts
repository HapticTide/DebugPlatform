/**
 * protoDecodeEngine.ts
 * 按「解码规则表」递归展开 protobuf 消息里的 bytes 字段。
 *
 * protobuf 的 bytes 字段是 schema 断掉的地方：descriptor 只说它是一段字节，不说里面装的是什么。
 * 真正的类型由**同一条消息里的另一个字段**决定（路由 path、信封类型枚举…），而那层映射
 * 不在 descriptor 里。规则表补的就是这层，引擎本身不含任何业务知识。
 *
 * 规则表的格式见 docs/PROTOBUF_DECODE.md；它一般由 proto 仓在生成 descriptor 时一并产出。
 */

import protobuf from 'protobufjs'

/** 条件：同一条消息里某个字段等于某值 */
export interface DecodeCondition {
    field: string
    equals: string | number | boolean
}

/** 单条嵌套解码规则。三种选型方式互斥，`when` 是可选前置条件。 */
export interface NestedRule {
    /** 固定按这个类型解 */
    decodeAs?: string
    /** 按同级该字段的取值查 switchTables */
    switchField?: string
    /** 按同级该 path 字段查 pathTypes */
    byPath?: { field: string; as: 'req' | 'rsp' | 'deliver' }
    when?: DecodeCondition
}

export interface DecodeRules {
    version: number
    generatedFrom?: string
    generatedAt?: string
    /** path → 各方向的消息类型 */
    pathTypes: Record<string, { req?: string; rsp?: string; deliver?: string }>
    /** 开关字段名 → (取值 → 类型全名) */
    switchTables: Record<string, Record<string, string>>
    /** 哪个 message 的哪个 bytes 字段，按什么规则解 */
    nested: Array<{ parent: string; field: string; rules: NestedRule[] }>
}

/** 一段没能解开的 bytes，连同原因一起如实呈现 */
export interface UndecodedBytes {
    kind: 'undecoded'
    size: number
    reason: string
    /** 前 16 字节的 hex，用于肉眼比对 */
    preview: string
}

/** 解码过程中每展开一层留下的一条记录，供 UI 显示「解到了哪一层」 */
export interface DecodeTraceEntry {
    /** 字段路径，如 `body.envelope` */
    path: string
    messageType: string | null
    ok: boolean
    reason?: string
}

export interface DecodeStats {
    /** 成功展开的 bytes 字段数 */
    expanded: number
    /** 未能展开的 bytes 字段数 */
    undecoded: number
    trace: DecodeTraceEntry[]
}

export type DecodeOutcome =
    | { ok: true; messageType: string; value: Record<string, unknown>; stats: DecodeStats }
    | { ok: false; error: string }

/** 展开后的嵌套消息在结果树里带上这个键，UI 与 JSONTree 都能直接显示 */
export const TYPE_KEY = '@type'

const DEFAULT_MAX_DEPTH = 12

/** protobufjs 的 fullName 带前导点（`.pkg.Message`），规则表里不带 */
function normalizeTypeName(fullName: string): string {
    return fullName.startsWith('.') ? fullName.slice(1) : fullName
}

/**
 * 宽松相等：规则里的字面量与 toObject 的产物类型未必一致
 * （int64 在 `longs: String` 下是字符串，bool 是布尔）。统一按字符串比。
 */
function looseEquals(actual: unknown, expected: string | number | boolean): boolean {
    if (actual === undefined || actual === null) return false
    return String(actual) === String(expected)
}

/**
 * 取 `when` 条件里那个字段的值——**缺键时回落到 schema 声明的默认值**。
 *
 * proto3 的标量默认值不上线 wire：`e2eeFlag = false` 编码时整个字段被省略，
 * 于是 `toObject({ defaults: false })` 的结果里根本没有这个键。直接读会拿到
 * `undefined`，让 `when e2eeFlag=false` 这类条件**永远不成立**——本该解开的
 * 明文信封被一路报成「不满足解码条件（需 e2eeFlag=false）」。
 *
 * 这个坑在自造夹具上照不出来：protobufjs 自己编码时会把显式赋的 `false`
 * 写上线（它按 hasOwnProperty 决定写不写），而 SwiftProtobuf / Java protobuf
 * 按 proto3 语义省略。只有真实 wire 才触发，所以回归测试必须构造「默认值不
 * 上线」的字节，见 protoDecodeEngine.test.ts。
 *
 * 有 explicit presence 的字段除外：真 `oneof` 成员、proto3 `optional` 合成的
 * oneof，它们的「缺失」本身就是可观测语义（未设置），替它补一个默认值等于
 * 把 unset 当成了 0 / false。消息类型字段同理，没有隐式默认值。
 */
function conditionValue(
    type: protobuf.Type,
    siblings: Record<string, unknown>,
    fieldName: string
): unknown {
    if (Object.prototype.hasOwnProperty.call(siblings, fieldName)) return siblings[fieldName]

    const field = type.fields[fieldName]
    if (!field) return undefined

    field.resolve()
    if (field.partOf || field.repeated || field.map) return undefined
    if (field.resolvedType instanceof protobuf.Type) return undefined

    // 枚举在 `enums: String` 下是名字，默认值也要换成名字，否则与字段在场时的形态比不上
    if (field.resolvedType instanceof protobuf.Enum) {
        const values = field.resolvedType.values
        const name = Object.keys(values).find((key) => values[key] === field.typeDefault)
        return name ?? field.typeDefault
    }

    return field.typeDefault
}

function toHexPreview(bytes: Uint8Array): string {
    return Array.from(bytes.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
}

function undecoded(bytes: Uint8Array, reason: string): UndecodedBytes {
    return { kind: 'undecoded', size: bytes.length, reason, preview: toHexPreview(bytes) }
}

export function isUndecodedBytes(value: unknown): value is UndecodedBytes {
    return typeof value === 'object' && value !== null && (value as UndecodedBytes).kind === 'undecoded'
}

/** toObject 在 `bytes: Array` 下把 bytes 字段转成数组，这里还原成 Uint8Array */
function asBytes(value: unknown): Uint8Array | null {
    if (value instanceof Uint8Array) return value
    if (Array.isArray(value) && value.every((v) => typeof v === 'number')) {
        return new Uint8Array(value as number[])
    }
    if (typeof value === 'string') {
        // protobufjs 在某些配置下把 bytes 转成 base64 字符串
        try {
            const binary = atob(value)
            const out = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
            return out
        } catch {
            return null
        }
    }
    return null
}

/**
 * 在规则表里找「这个 message 的这个字段」该怎么解。
 *
 * `parent` 既给规则表当键，也用来读同级字段的 schema 默认值——见 conditionValue。
 */
function resolveTargetType(
    rules: DecodeRules,
    parent: protobuf.Type,
    fieldName: string,
    siblings: Record<string, unknown>
): { type: string } | { skip: string } {
    const parentType = normalizeTypeName(parent.fullName)
    const entry = rules.nested.find((n) => n.parent === parentType && n.field === fieldName)
    if (!entry) return { skip: '无解码规则' }

    const sibling = (name: string) => conditionValue(parent, siblings, name)

    for (const rule of entry.rules) {
        if (rule.when && !looseEquals(sibling(rule.when.field), rule.when.equals)) continue

        if (rule.decodeAs) return { type: rule.decodeAs }

        if (rule.switchField) {
            const table = rules.switchTables[rule.switchField]
            if (!table) return { skip: `开关表 ${rule.switchField} 不存在` }
            const key = String(sibling(rule.switchField) ?? '')
            const target = table[key]
            if (!target) return { skip: `${rule.switchField}=${key || '(空)'} 未注册类型` }
            return { type: target }
        }

        if (rule.byPath) {
            const path = sibling(rule.byPath.field)
            if (typeof path !== 'string' || path.length === 0) {
                return { skip: `${rule.byPath.field} 为空，无法按 path 查表` }
            }
            const target = rules.pathTypes[path]?.[rule.byPath.as]
            if (!target) return { skip: `path ${path} 没有 ${rule.byPath.as} 类型映射` }
            return { type: target }
        }
    }

    // 有规则但所有 when 都不成立——通常正是「这段是密文」的情形，据实说明而不是硬解
    const conditions = entry.rules
        .filter((r) => r.when)
        .map((r) => `${r.when!.field}=${r.when!.equals}`)
        .join(' / ')
    return { skip: conditions ? `不满足解码条件（需 ${conditions}）` : '无匹配规则' }
}

interface ExpandContext {
    root: protobuf.Root
    rules: DecodeRules
    stats: DecodeStats
    maxDepth: number
}

/**
 * 把一段 bytes 按目标类型解开，并继续递归展开它内部的 bytes 字段。
 * 解不开时返回 UndecodedBytes——宁可留着原始字节，也不给一个看着像那么回事的错结果。
 */
function decodeNested(
    ctx: ExpandContext,
    bytes: Uint8Array,
    targetType: string,
    fieldPath: string,
    depth: number
): Record<string, unknown> | UndecodedBytes {
    if (depth >= ctx.maxDepth) {
        ctx.stats.undecoded++
        ctx.stats.trace.push({ path: fieldPath, messageType: targetType, ok: false, reason: '超出最大嵌套深度' })
        return undecoded(bytes, `超出最大嵌套深度（${ctx.maxDepth}）`)
    }

    let type: protobuf.Type
    try {
        type = ctx.root.lookupType(targetType)
    } catch {
        ctx.stats.undecoded++
        ctx.stats.trace.push({ path: fieldPath, messageType: targetType, ok: false, reason: '描述符里没有该类型' })
        return undecoded(bytes, `描述符里没有类型 ${targetType}`)
    }

    try {
        const message = type.decode(bytes)
        const object = type.toObject(message, {
            longs: String,
            enums: String,
            bytes: Array,
            defaults: false,
            arrays: true,
            objects: true,
        }) as Record<string, unknown>

        ctx.stats.expanded++
        ctx.stats.trace.push({ path: fieldPath, messageType: targetType, ok: true })

        const expanded = expandMessage(ctx, type, object, fieldPath, depth + 1)
        return { [TYPE_KEY]: targetType, ...expanded }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        ctx.stats.undecoded++
        ctx.stats.trace.push({ path: fieldPath, messageType: targetType, ok: false, reason })
        return undecoded(bytes, `按 ${targetType} 解码失败：${reason}`)
    }
}

/**
 * 遍历一条已解出的消息，就地展开其中的 bytes 字段与嵌套消息。
 * 用 descriptor 的字段元信息来判断类型，而不是靠猜值的形状。
 */
function expandMessage(
    ctx: ExpandContext,
    type: protobuf.Type,
    object: Record<string, unknown>,
    basePath: string,
    depth: number
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...object }

    for (const field of type.fieldsArray) {
        const value = result[field.name]
        if (value === undefined || value === null) continue

        const fieldPath = basePath ? `${basePath}.${field.name}` : field.name

        if (field.type === 'bytes') {
            const mapOne = (raw: unknown, path: string): unknown => {
                const bytes = asBytes(raw)
                if (!bytes) return raw
                if (bytes.length === 0) return raw

                const resolved = resolveTargetType(ctx.rules, type, field.name, object)
                if ('skip' in resolved) {
                    ctx.stats.undecoded++
                    ctx.stats.trace.push({ path, messageType: null, ok: false, reason: resolved.skip })
                    return undecoded(bytes, resolved.skip)
                }
                return decodeNested(ctx, bytes, resolved.type, path, depth)
            }

            result[field.name] = field.repeated && Array.isArray(value)
                ? value.map((item, i) => mapOne(item, `${fieldPath}[${i}]`))
                : mapOne(value, fieldPath)
            continue
        }

        // 嵌套消息：继续往下走，里面可能还有 bytes 字段（如 PbBoxPullRsp.items 里的 PbRequest.body）
        const resolvedType = field.resolvedType
        if (resolvedType instanceof protobuf.Type) {
            if (field.repeated && Array.isArray(value)) {
                result[field.name] = value.map((item, i) =>
                    typeof item === 'object' && item !== null
                        ? expandMessage(ctx, resolvedType, item as Record<string, unknown>, `${fieldPath}[${i}]`, depth)
                        : item
                )
            } else if (field.map && typeof value === 'object') {
                const mapped: Record<string, unknown> = {}
                for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
                    mapped[k] = typeof v === 'object' && v !== null
                        ? expandMessage(ctx, resolvedType, v as Record<string, unknown>, `${fieldPath}.${k}`, depth)
                        : v
                }
                result[field.name] = mapped
            } else if (typeof value === 'object') {
                result[field.name] = expandMessage(
                    ctx,
                    resolvedType,
                    value as Record<string, unknown>,
                    fieldPath,
                    depth
                )
            }
        }
    }

    return result
}

/**
 * 解码入口：按给定类型解一段字节，并递归展开内部的 bytes 字段。
 *
 * @param rules 为 null 时退化成单层解码（等价于没有规则表，只解最外层）
 */
export function decodeWithRules(
    root: protobuf.Root,
    messageType: string,
    bytes: Uint8Array,
    rules: DecodeRules | null,
    options?: { maxDepth?: number }
): DecodeOutcome {
    const stats: DecodeStats = { expanded: 0, undecoded: 0, trace: [] }

    let type: protobuf.Type
    try {
        type = root.lookupType(messageType)
    } catch {
        return { ok: false, error: `描述符里没有类型 ${messageType}` }
    }

    let object: Record<string, unknown>
    try {
        const message = type.decode(bytes)
        object = type.toObject(message, {
            longs: String,
            enums: String,
            bytes: Array,
            defaults: false,
            arrays: true,
            objects: true,
        }) as Record<string, unknown>
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }

    if (!rules) {
        return { ok: true, messageType, value: { [TYPE_KEY]: messageType, ...object }, stats }
    }

    const ctx: ExpandContext = { root, rules, stats, maxDepth: options?.maxDepth ?? DEFAULT_MAX_DEPTH }
    const expanded = expandMessage(ctx, type, object, '', 0)

    return { ok: true, messageType, value: { [TYPE_KEY]: messageType, ...expanded }, stats }
}

/**
 * 按 URL path 在规则表里查这条请求 / 响应该用什么类型。
 *
 * URL 可能带 query，也可能是完整 URL（带协议与 host），这里只取 path 部分。
 */
export function lookupTypeForUrl(
    rules: DecodeRules,
    url: string,
    direction: 'req' | 'rsp' | 'deliver'
): string | null {
    const path = extractPath(url)
    if (!path) return null
    return rules.pathTypes[path]?.[direction] ?? null
}

/**
 * 把解码结果里的「未解码字节」换成一行可读说明，便于直接交给通用的 JSON 树渲染。
 * 保留 reason 是刻意的——看到的人需要知道这段为什么没展开：是密文、是没规则、还是解失败。
 */
export function presentDecoded(value: unknown): unknown {
    if (isUndecodedBytes(value)) {
        return `⟨未解码 ${value.size} 字节 · ${value.reason}⟩`
    }
    if (Array.isArray(value)) {
        return value.map(presentDecoded)
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = presentDecoded(item)
        }
        return out
    }
    return value
}

/**
 * 一份可以直接贴给服务端的解码证据。
 *
 * 只贴一棵解出来的树是不够的：对方要复核「这段字节到底是什么」，需要知道**按哪个类型
 * 解的**（决定了字段名是否可信）、**规则表与 descriptor 是哪一版**（两侧不同版本时结论
 * 不可比），以及**原始 base64**（能自己重解一遍）。少任何一项，争的就变成各自的截图。
 */
export interface DecodeEvidence {
    /** 抓到这段字节的请求 URL */
    url?: string
    /** 查表方向 */
    direction?: 'req' | 'rsp' | 'deliver'
    /** 实际用来解的消息类型 */
    messageType: string
    /** descriptor 包名（哪一版 proto） */
    descriptor?: string
    /** 规则表的来源标记（`im-proto@<commit>`） */
    rules?: string
    sizeBytes: number
    /** 解码前是否剥掉了一层 base64 */
    doubleEncodedBase64?: boolean
    /** 解出来的树；未展开的 bytes 段是结构化对象而不是一句话 */
    decoded: unknown
    /** 没能展开的段落清单——这通常正是要交给服务端看的那部分 */
    undecoded: Array<{ path: string; messageType: string | null; reason: string }>
    /** 原始字节，供对方自行重解 */
    raw: { base64: string }
}

/**
 * 导出用的 bytes 段呈现：给机器读，所以结构化，而不是 presentDecoded 的那句 `⟨…⟩`。
 *
 * 保留 `hexPreview` 是刻意的——服务端往往只凭头几个字节的 tag / wire type 就能认出
 * 自己投的是哪种形态（例：顶层第一个字段是 13 还是 1，正是投递体与裸信封之差）。
 */
function presentForExport(value: unknown): unknown {
    if (isUndecodedBytes(value)) {
        return {
            '@undecoded': true,
            sizeBytes: value.size,
            reason: value.reason,
            hexPreview: value.preview,
        }
    }
    if (Array.isArray(value)) {
        return value.map(presentForExport)
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = presentForExport(item)
        }
        return out
    }
    return value
}

/** 把一次成功的解码打包成证据 JSON 文本（缩进 2，可直接贴进工单）。 */
export function buildDecodeEvidence(input: {
    messageType: string
    value: Record<string, unknown>
    stats: DecodeStats
    base64: string
    sizeBytes: number
    url?: string
    direction?: 'req' | 'rsp' | 'deliver'
    descriptor?: string
    rules?: string
    doubleEncodedBase64?: boolean
}): string {
    const evidence: DecodeEvidence = {
        url: input.url,
        direction: input.direction,
        messageType: input.messageType,
        descriptor: input.descriptor,
        rules: input.rules,
        sizeBytes: input.sizeBytes,
        doubleEncodedBase64: input.doubleEncodedBase64,
        decoded: presentForExport(input.value),
        undecoded: input.stats.trace
            .filter((entry) => !entry.ok)
            .map((entry) => ({
                path: entry.path,
                messageType: entry.messageType,
                reason: entry.reason ?? '未说明',
            })),
        raw: { base64: input.base64 },
    }

    // undefined 的键由 JSON.stringify 自动省略，不必手动清
    return JSON.stringify(evidence, null, 2)
}

/**
 * 有的端会把 protobuf body 再 base64 编码一次之后才放进 HTTP body，
 * 于是抓到的字节实际上是一段 ASCII 文本。这里识别并剥掉那一层。
 *
 * 判据取得比较严（整段都落在 base64 字符集内、长度是 4 的倍数、解出来非空），
 * 真正的 protobuf 字节几乎不可能全部落在可见 ASCII 范围内——
 * 字段 tag 通常小于 0x20，一出现就不满足条件。
 */
export function unwrapBase64Layer(bytes: Uint8Array): { bytes: Uint8Array; unwrapped: boolean } {
    if (bytes.length < 8 || bytes.length % 4 !== 0) return { bytes, unwrapped: false }

    let text = ''
    for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i]
        const isBase64Char =
            (code >= 0x41 && code <= 0x5a) || // A-Z
            (code >= 0x61 && code <= 0x7a) || // a-z
            (code >= 0x30 && code <= 0x39) || // 0-9
            code === 0x2b || // +
            code === 0x2f || // /
            code === 0x3d // =
        if (!isBase64Char) return { bytes, unwrapped: false }
        text += String.fromCharCode(code)
    }

    try {
        const binary = atob(text)
        if (binary.length === 0) return { bytes, unwrapped: false }
        const out = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
        return { bytes: out, unwrapped: true }
    } catch {
        return { bytes, unwrapped: false }
    }
}

/** 从任意形态的 URL 里取出 path（去掉协议、host 与 query） */
export function extractPath(url: string): string | null {
    if (!url) return null
    try {
        // 相对路径交给基址补全，绝对 URL 会忽略基址
        return new URL(url, 'http://placeholder.invalid').pathname
    } catch {
        const withoutQuery = url.split('?')[0].split('#')[0]
        return withoutQuery.startsWith('/') ? withoutQuery : null
    }
}
