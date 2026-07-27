import { startTransition, useEffect, useMemo, useState } from 'react'

import { App as AntdApp, ConfigProvider, Segmented, theme } from 'antd'

import CenterRepoPanel from './components/CenterRepoPanel'
import ClaudeConfigSyncPanel from './components/ClaudeConfigSyncPanel'
import CommandPalette from './components/CommandPalette'
import SkillDetailDrawer from './components/SkillDetailDrawer'

import './App.css'
import AppHeader from './pages/AppHeader'
import ConfigEditorView from './pages/ConfigEditorView'
import InsightsPanel from './pages/InsightsPanel'
import SkillInsightsOverlay from './pages/SkillInsightsOverlay'
import SkillListView from './pages/SkillListView'
import ToolListPanel from './pages/ToolListPanel'
import ToolManagerModal from './pages/modals/ToolManagerModal'
import SyncSkillsModal from './pages/modals/SyncSkillsModal'
import type { ThemeMode } from './pages/types'

import { getHomeDirPath } from './lib/toolboxApi'
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

  // 中间区域 tab + 编辑模式（跨左/中两区联动）
  const [editorMode, setEditorMode] = useState(false)
  const [middleTab, setMiddleTab] = useState<'skills' | 'editor' | 'sync'>('skills')

  // Modals
  const [managerOpen, setManagerOpen] = useState(false)
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [centerRepoOpen, setCenterRepoOpen] = useState(false)

  // Sync 共享状态（InsightsPanel/Overlay 触发 + CenterRepoPanel 消费）
  const [syncTargetToolIds, setSyncTargetToolIds] = useState<string[]>([])
  const [syncSelectedSkillIds, setSyncSelectedSkillIds] = useState<string[]>([])
  const [syncMode, setSyncMode] = useState<SyncMode>('copy')
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('skip')

  // SkillListView 的搜索关键字（同时影响 SkillInsightsOverlay 的过滤展示）
  const [skillKeyword, setSkillKeyword] = useState('')

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

  // 监听技能/配置目录变更，自动刷新列表
  useEffect(() => {
    if (!hasTauriRuntime()) return

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unlisten: (() => void) | undefined

    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event')
      if (disposed) return
      unlisten = await listen('app-files-changed', () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          void refreshTools()
        }, 300)
      })
    }

    void setup()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      unlisten?.()
    }
  }, [refreshTools])

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
    return [...currentSkills].sort((a, b) => {
      const timeA = a.updatedAt ?? 0
      const timeB = b.updatedAt ?? 0
      return timeB - timeA
    })
  }, [currentSkills])

  const filteredCurrentSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase()
    let result = sortedSkills

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
  }, [sortedSkills, skillKeyword, selectedTags])

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

  // 切到非 Claude Code 工具时，若停在「配置同步」tab，自动回退到「技能」
  useEffect(() => {
    if (selectedTool?.id !== 'claude' && middleTab === 'sync') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 联动 tab 重置
      setMiddleTab('skills')
    }
  }, [selectedTool?.id, middleTab])

  const isPreview = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)

  const openSyncModal = () => {
    setSyncModalOpen(true)
    setSyncTargetToolIds([])
    setSyncSelectedSkillIds([])
  }

  const handleTriggerSync = (toolIds: string[], skillName: string) => {
    setSyncTargetToolIds(toolIds)
    setSyncSelectedSkillIds([skillName])
    setSyncModalOpen(true)
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
            visibleToolsCount={visibleTools.length}
            isPreview={isPreview}
            resolvedTheme={resolvedTheme}
            onToggleTheme={setThemeMode}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            onOpenManager={() => setManagerOpen(true)}
            onOpenCenterRepo={() => setCenterRepoOpen(true)}
          />

          <div className="app-layout">
            <div className={`app-grid${editorMode ? ' app-grid--edit' : ''}`}>
              <ToolListPanel
                visibleTools={visibleTools}
                selectedTool={selectedTool}
                editorMode={editorMode}
                setEditorMode={setEditorMode}
                setMiddleTab={setMiddleTab}
              />

              {/* 中间：技能列表 / 编辑器（push 滑动）/ Claude Code 配置同步 */}
              <main className="panel panel--skills">
                {selectedTool ? (
                  <div style={{ padding: '12px 16px 0 16px', flexShrink: 0 }}>
                    <Segmented
                      block
                      options={[
                        { label: '技能', value: 'skills' },
                        { label: '配置编辑', value: 'editor' },
                        ...(selectedTool.id === 'claude'
                          ? [{ label: '配置同步', value: 'sync' }]
                          : []),
                      ]}
                      value={middleTab}
                      onChange={(value) => {
                        const next = value as 'skills' | 'editor' | 'sync'
                        setMiddleTab(next)
                        setEditorMode(next === 'editor')
                      }}
                    />
                  </div>
                ) : null}
                {selectedTool?.id === 'claude' && middleTab === 'sync' ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      padding: 16,
                    }}
                  >
                    <ClaudeConfigSyncPanel monacoTheme={monacoTheme} />
                  </div>
                ) : (
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="panel-push-wrapper">
                      <SkillListView
                        selectedTool={selectedTool}
                        currentSkills={currentSkills}
                        filteredCurrentSkills={filteredCurrentSkills}
                        skillKeyword={skillKeyword}
                        setSkillKeyword={setSkillKeyword}
                        allSkills={allSkills}
                        onOpenSyncModal={openSyncModal}
                      />

                      <ConfigEditorView
                        selectedTool={selectedTool}
                        selectedFile={selectedFile}
                        monacoTheme={monacoTheme}
                        setEditorMode={setEditorMode}
                        setMiddleTab={setMiddleTab}
                      />
                    </div>
                  </div>
                )}
              </main>

              {/* 右侧：变动洞察（普通）/ 技能列表+洞察（编辑） */}
              <aside className="panel panel--insights">
                <div className="panel--insights__container">
                  <InsightsPanel selectedTool={selectedTool} onTriggerSync={handleTriggerSync} />
                  <SkillInsightsOverlay
                    selectedTool={selectedTool}
                    currentSkills={currentSkills}
                    filteredCurrentSkills={filteredCurrentSkills}
                    onOpenSyncModal={openSyncModal}
                    onTriggerSync={handleTriggerSync}
                  />
                </div>
              </aside>
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
