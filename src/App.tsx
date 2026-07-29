import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'

import { App as AntdApp, ConfigProvider, Empty, theme } from 'antd'

import CenterRepoPanel from './components/CenterRepoPanel'
import ClaudeConfigSyncPanel from './components/ClaudeConfigSyncPanel'
import CommandPalette from './components/CommandPalette'
import SkillDetailDrawer from './components/SkillDetailDrawer'

import './App.css'
import AppHeader from './pages/AppHeader'
import CapabilityBar from './pages/CapabilityBar'
import { getToolCapabilities } from './pages/capability'
import ConfigEditorView from './pages/ConfigEditorView'
import InsightsPanel from './pages/InsightsPanel'
import ModelSyncPanel from './pages/ModelSyncPanel'
import ModelSyncSidePanel from './pages/ModelSyncSidePanel'
import type { ModelDiff } from './lib/modelSync'
import SkillListView from './pages/SkillListView'
import ToolListPanel from './pages/ToolListPanel'
import ToolManagerModal from './pages/modals/ToolManagerModal'
import SyncSkillsModal from './pages/modals/SyncSkillsModal'
import type { ThemeMode, ToolCapability } from './pages/types'

import { getHomeDirPath, syncSkills } from './lib/toolboxApi'
import { useToolboxStore } from './store/useToolboxStore'
import { hasTauriRuntime, normalizeFsPath } from './utils/appUtils'
import type { ConflictStrategy, OperationFeedback, SyncMode } from './types/toolbox'

/** 运行时动态获取的 Home 目录，启动时通过 Tauri 命令填充 */
let _homeDir = ''

const getSharedSkillDir = () => `${_homeDir}/.agents/skills`

const isSharedSkillTool = (tool: {
  id: string
  name?: string
  configFiles: unknown[]
  skillDir?: string
}) => {
  const id = tool.id.toLowerCase()
  const name = tool.name?.toLowerCase()
  return (
    id === 'agent' ||
    id === 'agents' ||
    name === '.agent' ||
    name === 'agents skills' ||
    (tool.configFiles.length === 0 &&
      normalizeFsPath(_homeDir, tool.skillDir) === getSharedSkillDir())
  )
}

/** 把 store.feedback 转发到 AntdApp 的 message，需要在 <AntdApp> 内挂载 */
function FeedbackBridge({ feedback }: { feedback: OperationFeedback | undefined }) {
  const { message: messageApi } = AntdApp.useApp()
  useEffect(() => {
    if (!feedback) return
    if (feedback.title === '工具列表已刷新') return

    void messageApi.open({
      type: feedback.tone,
      content: feedback.detail ? `${feedback.title} · ${feedback.detail}` : feedback.title,
    })
  }, [feedback, messageApi])
  return null
}

function App() {
  // 主题
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'
    const value = window.localStorage.getItem('ai-toolbox-theme')
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  })
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // 当前工具能力页（技能 / 配置 / 同步 / 模型）
  const [capability, setCapability] = useState<ToolCapability>('skills')
  const editorMode = capability === 'editor'

  // Modals
  const [managerOpen, setManagerOpen] = useState(false)
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [centerRepoOpen, setCenterRepoOpen] = useState(false)

  // Sync 共享状态（InsightsPanel/Overlay 触发 + CenterRepoPanel 消费）
  const [syncTargetToolIds, setSyncTargetToolIds] = useState<string[]>([])
  const [syncSelectedSkillIds, setSyncSelectedSkillIds] = useState<string[]>([])
  const [syncMode, setSyncMode] = useState<SyncMode>('copy')
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('skip')

  // SkillListView 的搜索关键字
  const [skillKeyword, setSkillKeyword] = useState('')
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string[]>([])

  const [isRefreshingAll, setIsRefreshingAll] = useState(false)

  // 模型同步右侧预览
  const [modelSide, setModelSide] = useState<{
    configPath?: string
    providerKey: string
    remoteCount: number
    localCount: number
    diff: ModelDiff
    dirty: boolean
    saving: boolean
    onApply: () => void
  } | null>(null)

  const handleModelDiffChange = useCallback(
    (payload: {
      configPath?: string
      providerKey: string
      remoteCount: number
      localCount: number
      diff: ModelDiff
      dirty: boolean
      saving: boolean
      onApply: () => void
    }) => {
      setModelSide(payload)
    },
    [],
  )

  // store
  const tools = useToolboxStore((state) => state.tools)
  const selectedToolId = useToolboxStore((state) => state.selectedToolId)
  const selectedConfigId = useToolboxStore((state) => state.selectedConfigId)
  const feedback = useToolboxStore((state) => state.feedback)
  const initialize = useToolboxStore((state) => state.initialize)
  const refreshTools = useToolboxStore((state) => state.refreshTools)
  const selectTool = useToolboxStore((state) => state.selectTool)
  const skillDetailOpen = useToolboxStore((state) => state.skillDetailOpen)
  const selectedSkillDetail = useToolboxStore((state) => state.selectedSkillDetail)
  const isSkillDetailLoading = useToolboxStore((state) => state.isSkillDetailLoading)
  const setSkillDetailOpen = useToolboxStore((state) => state.setSkillDetailOpen)
  const commandPaletteOpen = useToolboxStore((state) => state.commandPaletteOpen)
  const setCommandPaletteOpen = useToolboxStore((state) => state.setCommandPaletteOpen)
  const refreshPresets = useToolboxStore((state) => state.refreshPresets)
  const selectedTags = useToolboxStore((state) => state.selectedTags)

  // ---- 初始化 home 目录（在 initialize 之前完成）----
  useEffect(() => {
    if (hasTauriRuntime()) {
      getHomeDirPath()
        .then((dir) => {
          _homeDir = dir
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    startTransition(() => {
      void initialize()
    })
  }, [initialize])

  // ---- 主题 ----
  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初始化同步系统主题
    setSystemDark(media.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode
  const algorithm = resolvedTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs'

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ai-toolbox-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.body.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  // ---- 派生 ----
  const visibleTools = useMemo(() => tools.filter((tool) => !isSharedSkillTool(tool)), [tools])
  const selectedTool = visibleTools.find((tool) => tool.id === selectedToolId) ?? visibleTools[0]
  const selectedFile = selectedTool?.configFiles.find((file) => file.id === selectedConfigId)
  const currentSkills = useMemo(() => selectedTool?.skills ?? [], [selectedTool?.skills])
  const sortedSkills = useMemo(() => {
    // Rust 后端已按分类+更新时间排序，前端不重排
    return [...currentSkills]
  }, [currentSkills])

  const filteredCurrentSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase()
    let result = sortedSkills

    if (skillCategoryFilter.length > 0) {
      result = result.filter((skill) => {
        const cat = skill.category || ''
        return skillCategoryFilter.includes(cat)
      })
    }

    if (keyword) {
      result = result.filter((skill) => {
        return (
          skill.name.toLowerCase().includes(keyword) ||
          (skill.description ?? '').toLowerCase().includes(keyword) ||
          (skill.path ?? '').toLowerCase().includes(keyword)
        )
      })
    }

    if (selectedTags.length > 0) {
      result = result.filter((skill) => {
        const skillTags = skill.tags ?? []
        return selectedTags.some((tag) => skillTags.includes(tag))
      })
    }

    return result
  }, [sortedSkills, skillKeyword, selectedTags, skillCategoryFilter])

  const syncTargetOptions = useMemo(() => {
    const selectedSkillDir = normalizeFsPath(_homeDir, selectedTool?.skillDir)
    return visibleTools
      .filter((tool) => {
        if (tool.id === selectedTool?.id) return false
        const targetSkillDir = normalizeFsPath(_homeDir, tool.skillDir)
        if (selectedSkillDir && targetSkillDir && selectedSkillDir === targetSkillDir) return false
        return true
      })
      .map((tool) => ({
        label: tool.name,
        value: tool.id,
      }))
  }, [selectedTool?.id, selectedTool?.skillDir, visibleTools])

  const allSkills = useMemo(() => {
    const names = new Set<string>()
    tools.forEach((tool) => {
      tool.skills.forEach((skill) => names.add(skill.name))
    })
    return Array.from(names).sort()
  }, [tools])

  useEffect(() => {
    void refreshPresets()
  }, [refreshPresets])

  useEffect(() => {
    const validTargetIds = new Set(syncTargetOptions.map((option) => option.value))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 清除无效选中项
    setSyncTargetToolIds((current) => current.filter((toolId) => validTargetIds.has(toolId)))
  }, [syncTargetOptions])

  // 切换工具时，若当前能力对该工具不可用，回退到技能
  useEffect(() => {
    const allowed = new Set(getToolCapabilities(selectedTool).map((item) => item.key))
    if (!allowed.has(capability)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 联动能力页重置
      setCapability('skills')
    }
  }, [selectedTool, capability])

  const handleCapabilityChange = (next: ToolCapability) => {
    setCapability(next)
    if (next === 'editor' && selectedTool) {
      const targetId = selectedConfigId ?? selectedTool.configFiles[0]?.id
      if (targetId) {
        void useToolboxStore.getState().selectConfigFile(targetId)
      }
    }
  }

  // 进入配置编辑时加载当前文件内容
  useEffect(() => {
    if (capability !== 'editor' || !selectedConfigId) return
    void useToolboxStore.getState().selectConfigFile(selectedConfigId)
  }, [capability, selectedConfigId, selectedTool?.id])

  const openSyncModal = () => {
    setSyncModalOpen(true)
    setSyncTargetToolIds([])
    setSyncSelectedSkillIds([])
  }

  const handleTriggerSync = async (sourceToolId: string, toolIds: string[], skillName: string) => {
    const sourceTool = tools.find((tool) => tool.id === sourceToolId)
    if (!sourceTool) return
    const targetTools = tools.filter((tool) => toolIds.includes(tool.id))
    if (targetTools.length === 0) return

    const result = await syncSkills({
      sourceTool,
      targetTools,
      skills: [skillName],
      mode: 'copy',
      conflictStrategy: 'overwrite',
    })
    // 等待文件系统落盘后再刷新
    await new Promise((resolve) => setTimeout(resolve, 300))
    await useToolboxStore.getState().refreshTools()
    await useToolboxStore.getState().refreshInsights()
    // 构建逐条结果消息
    const parts = result.outcomes.map((item) => {
      const targetName =
        targetTools.find((t) => t.id === item.targetToolId)?.name ?? item.targetToolId
      return `${targetName}：${item.status === 'success' ? '已同步' : item.message || item.status}`
    })
    return parts.length > 0 ? parts.join('；') : result.message
  }

  const refreshAll = async () => {
    setIsRefreshingAll(true)
    try {
      await Promise.all([
        refreshTools(),
        refreshPresets(),
        useToolboxStore.getState().refreshInsights(),
      ])
    } finally {
      setIsRefreshingAll(false)
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm,
        token:
          resolvedTheme === 'dark'
            ? {
                colorPrimary: '#22d3ee',
                colorInfo: '#22d3ee',
                colorSuccess: '#4ade80',
                colorWarning: '#fbbf24',
                colorError: '#f87171',
                colorBgBase: '#0b1120',
                colorTextBase: '#f1f5f9',
                borderRadius: 10,
                fontFamily: '"Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", sans-serif',
              }
            : {
                colorPrimary: '#d86933',
                colorInfo: '#d86933',
                colorSuccess: '#1f8a5b',
                colorWarning: '#c28a1a',
                colorError: '#d64545',
                colorBgBase: '#f4f6f1',
                colorTextBase: '#1f2d37',
                borderRadius: 10,
                fontFamily: '"Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", sans-serif',
              },
      }}
    >
      <AntdApp>
        <FeedbackBridge feedback={feedback} />
        <div className="toolbox-shell" data-theme={resolvedTheme}>
          <AppHeader
            resolvedTheme={resolvedTheme}
            onToggleTheme={setThemeMode}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenManager={() => setManagerOpen(true)}
            onOpenCenterRepo={() => setCenterRepoOpen(true)}
            onRefreshAll={() => void refreshAll()}
            isRefreshing={isRefreshingAll}
          />

          <div className="app-layout">
            <div
              className={`app-grid${editorMode ? ' app-grid--edit' : ''}${
                capability === 'sync' ? ' app-grid--wide' : ''
              }`}
            >
              <ToolListPanel
                visibleTools={visibleTools}
                selectedTool={selectedTool}
                capability={capability}
                onCapabilityChange={handleCapabilityChange}
              />

              {/* 中间：按工具能力切换 */}
              <main className="main">
                <CapabilityBar
                  selectedTool={selectedTool}
                  active={capability}
                  onChange={handleCapabilityChange}
                />

                {capability === 'sync' && selectedTool?.id === 'claude' ? (
                  <div className="capability-content capability-content--scroll">
                    <ClaudeConfigSyncPanel monacoTheme={monacoTheme} />
                  </div>
                ) : capability === 'models' && selectedTool?.id === 'opencode' ? (
                  <div className="capability-content capability-content--scroll">
                    <ModelSyncPanel
                      selectedTool={selectedTool}
                      onDiffChange={handleModelDiffChange}
                    />
                  </div>
                ) : (
                  <div className="capability-content">
                    <div className="panel-push-wrapper">
                      <SkillListView
                        selectedTool={selectedTool}
                        currentSkills={currentSkills}
                        filteredCurrentSkills={filteredCurrentSkills}
                        skillKeyword={skillKeyword}
                        setSkillKeyword={setSkillKeyword}
                        skillCategoryFilter={skillCategoryFilter}
                        setSkillCategoryFilter={setSkillCategoryFilter}
                        allSkills={allSkills}
                        onOpenSyncModal={openSyncModal}
                      />

                      <ConfigEditorView
                        selectedTool={selectedTool}
                        selectedFile={selectedFile}
                        monacoTheme={monacoTheme}
                        onCloseEditor={() => setCapability('skills')}
                      />
                    </div>
                  </div>
                )}
              </main>

              {/* 右侧：技能洞察 / 模型变更预览 */}
              {capability === 'models' && selectedTool?.id === 'opencode' ? (
                modelSide ? (
                  <ModelSyncSidePanel
                    remoteCount={modelSide.remoteCount}
                    localCount={modelSide.localCount}
                    diff={modelSide.diff}
                    dirty={modelSide.dirty}
                    saving={modelSide.saving}
                    onApply={modelSide.onApply}
                  />
                ) : (
                  <aside className="panel-right">
                    <Empty description="加载变更预览…" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </aside>
                )
              ) : capability === 'skills' || capability === 'editor' ? (
                <aside className="panel-right" id="rightPanel">
                  <div className="panel-right-head">
                    <div className="head-left">
                      <span className="lbl">Insights</span>
                      <span className="ttl">变动洞察</span>
                    </div>
                  </div>
                  <div className="panel-right-body" id="insightBody">
                    <InsightsPanel onTriggerSync={handleTriggerSync} />
                  </div>
                </aside>
              ) : null}
            </div>
          </div>

          <ToolManagerModal open={managerOpen} onClose={() => setManagerOpen(false)} />

          <SyncSkillsModal
            open={syncModalOpen}
            onClose={() => setSyncModalOpen(false)}
            selectedTool={selectedTool}
            visibleTools={visibleTools}
            currentSkills={currentSkills}
            sortedSkills={sortedSkills}
            syncTargetOptions={syncTargetOptions}
            syncTargetToolIds={syncTargetToolIds}
            setSyncTargetToolIds={setSyncTargetToolIds}
            syncSelectedSkillIds={syncSelectedSkillIds}
            setSyncSelectedSkillIds={setSyncSelectedSkillIds}
            syncMode={syncMode}
            setSyncMode={setSyncMode}
            conflictStrategy={conflictStrategy}
            setConflictStrategy={setConflictStrategy}
          />
        </div>

        {/* 命令面板 */}
        <CommandPalette
          open={commandPaletteOpen}
          tools={tools.map((t) => ({ id: t.id, name: t.name }))}
          skills={tools.flatMap((t) =>
            t.skills.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              toolId: t.id,
              toolName: t.name,
            })),
          )}
          onSelectTool={(toolId) => {
            void selectTool(toolId)
          }}
          onSelectSkill={(toolId) => {
            void selectTool(toolId)
          }}
          onClose={() => setCommandPaletteOpen(false)}
          onOpen={() => setCommandPaletteOpen(true)}
        />

        <SkillDetailDrawer
          open={skillDetailOpen}
          detail={selectedSkillDetail ?? null}
          isLoading={isSkillDetailLoading}
          onClose={() => setSkillDetailOpen(false)}
        />
      </AntdApp>
      <CenterRepoPanel
        open={centerRepoOpen}
        tools={tools}
        syncMode={syncMode}
        conflictStrategy={conflictStrategy}
        onClose={() => setCenterRepoOpen(false)}
        onSyncComplete={() => void refreshTools()}
      />
    </ConfigProvider>
  )
}

export default App
