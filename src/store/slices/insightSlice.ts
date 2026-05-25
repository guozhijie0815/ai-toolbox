import { getSkillInsights } from '../../lib/toolboxApi'
import type { SkillInsightEntry } from '../../types/toolbox'
import { type ToolboxSliceCreator } from './types'

export interface InsightSlice {
  skillInsights: SkillInsightEntry[]
  isInsightsLoading: boolean

  refreshInsights: () => Promise<void>
}

export const createInsightSlice: ToolboxSliceCreator<InsightSlice> = (set) => ({
  skillInsights: [],
  isInsightsLoading: false,

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
})
