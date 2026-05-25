import { getSkillDetail } from '../../lib/toolboxApi'
import type { OperationFeedback, SkillDetailPayload } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'
import { buildFeedback, type ToolboxSliceCreator } from './types'

export interface UiSlice {
  feedback?: OperationFeedback
  commandPaletteOpen: boolean
  skillDetailOpen: boolean
  selectedSkillDetail?: SkillDetailPayload
  isSkillDetailLoading: boolean

  clearFeedback: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setSkillDetailOpen: (open: boolean) => void
  loadSkillDetail: (toolId: string, skillName: string) => Promise<void>
}

export const createUiSlice: ToolboxSliceCreator<UiSlice> = (set) => ({
  feedback: undefined,
  commandPaletteOpen: false,
  skillDetailOpen: false,
  selectedSkillDetail: undefined,
  isSkillDetailLoading: false,

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
})
