import { startTransition, useEffect, useMemo, useState } from 'react'

import Editor from '@monaco-editor/react'
import { getCurrentWindow } from '@tauri-apps/api/window'

import CenterRepoPanel from './components/CenterRepoPanel'
import ClaudeConfigSyncPanel from './components/ClaudeConfigSyncPanel'
import CommandPalette from './components/CommandPalette'
import PresetManager from './components/PresetManager'
import SkillDetailDrawer from './components/SkillDetailDrawer'
import TagFilter from './components/TagFilter'
import {
  CloseOutlined,
  CloudOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Checkbox,
  ConfigProvider,
  Dropdown,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Table,
  Tooltip,
  Typography,
  Form,
  message,
  theme,
} from 'antd'

import './App.css'
import {
  deleteSkill,
  deleteToolRegistryItem,
  detectToolPaths,
  getHomeDirPath,
  listToolRegistry,
  openPathInFinder,
  syncSkills,
  upsertToolRegistryItem,
} from './lib/toolboxApi'
import { useToolboxStore } from './store/useToolboxStore'
import {
  formatTime,
  hasTauriRuntime,
  isInteractiveDragTarget,
  normalizeFsPath,
} from './utils/appUtils'
import { getErrorMessage } from './utils/errorUtils'
import type {
  ConflictStrategy,
  SkillItem,
  SyncMode,
  ToolRegistryConfigFile,
  ToolRegistryEntry,
} from './types/toolbox'

const { Text, Title } = Typography

type ThemeMode = 'system' | 'light' | 'dark'

const modeOptions = [
  {
    label: (
      <span className="segmented-label">
        <CopyOutlined />
        copy
      </span>
    ),
    value: 'copy',
  },
  {
    label: (
      <span className="segmented-label">
        <LinkOutlined />
        symlink
      </span>
    ),
    value: 'symlink',
  },
]

const conflictOptions = [
  { label: '跳过', value: 'skip' },
  { label: '覆盖', value: 'overwrite' },
  { label: '重命名', value: 'rename' },
]

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

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

function App() {
  const [toolForm] = Form.useForm()
  const [messageApi, contextHolder] = message.useMessage()
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system'
    const value = window.localStorage.getItem('ai-toolbox-theme')
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
  })
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [autoSave, setAutoSave] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('ai-toolbox-autosave') === '1'
  })
  const [skillKeyword, setSkillKeyword] = useState('')
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncTargetToolIds, setSyncTargetToolIds] = useState<string[]>([])
  const [syncSelectedSkillIds, setSyncSelectedSkillIds] = useState<string[]>([])
  const [syncMode, setSyncModeState] = useState<SyncMode>('copy')
  const [conflictStrategy, setConflictStrategyState] = useState<ConflictStrategy>('skip')
  const [syncKeyword, setSyncKeyword] = useState('')
  const [isSyncSubmitting, setIsSyncSubmitting] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [registryTools, setRegistryTools] = useState<ToolRegistryEntry[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registrySaving, setRegistrySaving] = useState(false)
  const [editingToolId, setEditingToolId] = useState<string>()
  const [editingConfigFiles, setEditingConfigFiles] = useState<ToolRegistryConfigFile[]>([])
  const [editorMode, setEditorMode] = useState(false)
  const [centerRepoOpen, setCenterRepoOpen] = useState(false)
  const [middleTab, setMiddleTab] = useState<'skills' | 'editor' | 'sync'>('skills')

  const tools = useToolboxStore((state) => state.tools)
  const selectedToolId = useToolboxStore((state) => state.selectedToolId)
  const selectedConfigId = useToolboxStore((state) => state.selectedConfigId)
  const isToolsLoading = useToolboxStore((state) => state.isToolsLoading)
  const isConfigLoading = useToolboxStore((state) => state.isConfigLoading)
  const isSaving = useToolboxStore((state) => state.isSaving)
  const skillInsights = useToolboxStore((state) => state.skillInsights)
  const isInsightsLoading = useToolboxStore((state) => state.isInsightsLoading)
  const feedback = useToolboxStore((state) => state.feedback)
  const initialize = useToolboxStore((state) => state.initialize)
  const refreshTools = useToolboxStore((state) => state.refreshTools)
  const refreshInsights = useToolboxStore((state) => state.refreshInsights)
  const selectTool = useToolboxStore((state) => state.selectTool)
  const selectConfigFile = useToolboxStore((state) => state.selectConfigFile)
  const setEditorContent = useToolboxStore((state) => state.setEditorContent)
  const saveCurrentFile = useToolboxStore((state) => state.saveCurrentFile)
  const loadSkillDetail = useToolboxStore((state) => state.loadSkillDetail)
  const skillDetailOpen = useToolboxStore((state) => state.skillDetailOpen)
  const selectedSkillDetail = useToolboxStore((state) => state.selectedSkillDetail)
  const isSkillDetailLoading = useToolboxStore((state) => state.isSkillDetailLoading)
  const setSkillDetailOpen = useToolboxStore((state) => state.setSkillDetailOpen)
  const commandPaletteOpen = useToolboxStore((state) => state.commandPaletteOpen)
  const setCommandPaletteOpen = useToolboxStore((state) => state.setCommandPaletteOpen)
  const presets = useToolboxStore((state) => state.presets)
  const isPresetsLoading = useToolboxStore((state) => state.isPresetsLoading)
  const refreshPresets = useToolboxStore((state) => state.refreshPresets)
  const createPreset = useToolboxStore((state) => state.createPreset)
  const updatePreset = useToolboxStore((state) => state.updatePreset)
  const removePreset = useToolboxStore((state) => state.removePreset)
  const applyPreset = useToolboxStore((state) => state.applyPreset)
  const removePresetFromTools = useToolboxStore((state) => state.removePresetFromTools)
  const getPresetStatus = useToolboxStore((state) => state.getPresetStatus)
  const allTags = useToolboxStore((state) => state.allTags)
  const selectedTags = useToolboxStore((state) => state.selectedTags)
  const setSelectedTags = useToolboxStore((state) => state.setSelectedTags)
  const updateSkillTags = useToolboxStore((state) => state.updateSkillTags)
  const toggleSkillEnabled = useToolboxStore((state) => state.toggleSkillEnabled)

  useEffect(() => {
    // 初始化 home 目录（需要在 initialize 之前完成）
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
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ai-toolbox-autosave', autoSave ? '1' : '0')
  }, [autoSave])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.body.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    if (!feedback) return
    if (feedback.title === '工具列表已刷新') return

    void messageApi.open({
      type: feedback.tone,
      content: feedback.detail ? `${feedback.title} · ${feedback.detail}` : feedback.title,
    })
  }, [feedback, messageApi])

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

  const filteredSyncSkills = useMemo(() => {
    const keyword = syncKeyword.trim().toLowerCase()
    if (!keyword) return sortedSkills
    return sortedSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description ?? '').toLowerCase().includes(keyword) ||
        (skill.path ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [sortedSkills, syncKeyword])

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

  const selectedSyncTargetNames = useMemo(
    () =>
      visibleTools
        .filter((tool) => syncTargetToolIds.includes(tool.id))
        .map((tool) => tool.name)
        .join('、'),
    [syncTargetToolIds, visibleTools],
  )

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

  const canSubmitSync = syncTargetToolIds.length > 0 && syncSelectedSkillIds.length > 0

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

  const loadRegistryTools = async () => {
    setRegistryLoading(true)
    try {
      const list = await listToolRegistry()
      setRegistryTools(list)
    } catch (error) {
      void messageApi.error(getErrorMessage(error))
    } finally {
      setRegistryLoading(false)
    }
  }

  useEffect(() => {
    if (!autoSave || !selectedFile?.dirty || isSaving) return
    const timer = window.setTimeout(() => {
      void saveCurrentFile({ silent: true })
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [
    autoSave,
    isSaving,
    saveCurrentFile,
    selectedFile?.dirty,
    selectedFile?.content,
    selectedFile?.id,
  ])

  const openSyncModal = () => {
    setSyncModalOpen(true)
    setSyncTargetToolIds([])
    setSyncSelectedSkillIds([])
    setSyncKeyword('')
  }

  const resetToolForm = () => {
    setEditingToolId(undefined)
    setEditingConfigFiles([])
    toolForm.setFieldsValue({
      id: '',
      name: '',
      enabled: true,
      skillDir: '',
    })
  }

  const openEditTool = (item: ToolRegistryEntry) => {
    setEditingToolId(item.id)
    setEditingConfigFiles(item.configFiles)
    toolForm.setFieldsValue({
      id: item.id,
      name: item.name,
      enabled: item.enabled,
      skillDir: item.skillDir ?? '',
    })
  }

  const openManager = async () => {
    setManagerOpen(true)
    resetToolForm()
    await loadRegistryTools()
  }

  const onDetectPaths = async () => {
    const values = toolForm.getFieldsValue()
    const detected = await detectToolPaths({
      id: values.id,
      name: values.name,
    })
    if (detected.configFiles.length > 0) {
      setEditingConfigFiles(detected.configFiles)
    }
    if (detected.skillDir) {
      toolForm.setFieldValue('skillDir', detected.skillDir)
    }
    if (detected.configFiles.length === 0 && !detected.skillDir) {
      void messageApi.info('未探测到默认路径，可手动填写')
      return
    }
    void messageApi.success('已填充探测结果')
  }

  const onSaveTool = async () => {
    try {
      const values = await toolForm.validateFields()
      setRegistrySaving(true)
      await upsertToolRegistryItem({
        id: values.id,
        name: values.name,
        enabled: values.enabled,
        configFiles: editingConfigFiles,
        skillDir: values.skillDir?.trim() || undefined,
      })
      void messageApi.success(editingToolId ? '工具已更新' : '工具已新增')
      await loadRegistryTools()
      await refreshTools()
      resetToolForm()
    } catch (error) {
      void messageApi.error(getErrorMessage(error))
    } finally {
      setRegistrySaving(false)
    }
  }

  const onDeleteTool = (item: ToolRegistryEntry) => {
    Modal.confirm({
      title: '删除工具',
      content: `确认删除 ${item.name} 吗？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        const text = await deleteToolRegistryItem(item.id)
        void messageApi.success(text)
        await loadRegistryTools()
        await refreshTools()
        if (editingToolId === item.id) {
          resetToolForm()
        }
      },
    })
  }

  const handleSyncSubmit = async () => {
    if (!selectedTool) {
      void messageApi.error('没有可用的源工具')
      return
    }

    const targetTools = visibleTools.filter(
      (tool) =>
        syncTargetToolIds.includes(tool.id) &&
        syncTargetOptions.some((option) => option.value === tool.id),
    )
    if (targetTools.length === 0) {
      void messageApi.warning('至少选择一个目标工具')
      return
    }

    if (syncSelectedSkillIds.length === 0) {
      void messageApi.warning('至少选择一个技能')
      return
    }

    setIsSyncSubmitting(true)
    try {
      const syncMessage = await syncSkills({
        sourceTool: selectedTool,
        targetTools,
        skills: syncSelectedSkillIds,
        mode: syncMode,
        conflictStrategy,
      })
      void messageApi.success(syncMessage)
      setSyncModalOpen(false)
      await refreshTools()
    } catch (error) {
      void messageApi.error(getErrorMessage(error))
    } finally {
      setIsSyncSubmitting(false)
    }
  }

  const handleDeleteSkill = (skill: SkillItem) => {
    if (!selectedTool) return

    Modal.confirm({
      title: '删除技能',
      content: (
        <div className="danger-confirm-content">
          <Text>确认删除 {skill.name} 吗？</Text>
          {skill.path ? <Text className="danger-confirm-path">{skill.path}</Text> : null}
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        const deleteMessage = await deleteSkill({
          toolId: selectedTool.id,
          skillName: skill.name,
        })
        void messageApi.success(deleteMessage)
        await refreshTools()
      },
    })
  }

  const renderSkillMeta = (skill: SkillItem) => (
    <div className="skill-entry__meta">
      {skill.isSymlink ? (
        <Tag variant="filled" color="gold">
          软链接
        </Tag>
      ) : null}
    </div>
  )

  const renderSkillDescription = (skill: SkillItem) => {
    const text = skill.summary ?? skill.description
    return text ? <Text className="skill-entry__desc">{text}</Text> : null
  }

  const handleWindowDragMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasTauriRuntime() || event.button !== 0 || event.detail >= 2) return
    if (event.clientX < 80 || isInteractiveDragTarget(event.target)) return
    void getCurrentWindow().startDragging()
  }

  const handleWindowDragDoubleClick = async (event: React.MouseEvent<HTMLElement>) => {
    if (!hasTauriRuntime() || event.clientX < 80 || isInteractiveDragTarget(event.target)) return
    try {
      const appWindow = getCurrentWindow()
      const maximized = await appWindow.isMaximized()
      if (maximized) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
    } catch (err) {
      console.error('Window maximize/unmaximize failed:', err)
    }
  }

  const handleWindowClose = async () => {
    if (!hasTauriRuntime()) return
    try {
      await getCurrentWindow().close()
    } catch (err) {
      console.error('Window close failed:', err)
    }
  }

  const handleWindowMinimize = async () => {
    if (!hasTauriRuntime()) return
    try {
      await getCurrentWindow().minimize()
    } catch (err) {
      console.error('Window minimize failed:', err)
    }
  }

  const handleWindowMaximize = async () => {
    if (!hasTauriRuntime()) return
    try {
      const appWindow = getCurrentWindow()
      const maximized = await appWindow.isMaximized()
      if (maximized) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
    } catch (err) {
      console.error('Window maximize failed:', err)
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
                colorBgBase: '#060914',
                colorTextBase: '#e2e8f0',
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
        {contextHolder}
        <div className="toolbox-shell" data-theme={resolvedTheme}>
          <header
            className="app-header"
            onMouseDown={handleWindowDragMouseDown}
            onDoubleClick={(event) => void handleWindowDragDoubleClick(event)}
          >
            {/* 交通灯 + 标题 */}
            <div className="title-bar">
              <div className="traffic-lights">
                <button
                  type="button"
                  className="traffic-light traffic-light--red"
                  onClick={() => void handleWindowClose()}
                  aria-label="关闭"
                />
                <button
                  type="button"
                  className="traffic-light traffic-light--yellow"
                  onClick={() => void handleWindowMinimize()}
                  aria-label="最小化"
                />
                <button
                  type="button"
                  className="traffic-light traffic-light--green"
                  onClick={() => void handleWindowMaximize()}
                  aria-label="最大化"
                />
              </div>
              <span className="app-title">AI Toolbox</span>
            </div>

            {/* 标题行：左侧标题 + 右侧操作 */}
            <div className="header-top">
              <div className="header-brand">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 4,
                  }}
                >
                  <Title level={2} style={{ margin: 0, fontSize: 20 }}>
                    工具配置台
                  </Title>
                  <Tag
                    variant="filled"
                    color={isPreview ? 'gold' : 'success'}
                    className="runtime-mini-tag"
                  >
                    {isPreview ? 'Preview' : 'Tauri'} · {visibleTools.length} tools
                  </Tag>
                </div>
                <Text className="header-copy">
                  管理本机 AI 开发工具的配置文件、技能目录和跨工具同步。
                </Text>
              </div>
              <div className="header-search">
                <Input
                  prefix={<SearchOutlined />}
                  placeholder="搜索技能、工具、配置..."
                  readOnly
                  onClick={() => setCommandPaletteOpen(true)}
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    borderRadius: 10,
                    background: 'var(--chip-bg)',
                    borderColor: 'transparent',
                    padding: '10px 14px',
                  }}
                />
              </div>
              <div className="header-actions">
                <Segmented
                  size="small"
                  options={themeOptions}
                  value={themeMode}
                  onChange={(value) => setThemeMode(value as ThemeMode)}
                />
                <Button icon={<SettingOutlined />} onClick={() => void openManager()}>
                  管理工具
                </Button>
                <Button icon={<CloudOutlined />} onClick={() => setCenterRepoOpen(true)}>
                  中央仓库
                </Button>
              </div>
            </div>
          </header>

          <div className="app-layout">
            <div className={`app-grid${editorMode ? ' app-grid--edit' : ''}`}>
              {/* 左侧：工具列表 */}
              <aside className="panel panel--nav">
                <div className="panel-header">
                  <div>
                    <Text className="panel-kicker">Source</Text>
                    <Title level={4}>工具列表</Title>
                  </div>
                  <Tag variant="filled" color="orange">
                    {visibleTools.length}
                  </Tag>
                </div>

                <div className="tool-list">
                  {visibleTools.length === 0 && !isToolsLoading ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可用工具" />
                  ) : null}

                  {visibleTools.map((tool) => {
                    const active = tool.id === selectedTool?.id
                    const dirtyCount = tool.configFiles.filter((item) => item.dirty).length
                    const hasConfig = tool.configFiles.length > 0

                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={`tool-item${active ? ' is-active' : ''}`}
                        data-tool={tool.id}
                        onClick={() => void selectTool(tool.id)}
                      >
                        <div className="tool-item__title">
                          <span className="tool-item__name">
                            {tool.name}
                            {tool.isSystem ? (
                              <LockOutlined
                                style={{
                                  marginLeft: 6,
                                  fontSize: 11,
                                  color: 'var(--ant-color-text-tertiary)',
                                }}
                              />
                            ) : null}
                          </span>
                          {hasConfig && !tool.isSystem && (
                            <span
                              className="tool-item__edit"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (editorMode) {
                                  // 如果已经在编辑模式，点击则关闭
                                  setEditorMode(false)
                                  setMiddleTab('skills')
                                } else if (active) {
                                  setEditorMode(true)
                                  setMiddleTab('editor')
                                  if (!selectedConfigId && tool.configFiles[0]) {
                                    void selectConfigFile(tool.configFiles[0].id)
                                  }
                                } else {
                                  void selectTool(tool.id)
                                  setTimeout(() => {
                                    setEditorMode(true)
                                    setMiddleTab('editor')
                                    if (tool.configFiles[0]) {
                                      void selectConfigFile(tool.configFiles[0].id)
                                    }
                                  }, 50)
                                }
                              }}
                              title="编辑配置"
                            >
                              <FileTextOutlined />
                            </span>
                          )}
                        </div>
                        {tool.description ? (
                          <Text className="tool-item__desc">{tool.description}</Text>
                        ) : null}
                        <div className="tool-item__meta">
                          <span>{tool.configFiles.length} configs</span>
                          <span>{tool.skills.length} skills</span>
                          {dirtyCount > 0 ? <span>{dirtyCount} unsaved</span> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </aside>

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
                      {/* 第一屏：技能列表 */}
                      <div className="panel-slide">
                        <div className="panel-header">
                          <div>
                            <Text className="panel-kicker">Skills</Text>
                            <Title level={4}>当前技能</Title>
                          </div>
                          <Space>
                            <Tag variant="filled" color="cyan">
                              {filteredCurrentSkills.length}/{currentSkills.length}
                            </Tag>
                            <Button icon={<SyncOutlined />} onClick={openSyncModal}>
                              同步技能
                            </Button>
                          </Space>
                        </div>

                        <PresetManager
                          presets={presets}
                          tools={tools.map((t) => ({ id: t.id, name: t.name }))}
                          allSkills={allSkills}
                          onApply={(presetId, targetToolIds) => {
                            void applyPreset(presetId, targetToolIds)
                          }}
                          onCreate={(name, skills) => {
                            void createPreset(name, skills)
                          }}
                          onUpdate={(presetId, name, skills) => {
                            void updatePreset(presetId, name, skills)
                          }}
                          onDelete={(presetId) => {
                            void removePreset(presetId)
                          }}
                          onRemoveFromTools={(presetId, targetToolIds) => {
                            void removePresetFromTools(presetId, targetToolIds)
                          }}
                          getPresetStatus={getPresetStatus}
                          isLoading={isPresetsLoading}
                        />

                        {allTags.length > 0 && (
                          <TagFilter
                            allTags={allTags}
                            selectedTags={selectedTags}
                            onChange={setSelectedTags}
                          />
                        )}

                        <Input
                          allowClear
                          size="large"
                          prefix={<SearchOutlined />}
                          placeholder="筛选当前工具已有技能"
                          value={skillKeyword}
                          onChange={(event) => setSkillKeyword(event.target.value)}
                        />

                        <div className="skill-view-list">
                          {filteredCurrentSkills.length > 0 ? (
                            filteredCurrentSkills.map((skill) => (
                              <div
                                key={skill.id}
                                className={`skill-entry${skill.enabled === false ? ' is-disabled' : ''}`}
                              >
                                <div className="skill-entry__top">
                                  <span
                                    className="skill-entry__name"
                                    title={skill.name}
                                    onClick={() => {
                                      if (selectedTool) {
                                        loadSkillDetail(selectedTool.id, skill.name)
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {skill.name}
                                  </span>
                                  <div className="skill-entry__actions">
                                    {skill.updatedAt ? (
                                      <span className="skill-entry__time">
                                        {formatTime(skill.updatedAt)}
                                      </span>
                                    ) : null}
                                    {renderSkillMeta(skill)}
                                    <Switch
                                      size="small"
                                      checked={skill.enabled !== false}
                                      onChange={(checked) => {
                                        if (selectedTool) {
                                          toggleSkillEnabled(selectedTool.id, skill.name, checked)
                                        }
                                      }}
                                    />
                                    <Dropdown
                                      trigger={['click']}
                                      menu={{
                                        items: [
                                          {
                                            key: 'detail',
                                            icon: <FileTextOutlined />,
                                            label: '查看详情',
                                            onClick: () => {
                                              if (selectedTool) {
                                                loadSkillDetail(selectedTool.id, skill.name)
                                              }
                                            },
                                          },
                                          {
                                            key: 'tags',
                                            icon: null,
                                            label: (
                                              <div>
                                                <div style={{ marginBottom: 4 }}>编辑标签</div>
                                                <div
                                                  onClick={(e) => e.stopPropagation()}
                                                  style={{ maxWidth: 200 }}
                                                >
                                                  <Select
                                                    mode="tags"
                                                    size="small"
                                                    style={{ width: '100%' }}
                                                    placeholder="输入标签"
                                                    value={skill.tags || []}
                                                    onChange={(tags: string[]) => {
                                                      if (selectedTool) {
                                                        updateSkillTags(
                                                          selectedTool.id,
                                                          skill.name,
                                                          tags,
                                                        )
                                                      }
                                                    }}
                                                  />
                                                </div>
                                              </div>
                                            ),
                                          },
                                          {
                                            key: 'delete',
                                            danger: true,
                                            icon: <DeleteOutlined />,
                                            label: '删除',
                                            onClick: () => handleDeleteSkill(skill),
                                          },
                                        ],
                                      }}
                                    >
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<MoreOutlined />}
                                        aria-label={`${skill.name} 操作`}
                                      />
                                    </Dropdown>
                                  </div>
                                </div>
                                {renderSkillDescription(skill)}
                                {(skill.tags?.length ?? 0) > 0 && (
                                  <div className="skill-entry__tags">
                                    {skill.tags!.map((tag) => (
                                      <Tag key={tag}>{tag}</Tag>
                                    ))}
                                  </div>
                                )}
                                {skill.path ? (
                                  <div className="skill-entry__path-row">
                                    <Text
                                      className="skill-entry__path skill-entry__path--no-margin"
                                      style={{ flex: 1, minWidth: 0 }}
                                    >
                                      {skill.path}
                                    </Text>
                                    <button
                                      type="button"
                                      className="skill-open-location"
                                      onClick={() => void openPathInFinder(skill.path!)}
                                    >
                                      <FolderOpenOutlined />
                                      打开位置
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description={
                                currentSkills.length > 0 ? '没有匹配的技能' : '当前工具没有技能'
                              }
                            />
                          )}
                        </div>
                      </div>

                      {/* 第二屏：编辑器 */}
                      <div className="panel-slide">
                        <div className="editor-content__header">
                          <div className="config-strip" style={{ flex: 1, marginBottom: 0 }}>
                            {selectedTool?.configFiles.length ? (
                              selectedTool.configFiles.map((file) => (
                                <button
                                  key={file.id}
                                  type="button"
                                  className={`config-tab${file.id === selectedConfigId ? ' is-active' : ''}`}
                                  onClick={() => void selectConfigFile(file.id)}
                                >
                                  <span className="config-tab__name">
                                    <FileTextOutlined />
                                    {file.name}
                                  </span>
                                  <span className="config-tab__meta">
                                    <span>{file.language}</span>
                                    {file.dirty ? <span className="dirty-dot" /> : null}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="当前工具没有配置文件"
                              />
                            )}
                          </div>
                          <Space>
                            <Switch
                              checked={autoSave}
                              onChange={setAutoSave}
                              checkedChildren="自动保存"
                              unCheckedChildren="自动保存"
                            />
                            <Button
                              icon={<FolderOpenOutlined />}
                              disabled={!selectedFile}
                              onClick={() =>
                                selectedFile && void openPathInFinder(selectedFile.path)
                              }
                            >
                              打开目录
                            </Button>
                            <Button
                              type="primary"
                              icon={<SaveOutlined />}
                              loading={isSaving}
                              disabled={!selectedFile || !selectedFile.dirty}
                              onClick={async () => {
                                try {
                                  await saveCurrentFile()
                                  void messageApi.success('保存成功')
                                } catch {
                                  void messageApi.error('保存失败')
                                }
                              }}
                            >
                              保存
                            </Button>
                            <Button
                              type="text"
                              icon={<CloseOutlined />}
                              onClick={() => {
                                setEditorMode(false)
                                setMiddleTab('skills')
                              }}
                              title="关闭编辑"
                              style={{ fontSize: 16 }}
                            />
                          </Space>
                        </div>

                        <div className="editor-content__body">
                          <div className="editor-content__editor">
                            {selectedFile ? (
                              <>
                                <Editor
                                  height="100%"
                                  defaultLanguage={selectedFile.language}
                                  language={selectedFile.language}
                                  theme={monacoTheme}
                                  loading={<Spin />}
                                  options={{
                                    automaticLayout: true,
                                    fontSize: 14,
                                    minimap: { enabled: false },
                                    padding: { top: 18, bottom: 18 },
                                    roundedSelection: true,
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    smoothScrolling: true,
                                    cursorSmoothCaretAnimation: 'on',
                                  }}
                                  value={selectedFile.content ?? ''}
                                  onChange={(value) => setEditorContent(value ?? '')}
                                />
                                {isConfigLoading ? (
                                  <div className="editor-mask">
                                    <Spin size="large" />
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="editor-empty">
                                <Empty description="请选择要编辑的配置文件" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </main>

              {/* 右侧：变动洞察（普通）/ 技能列表+洞察（编辑） */}
              <aside className="panel panel--insights">
                <div className="panel--insights__container">
                  <div className="insights-content">
                    <div className="panel-header">
                      <div>
                        <Text className="panel-kicker">Insights</Text>
                        <Title level={4}>变动洞察</Title>
                      </div>
                      <Button
                        type="link"
                        size="small"
                        onClick={() => void refreshInsights()}
                        loading={isInsightsLoading}
                      >
                        刷新
                      </Button>
                    </div>

                    {skillInsights.length > 0 ? (
                      <div className="skill-insights__list" style={{ overflow: 'auto', flex: 1 }}>
                        {skillInsights.map((insight) => (
                          <div key={insight.skillName} className="skill-insight-card">
                            <div className="skill-insight-card__row">
                              <div className="skill-insight-card__info">
                                <div className="skill-insight-card__info-top">
                                  <span className="skill-insight-card__name">
                                    {insight.skillName}
                                  </span>
                                  <Tag variant="filled" color="warning" style={{ fontSize: 11 }}>
                                    {insight.laggingTools.length} 个工具未同步
                                  </Tag>
                                </div>
                                <div className="skill-insight-card__info-bottom">
                                  <span
                                    className="skill-insight-card__leader"
                                    data-tool={insight.leaderToolId}
                                  >
                                    {insight.leaderToolName}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: 'var(--muted-text)',
                                    }}
                                  >
                                    {formatTime(insight.leaderUpdatedAt)}
                                  </span>
                                </div>
                              </div>
                              <Button
                                type="primary"
                                size="small"
                                icon={<SyncOutlined />}
                                style={{ borderRadius: 999 }}
                                onClick={() => {
                                  setSyncTargetToolIds(
                                    insight.laggingTools.map((lag) => lag.toolId),
                                  )
                                  setSyncSelectedSkillIds([insight.skillName])
                                  setSyncModalOpen(true)
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="暂无变动洞察"
                        style={{ marginTop: 40 }}
                      />
                    )}

                    {/* 工具统计信息 */}
                    <div className="tool-info-section">
                      <Text className="field-label">工具统计</Text>
                      <div className="tool-info-grid">
                        <div className="tool-info-item">
                          <span className="tool-info-value">
                            {selectedTool?.configFiles.length ?? 0}
                          </span>
                          <span className="tool-info-label">配置文件</span>
                        </div>
                        <div className="tool-info-item">
                          <span className="tool-info-value">
                            {selectedTool?.skills.length ?? 0}
                          </span>
                          <span className="tool-info-label">技能</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 编辑模式：技能列表 + 洞察 */}
                  <div className="skills-overlay">
                    <div className="insights-split-view">
                      {/* 上方：技能列表 */}
                      <div className="insights-block">
                        <div className="insights-block__header">
                          <div>
                            <Text className="panel-kicker">Skills</Text>
                            <Title level={4} style={{ marginTop: 4 }}>
                              当前技能
                            </Title>
                          </div>
                          <Space>
                            <Tag variant="filled" color="cyan">
                              {filteredCurrentSkills.length}/{currentSkills.length}
                            </Tag>
                            <Button size="small" icon={<SyncOutlined />} onClick={openSyncModal}>
                              同步
                            </Button>
                          </Space>
                        </div>
                        <div className="insights-block__content">
                          {filteredCurrentSkills.length > 0 ? (
                            filteredCurrentSkills.map((skill) => (
                              <div key={skill.id} className="skill-entry">
                                <div className="skill-entry__top">
                                  <span className="skill-entry__name" title={skill.name}>
                                    {skill.name}
                                  </span>
                                  <div className="skill-entry__actions">
                                    {skill.updatedAt ? (
                                      <span className="skill-entry__time">
                                        {formatTime(skill.updatedAt)}
                                      </span>
                                    ) : null}
                                    {renderSkillMeta(skill)}
                                    <Dropdown
                                      trigger={['click']}
                                      menu={{
                                        items: [
                                          {
                                            key: 'delete',
                                            danger: true,
                                            icon: <DeleteOutlined />,
                                            label: '删除',
                                            onClick: () => handleDeleteSkill(skill),
                                          },
                                        ],
                                      }}
                                    >
                                      <Button
                                        type="text"
                                        size="small"
                                        icon={<MoreOutlined />}
                                        aria-label={`${skill.name} 操作`}
                                      />
                                    </Dropdown>
                                  </div>
                                </div>
                                {renderSkillDescription(skill)}
                              </div>
                            ))
                          ) : (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="当前工具没有技能"
                            />
                          )}
                        </div>
                      </div>

                      {/* 下方：变动洞察 */}
                      <div className="insights-block">
                        <div className="insights-block__header">
                          <div>
                            <Text className="panel-kicker">Insights</Text>
                            <Title level={4} style={{ marginTop: 4 }}>
                              变动洞察
                            </Title>
                          </div>
                          <Button
                            type="link"
                            size="small"
                            onClick={() => void refreshInsights()}
                            loading={isInsightsLoading}
                          >
                            刷新
                          </Button>
                        </div>
                        <div className="insights-block__content">
                          {skillInsights.length > 0 ? (
                            skillInsights.map((insight) => (
                              <div key={insight.skillName} className="skill-insight-card">
                                <div className="skill-insight-card__row">
                                  <div className="skill-insight-card__info">
                                    <div className="skill-insight-card__info-top">
                                      <span className="skill-insight-card__name">
                                        {insight.skillName}
                                      </span>
                                      <Tag
                                        variant="filled"
                                        color="warning"
                                        style={{ fontSize: 11 }}
                                      >
                                        {insight.laggingTools.length} 个工具未同步
                                      </Tag>
                                    </div>
                                    <div className="skill-insight-card__info-bottom">
                                      <span
                                        className="skill-insight-card__leader"
                                        data-tool={insight.leaderToolId}
                                      >
                                        {insight.leaderToolName}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: 'var(--muted-text)',
                                        }}
                                      >
                                        {formatTime(insight.leaderUpdatedAt)}
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    type="primary"
                                    size="small"
                                    icon={<SyncOutlined />}
                                    style={{ borderRadius: 999 }}
                                    onClick={() => {
                                      setSyncTargetToolIds(
                                        insight.laggingTools.map((lag) => lag.toolId),
                                      )
                                      setSyncSelectedSkillIds([insight.skillName])
                                      setSyncModalOpen(true)
                                    }}
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="暂无变动洞察"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <Modal
            title="工具管理"
            open={managerOpen}
            onCancel={() => setManagerOpen(false)}
            footer={null}
            width={950}
            centered
            className="tool-manager-modal"
          >
            <div className="tool-manager-layout">
              <div className="tool-manager-list">
                <div className="tool-manager-toolbar">
                  <Text className="field-label">已登记工具</Text>
                </div>
                <Table<ToolRegistryEntry>
                  size="small"
                  rowKey="id"
                  loading={registryLoading}
                  dataSource={registryTools}
                  pagination={false}
                  columns={[
                    {
                      title: '工具',
                      dataIndex: 'name',
                      key: 'name',
                      render: (_, row) => (
                        <div>
                          <div className="tool-registry-name">
                            {row.name}
                            {row.isSystem ? (
                              <Tooltip title="系统内置工具，不可编辑或删除">
                                <LockOutlined
                                  style={{
                                    marginLeft: 6,
                                    color: 'var(--ant-color-text-tertiary)',
                                  }}
                                />
                              </Tooltip>
                            ) : null}
                          </div>
                          <Text type="secondary">{row.id}</Text>
                        </div>
                      ),
                    },
                    {
                      title: '启用',
                      dataIndex: 'enabled',
                      key: 'enabled',
                      width: 90,
                      render: (enabled) => (
                        <Tag color={enabled ? 'success' : 'default'}>
                          {enabled ? '启用' : '停用'}
                        </Tag>
                      ),
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      width: 130,
                      render: (_, row) =>
                        row.isSystem ? (
                          <Tag color="default">系统</Tag>
                        ) : (
                          <Space size={4}>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => openEditTool(row)}
                            />
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => onDeleteTool(row)}
                            />
                          </Space>
                        ),
                    },
                  ]}
                />
              </div>

              <div className="tool-manager-form">
                <div className="tool-manager-form__header">
                  <Text className="field-label">{editingToolId ? '编辑工具' : '新增工具'}</Text>
                  {editingToolId ? (
                    <Tag variant="filled" color="blue">
                      {editingToolId}
                    </Tag>
                  ) : null}
                </div>
                <Form form={toolForm} layout="vertical" initialValues={{ enabled: true }}>
                  <div className="tool-form-row">
                    <Form.Item
                      label="工具 ID"
                      name="id"
                      rules={[{ required: true, message: '必填' }]}
                    >
                      <Input placeholder="例如 codex-custom" disabled={Boolean(editingToolId)} />
                    </Form.Item>
                    <Form.Item
                      label="名称"
                      name="name"
                      rules={[{ required: true, message: '必填' }]}
                    >
                      <Input placeholder="显示名称" />
                    </Form.Item>
                    <Form.Item label="启用" name="enabled" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                  </div>

                  <Form.Item label="技能目录" name="skillDir">
                    <Input placeholder="例如 /Users/you/.agents/skills" />
                  </Form.Item>

                  <div className="tool-manager-toolbar">
                    <Text className="field-label">配置文件</Text>
                    <Space size={8}>
                      <Button
                        size="small"
                        onClick={() =>
                          setEditingConfigFiles((items) => [
                            ...items,
                            { label: '', path: '', kind: 'plaintext' },
                          ])
                        }
                      >
                        添加配置
                      </Button>
                      <Button size="small" onClick={() => void onDetectPaths()}>
                        自动探测
                      </Button>
                    </Space>
                  </div>

                  <div className="tool-config-list">
                    {editingConfigFiles.map((item, index) => (
                      <div key={`${index}-${item.path}`} className="tool-config-item">
                        <Input
                          placeholder="文件名，如 settings.json"
                          value={item.label}
                          onChange={(event) =>
                            setEditingConfigFiles((items) =>
                              items.map((row, idx) =>
                                idx === index ? { ...row, label: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="绝对路径"
                          value={item.path}
                          onChange={(event) =>
                            setEditingConfigFiles((items) =>
                              items.map((row, idx) =>
                                idx === index ? { ...row, path: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <Input
                          placeholder="类型，如 json/toml"
                          value={item.kind}
                          onChange={(event) =>
                            setEditingConfigFiles((items) =>
                              items.map((row, idx) =>
                                idx === index ? { ...row, kind: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            setEditingConfigFiles((items) =>
                              items.filter((_, idx) => idx !== index),
                            )
                          }
                        />
                      </div>
                    ))}
                    {editingConfigFiles.length === 0 ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="无配置文件，可先自动探测或手动添加"
                      />
                    ) : null}
                  </div>

                  <div className="tool-manager-actions">
                    <Button onClick={resetToolForm}>{editingToolId ? '取消' : '重置'}</Button>
                    <Button
                      type="primary"
                      loading={registrySaving}
                      onClick={() => void onSaveTool()}
                    >
                      {editingToolId ? '保存修改' : '保存工具'}
                    </Button>
                  </div>
                </Form>
              </div>
            </div>
          </Modal>

          <Modal
            title="同步技能"
            open={syncModalOpen}
            onCancel={() => setSyncModalOpen(false)}
            onOk={() => void handleSyncSubmit()}
            okText="执行同步"
            cancelText="取消"
            width={950}
            centered
            confirmLoading={isSyncSubmitting}
            okButtonProps={{ disabled: !canSubmitSync }}
            className="sync-modal"
            wrapClassName="sync-modal-wrap"
          >
            <div className="sync-modal__layout">
              <div className="sync-modal__controls sync-modal__card">
                <div className="sync-control-group">
                  <Text className="field-label">源工具</Text>
                  <div className="fixed-source-tool">{selectedTool?.name ?? '-'}</div>
                </div>

                <div className="sync-control-group">
                  <Text className="field-label">目标工具</Text>
                  <Select
                    mode="multiple"
                    size="large"
                    value={syncTargetToolIds}
                    options={syncTargetOptions}
                    placeholder="可多选"
                    onChange={setSyncTargetToolIds}
                    style={{ width: '100%' }}
                  />
                  <div className="quick-actions">
                    <Button
                      size="small"
                      onClick={() =>
                        setSyncTargetToolIds(syncTargetOptions.map((item) => item.value))
                      }
                    >
                      全选
                    </Button>
                    <Button size="small" onClick={() => setSyncTargetToolIds([])}>
                      清空
                    </Button>
                  </div>
                </div>

                <div className="sync-control-group">
                  <Text className="field-label">同步模式</Text>
                  <Segmented
                    block
                    size="large"
                    options={modeOptions}
                    value={syncMode}
                    onChange={(value) => setSyncModeState(value as SyncMode)}
                  />
                </div>

                <div className="sync-control-group">
                  <Text className="field-label">冲突策略</Text>
                  <Segmented
                    className="conflict-segmented"
                    block
                    size="large"
                    options={conflictOptions}
                    value={conflictStrategy}
                    onChange={(value) => setConflictStrategyState(value as ConflictStrategy)}
                  />
                </div>

                <div className="sync-summary">
                  {canSubmitSync
                    ? `将 ${syncSelectedSkillIds.length} 个技能同步到 ${selectedSyncTargetNames}`
                    : '请选择目标工具和技能后执行同步'}
                </div>
              </div>

              <div className="sync-modal__skills sync-modal__card">
                <div className="sync-modal__skills-header">
                  <Text className="field-label">技能选择</Text>
                  <Space>
                    <Tag variant="filled" color="cyan">
                      {syncSelectedSkillIds.length}/{currentSkills.length}
                    </Tag>
                    <Button
                      size="small"
                      onClick={() =>
                        setSyncSelectedSkillIds(filteredSyncSkills.map((skill) => skill.id))
                      }
                    >
                      全选
                    </Button>
                    <Button size="small" onClick={() => setSyncSelectedSkillIds([])}>
                      清空
                    </Button>
                  </Space>
                </div>

                <Input
                  allowClear
                  size="large"
                  prefix={<SearchOutlined />}
                  placeholder="按技能名、描述、路径搜索"
                  value={syncKeyword}
                  onChange={(event) => setSyncKeyword(event.target.value)}
                />

                <div className="sync-skill-scroll">
                  {filteredSyncSkills.map((skill) => (
                    <label
                      key={skill.id}
                      className={`skill-item ${syncSelectedSkillIds.includes(skill.id) ? 'is-selected' : ''}`}
                    >
                      <div className="skill-item__checkbox">
                        <Checkbox
                          checked={syncSelectedSkillIds.includes(skill.id)}
                          onChange={(event) => {
                            setSyncSelectedSkillIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, skill.id])]
                                : current.filter((skillId) => skillId !== skill.id),
                            )
                          }}
                        />
                      </div>
                      <div className="skill-item__body">
                        <div className="skill-item__top">
                          <span className="skill-item__name" title={skill.name}>
                            {skill.name}
                          </span>
                          {skill.updatedAt ? (
                            <span className="skill-item__time">{formatTime(skill.updatedAt)}</span>
                          ) : null}
                        </div>
                        {(skill.summary ?? skill.description) ? (
                          <Text className="skill-item__desc">
                            {skill.summary ?? skill.description}
                          </Text>
                        ) : null}
                        {skill.isSymlink && (
                          <div className="skill-item__tags">
                            <Tag variant="filled" color="gold">
                              软链接
                            </Tag>
                          </div>
                        )}
                        {skill.path ? <Text className="skill-item__path">{skill.path}</Text> : null}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
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
