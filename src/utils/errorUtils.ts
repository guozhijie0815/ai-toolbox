/**
 * 统一错误消息提取
 * 从 unknown 类型的 catch error 中安全提取可读消息
 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
