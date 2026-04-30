import { invoke } from '@tauri-apps/api/core'

import type {
  BackupItem,
  ConfigFileItem,
  ConflictStrategy,
  SkillItem,
  SyncMode,
  ToolItem,
} from '../types/toolbox'

type UnknownRecord = Record<string, unknown>

const mockTools: ToolItem[] = [
  {
    id: 'codex',
    name: 'Codex',
    path: '~/.codex',
    description: '面向本地 Agent 的技能与配置目录',
    badge: 'Desktop',
    configFiles: [
      {
        id: 'codex-config',
        name: 'config.toml',
        path: '~/.codex/config.toml',
        language: 'toml',
      },
      {
        id: 'codex-marketplace',
        name: 'marketplace.json',
        path: '~/.codex/plugins/marketplace.json',
        language: 'json',
      },
    ],
    skills: [
      { id: 'frontend-design', name: 'frontend-design' },
      { id: 'skill-creator', name: 'skill-creator' },
      { id: 'openai-docs', name: 'openai-docs' },
    ],
  },
  {
    id: 'claude',
    name: 'Claude',
    path: '~/.claude',
    description: '另一套工具配置目录，用于同步对比',
    badge: 'Bridge',
    configFiles: [
      {
        id: 'claude-settings',
        name: 'settings.json',
        path: '~/.claude/settings.json',
        language: 'json',
      },
    ],
    skills: [
      { id: 'frontend-design', name: 'frontend-design' },
      { id: 'zdm-create-skill', name: 'zdm-create-skill' },
      { id: 'show-dont-tell', name: 'show-dont-tell' },
    ],
  },
]

const mockFileContents: Record<string, string> = {
  '~/.codex/config.toml': [
    '[workspace]',
    'trust_level = "trusted"',
    '',
    '[skills]',
    'auto_sync = false',
  ].join('\n'),
  '~/.codex/plugins/marketplace.json': JSON.stringify(
    {
      plugins: [{ name: 'Browser Use', enabled: true }],
    },
    null,
    2,
  ),
  '~/.claude/settings.json': JSON.stringify(
    {
      syncMode: 'copy',
      conflictStrategy: 'skip',
    },
    null,
    2,
  ),
}

const hasTauriRuntime = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return '__TAURI_INTERNALS__' in window
}

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : {}

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return undefined
}

const readArray = (value: unknown) => (Array.isArray(value) ? value : [])

const uniqById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>()

  items.forEach((item) => {
    map.set(item.id, item)
  })

  return [...map.values()]
}

const languageFromPath = (path: string) => {
  const lowerPath = path.toLowerCase()

  if (lowerPath.endsWith('.json')) {
    return 'json'
  }
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml')) {
    return 'yaml'
  }
  if (lowerPath.endsWith('.toml')) {
    return 'toml'
  }
  if (lowerPath.endsWith('.ini')) {
    return 'ini'
  }
  if (lowerPath.endsWith('.md')) {
    return 'markdown'
  }
  if (lowerPath.endsWith('.sh')) {
    return 'shell'
  }
  if (lowerPath.endsWith('.js') || lowerPath.endsWith('.cjs') || lowerPath.endsWith('.mjs')) {
    return 'javascript'
  }
  if (lowerPath.endsWith('.ts')) {
    return 'typescript'
  }

  return 'plaintext'
}

const normalizeSkill = (value: unknown): SkillItem | null => {
  if (typeof value === 'string') {
    return { id: value, name: value }
  }

  const record = asRecord(value)
  const id =
    readString(record.id, record.name, record.label, record.skill_id, record.skillId) ??
    `skill-${Math.random().toString(36).slice(2, 8)}`
  const name = readString(record.name, record.label, record.id, record.skill_name, record.skillName) ?? id

  if (!name) {
    return null
  }

  return {
    id,
    name,
    description: readString(record.description, record.desc),
    fullDescription: readString(record.fullDescription, record.full_description, record.tooltip),
    summary: readString(record.summary, record.brief, record.excerpt),
    path: readString(record.path),
    hasSkillMd: Boolean(record.hasSkillMd ?? record.has_skill_md),
    isSymlink: Boolean(record.isSymlink ?? record.is_symlink),
    linkTarget: readString(record.linkTarget, record.link_target),
    updatedAt:
      typeof (record.updatedAt ?? record.updated_at) === 'number'
        ? Number(record.updatedAt ?? record.updated_at)
        : undefined,
  }
}

const normalizeConfigFile = (value: unknown): ConfigFileItem | null => {
  if (typeof value === 'string') {
    return {
      id: value,
      name: value.split('/').pop() ?? value,
      path: value,
      language: languageFromPath(value),
    }
  }

  const record = asRecord(value)
  const path = readString(record.path, record.file, record.file_path, record.filePath, record.name)

  if (!path) {
    return null
  }

  const name = readString(record.name, record.file_name, record.fileName) ?? path.split('/').pop() ?? path

  return {
    id: readString(record.id, path) ?? path,
    name,
    path,
    language: readString(record.language, record.lang) ?? languageFromPath(path),
  }
}

const normalizeTool = (value: unknown): ToolItem | null => {
  const record = asRecord(value)
  const name = readString(
    record.name,
    record.label,
    record.tool_name,
    record.toolName,
    record.id,
  )

  if (!name) {
    return null
  }

  const configFiles = readArray(
    record.configFiles ?? record.config_files ?? record.files ?? record.configs,
  )
    .map(normalizeConfigFile)
    .filter((item): item is ConfigFileItem => Boolean(item))

  const skills = readArray(
    record.skills ?? record.availableSkills ?? record.available_skills ?? record.skill_names,
  )
    .map(normalizeSkill)
    .filter((item): item is SkillItem => Boolean(item))

  return {
    id: readString(record.id, record.tool_id, record.toolId, name) ?? name,
    name,
    path: readString(record.path, record.root, record.directory),
    description: readString(record.description, record.desc),
    badge: readString(record.badge, record.kind, record.type),
    configFiles: uniqById(configFiles),
    skills: uniqById(skills),
  }
}

const normalizeToolsResponse = (value: unknown) => {
  const root = asRecord(value)
  const list = Array.isArray(value)
    ? value
    : readArray(root.tools ?? root.data ?? root.items ?? root.result)

  return uniqById(
    list.map(normalizeTool).filter((item): item is ToolItem => Boolean(item)),
  )
}

const readContentResponse = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  const record = asRecord(value)

  return readString(
    record.content,
    record.text,
    record.value,
    record.data,
  ) ?? ''
}

const readMessageResponse = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  const record = asRecord(value)

  return (
    readString(record.message, record.msg, record.status, record.result) ?? fallback
  )
}

export const listTools = async () => {
  if (!hasTauriRuntime()) {
    return mockTools
  }

  const response = await invoke<unknown>('list_tools')
  const tools = normalizeToolsResponse(response)

  return tools.length > 0 ? tools : mockTools
}

export const readConfigFile = async (_tool: ToolItem, file: ConfigFileItem) => {
  if (!hasTauriRuntime()) {
    return mockFileContents[file.path] ?? ''
  }

  const response = await invoke<unknown>('read_config_file', {
    path: file.path,
  })

  return readContentResponse(response)
}

export const saveConfigFile = async (
  _tool: ToolItem,
  file: ConfigFileItem,
  content: string,
) => {
  if (!hasTauriRuntime()) {
    mockFileContents[file.path] = content
    return '已在预览模式更新本地草稿'
  }

  const response = await invoke<unknown>('save_config_file', {
    request: {
      path: file.path,
      content,
    },
  })

  const record = asRecord(response)
  const backupPath = readString(record.backupPath, record.backup_path)

  return backupPath ? `配置已保存，备份已写入 ${backupPath}` : '配置已保存'
}

export const syncSkills = async (params: {
  sourceTool: ToolItem
  targetTools: ToolItem[]
  skills: string[]
  mode: SyncMode
  conflictStrategy: ConflictStrategy
}) => {
  if (!hasTauriRuntime()) {
    return `已模拟同步 ${params.skills.length} 个 skill 到 ${params.targetTools.length} 个目标工具`
  }

  const response = await invoke<unknown>('sync_skills', {
    request: {
      sourceToolId: params.sourceTool.id,
      skillNames: params.skills,
      targetToolIds: params.targetTools.map((tool) => tool.id),
      mode: params.mode,
      conflictPolicy: params.conflictStrategy,
    },
  })

  const items = Array.isArray(response) ? response : []
  const successCount = items.filter((item) => asRecord(item).status === 'success').length

  return successCount > 0
    ? `已完成 ${successCount} 条同步操作，目标工具 ${params.targetTools.length} 个`
    : readMessageResponse(response, '技能同步已完成')
}

const normalizeBackups = (value: unknown): BackupItem[] => {
  const list = Array.isArray(value) ? value : readArray(asRecord(value).items ?? asRecord(value).data)

  return list
    .map((item): BackupItem | null => {
      const record = asRecord(item)
      const path = readString(record.path)
      if (!path) return null
      return {
        path,
        name: readString(record.name) ?? path.split('/').pop() ?? path,
        updatedAt:
          typeof (record.updatedAt ?? record.updated_at) === 'number'
            ? Number(record.updatedAt ?? record.updated_at)
            : undefined,
      }
    })
    .filter((item): item is BackupItem => item !== null)
}

export const listConfigBackups = async (path: string) => {
  if (!hasTauriRuntime()) {
    return [] as BackupItem[]
  }

  const response = await invoke<unknown>('list_config_backups', { path })
  return normalizeBackups(response)
}

export const openPathInFinder = async (path: string) => {
  if (!hasTauriRuntime()) {
    return
  }

  await invoke('open_path_in_finder', { path })
}

export const deleteSkill = async (params: { toolId: string; skillName: string }) => {
  if (!hasTauriRuntime()) {
    return `已在预览模式删除 ${params.skillName}`
  }

  const response = await invoke<unknown>('delete_skill', {
    request: {
      toolId: params.toolId,
      skillName: params.skillName,
    },
  })

  return readMessageResponse(response, `已删除 ${params.skillName}`)
}
