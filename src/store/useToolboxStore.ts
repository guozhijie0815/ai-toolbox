import { create } from 'zustand'

import { createClaudeSlice } from './slices/claudeSlice'
import { createConfigSlice } from './slices/configSlice'
import { createGitSlice } from './slices/gitSlice'
import { createInsightSlice } from './slices/insightSlice'
import { createPresetSlice } from './slices/presetSlice'
import { createToolSlice } from './slices/toolSlice'
import { createUiSlice } from './slices/uiSlice'
import type { ToolboxStore } from './slices/types'

export type { ToolboxStore } from './slices/types'

export const useToolboxStore = create<ToolboxStore>()((...a) => ({
  ...createToolSlice(...a),
  ...createConfigSlice(...a),
  ...createInsightSlice(...a),
  ...createClaudeSlice(...a),
  ...createUiSlice(...a),
  ...createPresetSlice(...a),
  ...createGitSlice(...a),
}))
