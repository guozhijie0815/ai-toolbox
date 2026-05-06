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
  description?: string
  badge?: string
  configFiles: ConfigFileItem[]
  skills: SkillItem[]
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
}
