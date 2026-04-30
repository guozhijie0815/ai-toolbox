export type ConfigFile = {
  label: string
  path: string
  kind: string
  exists: boolean
}

export type SkillEntry = {
  name: string
  path: string
  hasSkillMd: boolean
  isSymlink: boolean
  linkTarget?: string | null
  updatedAt?: number | null
}

export type ToolEntry = {
  id: string
  name: string
  configFiles: ConfigFile[]
  skillDir?: string | null
  skills: SkillEntry[]
}

export type ConfigPayload = {
  path: string
  content: string
}

export type SyncOutcome = {
  sourceToolId: string
  sourceSkill: string
  targetToolId: string
  targetPath: string
  status: string
  message: string
}
