/** 检测当前是否运行在 Tauri 桌面环境中 */
export const hasTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * 规范化文件系统路径
 * - 将 `~` 替换为实际 home 目录
 * - 移除末尾多余斜杠
 */
export const normalizeFsPath = (homeDir: string, value?: string) =>
  homeDir ? value?.replace(/^~(?=\/)/, homeDir).replace(/\/+$/, '') : value?.replace(/\/+$/, '')

/** 格式化 Unix 时间戳为中文时间字符串 */
export const formatTime = (value?: number) => {
  if (!value) return '未知时间'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

/** 判断事件目标是否为可交互元素（用于窗口拖拽判定） */
export const isInteractiveDragTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(
    target.closest(
      'button,input,textarea,select,[role="button"],[role="tab"],[role="radio"],[role="switch"],.ant-segmented,.ant-select,.monaco-editor',
    ),
  )
