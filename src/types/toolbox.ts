export type SyncMode = 'copy' | 'symlink'

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename'

export type FeedbackTone = 'success' | 'error' | 'info'

export interface SkillItem {
  id: string
  name: string
  description?: string
  fullDescription?: string
  summary?: string
  path?: string
  hasSkillMd?: boolean
  isSymlink?: boolean
  linkTarget?: string
  updatedAt?: number
  tags?: string[]
  enabled?: boolean
}

export interface ConfigFileItem {
  id: string
  name: string
  path: string
  language: string
  content?: string
  originalContent?: string
  loaded?: boolean
  dirty?: boolean
}

export interface ToolItem {
  id: string
  name: string
  path?: string
  skillDir?: string
  description?: string
  badge?: string
  configFiles: ConfigFileItem[]
  skills: SkillItem[]
  isSystem?: boolean
}

export interface OperationFeedback {
  tone: FeedbackTone
  title: string
  detail?: string
  timestamp: number
}

export interface BackupItem {
  path: string
  name: string
  updatedAt?: number
}

export interface ToolRegistryConfigFile {
  label: string
  path: string
  kind: string
  exists?: boolean
}

export interface ToolRegistryEntry {
  id: string
  name: string
  enabled: boolean
  configFiles: ToolRegistryConfigFile[]
  skillDir?: string
  isSystem?: boolean
}

export interface SkillDiff {
  fileName: string
  diffType: 'added' | 'modified' | 'deleted'
}

export interface LaggingToolInfo {
  toolId: string
  toolName: string
  behindSeconds: number
  diffs: SkillDiff[]
}

export interface SkillInsightEntry {
  skillName: string
  leaderToolId: string
  leaderToolName: string
  leaderUpdatedAt: number
  laggingTools: LaggingToolInfo[]
}

// ============================================================================
// Claude Code Config Sync
// ============================================================================

export type ConfigDiffType = 'missing' | 'different' | 'same' | 'onlyInCcSwitch'

export type ValueKind = 'scalar' | 'object' | 'array'

export type BaselineKind =
  | { kind: 'live' }
  | { kind: 'richest' }
  | { kind: 'snapshot'; ts: number }

export interface ConfigDiffEntry {
  field: string
  settingsValue: unknown
  cswitchValue: unknown
  diffType: ConfigDiffType
  valueKind: ValueKind
}

export interface SnapshotMeta {
  ts: number
  path: string
  hash: string
  fieldCount: number
}

export interface ClaudeConfigDiffResult {
  entries: ConfigDiffEntry[]
  baselineKind: BaselineKind
  baselinePath?: string
  cswitchDbPath: string
  cswitchLocked: boolean
  snapshots: SnapshotMeta[]
  settingsPath: string
  needsSync: boolean
  excludedFields: string[]
}

export interface ClaudeConfigSyncResult {
  backupPath: string
  appliedFields: string[]
}

export interface SkillDetailPayload {
  skillName: string
  skillMdContent?: string
  readmeContent?: string
}

export interface PresetSkill {
  skillName: string
}

export interface PresetEntry {
  id: string
  name: string
  icon?: string
  skills: PresetSkill[]
}
