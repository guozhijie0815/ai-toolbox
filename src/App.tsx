import { startTransition, useEffect, useMemo, useState } from 'react'

import Editor from '@monaco-editor/react'
import {
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SyncOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Checkbox,
  ConfigProvider,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd'

import './App.css'
import { deleteSkill, listConfigBackups, openPathInFinder, syncSkills } from './lib/toolboxApi'
import { useToolboxStore } from './store/useToolboxStore'
import type { BackupItem, ConflictStrategy, SkillItem, SyncMode } from './types/toolbox'

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
  { label: 'skip', value: 'skip' },
  { label: 'overwrite', value: 'overwrite' },
  { label: 'rename', value: 'rename' },
]

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
]

const formatTime = (value?: number) => {
  if (!value) return '未知时间'
  return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false })
}

function App() {
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
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [isBackupsLoading, setIsBackupsLoading] = useState(false)
  const [skillKeyword, setSkillKeyword] = useState('')
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncTargetToolIds, setSyncTargetToolIds] = useState<string[]>([])
  const [syncSelectedSkillIds, setSyncSelectedSkillIds] = useState<string[]>([])
  const [syncMode, setSyncModeState] = useState<SyncMode>('copy')
  const [conflictStrategy, setConflictStrategyState] = useState<ConflictStrategy>('skip')
  const [syncKeyword, setSyncKeyword] = useState('')
  const [isSyncSubmitting, setIsSyncSubmitting] = useState(false)

  const tools = useToolboxStore((state) => state.tools)
  const selectedToolId = useToolboxStore((state) => state.selectedToolId)
  const selectedConfigId = useToolboxStore((state) => state.selectedConfigId)
  const isToolsLoading = useToolboxStore((state) => state.isToolsLoading)
  const isConfigLoading = useToolboxStore((state) => state.isConfigLoading)
  const isSaving = useToolboxStore((state) => state.isSaving)
  const feedback = useToolboxStore((state) => state.feedback)
  const initialize = useToolboxStore((state) => state.initialize)
  const refreshTools = useToolboxStore((state) => state.refreshTools)
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

  const visibleTools = useMemo(() => tools.filter((tool) => tool.id !== 'agents'), [tools])

  const selectedTool = visibleTools.find((tool) => tool.id === selectedToolId) ?? visibleTools[0]
  const selectedFile = selectedTool?.configFiles.find((file) => file.id === selectedConfigId)
  const currentSkills = selectedTool?.skills ?? []
  const filteredCurrentSkills = useMemo(() => {
    const keyword = skillKeyword.trim().toLowerCase()
    if (!keyword) return currentSkills
    return currentSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description ?? '').toLowerCase().includes(keyword) ||
        (skill.path ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [currentSkills, skillKeyword])

  const filteredSyncSkills = useMemo(() => {
    const keyword = syncKeyword.trim().toLowerCase()
    if (!keyword) return currentSkills
    return currentSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description ?? '').toLowerCase().includes(keyword) ||
        (skill.path ?? '').toLowerCase().includes(keyword)
      )
    })
  }, [currentSkills, syncKeyword])

  const syncTargetOptions = useMemo(
    () =>
      visibleTools
        .filter((tool) => tool.id !== selectedTool?.id)
        .map((tool) => ({
          label: tool.name,
          value: tool.id,
        })),
    [selectedTool?.id, visibleTools],
  )

  const isPreview = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)

  useEffect(() => {
    let cancelled = false

    const loadBackups = async () => {
      if (!selectedFile?.path || isPreview) {
        setBackups([])
        return
      }

      setIsBackupsLoading(true)
      try {
        const items = await listConfigBackups(selectedFile.path)
        if (!cancelled) {
          setBackups(items)
        }
      } catch (error) {
        if (!cancelled) {
          setBackups([])
          void messageApi.error(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!cancelled) {
          setIsBackupsLoading(false)
        }
      }
    }

    void loadBackups()
    return () => {
      cancelled = true
    }
  }, [isPreview, messageApi, selectedFile?.path])

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

  const handleSyncSubmit = async () => {
    if (!selectedTool) {
      void messageApi.error('没有可用的源工具')
      return
    }

    const targetTools = visibleTools.filter((tool) => syncTargetToolIds.includes(tool.id))
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
      content: `确认删除 ${skill.name} 吗？`,
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
      {skill.hasSkillMd ? <Tag bordered={false}>SKILL.md</Tag> : null}
      {skill.isSymlink ? <Tag bordered={false} color="gold">软链接</Tag> : null}
      {skill.updatedAt ? <Tag bordered={false}>{formatTime(skill.updatedAt)}</Tag> : null}
    </div>
  )

  const renderSkillDescription = (skill: SkillItem) => {
    const text = skill.summary ?? skill.description
    return text ? <Text className="skill-entry__desc">{text}</Text> : null
  }

  return (
    <ConfigProvider
      theme={{
        algorithm,
        token: {
          colorPrimary: resolvedTheme === 'dark' ? '#ef7d3b' : '#c96a31',
          colorInfo: resolvedTheme === 'dark' ? '#ef7d3b' : '#c96a31',
          colorSuccess: '#55c27b',
          colorWarning: '#ffbb52',
          colorError: '#ff6b6b',
          colorBgBase: resolvedTheme === 'dark' ? '#101416' : '#eef2f5',
          colorTextBase: resolvedTheme === 'dark' ? '#f5efe7' : '#18222d',
          borderRadius: 16,
          fontFamily:
            '"Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif',
        },
      }}
    >
      <AntdApp>
        {contextHolder}
        <div className="toolbox-shell" data-theme={resolvedTheme}>
          <div className="window-dragbar" data-tauri-drag-region />

          <header className="app-header" data-tauri-drag-region>
            <div>
              <Text className="eyebrow">Skill Sync Console</Text>
              <Title level={2}>工具配置台</Title>
              <Text className="header-copy">
                管理本机 AI 开发工具的配置文件、技能目录和跨工具同步。
              </Text>
            </div>
            <div className="header-actions">
              <Segmented
                options={themeOptions}
                value={themeMode}
                onChange={(value) => setThemeMode(value as ThemeMode)}
              />
              <Tag bordered={false} color={isPreview ? 'gold' : 'success'}>
                {isPreview ? 'Preview Runtime' : 'Tauri Runtime'}
              </Tag>
              <Tag bordered={false}>{visibleTools.length} tools</Tag>
              <Button icon={<ReloadOutlined />} loading={isToolsLoading} onClick={() => void refreshTools()}>
                刷新
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={isSaving}
                disabled={!selectedFile || !selectedFile.dirty}
                onClick={() => void saveCurrentFile()}
              >
                保存配置
              </Button>
            </div>
          </header>

          <div className="app-grid">
            <aside className="panel panel--nav">
              <div className="panel-header">
                <div>
                  <Text className="panel-kicker">Source</Text>
                  <Title level={4}>工具列表</Title>
                </div>
                <Tag bordered={false} color="orange">
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

                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`tool-item${active ? ' is-active' : ''}`}
                      onClick={() => void selectTool(tool.id)}
                    >
                      <div className="tool-item__title">
                        <span className="tool-item__name">
                          <ToolOutlined />
                          {tool.name}
                        </span>
                      </div>
                      {tool.description ? <Text className="tool-item__desc">{tool.description}</Text> : null}
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

            <main className="panel panel--workspace">
              <div className="panel-header panel-header--workspace">
                <div>
                  <Text className="panel-kicker">Editor</Text>
                  <Title level={4}>配置文件</Title>
                </div>
                {selectedTool?.path ? <Text className="path-chip">{selectedTool.path}</Text> : null}
              </div>

              <div className="config-strip">
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

              <div className="editor-toolbar">
                <div className="editor-toolbar__meta">
                  <Tag bordered={false} color="orange">
                    {selectedFile?.language ?? 'plaintext'}
                  </Tag>
                  {selectedFile?.dirty ? (
                    <Tag bordered={false} color="error">
                      未保存
                    </Tag>
                  ) : (
                    <Tag bordered={false} color="success">
                      已保存
                    </Tag>
                  )}
                  <Switch
                    checked={autoSave}
                    onChange={setAutoSave}
                    checkedChildren="自动保存"
                    unCheckedChildren="手动"
                  />
                </div>

                <Space className="editor-toolbar__path" wrap={false}>
                  <Button
                    icon={<FolderOpenOutlined />}
                    disabled={!selectedFile}
                    onClick={() => selectedFile && void openPathInFinder(selectedFile.path)}
                  >
                    打开所在目录
                  </Button>
                  <Text className="path-chip">{selectedFile?.path ?? '请选择配置文件'}</Text>
                </Space>
              </div>

              <div className="backup-strip">
                <div className="backup-strip__title">
                  <Text className="field-label">最近备份</Text>
                  <Space size={8}>
                    {isBackupsLoading ? <Spin size="small" /> : null}
                    <Tag bordered={false}>{backups.length}</Tag>
                  </Space>
                </div>
                {backups.length > 0 ? (
                  <div className="backup-list">
                    {backups.slice(0, 5).map((backup) => (
                      <button
                        key={backup.path}
                        type="button"
                        className="backup-item"
                        onClick={() => void openPathInFinder(backup.path)}
                      >
                        <span className="backup-item__name">{backup.name}</span>
                        <span className="backup-item__time">{formatTime(backup.updatedAt)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Text className="backup-empty">当前文件还没有备份，保存后会显示在这里。</Text>
                )}
              </div>

              <div className="editor-wrap">
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
                    <Empty description="左侧选择工具后，在这里查看和编辑配置" />
                  </div>
                )}
              </div>
            </main>

            <aside className="panel panel--skills">
              <div className="panel-header">
                <div>
                  <Text className="panel-kicker">Skills</Text>
                  <Title level={4}>当前技能</Title>
                </div>
                <Space>
                  <Tag bordered={false} color="cyan">
                    {filteredCurrentSkills.length}/{currentSkills.length}
                  </Tag>
                  <Button type="primary" icon={<SyncOutlined />} onClick={openSyncModal}>
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
                          <span className="skill-entry__name">{skill.name}</span>
                          <div className="skill-entry__actions">
                            {renderSkillMeta(skill)}
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              aria-label={`删除 ${skill.name}`}
                              onClick={() => handleDeleteSkill(skill)}
                            />
                          </div>
                        </div>
                        {renderSkillDescription(skill)}
                        {skill.path ? <Text className="skill-entry__path">{skill.path}</Text> : null}
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
            </aside>
          </div>

          <Modal
            title="同步技能"
            open={syncModalOpen}
            onCancel={() => setSyncModalOpen(false)}
            onOk={() => void handleSyncSubmit()}
            okText="执行同步"
            cancelText="取消"
            width={1180}
            confirmLoading={isSyncSubmitting}
            className="sync-modal"
          >
            <div className="sync-modal__layout">
              <div className="sync-modal__controls">
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
                    block
                    size="large"
                    options={conflictOptions}
                    value={conflictStrategy}
                    onChange={(value) => setConflictStrategyState(value as ConflictStrategy)}
                  />
                </div>
              </div>

              <div className="sync-modal__skills">
                <div className="sync-modal__skills-header">
                  <Text className="field-label">技能选择</Text>
                  <Space>
                    <Tag bordered={false} color="cyan">
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
                            <span className="skill-item__name">{skill.name}</span>
                            <div className="skill-item__tags">
                              {skill.hasSkillMd ? <Tag bordered={false}>SKILL.md</Tag> : null}
                              {skill.isSymlink ? <Tag bordered={false} color="gold">软链接</Tag> : null}
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
