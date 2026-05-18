import { invoke } from '@tauri-apps/api/core'

import type {
  BackupItem,
  BaselineKind,
  ClaudeConfigDiffResult,
  ClaudeConfigSyncResult,
  ConfigFileItem,
  ConflictStrategy,
  PresetEntry,
  SkillDetailPayload,
  SkillInsightEntry,
  SkillItem,
  SnapshotMeta,
  SyncMode,
  ToolRegistryConfigFile,
  ToolRegistryEntry,
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
      { id: 'find-skills', name: 'find-skills' },
      { id: 'show-dont-tell', name: 'show-dont-tell' },
      { id: 'de-gpt-ify', name: 'de-gpt-ify' },
      { id: 'zdm-create-skill', name: 'zdm-create-skill' },
      { id: 'zdm-feishu', name: 'zdm-feishu' },
      { id: 'zdm-loki', name: 'zdm-loki' },
      { id: 'zdm-dot', name: 'zdm-dot' },
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

const readNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }

  return undefined
}

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
  const name =
    readString(record.name, record.label, record.id, record.skill_name, record.skillName) ?? id

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

  const name =
    readString(record.name, record.file_name, record.fileName) ?? path.split('/').pop() ?? path

  return {
    id: readString(record.id, path) ?? path,
    name,
    path,
    language: readString(record.language, record.lang) ?? languageFromPath(path),
  }
}

const normalizeRegistryConfigFile = (value: unknown): ToolRegistryConfigFile | null => {
  const record = asRecord(value)
  const path = readString(record.path, record.file, record.filePath, record.file_path)
  const label = readString(record.label, record.name, record.fileName, record.file_name)
  const kind =
    readString(record.kind, record.language, record.lang) ??
    (path ? languageFromPath(path) : 'plaintext')

  if (!path || !label) return null

  return {
    label,
    path,
    kind,
    exists: Boolean(record.exists),
  }
}

const normalizeTool = (value: unknown): ToolItem | null => {
  const record = asRecord(value)
  const name = readString(record.name, record.label, record.tool_name, record.toolName, record.id)

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
    skillDir: readString(record.skillDir, record.skill_dir, record.skillsDir, record.skills_dir),
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

  return uniqById(list.map(normalizeTool).filter((item): item is ToolItem => Boolean(item)))
}

const normalizeToolRegistryEntry = (value: unknown): ToolRegistryEntry | null => {
  const record = asRecord(value)
  const id = readString(record.id)
  const name = readString(record.name)
  if (!id || !name) return null

  const configFiles = readArray(record.configFiles ?? record.config_files)
    .map(normalizeRegistryConfigFile)
    .filter((item): item is ToolRegistryConfigFile => item !== null)

  return {
    id,
    name,
    enabled: Boolean(record.enabled ?? true),
    configFiles,
    skillDir: readString(record.skillDir, record.skill_dir),
  }
}

const readContentResponse = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  const record = asRecord(value)

  return readString(record.content, record.text, record.value, record.data) ?? ''
}

const readMessageResponse = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim()) {
    return value
  }

  const record = asRecord(value)

  return readString(record.message, record.msg, record.status, record.result) ?? fallback
}

const normalizeSkillInsightsResponse = (value: unknown): SkillInsightEntry[] => {
  const list = Array.isArray(value)
    ? value
    : readArray(asRecord(value).data ?? asRecord(value).items)

  return list
    .map((item) => {
      const record = asRecord(item)
      const laggingTools = readArray(record.laggingTools ?? record.lagging_tools)
        .map((lag) => {
          const lagRecord = asRecord(lag)
          const diffs = readArray(lagRecord.diffs ?? lagRecord.diff)
            .map((diffItem) => {
              const diffRecord = asRecord(diffItem)
              return {
                fileName: readString(diffRecord.fileName, diffRecord.file_name) ?? '',
                diffType: (readString(diffRecord.diffType, diffRecord.diff_type) ?? 'modified') as
                  | 'added'
                  | 'modified'
                  | 'deleted',
              }
            })
            .filter((diff) => diff.fileName)

          return {
            toolId: readString(lagRecord.toolId, lagRecord.tool_id) ?? '',
            toolName: readString(lagRecord.toolName, lagRecord.tool_name) ?? '',
            behindSeconds: readNumber(lagRecord.behindSeconds, lagRecord.behind_seconds) ?? 0,
            diffs,
          }
        })
        .filter((lag) => lag.toolId)

      return {
        skillName: readString(record.skillName, record.skill_name) ?? '',
        leaderToolId: readString(record.leaderToolId, record.leader_tool_id) ?? '',
        leaderToolName: readString(record.leaderToolName, record.leader_tool_name) ?? '',
        leaderUpdatedAt: readNumber(record.leaderUpdatedAt, record.leader_updated_at) ?? 0,
        laggingTools,
      }
    })
    .filter((insight) => insight.skillName && insight.leaderToolId)
}

export const listTools = async () => {
  if (!hasTauriRuntime()) {
    return mockTools
  }

  const response = await invoke<unknown>('list_tools')
  const tools = normalizeToolsResponse(response)

  return tools.length > 0 ? tools : mockTools
}

export const getSkillInsights = async () => {
  if (!hasTauriRuntime()) {
    return []
  }

  const response = await invoke<unknown>('get_skill_insights')
  return normalizeSkillInsightsResponse(response)
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

export const saveConfigFile = async (_tool: ToolItem, file: ConfigFileItem, content: string) => {
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
  const list = Array.isArray(value)
    ? value
    : readArray(asRecord(value).items ?? asRecord(value).data)

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

export const listToolRegistry = async () => {
  if (!hasTauriRuntime()) {
    return mockTools.map<ToolRegistryEntry>((tool) => ({
      id: tool.id,
      name: tool.name,
      enabled: true,
      configFiles: tool.configFiles.map((item) => ({
        label: item.name,
        path: item.path,
        kind: item.language,
        exists: true,
      })),
      skillDir:
        tool.id === 'codex' ? '~/.agents/skills' : tool.path ? `${tool.path}/skills` : undefined,
    }))
  }

  const response = await invoke<unknown>('list_tool_registry')
  const list = Array.isArray(response)
    ? response
    : readArray(asRecord(response).items ?? asRecord(response).data)
  return list
    .map(normalizeToolRegistryEntry)
    .filter((item): item is ToolRegistryEntry => item !== null)
}

export const upsertToolRegistryItem = async (payload: {
  id: string
  name: string
  enabled: boolean
  configFiles: ToolRegistryConfigFile[]
  skillDir?: string
}) => {
  const response = await invoke<unknown>('upsert_tool_registry_item', {
    request: {
      id: payload.id,
      name: payload.name,
      enabled: payload.enabled,
      configFiles: payload.configFiles.map((item) => ({
        label: item.label,
        path: item.path,
        kind: item.kind,
      })),
      skillDir: payload.skillDir,
    },
  })

  const entry = normalizeToolRegistryEntry(response)
  if (!entry) {
    throw new Error('保存工具失败：响应格式错误')
  }
  return entry
}

export const deleteToolRegistryItem = async (id: string) => {
  const response = await invoke<unknown>('delete_tool_registry_item', {
    request: { id },
  })
  return readMessageResponse(response, '工具已删除')
}

export const detectToolPaths = async (params: { id?: string; name?: string }) => {
  if (!hasTauriRuntime()) {
    return {
      configFiles: [] as ToolRegistryConfigFile[],
      skillDir: undefined as string | undefined,
    }
  }

  const response = await invoke<unknown>('detect_tool_paths', {
    request: {
      id: params.id,
      name: params.name,
    },
  })
  const record = asRecord(response)
  const configFiles = readArray(record.configFiles ?? record.config_files)
    .map(normalizeRegistryConfigFile)
    .filter((item): item is ToolRegistryConfigFile => item !== null)
  return {
    configFiles,
    skillDir: readString(record.skillDir, record.skill_dir),
  }
}

export async function toggleSkillEnabled(request: {
  toolId: string
  skillName: string
  enabled: boolean
}): Promise<void> {
  return invoke('toggle_skill_enabled', { request })
}

// ============================================================================
// Center skill types and commands
// ============================================================================

export interface DiscoveredSource {
  toolId: string
  toolName: string
  path: string
}

export interface DiscoveredSkill {
  name: string
  description?: string
  sources: DiscoveredSource[]
}

export interface ImportOutcome {
  skillName: string
  status: string
  message: string
}

export async function discoverCenterSkills(): Promise<DiscoveredSkill[]> {
  return invoke('discover_center_skills')
}

export async function batchImportToCenter(
  skills: { skillName: string; sourceToolId: string }[],
): Promise<ImportOutcome[]> {
  return invoke('batch_import_to_center', { request: skills })
}

export async function setSkillCategory(skillName: string, category: string): Promise<void> {
  return invoke('set_skill_category', { skillName, category })
}

export interface ToolSyncStatus {
  toolId: string
  toolName: string
  synced: boolean
  path?: string
  lastSyncedAt?: number
}

export interface CenterSkillInfo {
  name: string
  path: string
  description?: string
  sourceType: string
  updatedAt?: number
  hasSkillMd: boolean
  syncStatuses: ToolSyncStatus[]
}

export interface SyncOutcome {
  skillName: string
  targetToolId: string
  targetPath: string
  status: string
  message: string
}

export async function batchSyncFromCenter(
  skillNames: string[],
  targetToolId: string,
  mode: string,
  conflictPolicy: string,
): Promise<SyncOutcome[]> {
  return invoke('batch_sync_from_center', {
    skillNames,
    targetToolId,
    mode,
    conflictPolicy,
  })
}

export async function listCenterSkills(): Promise<CenterSkillInfo[]> {
  return invoke('list_center_skills')
}

export async function deleteCenterSkill(skillName: string): Promise<void> {
  return invoke('delete_center_skill_command', { skillName })
}

export async function syncFromCenter(
  skillName: string,
  targetToolId: string,
  mode: string,
  conflictPolicy: string,
): Promise<SyncOutcome> {
  return invoke('sync_from_center', {
    skillName,
    targetToolId,
    mode,
    conflictPolicy,
  })
}

export async function importToCenter(skillName: string, sourceToolId: string): Promise<string> {
  return invoke('import_to_center', { skillName, sourceToolId })
}

export async function installSkillFromGitToCenter(
  gitUrl: string,
  skillName?: string,
): Promise<string> {
  return invoke('install_skill_from_git_to_git', { gitUrl, skillName })
}

export async function getSkillDetail(
  toolId: string,
  skillName: string,
): Promise<SkillDetailPayload> {
  return invoke('get_skill_detail', { toolId, skillName })
}

// ============================================================================
// Preset
// ============================================================================

export async function listPresets(): Promise<PresetEntry[]> {
  return invoke('list_presets_command')
}

export async function savePreset(
  name: string,
  skills: string[],
  id?: string,
): Promise<PresetEntry> {
  return invoke('save_preset_command', {
    request: { id: id || null, name, skills },
  })
}

export async function deletePreset(id: string): Promise<void> {
  return invoke('delete_preset_command', { request: { id } })
}

// ============================================================================
// Claude Code Config Sync
// ============================================================================

export async function getClaudeConfigDiff(
  baseline?: BaselineKind,
): Promise<ClaudeConfigDiffResult> {
  return invoke('get_claude_config_diff', {
    baseline: baseline ?? { kind: 'live' },
  })
}

export async function applyClaudeConfigFullSync(
  baseline?: BaselineKind,
): Promise<ClaudeConfigSyncResult> {
  return invoke('apply_claude_config_full_sync', {
    baseline: baseline ?? { kind: 'live' },
  })
}

export async function listClaudeSettingsSnapshots(): Promise<SnapshotMeta[]> {
  return invoke('list_claude_settings_snapshots')
}

export async function restoreCswitchDbFromBackup(backupPath: string): Promise<void> {
  return invoke('restore_cswitch_db_from_backup', { backupPath })
}

/** 获取当前用户 Home 目录路径 */
export async function getHomeDirPath(): Promise<string> {
  return invoke('get_home_dir_path')
}

// ============================================================================
// Skill tags
// ============================================================================

export async function updateSkillTags(
  toolId: string,
  skillName: string,
  tags: string[],
): Promise<void> {
  return invoke('update_skill_tags', { toolId, skillName, tags })
}

// ============================================================================
// Git backup & version management
// ============================================================================

export interface GitCommitInfo {
  hash: string
  message: string
  author: string
  timestamp: number
}

export async function initCenterGitRepo(): Promise<string> {
  return invoke('init_center_git_repo')
}

export async function commitCenterSnapshot(message: string): Promise<string> {
  return invoke('commit_center_snapshot', { message })
}

export async function getCenterGitHistory(): Promise<GitCommitInfo[]> {
  return invoke('get_center_git_history')
}

export async function restoreCenterSnapshot(hash: string): Promise<string> {
  return invoke('restore_center_snapshot', { hash })
}

// ============================================================================
// Upstream update detection
// ============================================================================

export interface GitSkillUpdateInfo {
  skillName: string
  hasUpdate: boolean
  localHash: string
  remoteHash: string
  lastCheckedAt?: number
}

export async function checkGitSkillUpdates(): Promise<GitSkillUpdateInfo[]> {
  return invoke('check_git_skill_updates')
}

export async function updateGitSkill(skillName: string): Promise<string> {
  return invoke('update_git_skill', { skillName })
}
