import { create } from 'zustand'

import {
  applyClaudeConfigFullSync,
  getClaudeConfigDiff,
  getSkillDetail,
  getSkillInsights,
  batchSyncFromCenter,
  deletePreset,
  listPresets,
  listTools,
  readConfigFile,
  saveConfigFile,
  savePreset,
  syncSkills,
  toggleSkillEnabled as toggleSkillEnabledApi,
} from '../lib/toolboxApi'
import type {
  BaselineKind,
  ClaudeConfigDiffResult,
  ConfigFileItem,
  ConflictStrategy,
  OperationFeedback,
  PresetEntry,
  SkillDetailPayload,
  SkillInsightEntry,
  SyncMode,
  ToolItem,
} from '../types/toolbox'

interface ToolboxStore {
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
  removePreset: (id: string) => Promise<void>
  applyPreset: (presetId: string, targetToolIds: string[]) => Promise<void>
}

const buildFeedback = (
  tone: OperationFeedback['tone'],
  title: string,
  detail?: string,
): OperationFeedback => ({
  tone,
  title,
  detail,
  timestamp: Date.now(),
})

const findTool = (tools: ToolItem[], toolId?: string) =>
  tools.find((tool) => tool.id === toolId)

const findConfig = (tool?: ToolItem, configId?: string) =>
  tool?.configFiles.find((file) => file.id === configId)

const mergeConfigFile = (
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

const resolveSelections = (
  tools: ToolItem[],
  previous: Pick<
    ToolboxStore,
    'selectedToolId' | 'selectedConfigId' | 'targetToolId' | 'selectedSkillIds'
  >,
) => {
  const nextSelectedTool =
    findTool(tools, previous.selectedToolId) ?? tools[0]
  const nextConfig =
    findConfig(nextSelectedTool, previous.selectedConfigId) ??
    nextSelectedTool?.configFiles[0]
  const targetCandidates = tools.filter((tool) => tool.id !== nextSelectedTool?.id)
  const nextTargetTool =
    findTool(targetCandidates, previous.targetToolId) ??
    targetCandidates[0] ??
    nextSelectedTool
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

export const useToolboxStore = create<ToolboxStore>((set, get) => ({
  tools: [],
  selectedToolId: undefined,
  selectedConfigId: undefined,
  selectedSkillIds: [],
  targetToolId: undefined,
  syncMode: 'copy',
  conflictStrategy: 'skip',
  isToolsLoading: false,
  isConfigLoading: false,
  isSaving: false,
  isSyncing: false,
  skillInsights: [],
  isInsightsLoading: false,
  feedback: undefined,

  claudeConfigDiff: null,
  claudeConfigBaseline: { kind: 'live' },
  isClaudeConfigLoading: false,
  isClaudeConfigApplying: false,

  commandPaletteOpen: false,
  skillDetailOpen: false,
  selectedSkillDetail: undefined,
  isSkillDetailLoading: false,

  presets: [],
  isPresetsLoading: false,

  initialize: async () => {
    if (get().tools.length > 0) {
      return
    }

    await get().refreshTools()
    await get().refreshInsights()
  },

  refreshTools: async () => {
    set({ isToolsLoading: true })

    try {
      const tools = await listTools()
      const selection = resolveSelections(tools, get())

      set({
        tools,
        ...selection,
      })

      if (selection.selectedToolId && selection.selectedConfigId) {
        await get().selectConfigFile(selection.selectedConfigId)
      }
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '读取工具列表失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isToolsLoading: false })
    }
  },

  refreshInsights: async () => {
    set({ isInsightsLoading: true })
    try {
      const insights = await getSkillInsights()
      set({ skillInsights: insights })
    } catch (error) {
      console.error('刷新变动洞察失败:', error)
    } finally {
      set({ isInsightsLoading: false })
    }
  },

  selectTool: async (toolId) => {
    const tool = findTool(get().tools, toolId)

    if (!tool) {
      return
    }

    const targetCandidates = get().tools.filter((item) => item.id !== toolId)
    const selectedConfigId = tool.configFiles[0]?.id
    const targetToolId =
      get().targetToolId && get().targetToolId !== toolId
        ? get().targetToolId
        : (targetCandidates[0]?.id ?? toolId)

    set({
      selectedToolId: toolId,
      selectedConfigId,
      targetToolId,
      selectedSkillIds: get().selectedSkillIds.filter((skillId) =>
        tool.skills.some((skill) => skill.id === skillId),
      ),
    })

    if (selectedConfigId) {
      await get().selectConfigFile(selectedConfigId)
    }
  },

  selectConfigFile: async (configId) => {
    const { tools, selectedToolId } = get()
    const tool = findTool(tools, selectedToolId)
    const file = findConfig(tool, configId)

    if (!tool || !file) {
      return
    }

    set({ selectedConfigId: configId })

    if (file.loaded) {
      return
    }

    set({ isConfigLoading: true })

    try {
      const content = await readConfigFile(tool, file)

      set((state) => ({
        tools: mergeConfigFile(state.tools, tool.id, file.id, (current) => ({
          ...current,
          content,
          originalContent: content,
          loaded: true,
          dirty: false,
        })),
      }))
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          `读取 ${file.name} 失败`,
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isConfigLoading: false })
    }
  },

  setEditorContent: (content) => {
    const { selectedToolId, selectedConfigId } = get()

    if (!selectedToolId || !selectedConfigId) {
      return
    }

    set((state) => ({
      tools: mergeConfigFile(
        state.tools,
        selectedToolId,
        selectedConfigId,
        (file) => ({
          ...file,
          content,
          loaded: true,
          dirty: content !== (file.originalContent ?? ''),
        }),
      ),
    }))
  },

  setSelectedSkillIds: (selectedSkillIds) => set({ selectedSkillIds }),
  setTargetToolId: (targetToolId) => set({ targetToolId }),
  setSyncMode: (syncMode) => set({ syncMode }),
  setConflictStrategy: (conflictStrategy) => set({ conflictStrategy }),

  saveCurrentFile: async (options) => {
    const state = get()
    const tool = findTool(state.tools, state.selectedToolId)
    const file = findConfig(tool, state.selectedConfigId)

    if (!tool || !file) {
      return
    }

    set({ isSaving: true })

    try {
      const message = await saveConfigFile(tool, file, file.content ?? '')

      set((current) => ({
        tools: mergeConfigFile(current.tools, tool.id, file.id, (config) => ({
          ...config,
          originalContent: config.content ?? '',
          dirty: false,
          loaded: true,
        })),
        feedback: options?.silent
          ? current.feedback
          : buildFeedback('success', '配置已保存', message),
      }))
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          `保存 ${file.name} 失败`,
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isSaving: false })
    }
  },

  runSync: async () => {
    const state = get()
    const sourceTool = findTool(state.tools, state.selectedToolId)
    const targetTool = findTool(state.tools, state.targetToolId)

    if (!sourceTool || !targetTool) {
      set({
        feedback: buildFeedback('error', '缺少源工具或目标工具'),
      })
      return
    }

    if (state.selectedSkillIds.length === 0) {
      set({
        feedback: buildFeedback('info', '至少选择一个 skill'),
      })
      return
    }

    set({ isSyncing: true })

      try {
      const message = await syncSkills({
        sourceTool,
        targetTools: [targetTool],
        skills: state.selectedSkillIds,
        mode: state.syncMode,
        conflictStrategy: state.conflictStrategy,
      })

      set({
        feedback: buildFeedback('success', '同步完成', message),
      })

      await get().refreshTools()
      await get().refreshInsights()
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '同步失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isSyncing: false })
    }
  },

  toggleSkillEnabled: async (toolId, skillName, enabled) => {
    try {
      await toggleSkillEnabledApi({ toolId, skillName, enabled })
      set((state) => ({
        tools: state.tools.map((tool) =>
          tool.id !== toolId
            ? tool
            : {
                ...tool,
                skills: tool.skills.map((skill) =>
                  skill.name !== skillName ? skill : { ...skill, enabled },
                ),
              },
        ),
      }))
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          enabled ? '启用技能失败' : '停用技能失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    }
  },

  loadClaudeConfigDiff: async () => {
    set({ isClaudeConfigLoading: true })
    try {
      const baseline = get().claudeConfigBaseline
      const result = await getClaudeConfigDiff(baseline)
      set({ claudeConfigDiff: result })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '读取配置差异失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isClaudeConfigLoading: false })
    }
  },

  setClaudeConfigBaseline: async (baseline) => {
    set({ claudeConfigBaseline: baseline })
    await get().loadClaudeConfigDiff()
  },

  applyClaudeConfigSync: async () => {
    const diff = get().claudeConfigDiff
    if (!diff?.needsSync) {
      set({
        feedback: buildFeedback('info', '两边已一致，无需同步'),
      })
      return
    }
    set({ isClaudeConfigApplying: true })
    try {
      const baseline = get().claudeConfigBaseline
      const result = await applyClaudeConfigFullSync(baseline)
      set({
        feedback: buildFeedback(
          'success',
          `已整段同步 ${result.appliedFields.length} 个字段到 cc-switch`,
          `备份: ${result.backupPath}`,
        ),
      })
      await get().loadClaudeConfigDiff()
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '同步到 cc-switch 失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isClaudeConfigApplying: false })
    }
  },

  clearFeedback: () => set({ feedback: undefined }),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  setSkillDetailOpen: (open) => set({ skillDetailOpen: open }),

  loadSkillDetail: async (toolId, skillName) => {
    set({ isSkillDetailLoading: true, skillDetailOpen: true })
    try {
      set({ selectedSkillDetail: await getSkillDetail(toolId, skillName) })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '读取技能详情失败',
          error instanceof Error ? error.message : String(error),
        ),
        skillDetailOpen: false,
      })
    } finally {
      set({ isSkillDetailLoading: false })
    }
  },

  refreshPresets: async () => {
    set({ isPresetsLoading: true })
    try {
      const presets = await listPresets()
      set({ presets })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '读取预设失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    } finally {
      set({ isPresetsLoading: false })
    }
  },

  createPreset: async (name, skills) => {
    try {
      await savePreset(name, skills)
      await get().refreshPresets()
      set({
        feedback: buildFeedback('success', '预设创建成功'),
      })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '创建预设失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    }
  },

  removePreset: async (id) => {
    try {
      await deletePreset(id)
      await get().refreshPresets()
      set({
        feedback: buildFeedback('success', '预设已删除'),
      })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '删除预设失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    }
  },

  applyPreset: async (presetId: string, targetToolIds: string[]) => {
    const preset = get().presets.find((p) => p.id === presetId)
    if (!preset) {
      set({ feedback: buildFeedback('error', '预设不存在') })
      return
    }
    const skillNames = preset.skills.map((s) => s.skillName)
    if (skillNames.length === 0) {
      set({ feedback: buildFeedback('error', '预设中没有技能') })
      return
    }
    try {
      const results: string[] = []
      for (const toolId of targetToolIds) {
        const result = await batchSyncFromCenter(
          skillNames,
          toolId,
          get().syncMode,
          get().conflictStrategy,
        )
        results.push(`${toolId}: ${Array.isArray(result) ? result.length : 0} 个技能已同步`)
      }
      await get().refreshTools()
      set({
        feedback: buildFeedback('success', '预设应用成功', results.join('；')),
      })
    } catch (error) {
      set({
        feedback: buildFeedback(
          'error',
          '应用预设失败',
          error instanceof Error ? error.message : String(error),
        ),
      })
    }
  },
}))
