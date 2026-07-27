import { CopyOutlined, LinkOutlined } from '@ant-design/icons'

export type ThemeMode = 'system' | 'light' | 'dark'

/** 当前工具下的能力页 */
export type ToolCapability = 'skills' | 'editor' | 'sync' | 'models'

export const modeOptions = [
  {
    label: (
      <span className="segmented-label">
        <CopyOutlined />
        copy
      </span>
    ),
    value: 'copy',
  },
  {
    label: (
      <span className="segmented-label">
        <LinkOutlined />
        symlink
      </span>
    ),
    value: 'symlink',
  },
]

export const conflictOptions = [
  { label: '跳过', value: 'skip' },
  { label: '覆盖', value: 'overwrite' },
  { label: '重命名', value: 'rename' },
]
