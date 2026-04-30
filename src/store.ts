import { create } from 'zustand'
import type { ToolEntry, SyncOutcome } from './types'

type ToolboxState = {
  tools: ToolEntry[]
  selectedToolId: string | null
  selectedConfigPath: string | null
  configContent: string
  configDirty: boolean
  selectedSkillNames: string[]
  targetToolIds: string[]
  syncMode: 'copy' | 'symlink'
  conflictPolicy: 'skip' | 'overwrite' | 'rename'
  syncResults: SyncOutcome[]
  setTools: (tools: ToolEntry[]) => void
  selectTool: (toolId: string | null) => void
  selectConfig: (path: string | null) => void
  setConfigContent: (content: string) => void
  markConfigSaved: (content: string) => void
  setSelectedSkillNames: (names: string[]) => void
  setTargetToolIds: (toolIds: string[]) => void
  setSyncMode: (mode: 'copy' | 'symlink') => void
  setConflictPolicy: (policy: 'skip' | 'overwrite' | 'rename') => void
  setSyncResults: (results: SyncOutcome[]) => void
}

export const useToolboxStore = create<ToolboxState>((set) => ({
  tools: [],
  selectedToolId: null,
  selectedConfigPath: null,
  configContent: '',
  configDirty: false,
  selectedSkillNames: [],
  targetToolIds: [],
  syncMode: 'copy',
  conflictPolicy: 'skip',
  syncResults: [],
  setTools: (tools) =>
    set((state) => {
      const selectedToolId =
        state.selectedToolId && tools.some((tool) => tool.id === state.selectedToolId)
          ? state.selectedToolId
          : tools[0]?.id ?? null
      const selectedTool = tools.find((tool) => tool.id === selectedToolId)
      const selectedConfigPath =
        state.selectedConfigPath &&
        selectedTool?.configFiles.some((file) => file.path === state.selectedConfigPath)
          ? state.selectedConfigPath
          : selectedTool?.configFiles[0]?.path ?? null

      return {
        tools,
        selectedToolId,
        selectedConfigPath,
        selectedSkillNames:
          selectedTool?.skills
            .filter((skill) => state.selectedSkillNames.includes(skill.name))
            .map((skill) => skill.name) ?? [],
        targetToolIds: state.targetToolIds.filter((toolId) => toolId !== selectedToolId),
      }
    }),
  selectTool: (selectedToolId) =>
    set((state) => {
      const selectedTool = state.tools.find((tool) => tool.id === selectedToolId)
      return {
        selectedToolId,
        selectedConfigPath: selectedTool?.configFiles[0]?.path ?? null,
        selectedSkillNames: [],
        targetToolIds: state.targetToolIds.filter((toolId) => toolId !== selectedToolId),
        configContent: '',
        configDirty: false,
      }
    }),
  selectConfig: (selectedConfigPath) =>
    set({
      selectedConfigPath,
      configContent: '',
      configDirty: false,
    }),
  setConfigContent: (configContent) => set({ configContent, configDirty: true }),
  markConfigSaved: (configContent) => set({ configContent, configDirty: false }),
  setSelectedSkillNames: (selectedSkillNames) => set({ selectedSkillNames }),
  setTargetToolIds: (targetToolIds) => set({ targetToolIds }),
  setSyncMode: (syncMode) => set({ syncMode }),
  setConflictPolicy: (conflictPolicy) => set({ conflictPolicy }),
  setSyncResults: (syncResults) => set({ syncResults }),
}))
