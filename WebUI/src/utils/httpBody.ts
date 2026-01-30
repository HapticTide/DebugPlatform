export type BodyDisplayKind = 'empty' | 'text' | 'binary'

export interface BodyDisplayResult {
  kind: BodyDisplayKind
  size: number
  contentType: string | null
  contentEncoding: string | null
  text?: string
  truncated?: boolean
  warning?: string
}

const DEFAULT_PREVIEW_BYTES = 1024 * 1024
const DEFAULT_SNIFF_BYTES = 4096
const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024

function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

function isZlibBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false
  const first = bytes[0]
  const second = bytes[1]
  if (first !== 0x78) return false
  return second === 0x01 || second === 0x9c || second === 0xda
}

/**
 * 检测字节序列是否可能是 Brotli 压缩数据
 * Brotli 没有固定的 magic bytes，但可以通过以下特征进行启发式检测：
 * 1. 第一个字节的高 4 位表示窗口大小
 * 2. 有效的窗口大小范围是 10-24 (即 1KB - 16MB)
 * 3. 某些字节组合在未压缩文本中极不可能出现
 */
function isBrotliBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false

  // Brotli 流的第一个字节包含 WBITS 信息
  // 格式: WBITS = (first_byte >> 1) & 0x7F
  // 有效范围: 10-24 (对应 1KB-16MB 窗口)
  const wbits = (bytes[0] >> 1) & 0x7f

  // 检查窗口大小是否在有效范围内
  // 注意: 实际 Brotli 流可能使用更复杂的编码
  if (wbits >= 10 && wbits <= 24) {
    // 额外检查: 如果前几个字节看起来像明文，则可能不是压缩数据
    // 检查是否以常见的 ASCII 文本模式开头
    const isAsciiStart = bytes.slice(0, Math.min(4, bytes.length))
      .every(b => (b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13)

    if (isAsciiStart) {
      return false
    }

    return true
  }

  // 备选检测: 检查是否有 Brotli 常见的字节模式
  // Brotli 空流或极短内容的特征
  if (bytes[0] === 0x1b || bytes[0] === 0x0b || bytes[0] === 0x81) {
    return true
  }

  return false
}

function shouldAttemptDecompress(encoding: string, sniffBytes: Uint8Array, sniffText: boolean): boolean {
  if (!sniffText) return true
  switch (encoding) {
    case 'gzip':
      return isGzipBytes(sniffBytes)
    case 'deflate':
      return isZlibBytes(sniffBytes)
    case 'br':
      return isBrotliBytes(sniffBytes)
    default:
      return true
  }
}

const TEXT_MIME_HINTS = [
  'application/json',
  'application/ld+json',
  'application/problem+json',
  'application/vnd.api+json',
  'application/xml',
  'application/problem+xml',
  'application/xhtml+xml',
  'application/javascript',
  'application/x-javascript',
  'application/graphql',
  'application/x-www-form-urlencoded',
  'image/svg+xml',
]

const BINARY_MIME_HINTS = [
  // 通用二进制格式
  'application/octet-stream',

  // 压缩/归档格式
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-gzip',
  'application/x-tar',
  'application/x-bzip2',
  'application/x-7z-compressed',
  'application/x-rar-compressed',

  // 文档格式
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // 字体格式
  'application/vnd.ms-fontobject',
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-otf',

  // 序列化/RPC 协议
  'application/protobuf',
  'application/x-protobuf',
  'application/vnd.google.protobuf',
  'application/grpc',
  'application/grpc+proto',
  'application/grpc-web+proto',
  'application/msgpack',
  'application/x-msgpack',
  'application/vnd.msgpack',
  'application/cbor',
  'application/thrift',
  'application/x-thrift',
  'application/avro',
  'application/flatbuffers',

  // 数据库/存储格式
  'application/x-sqlite3',
  'application/vnd.sqlite3',

  // 其他二进制格式
  'application/wasm',
  'application/x-shockwave-flash',
  'application/java-archive',
  'application/x-java-archive',
]

export function getHeaderValue(
  headers: Record<string, string> | null | undefined,
  name: string
): string | null {
  if (!headers) return null
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value
  }
  return null
}

export function parseContentType(contentType: string | null | undefined): {
  mimeType: string | null
  charset: string | null
} {
  if (!contentType) return { mimeType: null, charset: null }
  const [typePart, ...params] = contentType.split(';')
  const mimeType = typePart.trim().toLowerCase()
  let charset: string | null = null
  for (const param of params) {
    const [key, value] = param.split('=').map((v) => v.trim())
    if (key && value && key.toLowerCase() === 'charset') {
      charset = value.replace(/^"|"$/g, '').toLowerCase()
      break
    }
  }
  return { mimeType, charset }
}

export function isTextContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const { mimeType } = parseContentType(contentType)
  if (!mimeType) return false
  if (mimeType.startsWith('text/')) return true
  if (mimeType.endsWith('+json') || mimeType.endsWith('+xml')) return true
  return TEXT_MIME_HINTS.includes(mimeType)
}

export function isBinaryContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const { mimeType } = parseContentType(contentType)
  if (!mimeType) return false
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') return true
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return true
  return BINARY_MIME_HINTS.includes(mimeType)
}

export function base64ByteLength(base64: string): number {
  const trimmed = base64.trim()
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

export function decodeBase64ToBytes(base64: string, maxBytes?: number): Uint8Array {
  let slice = base64
  if (maxBytes !== undefined) {
    const maxChars = Math.ceil(maxBytes / 3) * 4
    slice = base64.slice(0, maxChars)
  }
  const binaryString = atob(slice)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export function decodeBytesToText(bytes: Uint8Array, charset: string | null): string {
  const normalized = charset || 'utf-8'
  try {
    return new TextDecoder(normalized).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/**
 * 检测字节序列是否可能是文本内容
 * 使用多重验证策略：
 * 1. 检查是否包含 NUL 字节（二进制特征）
 * 2. 验证 UTF-8 多字节序列的有效性
 * 3. 统计可打印字符与控制字符的比例
 */
export function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true

  let printable = 0
  let control = 0
  let invalidUtf8 = 0
  let i = 0

  while (i < bytes.length) {
    const byte = bytes[i]

    // NUL 字节是二进制文件的强特征
    if (byte === 0) {
      return false
    }

    // 常见的文本控制字符（换行、回车、制表符）
    if (byte === 9 || byte === 10 || byte === 13) {
      printable++
      i++
      continue
    }

    // ASCII 可打印字符范围
    if (byte >= 32 && byte <= 126) {
      printable++
      i++
      continue
    }

    // 验证 UTF-8 多字节序列
    if (byte >= 128) {
      const seqResult = validateUtf8Sequence(bytes, i)
      if (seqResult.valid) {
        printable += seqResult.length // UTF-8 序列视为可打印
        i += seqResult.length
      } else {
        // 无效的 UTF-8 序列
        invalidUtf8++
        i++
      }
      continue
    }

    // 其他控制字符
    control++
    i++
  }

  // 如果有过多无效的 UTF-8 序列，可能是二进制
  if (invalidUtf8 > bytes.length * 0.05) {
    return false
  }

  // 控制字符比例过高则判定为二进制
  return control / bytes.length < 0.1 && printable / bytes.length > 0.7
}

/**
 * 验证从指定位置开始的 UTF-8 多字节序列
 * 返回序列是否有效及其长度
 */
function validateUtf8Sequence(
  bytes: Uint8Array,
  start: number
): { valid: boolean; length: number } {
  const first = bytes[start]

  // 2 字节序列: 110xxxxx 10xxxxxx
  if ((first & 0xe0) === 0xc0) {
    if (start + 1 >= bytes.length) return { valid: false, length: 1 }
    if ((bytes[start + 1] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    // 检查是否为过长编码 (< 0x80 应使用单字节)
    if ((first & 0x1e) === 0) return { valid: false, length: 1 }
    return { valid: true, length: 2 }
  }

  // 3 字节序列: 1110xxxx 10xxxxxx 10xxxxxx
  if ((first & 0xf0) === 0xe0) {
    if (start + 2 >= bytes.length) return { valid: false, length: 1 }
    if ((bytes[start + 1] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    if ((bytes[start + 2] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    // 检查过长编码和代理对范围
    const codePoint =
      ((first & 0x0f) << 12) |
      ((bytes[start + 1] & 0x3f) << 6) |
      (bytes[start + 2] & 0x3f)
    if (codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return { valid: false, length: 1 }
    }
    return { valid: true, length: 3 }
  }

  // 4 字节序列: 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
  if ((first & 0xf8) === 0xf0) {
    if (start + 3 >= bytes.length) return { valid: false, length: 1 }
    if ((bytes[start + 1] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    if ((bytes[start + 2] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    if ((bytes[start + 3] & 0xc0) !== 0x80) return { valid: false, length: 1 }
    // 检查过长编码和有效范围 (0x10000 - 0x10FFFF)
    const codePoint =
      ((first & 0x07) << 18) |
      ((bytes[start + 1] & 0x3f) << 12) |
      ((bytes[start + 2] & 0x3f) << 6) |
      (bytes[start + 3] & 0x3f)
    if (codePoint < 0x10000 || codePoint > 0x10ffff) {
      return { valid: false, length: 1 }
    }
    return { valid: true, length: 4 }
  }

  // 无效的起始字节 (10xxxxxx 或 11111xxx)
  return { valid: false, length: 1 }
}

export function parseContentDispositionFilename(value: string | null | undefined): string | null {
  if (!value) return null
  const starMatch = value.match(/filename\*=([^']*)''([^;]+)/i)
  if (starMatch && starMatch[2]) {
    try {
      return decodeURIComponent(starMatch[2])
    } catch {
      return starMatch[2]
    }
  }
  const match = value.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? null
}

function getEncodings(contentEncoding: string | null): string[] {
  if (!contentEncoding) return []
  return contentEncoding
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && part !== 'identity')
}

async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false

  while (true) {
    const result = await reader.read()
    if (result.done) break
    const chunk = result.value
    total += chunk.length
    if (total > maxBytes) {
      const allowed = maxBytes - (total - chunk.length)
      if (allowed > 0) {
        chunks.push(chunk.slice(0, allowed))
      }
      truncated = true
      try {
        await reader.cancel()
      } catch {
        // ignore
      }
      break
    }
    chunks.push(chunk)
  }

  const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return { bytes: merged, truncated }
}

/**
 * 解压错误类型
 */
interface DecompressError extends Error {
  encoding: string
  originalSize: number
  decompressedSoFar: number
  cause?: unknown
}

/**
 * 创建详细的解压错误
 */
function createDecompressError(
  message: string,
  encoding: string,
  originalSize: number,
  decompressedSoFar: number,
  cause?: unknown
): DecompressError {
  const error = new Error(message) as DecompressError
  error.name = 'DecompressError'
  error.encoding = encoding
  error.originalSize = originalSize
  error.decompressedSoFar = decompressedSoFar
  if (cause) {
    error.cause = cause
  }
  return error
}

/**
 * 解压字节数据
 * 支持多层压缩（如 gzip + br）
 * @throws {DecompressError} 解压失败时抛出详细错误信息
 */
async function decompressBytes(
  bytes: Uint8Array,
  encodings: string[],
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: unknown }).DecompressionStream
  if (!DecompressionStreamCtor) {
    throw createDecompressError(
      '当前浏览器不支持 DecompressionStream API',
      encodings.join(', '),
      bytes.length,
      0
    )
  }

  const supportedEncodings = ['gzip', 'br', 'deflate']
  let current = bytes
  let truncated = false

  for (let i = encodings.length - 1; i >= 0; i--) {
    const encoding = encodings[i]

    if (!supportedEncodings.includes(encoding)) {
      throw createDecompressError(
        `不支持的压缩编码: ${encoding}`,
        encoding,
        current.length,
        0
      )
    }

    try {
      const decompressor = new (DecompressionStreamCtor as any)(encoding) as TransformStream<
        Uint8Array,
        Uint8Array
      >
      const stream = new Blob([current]).stream().pipeThrough(decompressor) as ReadableStream<Uint8Array>
      const result = await readStreamWithLimit(stream, maxBytes)

      // 检查解压结果是否有效
      if (result.bytes.length === 0 && current.length > 0) {
        throw createDecompressError(
          `${encoding} 解压后数据为空，可能是数据损坏或编码不匹配`,
          encoding,
          current.length,
          0
        )
      }

      current = result.bytes
      truncated = truncated || result.truncated
    } catch (error) {
      // 重新包装错误，添加更多上下文
      if ((error as DecompressError).name === 'DecompressError') {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      throw createDecompressError(
        `${encoding} 解压失败: ${errorMessage}`,
        encoding,
        current.length,
        0,
        error
      )
    }
  }

  return { bytes: current, truncated }
}

export async function decodeBodyForDisplay(
  base64: string | null | undefined,
  headers?: Record<string, string> | null,
  options?: {
    contentType?: string | null
    maxPreviewBytes?: number
  }
): Promise<BodyDisplayResult> {
  const contentType = options?.contentType ?? getHeaderValue(headers, 'content-type')
  const contentEncoding = getHeaderValue(headers, 'content-encoding')
  const sizeFromHeaderRaw = getHeaderValue(headers, 'content-length')
  const parsedSize = sizeFromHeaderRaw ? parseInt(sizeFromHeaderRaw, 10) : NaN
  const size = Number.isFinite(parsedSize) ? parsedSize : base64 ? base64ByteLength(base64) : 0
  const maxPreviewBytes = options?.maxPreviewBytes ?? DEFAULT_PREVIEW_BYTES

  if (!base64) {
    return {
      kind: 'empty',
      size: size || 0,
      contentType,
      contentEncoding,
    }
  }

  const textByType = isTextContentType(contentType)
  const binaryByType = isBinaryContentType(contentType)

  const sniffBytes = decodeBase64ToBytes(base64, Math.min(DEFAULT_SNIFF_BYTES, maxPreviewBytes))
  const sniffText = isProbablyText(sniffBytes)

  if (binaryByType && !textByType && !sniffText) {
    return {
      kind: 'binary',
      size,
      contentType,
      contentEncoding,
    }
  }

  if (textByType && !sniffText) {
    return {
      kind: 'binary',
      size,
      contentType,
      contentEncoding,
      warning: 'Content-Type 标记为文本，但内容看起来是二进制',
    }
  }

  const isTextLike = textByType || sniffText

  if (!isTextLike) {
    return {
      kind: 'binary',
      size,
      contentType,
      contentEncoding,
      warning: '内容类型未知，按二进制处理',
    }
  }

  let bytes = decodeBase64ToBytes(base64, maxPreviewBytes)
  let truncated = size > bytes.length
  let warning: string | undefined
  if (binaryByType && !textByType && sniffText) {
    warning = '内容类型标记为二进制，但内容像文本，已按文本展示'
  }

  const encodings = getEncodings(contentEncoding)
  if (encodings.length > 0) {
    if (size > MAX_COMPRESSED_BYTES) {
      return {
        kind: 'binary',
        size,
        contentType,
        contentEncoding,
        warning: '压缩内容过大，已跳过解压，请下载查看',
      }
    }
    const outerEncoding = encodings[encodings.length - 1]
    if (!shouldAttemptDecompress(outerEncoding, sniffBytes, sniffText)) {
      // 头部标记压缩，但内容看起来是明文，直接展示完整预览
      const { charset } = parseContentType(contentType)
      const previewBytes = decodeBase64ToBytes(base64, maxPreviewBytes)
      const previewTruncated = size > previewBytes.length
      const previewText = decodeBytesToText(previewBytes, charset)
      const warning = previewTruncated
        ? `内容过大，仅显示前 ${Math.round(previewBytes.length / 1024)} KB`
        : undefined
      return {
        kind: 'text',
        size,
        contentType,
        contentEncoding,
        text: previewText,
        truncated: previewTruncated,
        warning,
      }
    }
    try {
      bytes = decodeBase64ToBytes(base64)
      truncated = false
      const result = await decompressBytes(bytes, encodings, maxPreviewBytes)
      bytes = result.bytes
      truncated = truncated || result.truncated
    } catch (error) {
      if (sniffText) {
        const { charset } = parseContentType(contentType)
        const fallbackText = decodeBytesToText(bytes, charset)
        return {
          kind: 'text',
          size,
          contentType,
          contentEncoding,
          text: fallbackText,
          warning: '响应体标记为压缩，但解压失败，已按原始文本展示',
        }
      }
      return {
        kind: 'binary',
        size,
        contentType,
        contentEncoding,
        warning: '响应体已压缩，当前环境无法解压，请下载查看',
      }
    }
  }

  const { charset } = parseContentType(contentType)
  const text = decodeBytesToText(bytes, charset)

  if (truncated) {
    const truncationMessage = `内容过大，仅显示前 ${Math.round(bytes.length / 1024)} KB`
    warning = warning ? `${warning}；${truncationMessage}` : truncationMessage
  }

  return {
    kind: 'text',
    size,
    contentType,
    contentEncoding,
    text,
    truncated,
    warning,
  }
}

export function summarizeBodyForDiff(
  base64: string | null | undefined,
  headers?: Record<string, string> | null
): string | null {
  if (!base64) return null
  const contentType = getHeaderValue(headers, 'content-type')
  const contentEncoding = getHeaderValue(headers, 'content-encoding')
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    return `<<压缩内容，编码: ${contentEncoding}>>`
  }
  if (isBinaryContentType(contentType)) {
    const size = base64ByteLength(base64)
    return `<<二进制内容: ${contentType ?? 'unknown'} (${size} bytes)>>`
  }
  if (!isTextContentType(contentType)) {
    const sniffBytes = decodeBase64ToBytes(base64, DEFAULT_SNIFF_BYTES)
    if (!isProbablyText(sniffBytes)) {
      const size = base64ByteLength(base64)
      return `<<二进制内容: ${contentType ?? 'unknown'} (${size} bytes)>>`
    }
  }
  try {
    return decodeBytesToText(decodeBase64ToBytes(base64), parseContentType(contentType).charset)
  } catch {
    return `<<无法解析的内容: ${contentType ?? 'unknown'}>>`
  }
}
