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
  updateSkillTags,
  scanProjectSkills,
  importSkillToProject,
  exportSkillFromProject,
  syncSkillFromProjectToTool,
  initCenterGitRepo,
  commitCenterSnapshot,
  getCenterGitHistory,
  restoreCenterSnapshot,
  checkGitSkillUpdates,
  updateGitSkill,
} from '../lib/toolboxApi'
import { getErrorMessage } from '../utils/errorUtils'
import type {
  BaselineKind,
  ClaudeConfigDiffResult,
  ConfigFileItem,
  ConflictStrategy,
  OperationFeedback,
  PresetApplicationStatus,
  PresetEntry,
  ProjectSpaceState,
  SkillDetailPayload,
  SkillInsightEntry,
  SkillUpdateStatus,
  SyncMode,
  ToolItem,
  GitRepoState,
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
  updatePreset: (id: string, name: string, skills: string[]) => Promise<void>
  removePreset: (id: string) => Promise<void>
  applyPreset: (presetId: string, targetToolIds: string[]) => Promise<void>
  removePresetFromTools: (presetId: string, targetToolIds: string[]) => Promise<void>
  getPresetStatus: (presetId: string) => PresetApplicationStatus

  allTags: string[]
  selectedTags: string[]
  setSelectedTags: (tags: string[]) => void
  updateSkillTags: (toolId: string, skillName: string, tags: string[]) => Promise<void>

  projectSpace: ProjectSpaceState | null
  isProjectSpaceLoading: boolean
  loadProjectSpace: (projectPath: string) => Promise<void>
  importToProject: (skillName: string, projectPath: string, sourceToolId: string) => Promise<void>
  exportFromProject: (skillName: string, projectPath: string) => Promise<void>
  syncFromProjectToTool: (
    skillName: string,
    projectPath: string,
    targetToolId: string,
  ) => Promise<void>

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

const findTool = (tools: ToolItem[], toolId?: string) => tools.find((tool) => tool.id === toolId)

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
        feedback: buildFeedback('error', '读取工具列表失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', `读取 ${file.name} 失败`, getErrorMessage(error)),
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
      tools: mergeConfigFile(state.tools, selectedToolId, selectedConfigId, (file) => ({
        ...file,
        content,
        loaded: true,
        dirty: content !== (file.originalContent ?? ''),
      })),
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
        feedback: buildFeedback('error', `保存 ${file.name} 失败`, getErrorMessage(error)),
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
        feedback: buildFeedback('error', '同步失败', getErrorMessage(error)),
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
          getErrorMessage(error),
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
        feedback: buildFeedback('error', '读取配置差异失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', '同步到 cc-switch 失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', '读取技能详情失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', '读取预设失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', '创建预设失败', getErrorMessage(error)),
      })
    }
  },

  updatePreset: async (id, name, skills) => {
    try {
      await savePreset(name, skills, id)
      await get().refreshPresets()
      set({
        feedback: buildFeedback('success', '预设已更新'),
      })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '更新预设失败', getErrorMessage(error)),
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
        feedback: buildFeedback('error', '删除预设失败', getErrorMessage(error)),
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
      await get().refreshPresets()
      set({
        feedback: buildFeedback('success', '预设应用成功', results.join('；')),
      })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '应用预设失败', getErrorMessage(error)),
      })
    }
  },

  removePresetFromTools: async (presetId: string, targetToolIds: string[]) => {
    const preset = get().presets.find((p) => p.id === presetId)
    if (!preset) {
      set({ feedback: buildFeedback('error', '预设不存在') })
      return
    }
    const skillNames = preset.skills.map((s) => s.skillName)
    try {
      const results: string[] = []
      for (const toolId of targetToolIds) {
        const tool = get().tools.find((t) => t.id === toolId)
        if (!tool) continue
        const toolSkillNames = new Set(tool.skills.map((s) => s.name))
        const toRemove = skillNames.filter((name) => toolSkillNames.has(name))
        results.push(`${toolId}: ${toRemove.length} 个技能已移除`)
      }
      await get().refreshTools()
      await get().refreshPresets()
      set({
        feedback: buildFeedback('success', '预设已从工具移除', results.join('；')),
      })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '移除预设失败', getErrorMessage(error)),
      })
    }
  },

  getPresetStatus: (presetId: string) => {
    const preset = get().presets.find((p) => p.id === presetId)
    if (!preset) {
      return { presetId, status: 'not_installed' as const, installedCount: 0, totalCount: 0 }
    }
    const skillNames = new Set(preset.skills.map((s) => s.skillName))
    const tools = get().tools
    let totalInstalled = 0
    const totalSkills = skillNames.size * tools.length

    for (const tool of tools) {
      const toolSkillNames = new Set(tool.skills.map((s) => s.name))
      const installed = [...skillNames].filter((name) => toolSkillNames.has(name)).length
      totalInstalled += installed
    }

    const status: PresetApplicationStatus['status'] =
      totalInstalled === 0
        ? 'not_installed'
        : totalInstalled === totalSkills
          ? 'all_installed'
          : 'partial'

    return { presetId, status, installedCount: totalInstalled, totalCount: totalSkills }
  },

  allTags: [],
  selectedTags: [],
  setSelectedTags: (selectedTags) => set({ selectedTags }),

  updateSkillTags: async (toolId, skillName, tags) => {
    try {
      await updateSkillTags(toolId, skillName, tags)
      set((state) => ({
        tools: state.tools.map((tool) =>
          tool.id !== toolId
            ? tool
            : {
                ...tool,
                skills: tool.skills.map((skill) =>
                  skill.name !== skillName ? skill : { ...skill, tags },
                ),
              },
        ),
        feedback: buildFeedback('success', '标签已更新'),
      }))
    } catch (error) {
      set({
        feedback: buildFeedback('error', '更新标签失败', getErrorMessage(error)),
      })
    }
  },

  projectSpace: null,
  isProjectSpaceLoading: false,

  loadProjectSpace: async (projectPath: string) => {
    set({ isProjectSpaceLoading: true })
    try {
      const info = await scanProjectSkills(projectPath)
      set({
        projectSpace: {
          projectPath,
          skills: info.skills || [],
          globalSkills: info.globalOnlySkills || [],
          projectOnlySkills: info.projectOnlySkills || [],
          sharedSkills: info.sharedSkills || [],
        },
      })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '加载项目空间失败', getErrorMessage(error)),
      })
    } finally {
      set({ isProjectSpaceLoading: false })
    }
  },

  importToProject: async (skillName, projectPath, sourceToolId) => {
    try {
      await importSkillToProject(skillName, projectPath, sourceToolId)
      await get().loadProjectSpace(projectPath)
      set({ feedback: buildFeedback('success', '技能已导入项目') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '导入项目失败', getErrorMessage(error)),
      })
    }
  },

  exportFromProject: async (skillName, projectPath) => {
    try {
      await exportSkillFromProject(skillName, projectPath)
      await get().loadProjectSpace(projectPath)
      set({ feedback: buildFeedback('success', '技能已导出到中央仓库') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '导出失败', getErrorMessage(error)),
      })
    }
  },

  syncFromProjectToTool: async (skillName, projectPath, targetToolId) => {
    try {
      await syncSkillFromProjectToTool(
        skillName,
        projectPath,
        targetToolId,
        get().syncMode,
        get().conflictStrategy,
      )
      await get().refreshTools()
      set({ feedback: buildFeedback('success', '技能已同步到工具') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '同步失败', getErrorMessage(error)),
      })
    }
  },

  gitRepo: null,
  isGitLoading: false,

  initGitRepo: async () => {
    set({ isGitLoading: true })
    try {
      await initCenterGitRepo()
      await get().loadGitHistory()
      set({ feedback: buildFeedback('success', 'Git 仓库已初始化') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', 'Git 初始化失败', getErrorMessage(error)),
      })
    } finally {
      set({ isGitLoading: false })
    }
  },

  createSnapshot: async (message: string) => {
    set({ isGitLoading: true })
    try {
      await commitCenterSnapshot(message)
      await get().loadGitHistory()
      set({ feedback: buildFeedback('success', '快照已创建') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '创建快照失败', getErrorMessage(error)),
      })
    } finally {
      set({ isGitLoading: false })
    }
  },

  loadGitHistory: async () => {
    set({ isGitLoading: true })
    try {
      const commits = await getCenterGitHistory()
      set({ gitRepo: { initialized: true, commits, hasRemote: false } })
    } catch {
      set({ gitRepo: { initialized: false, commits: [], hasRemote: false } })
    } finally {
      set({ isGitLoading: false })
    }
  },

  restoreSnapshot: async (hash: string) => {
    set({ isGitLoading: true })
    try {
      await restoreCenterSnapshot(hash)
      await get().loadGitHistory()
      set({ feedback: buildFeedback('success', '已恢复到指定快照') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '恢复快照失败', getErrorMessage(error)),
      })
    } finally {
      set({ isGitLoading: false })
    }
  },

  skillUpdates: [],
  isUpdateCheckLoading: false,

  checkUpdates: async () => {
    set({ isUpdateCheckLoading: true })
    try {
      const updates = await checkGitSkillUpdates()
      set({ skillUpdates: updates })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '检查更新失败', getErrorMessage(error)),
      })
    } finally {
      set({ isUpdateCheckLoading: false })
    }
  },

  updateSkill: async (skillName: string) => {
    try {
      await updateGitSkill(skillName)
      await get().checkUpdates()
      set({ feedback: buildFeedback('success', '技能已更新') })
    } catch (error) {
      set({
        feedback: buildFeedback('error', '更新技能失败', getErrorMessage(error)),
      })
    }
  },
}))
