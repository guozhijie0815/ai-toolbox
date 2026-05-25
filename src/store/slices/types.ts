import type { StateCreator } from 'zustand'

import type {
  BaselineKind,
  ClaudeConfigDiffResult,
  ConfigFileItem,
  ConflictStrategy,
  OperationFeedback,
  PresetApplicationStatus,
  PresetEntry,
  SkillDetailPayload,
  SkillInsightEntry,
  SkillUpdateStatus,
  SyncMode,
  ToolItem,
  GitRepoState,
} from '../../types/toolbox'

export interface ToolboxStore {
  tools: ToolItem[]
  selectedToolId?: string
  selectedConfigId?: string
  selectedSkillIds: string[]
  targetToolId?: string
  syncMode: SyncMode
  conflictStrategy: ConflictStrategy
  isToolsLoading: boolean
  isConfigLoading: boolean
  isSaving: boolean
  isSyncing: boolean
  skillInsights: SkillInsightEntry[]
  isInsightsLoading: boolean
  feedback?: OperationFeedback
  claudeConfigDiff: ClaudeConfigDiffResult | null
  claudeConfigBaseline: BaselineKind
  isClaudeConfigLoading: boolean
  isClaudeConfigApplying: boolean

  commandPaletteOpen: boolean
  skillDetailOpen: boolean
  selectedSkillDetail?: SkillDetailPayload
  isSkillDetailLoading: boolean

  initialize: () => Promise<void>
  refreshTools: () => Promise<void>
  refreshInsights: () => Promise<void>
  selectTool: (toolId: string) => Promise<void>
  selectConfigFile: (configId: string) => Promise<void>
  setEditorContent: (content: string) => void
  setSelectedSkillIds: (skillIds: string[]) => void
  setTargetToolId: (toolId: string) => void
  setSyncMode: (mode: SyncMode) => void
  setConflictStrategy: (strategy: ConflictStrategy) => void
  saveCurrentFile: (options?: { silent?: boolean }) => Promise<void>
  runSync: () => Promise<void>
  toggleSkillEnabled: (toolId: string, skillName: string, enabled: boolean) => Promise<void>
  loadClaudeConfigDiff: () => Promise<void>
  setClaudeConfigBaseline: (baseline: BaselineKind) => Promise<void>
  applyClaudeConfigSync: () => Promise<void>
  clearFeedback: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSkillDetailOpen: (open: boolean) => void
  loadSkillDetail: (toolId: string, skillName: string) => Promise<void>

  presets: PresetEntry[]
  isPresetsLoading: boolean
  refreshPresets: () => Promise<void>
  createPreset: (name: string, skills: string[]) => Promise<void>
  updatePreset: (id: string, name: string, skills: string[]) => Promise<void>
  removePreset: (id: string) => Promise<void>
  applyPreset: (presetId: string, targetToolIds: string[]) => Promise<void>
  removePresetFromTools: (presetId: string, targetToolIds: string[]) => Promise<void>
  getPresetStatus: (presetId: string) => PresetApplicationStatus

  allTags: string[]
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void
  updateSkillTags: (toolId: string, skillName: string, tags: string[]) => Promise<void>

  gitRepo: GitRepoState | null
  isGitLoading: boolean
  initGitRepo: () => Promise<void>
  createSnapshot: (message: string) => Promise<void>
  loadGitHistory: () => Promise<void>
  restoreSnapshot: (hash: string) => Promise<void>

  skillUpdates: SkillUpdateStatus[]
  isUpdateCheckLoading: boolean
  checkUpdates: () => Promise<void>
  updateSkill: (skillName: string) => Promise<void>
}

export type ToolboxSliceCreator<T> = StateCreator<ToolboxStore, [], [], T>

export const buildFeedback = (
  tone: OperationFeedback['tone'],
  title: string,
  detail?: string,
): OperationFeedback => ({
  tone,
  title,
  detail,
  timestamp: Date.now(),
})

export const findTool = (tools: ToolItem[], toolId?: string) =>
  tools.find((tool) => tool.id === toolId)

export const findConfig = (tool?: ToolItem, configId?: string) =>
  tool?.configFiles.find((file) => file.id === configId)

export const mergeConfigFile = (
  tools: ToolItem[],
  toolId: string,
  configId: string,
  updater: (file: ConfigFileItem) => ConfigFileItem,
) =>
  tools.map((tool) =>
    tool.id !== toolId
      ? tool
      : {
          ...tool,
          configFiles: tool.configFiles.map((file) =>
            file.id === configId ? updater(file) : file,
          ),
        },
  )

export const resolveSelections = (
  tools: ToolItem[],
  previous: Pick<
    ToolboxStore,
    'selectedToolId' | 'selectedConfigId' | 'targetToolId' | 'selectedSkillIds'
  >,
) => {
  const nextSelectedTool = findTool(tools, previous.selectedToolId) ?? tools[0]
  const nextConfig =
    findConfig(nextSelectedTool, previous.selectedConfigId) ?? nextSelectedTool?.configFiles[0]
  const targetCandidates = tools.filter((tool) => tool.id !== nextSelectedTool?.id)
  const nextTargetTool =
    findTool(targetCandidates, previous.targetToolId) ?? targetCandidates[0] ?? nextSelectedTool
  const validSkillIds = new Set(nextSelectedTool?.skills.map((skill) => skill.id) ?? [])
  const nextSelectedSkills = previous.selectedSkillIds.filter((skillId) =>
    validSkillIds.has(skillId),
  )

  return {
    selectedToolId: nextSelectedTool?.id,
    selectedConfigId: nextConfig?.id,
    targetToolId: nextTargetTool?.id,
    selectedSkillIds: nextSelectedSkills,
  }
}
