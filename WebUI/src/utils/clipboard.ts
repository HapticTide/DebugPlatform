/**
 * 复制文本到剪贴板
 * 优先使用 Clipboard API，在非 HTTPS 环境下使用 execCommand fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 优先使用现代 Clipboard API（需要 HTTPS 或 localhost）
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn('Clipboard API failed, falling back to execCommand:', err)
    }
  }

  // Fallback: 使用 execCommand（已废弃但兼容性好）
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    const success = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (success) {
      return true
    }
  } catch (err) {
    console.error('execCommand fallback failed:', err)
  }

  console.error('Unable to copy to clipboard')
  return false
}
