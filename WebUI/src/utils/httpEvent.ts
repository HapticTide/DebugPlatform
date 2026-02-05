import type { HTTPErrorInfo } from '@/types'

export function hasStructuredError(error: HTTPErrorInfo | null | undefined, fallback?: string | null): boolean {
  if (error) return true
  return Boolean(fallback)
}

export function isHTTPEventError(
  statusCode: number | null | undefined,
  error: HTTPErrorInfo | null | undefined,
  errorDescription?: string | null
): boolean {
  if (statusCode !== null && statusCode !== undefined && statusCode > 0) {
    if (statusCode >= 400) return true
    return false
  }

  if (error?.category === 'cancelled') return false
  return hasStructuredError(error, errorDescription)
}

export function isNetworkError(
  error: HTTPErrorInfo | null | undefined,
  errorDescription?: string | null
): boolean {
  if (error?.isNetworkError === true) return true
  if (error?.category && error.category !== 'unknown' && error.category !== 'http' && error.category !== 'cancelled') {
    return true
  }
  if (!error && errorDescription) return true
  return false
}

export function formatErrorCategory(category: HTTPErrorInfo['category']): string {
  switch (category) {
    case 'network':
      return '网络异常'
    case 'timeout':
      return '超时'
    case 'cancelled':
      return '已取消'
    case 'dns':
      return 'DNS'
    case 'tls':
      return 'TLS'
    case 'http':
      return 'HTTP'
    case 'unknown':
      return '未知'
    default:
      return '-'
  }
}
