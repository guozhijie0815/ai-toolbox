import {
  batchSyncFromCenter,
  deletePreset,
  listPresets,
  savePreset,
  updateSkillTags as updateSkillTagsApi,
} from '../../lib/toolboxApi'
import type { PresetApplicationStatus, PresetEntry } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'
import { buildFeedback, type ToolboxSliceCreator } from './types'

export interface PresetSlice {
  presets: PresetEntry[]
  isPresetsLoading: boolean
  allTags: string[]
  selectedTags: string[]

  refreshPresets: () => Promise<void>
  createPreset: (name: string, skills: string[]) => Promise<void>
  updatePreset: (id: string, name: string, skills: string[]) => Promise<void>
  removePreset: (id: string) => Promise<void>
  applyPreset: (presetId: string, targetToolIds: string[]) => Promise<void>
  removePresetFromTools: (presetId: string, targetToolIds: string[]) => Promise<void>
  getPresetStatus: (presetId: string) => PresetApplicationStatus
  setSelectedTags: (tags: string[]) => void
  updateSkillTags: (toolId: string, skillName: string, tags: string[]) => Promise<void>
}

export const createPresetSlice: ToolboxSliceCreator<PresetSlice> = (set, get) => ({
  presets: [],
  isPresetsLoading: false,
  allTags: [],
  selectedTags: [],

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

  setSelectedTags: (selectedTags) => set({ selectedTags }),

  updateSkillTags: async (toolId, skillName, tags) => {
    try {
      await updateSkillTagsApi(toolId, skillName, tags)
      set((state) => ({
        tools: state.tools.map((tool) => ({
          ...tool,
          skills: tool.skills.map((skill) =>
            skill.name !== skillName ? skill : { ...skill, tags },
          ),
        })),
        feedback: buildFeedback('success', '标签已更新'),
      }))
    } catch (error) {
      set({
        feedback: buildFeedback('error', '更新标签失败', getErrorMessage(error)),
      })
    }
  },
})
