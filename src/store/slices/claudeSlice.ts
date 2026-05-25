import { applyClaudeConfigFullSync, getClaudeConfigDiff } from '../../lib/toolboxApi'
import type { BaselineKind, ClaudeConfigDiffResult } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'
import { buildFeedback, type ToolboxSliceCreator } from './types'

export interface ClaudeSlice {
  claudeConfigDiff: ClaudeConfigDiffResult | null
  claudeConfigBaseline: BaselineKind
  isClaudeConfigLoading: boolean
  isClaudeConfigApplying: boolean

  loadClaudeConfigDiff: () => Promise<void>
  setClaudeConfigBaseline: (baseline: BaselineKind) => Promise<void>
  applyClaudeConfigSync: () => Promise<void>
}

export const createClaudeSlice: ToolboxSliceCreator<ClaudeSlice> = (set, get) => ({
  claudeConfigDiff: null,
  claudeConfigBaseline: { kind: 'live' },
  isClaudeConfigLoading: false,
  isClaudeConfigApplying: false,

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
})
