/**
 * body 压缩状态嗅探的回归测试。
 *
 * 这条判断错了不会报错：只会让一段已经解压好的 protobuf / 图片被当成压缩内容，
 * 掉进纯文本路径显示成一屏乱码——看起来像「解码功能坏了」，实际是判断走错了分支。
 */

import { describe, expect, it } from 'vitest'
import { isBodyStillCompressed } from './httpBody'

/** 明文 protobuf：字段 1（length-delimited），内容是一段 ASCII */
const PLAIN_PROTOBUF = new Uint8Array([
    0x0a, 0x11, 0x49, 0x47, 0x30, 0x32, 0x50, 0x34, 0x31, 0x38, 0x56, 0x33,
    0x31, 0x38, 0x4a, 0x55, 0x31, 0x30, 0x30, 0x12, 0x11, 0x49, 0x41, 0x30,
])

const GZIP_BYTES = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00])
const ZLIB_BYTES = new Uint8Array([0x78, 0x9c, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06])

describe('isBodyStillCompressed', () => {
    it('没有 Content-Encoding 时一律视为未压缩', () => {
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, null)).toBe(false)
        expect(isBodyStillCompressed(GZIP_BYTES, null)).toBe(false)
    })

    it('identity 不算压缩', () => {
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, 'identity')).toBe(false)
    })

    it('头写 br 但 body 已是明文 protobuf —— 判为未压缩', () => {
        // 这正是线上那条 pullMessages 的形态：系统网络栈解了 brotli，响应头原样保留
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, 'br')).toBe(false)
    })

    it('头写 gzip 但 body 已解压 —— 判为未压缩', () => {
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, 'gzip')).toBe(false)
    })

    it('确实是 gzip 数据 —— 判为仍压缩', () => {
        expect(isBodyStillCompressed(GZIP_BYTES, 'gzip')).toBe(true)
    })

    it('确实是 deflate 数据 —— 判为仍压缩', () => {
        expect(isBodyStillCompressed(ZLIB_BYTES, 'deflate')).toBe(true)
    })

    it('多层编码只看最外层', () => {
        // gzip, br 表示先 gzip 再 br；最外层是 br，而 body 是明文
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, 'gzip, br')).toBe(false)
        // 最外层是 gzip 且 body 确实是 gzip
        expect(isBodyStillCompressed(GZIP_BYTES, 'br, gzip')).toBe(true)
    })

    it('不认识的编码保守当作仍压缩', () => {
        expect(isBodyStillCompressed(PLAIN_PROTOBUF, 'zstd')).toBe(true)
    })
})
