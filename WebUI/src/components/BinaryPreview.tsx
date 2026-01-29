import { useState } from 'react'
import { formatBytes } from '@/utils/format'
import {
  base64ByteLength,
  decodeBase64ToBytes,
  parseContentType,
} from '@/utils/httpBody'

interface Props {
  base64Data: string
  contentType: string | null
  contentEncoding?: string | null
  size?: number | null
  filename?: string | null
  url?: string | null
  suggestedName?: string | null
  warning?: string
}

export function BinaryPreview({
  base64Data,
  contentType,
  contentEncoding,
  size,
  filename,
  url,
  suggestedName,
  warning,
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false)
  const { mimeType } = parseContentType(contentType)
  const byteSize = size ?? base64ByteLength(base64Data)

  const downloadName = buildDownloadName({
    filename,
    url,
    contentType,
    suggestedName,
  })

  const handleDownload = () => {
    setIsDownloading(true)
    try {
      const bytes = decodeBase64ToBytes(base64Data)
      const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-bg-dark">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-text-primary">二进制内容</div>
          <div className="text-xs text-text-muted mt-1 space-y-0.5">
            <div>类型: <span className="font-mono">{mimeType ?? 'unknown'}</span></div>
            {contentEncoding && (
              <div>编码: <span className="font-mono">{contentEncoding}</span></div>
            )}
            <div>大小: <span className="font-mono">{formatBytes(byteSize)}</span></div>
            {filename && (
              <div>文件名: <span className="font-mono">{filename}</span></div>
            )}
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="px-2 py-1 text-xs bg-bg-light border border-border-subtle rounded hover:bg-bg-lighter transition-colors"
          disabled={isDownloading}
          title="下载文件"
        >
          {isDownloading ? '下载中...' : '下载'}
        </button>
      </div>
      {warning && (
        <div className="mt-2 text-xs text-yellow-400">{warning}</div>
      )}
    </div>
  )
}

function buildDownloadName({
  filename,
  url,
  contentType,
  suggestedName,
}: {
  filename?: string | null
  url?: string | null
  contentType?: string | null
  suggestedName?: string | null
}): string {
  const ext = inferExtension(contentType)
  let name = sanitizeFilename(filename || extractNameFromUrl(url) || suggestedName || `download-${Date.now()}`)
  if (!name) {
    name = `download-${Date.now()}`
  }
  if (!hasExtension(name) && ext) {
    name = `${name}.${ext}`
  }
  if (name.length > 120) {
    const base = name.slice(0, 120)
    name = hasExtension(base) || !ext ? base : `${base}.${ext}`
  }
  return name
}

function extractNameFromUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const segment = url.pathname.split('/').filter(Boolean).pop()
    return segment ? decodeURIComponent(segment) : null
  } catch {
    return null
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
}

function hasExtension(name: string): boolean {
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 && lastDot < name.length - 1
}

function inferExtension(contentType: string | null | undefined): string | null {
  if (!contentType) return null
  const { mimeType } = parseContentType(contentType)
  if (!mimeType) return null
  const map: Record<string, string> = {
    'application/json': 'json',
    'application/ld+json': 'json',
    'application/problem+json': 'json',
    'application/xml': 'xml',
    'application/xhtml+xml': 'html',
    'application/javascript': 'js',
    'application/x-javascript': 'js',
    'application/graphql': 'graphql',
    'application/x-www-form-urlencoded': 'txt',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/css': 'css',
    'text/csv': 'csv',
    'text/xml': 'xml',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/gzip': 'gz',
    'application/octet-stream': 'bin',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico',
    'image/ico': 'ico',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  }
  if (map[mimeType]) return map[mimeType]
  if (mimeType.startsWith('text/')) return 'txt'
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1] || null
  if (mimeType.startsWith('audio/')) return mimeType.split('/')[1] || null
  if (mimeType.startsWith('video/')) return mimeType.split('/')[1] || null
  return null
}
