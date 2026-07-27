import type { ToolItem } from '../types/toolbox'
import type { ToolCapability } from './types'

export interface CapabilityMeta {
  key: ToolCapability
  title: string
  desc: string
  meta?: string
}

/** 根据工具返回可用能力列表（不含图标，图标在 UI 层补） */
export function getToolCapabilities(tool?: ToolItem): CapabilityMeta[] {
  if (!tool) return []

  const items: CapabilityMeta[] = [
    {
      key: 'skills',
      title: '技能管理',
      desc: '查看、启停与跨工具同步',
      meta: `${tool.skills.length} 个`,
    },
    {
      key: 'editor',
      title: '配置编辑',
      desc: '编辑本机配置文件',
      meta: `${tool.configFiles.length} 个文件`,
    },
  ]

  if (tool.id === 'claude') {
    items.push({
      key: 'sync',
      title: '配置同步',
      desc: 'Claude 配置对比与同步',
    })
  }

  if (tool.id === 'opencode') {
    items.push({
      key: 'models',
      title: '模型同步',
      desc: '同步 Modelverse 模型列表',
    })
  }

  return items
}
