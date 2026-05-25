import {
  checkGitSkillUpdates,
  commitCenterSnapshot,
  getCenterGitHistory,
  initCenterGitRepo,
  restoreCenterSnapshot,
  updateGitSkill,
} from '../../lib/toolboxApi'
import type { GitRepoState, SkillUpdateStatus } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'
import { buildFeedback, type ToolboxSliceCreator } from './types'

export interface GitSlice {
  gitRepo: GitRepoState | null
  isGitLoading: boolean
  skillUpdates: SkillUpdateStatus[]
  isUpdateCheckLoading: boolean

  initGitRepo: () => Promise<void>
  createSnapshot: (message: string) => Promise<void>
  loadGitHistory: () => Promise<void>
  restoreSnapshot: (hash: string) => Promise<void>
  checkUpdates: () => Promise<void>
  updateSkill: (skillName: string) => Promise<void>
}

export const createGitSlice: ToolboxSliceCreator<GitSlice> = (set, get) => ({
  gitRepo: null,
  isGitLoading: false,
  skillUpdates: [],
  isUpdateCheckLoading: false,

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
})
