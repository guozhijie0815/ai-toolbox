import {
  listTools,
  syncSkills,
  toggleSkillEnabled as toggleSkillEnabledApi,
} from '../../lib/toolboxApi'
import type { ConflictStrategy, SyncMode, ToolItem } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'
import { buildFeedback, findTool, resolveSelections, type ToolboxSliceCreator } from './types'

export interface ToolSlice {
  tools: ToolItem[]
  selectedToolId?: string
  targetToolId?: string
  isToolsLoading: boolean
  selectedSkillIds: string[]
  syncMode: SyncMode
  conflictStrategy: ConflictStrategy
  isSyncing: boolean

  initialize: () => Promise<void>
  refreshTools: () => Promise<void>
  selectTool: (toolId: string) => Promise<void>
  setSelectedSkillIds: (skillIds: string[]) => void
  setTargetToolId: (toolId: string) => void
  setSyncMode: (mode: SyncMode) => void
  setConflictStrategy: (strategy: ConflictStrategy) => void
  runSync: () => Promise<void>
  toggleSkillEnabled: (toolId: string, skillName: string, enabled: boolean) => Promise<void>
}

export const createToolSlice: ToolboxSliceCreator<ToolSlice> = (set, get) => ({
  tools: [],
  selectedToolId: undefined,
  targetToolId: undefined,
  isToolsLoading: false,
  selectedSkillIds: [],
  syncMode: 'copy',
  conflictStrategy: 'skip',
  isSyncing: false,

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
      // 不在刷新时预读配置文件，进入「配置编辑」再加载，避免缺失文件刷屏报错
    } catch (error) {
      set({
        feedback: buildFeedback('error', '读取工具列表失败', getErrorMessage(error)),
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
    // 仅记录选中配置 id，内容在进入编辑器时再读
  },

  setSelectedSkillIds: (selectedSkillIds) => set({ selectedSkillIds }),
  setTargetToolId: (targetToolId) => set({ targetToolId }),
  setSyncMode: (syncMode) => set({ syncMode }),
  setConflictStrategy: (conflictStrategy) => set({ conflictStrategy }),

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
})
