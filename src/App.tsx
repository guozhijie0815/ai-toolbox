import { startTransition, useEffect, useMemo, useState } from 'react'

import Editor from '@monaco-editor/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  MoreOutlined,
  ReloadOutlined,
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
import { deleteSkill, deleteToolRegistryItem, detectToolPaths, listToolRegistry, openPathInFinder, syncSkills, upsertToolRegistryItem } from './lib/toolboxApi'
import { useToolboxStore } from './store/useToolboxStore'
import type { ConflictStrategy, SkillItem, SyncMode, ToolRegistryConfigFile, ToolRegistryEntry } from './types/toolbox'

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

const SHARED_SKILL_DIR = '/Users/smzdm/.agents/skills'

const normalizeFsPath = (value?: string) =>
  value?.replace(/^~(?=\/)/, '/Users/smzdm').replace(/\/+$/, '')

const isSharedSkillTool = (tool: { id: string; name?: string; configFiles: unknown[]; skillDir?: string }) => {
  const id = tool.id.toLowerCase()
  const name = tool.name?.toLowerCase()
  return (
    id === 'agent' ||
    id === 'agents' ||
    name === '.agent' ||
    name === 'agents skills' ||
    (tool.configFiles.length === 0 && normalizeFsPath(tool.skillDir) === SHARED_SKILL_DIR)
  )
}

const isInteractiveDragTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('button,input,textarea,select,[role="button"],[role="tab"],[role="radio"],[role="switch"],.ant-segmented,.ant-select,.monaco-editor'))

const formatTime = (value?: number) => {
  if (!value) return '未知时间'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

const formatDuration = (seconds: number) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

const hasTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

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

  useEffect(() => {
    startTransition(() => {
      void initialize()
    })
  }, [initialize])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
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
  const currentSkills = selectedTool?.skills ?? []
  const sortedSkills = useMemo(() => {
    return [...currentSkills].sort((a, b) => {
      const timeA = a.updatedAt ?? 0
      const timeB = b.updatedAt ?? 0
      return timeB - timeA
    })
  }, [currentSkills])

  const filteredCurrentSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase()
    if (!keyword) return sortedSkills
    return sortedSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description ?? '').toLowerCase().includes(keyword) ||
        (skill.path ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [sortedSkills, skillKeyword])

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

  const syncTargetOptions = useMemo(
    () => {
      const selectedSkillDir = normalizeFsPath(selectedTool?.skillDir)
      return visibleTools
        .filter((tool) => {
          if (tool.id === selectedTool?.id) return false
          const targetSkillDir = normalizeFsPath(tool.skillDir)
          if (selectedSkillDir && targetSkillDir && selectedSkillDir === targetSkillDir) return false
          return true
        })
        .map((tool) => ({
          label: tool.name,
          value: tool.id,
        }))
    },
    [selectedTool?.id, selectedTool?.skillDir, visibleTools],
  )

  const selectedSyncTargetNames = useMemo(
    () =>
      visibleTools
        .filter((tool) => syncTargetToolIds.includes(tool.id))
        .map((tool) => tool.name)
        .join('、'),
    [syncTargetToolIds, visibleTools],
  )

  const canSubmitSync = syncTargetToolIds.length > 0 && syncSelectedSkillIds.length > 0

  useEffect(() => {
    const validTargetIds = new Set(syncTargetOptions.map((option) => option.value))
    setSyncTargetToolIds((current) => current.filter((toolId) => validTargetIds.has(toolId)))
  }, [syncTargetOptions])

  const isPreview = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)

  const loadRegistryTools = async () => {
    setRegistryLoading(true)
    try {
      const list = await listToolRegistry()
      setRegistryTools(list)
    } catch (error) {
      void messageApi.error(error instanceof Error ? error.message : String(error))
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
  }, [autoSave, isSaving, saveCurrentFile, selectedFile?.dirty, selectedFile?.content, selectedFile?.id])

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
      if (error instanceof Error) {
        void messageApi.error(error.message)
      }
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

    const targetTools = visibleTools.filter((tool) =>
      syncTargetToolIds.includes(tool.id) && syncTargetOptions.some((option) => option.value === tool.id),
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
      void messageApi.error(error instanceof Error ? error.message : String(error))
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
      {skill.isSymlink ? <Tag variant="filled" color="gold">软链接</Tag> : null}
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
        token: resolvedTheme === 'dark'
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
            data-tauri-drag-region
            onMouseDown={handleWindowDragMouseDown}
            onDoubleClick={(event) => void handleWindowDragDoubleClick(event)}
          >
            {/* 交通灯 */}
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

            {/* 标题行：左侧标题 + 右侧操作 */}
            <div className="header-top">
              <div className="header-brand">
                <Text className="eyebrow">Skill Sync Console</Text>
                <Title level={2}>工具配置台</Title>
                <Text className="header-copy">
                  管理本机 AI 开发工具的配置文件、技能目录和跨工具同步。
                </Text>
              </div>
              <div className="header-actions">
                <div className="tool-indicator">
                  <Text className="header-tool-name">{selectedTool?.name ?? '未选择'}</Text>
                  {selectedFile?.dirty && (
                    <span className="unsaved-dot" aria-label="未保存" />
                  )}
                </div>
                <Button icon={<SettingOutlined />} onClick={() => void openManager()}>
                  管理工具
                </Button>
                <Button icon={<ReloadOutlined />} loading={isToolsLoading} onClick={() => void refreshTools()}>
                  刷新
                </Button>
              </div>
            </div>

            {/* 底栏：左侧主题/运行时 + 右侧空（或保留扩展） */}
            <div className="header-bottom">
              <div className="header-meta-bar">
                <Segmented
                  options={themeOptions}
                  value={themeMode}
                  onChange={(value) => setThemeMode(value as ThemeMode)}
                />
                <Tag variant="filled" color={isPreview ? 'gold' : 'success'} className="runtime-mini-tag">
                  {isPreview ? 'Preview' : 'Tauri'} · {visibleTools.length} tools
                </Tag>
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
                          </span>
                          {hasConfig && (
                            <span
                              className="tool-item__edit"
                              onClick={(event) => {
                                event.stopPropagation()
                                if (editorMode) {
                                  // 如果已经在编辑模式，点击则关闭
                                  setEditorMode(false)
                                } else if (active) {
                                  setEditorMode(true)
                                  if (!selectedConfigId && tool.configFiles[0]) {
                                    void selectConfigFile(tool.configFiles[0].id)
                                  }
                                } else {
                                  void selectTool(tool.id)
                                  setTimeout(() => {
                                    setEditorMode(true)
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
                        {tool.description ? <Text className="tool-item__desc">{tool.description}</Text> : null}
                        <div className="tool-item__meta">
                          <span>{tool.configFiles.length} configs</span>
                          <span>{tool.skills.length} skills</span>
                          {dirtyCount > 0 ? <span>{dirtyCount} unsaved</span> : null}
                        </div>
                        {hasConfig && (
                          <div className="tool-configs">
                            <div className="tool-configs__label">配置文件</div>
                            <div className="tool-configs__list">
                              {tool.configFiles.map((file) => (
                                <div
                                  key={file.id}
                                  className="tool-config-file"
                                  role="button"
                                  tabIndex={0}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void selectConfigFile(file.id)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.stopPropagation()
                                      void selectConfigFile(file.id)
                                    }
                                  }}
                                >
                                  <FileTextOutlined className="config-icon" />
                                  <span className="config-name">{file.name}</span>
                                  <span className="config-type">{file.language}</span>
                                  {file.dirty ? <span className="dirty-indicator" /> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </aside>

              {/* 中间：技能列表 / 编辑器（push 滑动） */}
              <main className="panel panel--skills">
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
                          <Tooltip key={skill.id} title={skill.fullDescription ?? skill.description ?? skill.path}>
                            <div className="skill-entry">
                              <div className="skill-entry__top">
                                <span className="skill-entry__name" title={skill.name}>{skill.name}</span>
                                <div className="skill-entry__actions">
                                  {skill.updatedAt ? <span className="skill-entry__time">{formatTime(skill.updatedAt)}</span> : null}
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
                              {skill.path ? (
                                <div className="skill-entry__path-row">
                                  <Text className="skill-entry__path skill-entry__path--no-margin" style={{ flex: 1, minWidth: 0 }}>{skill.path}</Text>
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
                          </Tooltip>
                        ))
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={currentSkills.length > 0 ? '没有匹配的技能' : '当前工具没有技能'}
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
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工具没有配置文件" />
                        )}
                      </div>
                      <Space>
                        <Switch
                          checked={autoSave}
                          onChange={setAutoSave}
                          checkedChildren="自动保存开"
                          unCheckedChildren="自动保存关"
                        />
                        <Button
                          icon={<FolderOpenOutlined />}
                          disabled={!selectedFile}
                          onClick={() => selectedFile && void openPathInFinder(selectedFile.path)}
                        >
                          打开所在目录
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
                            } catch (error) {
                              void messageApi.error('保存失败')
                            }
                          }}
                        >
                          保存配置
                        </Button>
                        <Button
                          type="text"
                          icon={<CloseOutlined />}
                          onClick={() => setEditorMode(false)}
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
              </main>

              {/* 右侧：变动洞察（普通）/ 技能列表+洞察（编辑） */}
              <aside className="panel panel--insights">
                <div className="insights-content">
                  <div className="panel-header">
                    <div>
                      <Text className="panel-kicker">Insights</Text>
                      <Title level={4}>变动洞察</Title>
                    </div>
                    <Button type="link" size="small" onClick={() => void refreshInsights()} loading={isInsightsLoading}>
                      刷新
                    </Button>
                  </div>

                  {skillInsights.length > 0 ? (
                    <div className="skill-insights__list" style={{ overflow: 'auto', flex: 1 }}>
                      {skillInsights.map((insight) => (
                        <div key={insight.skillName} className="skill-insight-card">
                          <div className="skill-insight-card__top">
                            <div className="skill-insight-card__skill">
                              <span className="skill-insight-card__name">{insight.skillName}</span>
                              <span className="skill-insight-card__leader" data-tool={insight.leaderToolId}>
                                {insight.leaderToolName}
                              </span>
                            </div>
                          </div>
                          <div className="skill-insight-card__laggers">
                            {insight.laggingTools.map((lagger) => (
                              <div key={lagger.toolId} className="skill-insight-card__lagger" data-tool={lagger.toolId}>
                                <span className="skill-insight-card__lagger-name">{lagger.toolName}</span>
                                <span className="skill-insight-card__behind">{formatDuration(lagger.behindSeconds)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无变动洞察" style={{ marginTop: 40 }} />
                  )}

                  {/* 工具统计信息 */}
                  <div className="tool-info-section">
                    <Text className="field-label">工具统计</Text>
                    <div className="tool-info-grid">
                      <div className="tool-info-item">
                        <span className="tool-info-value">{selectedTool?.configFiles.length ?? 0}</span>
                        <span className="tool-info-label">配置文件</span>
                      </div>
                      <div className="tool-info-item">
                        <span className="tool-info-value">{selectedTool?.skills.length ?? 0}</span>
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
                          <Title level={4} style={{ marginTop: 4 }}>当前技能</Title>
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
                            <Tooltip key={skill.id} title={skill.fullDescription ?? skill.description ?? skill.path}>
                              <div className="skill-entry">
                                <div className="skill-entry__top">
                                  <span className="skill-entry__name" title={skill.name}>{skill.name}</span>
                                  <div className="skill-entry__actions">
                                    {skill.updatedAt ? <span className="skill-entry__time">{formatTime(skill.updatedAt)}</span> : null}
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
                            </Tooltip>
                          ))
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工具没有技能" />
                        )}
                      </div>
                    </div>

                    {/* 下方：变动洞察 */}
                    <div className="insights-block">
                      <div className="insights-block__header">
                        <div>
                          <Text className="panel-kicker">Insights</Text>
                          <Title level={4} style={{ marginTop: 4 }}>变动洞察</Title>
                        </div>
                        <Button type="link" size="small" onClick={() => void refreshInsights()} loading={isInsightsLoading}>
                          刷新
                        </Button>
                      </div>
                      <div className="insights-block__content">
                        {skillInsights.length > 0 ? (
                          skillInsights.map((insight) => (
                            <div key={insight.skillName} className="skill-insight-card">
                              <div className="skill-insight-card__top">
                                <div className="skill-insight-card__skill">
                                  <span className="skill-insight-card__name">{insight.skillName}</span>
                                  <span className="skill-insight-card__leader" data-tool={insight.leaderToolId}>
                                    {insight.leaderToolName}
                                  </span>
                                </div>
                              </div>
                              <div className="skill-insight-card__laggers">
                                {insight.laggingTools.map((lagger) => (
                                  <div key={lagger.toolId} className="skill-insight-card__lagger" data-tool={lagger.toolId}>
                                    <span className="skill-insight-card__lagger-name">{lagger.toolName}</span>
                                    <span className="skill-insight-card__behind">{formatDuration(lagger.behindSeconds)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无变动洞察" />
                        )}
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
                          <div className="tool-registry-name">{row.name}</div>
                          <Text type="secondary">{row.id}</Text>
                        </div>
                      ),
                    },
                    {
                      title: '启用',
                      dataIndex: 'enabled',
                      key: 'enabled',
                      width: 90,
                      render: (enabled) => <Tag color={enabled ? 'success' : 'default'}>{enabled ? '启用' : '停用'}</Tag>,
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      width: 130,
                      render: (_, row) => (
                        <Space size={4}>
                          <Button size="small" icon={<EditOutlined />} onClick={() => openEditTool(row)} />
                          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDeleteTool(row)} />
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>

              <div className="tool-manager-form">
                <div className="tool-manager-form__header">
                  <Text className="field-label">{editingToolId ? '编辑工具' : '新增工具'}</Text>
                  {editingToolId ? <Tag variant="filled" color="blue">{editingToolId}</Tag> : null}
                </div>
                <Form form={toolForm} layout="vertical" initialValues={{ enabled: true }}>
                  <div className="tool-form-row">
                    <Form.Item label="工具 ID" name="id" rules={[{ required: true, message: '必填' }]}>
                      <Input placeholder="例如 codex-custom" disabled={Boolean(editingToolId)} />
                    </Form.Item>
                    <Form.Item label="名称" name="name" rules={[{ required: true, message: '必填' }]}>
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
                          setEditingConfigFiles((items) => [...items, { label: '', path: '', kind: 'plaintext' }])
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
                              items.map((row, idx) => (idx === index ? { ...row, label: event.target.value } : row)),
                            )
                          }
                        />
                        <Input
                          placeholder="绝对路径"
                          value={item.path}
                          onChange={(event) =>
                            setEditingConfigFiles((items) =>
                              items.map((row, idx) => (idx === index ? { ...row, path: event.target.value } : row)),
                            )
                          }
                        />
                        <Input
                          placeholder="类型，如 json/toml"
                          value={item.kind}
                          onChange={(event) =>
                            setEditingConfigFiles((items) =>
                              items.map((row, idx) => (idx === index ? { ...row, kind: event.target.value } : row)),
                            )
                          }
                        />
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            setEditingConfigFiles((items) => items.filter((_, idx) => idx !== index))
                          }
                        />
                      </div>
                    ))}
                    {editingConfigFiles.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无配置文件，可先自动探测或手动添加" /> : null}
                  </div>

                  <div className="tool-manager-actions">
                    <Button onClick={resetToolForm}>{editingToolId ? '取消' : '重置'}</Button>
                    <Button type="primary" loading={registrySaving} onClick={() => void onSaveTool()}>
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
                    <Button size="small" onClick={() => setSyncTargetToolIds(syncTargetOptions.map((item) => item.value))}>
                      全选
                    </Button>
                    <Button size="small" onClick={() => setSyncTargetToolIds([])}>
                      清空
                    </Button>
                  </div>
                </div>

                <div className="sync-control-group">
                  <Text className="field-label">同步模式</Text>
                  <Segmented block size="large" options={modeOptions} value={syncMode} onChange={(value) => setSyncModeState(value as SyncMode)} />
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
                    <Button size="small" onClick={() => setSyncSelectedSkillIds(filteredSyncSkills.map((skill) => skill.id))}>
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
                    <Tooltip key={skill.id} title={skill.fullDescription ?? skill.description ?? skill.path}>
                      <label className="skill-item">
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
                        <div className="skill-item__body">
                          <div className="skill-item__top">
                            <span className="skill-item__name" title={skill.name}>{skill.name}</span>
                            <div className="skill-item__tags">
                              {skill.isSymlink ? <Tag variant="filled" color="gold">软链接</Tag> : null}
                              {skill.updatedAt ? <span className="skill-item__time">{formatTime(skill.updatedAt)}</span> : null}
                            </div>
                          </div>
                          {skill.summary ?? skill.description ? (
                            <Text className="skill-item__desc">{skill.summary ?? skill.description}</Text>
                          ) : null}
                          {skill.path ? <Text className="skill-item__path">{skill.path}</Text> : null}
                        </div>
                      </label>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </Modal>
        </div>
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
