import { create } from 'zustand'

import {
  listTools,
  readConfigFile,
  saveConfigFile,
  syncSkills,
} from '../lib/toolboxApi'
import type {
  ConfigFileItem,
  ConflictStrategy,
  OperationFeedback,
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
  feedback?: OperationFeedback
  initialize: () => Promise<void>
  refreshTools: () => Promise<void>
  selectTool: (toolId: string) => Promise<void>
  selectConfigFile: (configId: string) => Promise<void>
  setEditorContent: (content: string) => void
  setSelectedSkillIds: (skillIds: string[]) => void
  setTargetToolId: (toolId: string) => void
  setSyncMode: (mode: SyncMode) => void
  setConflictStrategy: (strategy: ConflictStrategy) => void
  saveCurrentFile: (options?: { silent?: boolean }) => Promise<void>
  runSync: () => Promise<void>
  clearFeedback: () => void
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
  feedback: undefined,

  initialize: async () => {
    if (get().tools.length > 0) {
      return
    }

    await get().refreshTools()
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

  clearFeedback: () => set({ feedback: undefined }),
}))
