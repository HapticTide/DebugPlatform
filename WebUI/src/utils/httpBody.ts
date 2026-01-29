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

function shouldAttemptDecompress(encoding: string, sniffBytes: Uint8Array, sniffText: boolean): boolean {
  if (!sniffText) return true
  switch (encoding) {
    case 'gzip':
      return isGzipBytes(sniffBytes)
    case 'deflate':
      return isZlibBytes(sniffBytes)
    case 'br':
      // Brotli 没有明确的 magic bytes，若内容明显是文本则跳过解压
      return false
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
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/pdf',
  'application/vnd.ms-fontobject',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
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

export function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true
  let printable = 0
  let control = 0
  let zero = 0
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]
    if (byte === 0) {
      zero++
      continue
    }
    if (byte === 9 || byte === 10 || byte === 13) {
      printable++
      continue
    }
    if (byte >= 32 && byte <= 126) {
      printable++
    } else if (byte >= 128) {
      printable++
    } else {
      control++
    }
  }
  if (zero > 0) return false
  return control / bytes.length < 0.1 && printable / bytes.length > 0.7
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

async function decompressBytes(
  bytes: Uint8Array,
  encodings: string[],
  maxBytes: number
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: unknown }).DecompressionStream
  if (!DecompressionStreamCtor) {
    throw new Error('DecompressionStream not supported')
  }

  let current = bytes
  let truncated = false
  for (let i = encodings.length - 1; i >= 0; i--) {
    const encoding = encodings[i]
    if (!['gzip', 'br', 'deflate'].includes(encoding)) {
      throw new Error(`Unsupported encoding: ${encoding}`)
    }
    const decompressor = new (DecompressionStreamCtor as any)(encoding) as TransformStream<
      Uint8Array,
      Uint8Array
    >
    const stream = new Blob([current]).stream().pipeThrough(decompressor) as ReadableStream<Uint8Array>
    const result = await readStreamWithLimit(stream, maxBytes)
    current = result.bytes
    truncated = truncated || result.truncated
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
