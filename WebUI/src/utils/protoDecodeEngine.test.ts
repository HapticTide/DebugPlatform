/**
 * 解码引擎的回归测试。
 *
 * 刻意使用自造的中性 schema 而非任何真实业务 descriptor：这里要测的是引擎逻辑
 * （按 path / 按开关字段 / 条件不满足时不硬解），与具体业务无关。
 *
 * 为什么必须有这组测试：protobuf 的 wire format 让「解错」不报错——用错误的类型去解一段
 * 字节，往往能"成功"解出一组张冠李戴的字段。这类失败没有异常、没有红色，只有看起来
 * 很合理的错数据。只能靠断言守住。
 */

import { describe, expect, it } from 'vitest'
import protobuf from 'protobufjs'
import {
    buildDecodeEvidence,
    decodeWithRules,
    extractPath,
    isUndecodedBytes,
    lookupTypeForUrl,
    TYPE_KEY,
    unwrapBase64Layer,
    type DecodeRules,
} from './protoDecodeEngine'

const SCHEMA = `
syntax = "proto3";
package sample;

message Container {
  repeated Envelope items = 1;
}

message Envelope {
  string route = 1;
  bytes payload = 2;
}

message Carrier {
  int32 kind = 1;
  bool sealed = 2;
  bytes content = 3;
}

message TextLeaf {
  string text = 1;
}

message NumberLeaf {
  int64 amount = 1;
}

enum Mode {
  MODE_PLAIN = 0;
  MODE_SEALED = 1;
}

/* 与 Carrier 同形，但开关字段是 enum、条件字段有 explicit presence */
message Tagged {
  int32 kind = 1;
  optional bool sealed = 2;
  bytes content = 3;
  Mode mode = 4;
}
`

const root = protobuf.parse(SCHEMA).root

const rules: DecodeRules = {
    version: 1,
    pathTypes: {
        '/demo/text': { deliver: 'sample.Carrier' },
    },
    switchTables: {
        kind: {
            '1': 'sample.TextLeaf',
            '2': 'sample.NumberLeaf',
        },
    },
    nested: [
        {
            parent: 'sample.Envelope',
            field: 'payload',
            rules: [{ byPath: { field: 'route', as: 'deliver' } }],
        },
        {
            parent: 'sample.Carrier',
            field: 'content',
            rules: [{ switchField: 'kind', when: { field: 'sealed', equals: false } }],
        },
        {
            parent: 'sample.Tagged',
            field: 'content',
            rules: [{ switchField: 'kind', when: { field: 'sealed', equals: false } }],
        },
    ],
}

/**
 * 按 proto3 语义编码：标量默认值**不上线 wire**。
 *
 * 不能用 `encode(type.create({ sealed: false }))` 代替——protobufjs 按 hasOwnProperty
 * 决定写不写，显式赋的 `false` 会被写进 wire，于是夹具比真实 wire 多了一个字段，
 * 本文件下面那条「条件按默认值成立」的用例就恒绿，而现网恒黑。
 */
function encodeProto3(typeName: string, payload: Record<string, unknown>): Uint8Array {
    const type = root.lookupType(typeName)
    const trimmed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
        const field = type.fields[key]
        if (field) {
            field.resolve()
            // 与标量默认值相等的项整条丢掉，等价于 SwiftProtobuf / Java protobuf 的行为
            if (!field.repeated && !field.map && String(value) === String(field.typeDefault)) continue
        }
        trimmed[key] = value
    }
    return type.encode(type.create(trimmed)).finish()
}

function encode(typeName: string, payload: Record<string, unknown>): Uint8Array {
    const type = root.lookupType(typeName)
    return type.encode(type.create(payload)).finish()
}

/** 组一条最深的链：Container → items[].payload → Carrier.content → TextLeaf */
function buildNestedContainer(options: { sealed: boolean; route?: string }): Uint8Array {
    const leaf = encode('sample.TextLeaf', { text: 'hello' })
    const carrier = encode('sample.Carrier', { kind: 1, sealed: options.sealed, content: leaf })
    return encode('sample.Container', {
        items: [{ route: options.route ?? '/demo/text', payload: carrier }],
    })
}

describe('decodeWithRules', () => {
    it('沿 path 与开关字段一路展开到叶子', () => {
        const outcome = decodeWithRules(root, 'sample.Container', buildNestedContainer({ sealed: false }), rules)

        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const carrier = item.payload as Record<string, unknown>
        expect(carrier[TYPE_KEY]).toBe('sample.Carrier')

        const leaf = carrier.content as Record<string, unknown>
        expect(leaf[TYPE_KEY]).toBe('sample.TextLeaf')
        expect(leaf.text).toBe('hello')

        expect(outcome.stats.expanded).toBe(2)
        expect(outcome.stats.undecoded).toBe(0)
    })

    /**
     * 这条守的是现网真正踩到的那个坑：`e2eeFlag = false` 不上线 wire，
     * `toObject({ defaults: false })` 里没有这个键，于是 `when e2eeFlag=false`
     * 永远不成立，明文信封被一路报成「不满足解码条件」。
     *
     * 判据只能是「解开了」：报错文案与 stats 都不足以区分「条件真不成立」
     * 和「条件字段被 wire 省略了」——两者都是 undecoded + 同一句原因。
     */
    it('条件字段被 proto3 省略时按 schema 默认值判定，明文段照样解开', () => {
        const leaf = encodeProto3('sample.TextLeaf', { text: 'hello' })
        // sealed=false 不上线，与 SwiftProtobuf / Java protobuf 的真实 wire 一致
        const carrier = encodeProto3('sample.Carrier', { kind: 1, sealed: false, content: leaf })
        const bytes = encodeProto3('sample.Container', {
            items: [{ route: '/demo/text', payload: carrier }],
        })

        // 前提：这段字节里确实没有 sealed 字段，否则本用例守的东西已不存在
        const decodedCarrier = root.lookupType('sample.Carrier').decode(carrier)
        expect(Object.prototype.hasOwnProperty.call(decodedCarrier, 'sealed')).toBe(false)

        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const content = (item.payload as Record<string, unknown>).content as Record<string, unknown>
        expect(content[TYPE_KEY]).toBe('sample.TextLeaf')
        expect(content.text).toBe('hello')
        expect(outcome.stats.undecoded).toBe(0)
    })

    /**
     * 反向：有 explicit presence 的字段（proto3 `optional` / oneof 成员）缺失
     * 是可观测语义「未设置」，不能替它补 false——补了就等于把 unset 当成明文，
     * 拿着规则去硬解一段可能是密文的字节。
     */
    it('有 explicit presence 的条件字段缺失时不补默认值，保持未解码', () => {
        const leaf = encodeProto3('sample.TextLeaf', { text: 'hello' })
        const tagged = encodeProto3('sample.Tagged', { kind: 1, content: leaf })

        const outcome = decodeWithRules(root, 'sample.Tagged', tagged, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        expect(isUndecodedBytes(outcome.value.content)).toBe(true)
        if (!isUndecodedBytes(outcome.value.content)) return
        expect(outcome.value.content.reason).toContain('sealed=false')
    })

    it('when 条件不满足时保留原始字节，并说明原因', () => {
        const outcome = decodeWithRules(root, 'sample.Container', buildNestedContainer({ sealed: true }), rules)

        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const carrier = item.payload as Record<string, unknown>
        expect(carrier[TYPE_KEY]).toBe('sample.Carrier')

        // sealed=true 时规则不成立——必须留作未解码，而不是硬套 TextLeaf
        const content = carrier.content
        expect(isUndecodedBytes(content)).toBe(true)
        if (!isUndecodedBytes(content)) return
        expect(content.reason).toContain('sealed=false')
        expect(content.size).toBeGreaterThan(0)
        expect(outcome.stats.undecoded).toBe(1)
    })

    it('path 查不到映射时不猜类型', () => {
        const bytes = buildNestedContainer({ sealed: false, route: '/demo/unknown' })
        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)

        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        expect(isUndecodedBytes(item.payload)).toBe(true)
        if (!isUndecodedBytes(item.payload)) return
        expect(item.payload.reason).toContain('/demo/unknown')
    })

    it('开关字段取值未注册时不猜类型', () => {
        const carrier = encode('sample.Carrier', { kind: 99, sealed: false, content: encode('sample.TextLeaf', { text: 'x' }) })
        const bytes = encode('sample.Container', { items: [{ route: '/demo/text', payload: carrier }] })

        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const content = (item.payload as Record<string, unknown>).content
        expect(isUndecodedBytes(content)).toBe(true)
        if (!isUndecodedBytes(content)) return
        expect(content.reason).toContain('kind=99')
    })

    it('没有规则的 bytes 字段原样保留', () => {
        const rulesWithoutCarrier: DecodeRules = { ...rules, nested: [rules.nested[0]] }
        const outcome = decodeWithRules(
            root,
            'sample.Container',
            buildNestedContainer({ sealed: false }),
            rulesWithoutCarrier
        )

        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const content = (item.payload as Record<string, unknown>).content
        expect(isUndecodedBytes(content)).toBe(true)
        if (!isUndecodedBytes(content)) return
        expect(content.reason).toContain('无解码规则')
    })

    it('嵌套解码失败时降级为原始字节，不影响外层', () => {
        // content 装的是随机字节，按 TextLeaf 解会失败
        const carrier = encode('sample.Carrier', {
            kind: 1,
            sealed: false,
            content: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
        })
        const bytes = encode('sample.Container', { items: [{ route: '/demo/text', payload: carrier }] })

        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        const carrierOut = item.payload as Record<string, unknown>
        // 外层仍然解开了
        expect(carrierOut[TYPE_KEY]).toBe('sample.Carrier')
        expect(isUndecodedBytes(carrierOut.content)).toBe(true)
    })

    it('不给规则表时只解最外层', () => {
        const outcome = decodeWithRules(root, 'sample.Container', buildNestedContainer({ sealed: false }), null)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const item = (outcome.value.items as Record<string, unknown>[])[0]
        // payload 未被展开——仍是 toObject 给出的原始形态
        expect((item.payload as Record<string, unknown>)?.[TYPE_KEY]).toBeUndefined()
        expect(outcome.stats.expanded).toBe(0)
    })

    it('类型不存在时整体失败而不是静默返回空', () => {
        const outcome = decodeWithRules(root, 'sample.NotThere', new Uint8Array([1, 2]), rules)
        expect(outcome.ok).toBe(false)
    })

    it('记录解码轨迹，供界面显示解到了哪一层', () => {
        const outcome = decodeWithRules(root, 'sample.Container', buildNestedContainer({ sealed: false }), rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        expect(outcome.stats.trace.map((t) => t.path)).toEqual([
            'items[0].payload',
            'items[0].payload.content',
        ])
        expect(outcome.stats.trace.every((t) => t.ok)).toBe(true)
    })
})

describe('buildDecodeEvidence', () => {
    /**
     * 证据是拿去和服务端对账的，所以「没解开的那几段」必须是结构化的、带 hex 头的，
     * 而不是界面上那句给人看的 `⟨未解码 …⟩`——对方要凭头几个字节的 tag 认形态。
     */
    it('把未解段导成结构化条目，并带上原始 base64 与版本标记', () => {
        const bytes = buildNestedContainer({ sealed: true })
        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const base64 = btoa(String.fromCharCode(...bytes))
        const json = JSON.parse(
            buildDecodeEvidence({
                messageType: outcome.messageType,
                value: outcome.value,
                stats: outcome.stats,
                base64,
                sizeBytes: bytes.length,
                url: '/demo/text?imAcctId=1',
                direction: 'deliver',
                descriptor: 'sample_desc',
                rules: 'sample@deadbee',
            })
        )

        expect(json.messageType).toBe('sample.Container')
        expect(json.descriptor).toBe('sample_desc')
        expect(json.rules).toBe('sample@deadbee')
        expect(json.raw.base64).toBe(base64)

        expect(json.undecoded).toHaveLength(1)
        expect(json.undecoded[0].path).toBe('items[0].payload.content')
        expect(json.undecoded[0].reason).toContain('sealed=false')

        const content = json.decoded.items[0].payload.content
        expect(content['@undecoded']).toBe(true)
        expect(content.sizeBytes).toBeGreaterThan(0)
        expect(content.hexPreview).toMatch(/^[0-9a-f]{2}( [0-9a-f]{2})*$/)
    })

    it('全部解开时未解段清单为空数组而不是缺键', () => {
        const bytes = buildNestedContainer({ sealed: false })
        const outcome = decodeWithRules(root, 'sample.Container', bytes, rules)
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return

        const json = JSON.parse(
            buildDecodeEvidence({
                messageType: outcome.messageType,
                value: outcome.value,
                stats: outcome.stats,
                base64: btoa(String.fromCharCode(...bytes)),
                sizeBytes: bytes.length,
            })
        )
        expect(json.undecoded).toEqual([])
    })
})

describe('unwrapBase64Layer', () => {
    it('剥掉多包的一层 base64', () => {
        const inner = encode('sample.TextLeaf', { text: 'wrapped' })
        const base64Text = btoa(String.fromCharCode(...inner))
        const outer = new Uint8Array([...base64Text].map((c) => c.charCodeAt(0)))

        const result = unwrapBase64Layer(outer)
        expect(result.unwrapped).toBe(true)
        expect(Array.from(result.bytes)).toEqual(Array.from(inner))
    })

    it('裸 protobuf 字节不会被误判', () => {
        const raw = encode('sample.Carrier', { kind: 1, sealed: false, content: new Uint8Array([1, 2, 3]) })
        expect(unwrapBase64Layer(raw).unwrapped).toBe(false)
    })

    it('太短的输入不处理', () => {
        expect(unwrapBase64Layer(new Uint8Array([65, 66, 67, 68])).unwrapped).toBe(false)
    })
})

describe('extractPath', () => {
    it('去掉 query 与 hash', () => {
        expect(extractPath('/demo/text?a=1&b=2')).toBe('/demo/text')
    })

    it('处理绝对 URL', () => {
        expect(extractPath('https://example.invalid/demo/text?x=1')).toBe('/demo/text')
    })

    it('空输入返回 null', () => {
        expect(extractPath('')).toBeNull()
    })
})

describe('lookupTypeForUrl', () => {
    it('带 query 的 URL 也能命中', () => {
        expect(lookupTypeForUrl(rules, '/demo/text?imAcctId=1', 'deliver')).toBe('sample.Carrier')
    })

    it('方向不匹配时返回 null', () => {
        expect(lookupTypeForUrl(rules, '/demo/text', 'req')).toBeNull()
    })
})
