/**
 * 统一错误消息提取
 * 从 unknown 类型的 catch error 中安全提取可读消息
 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (/does not support image input/i.test(message)) {
    return '该模型不支持图片输入，请更换支持视觉能力的模型'
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
