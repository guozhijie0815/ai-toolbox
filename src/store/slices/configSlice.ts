import { readConfigFile, saveConfigFile } from '../../lib/toolboxApi'
import { getErrorMessage } from '../../utils/errorUtils'
import {
  buildFeedback,
  findConfig,
  findTool,
  mergeConfigFile,
  type ToolboxSliceCreator,
} from './types'

export interface ConfigSlice {
  selectedConfigId?: string
  isConfigLoading: boolean
  isSaving: boolean

  selectConfigFile: (configId: string) => Promise<void>
  setEditorContent: (content: string) => void
  saveCurrentFile: (options?: { silent?: boolean }) => Promise<void>
}

export const createConfigSlice: ToolboxSliceCreator<ConfigSlice> = (set, get) => ({
  selectedConfigId: undefined,
  isConfigLoading: false,
  isSaving: false,

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
          exists: true,
        })),
      }))
    } catch (error) {
      const message = getErrorMessage(error)
      const missing =
        /no such file|not found|os error 2|不存在/i.test(message) || file.exists === false
      // 缺失文件：按空文件处理，不弹错误
      if (missing) {
        set((state) => ({
          tools: mergeConfigFile(state.tools, tool.id, file.id, (current) => ({
            ...current,
            content: '',
            originalContent: '',
            loaded: true,
            dirty: false,
            exists: false,
          })),
        }))
      } else {
        set({
          feedback: buildFeedback('error', `读取 ${file.name} 失败`, message),
        })
      }
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
})
