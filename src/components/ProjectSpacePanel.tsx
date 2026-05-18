import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Drawer,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  Checkbox,
  Card,
  message,
} from 'antd'
import {
  SearchOutlined,
  FolderOpenOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  SyncOutlined,
  PlusOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons'
import { useToolboxStore } from '../store/useToolboxStore'
import { getErrorMessage } from '../utils/errorUtils'
import type { ToolItem } from '../types/toolbox'

const { Text, Title } = Typography

interface Props {
  open: boolean
  tools: ToolItem[]
  syncMode: string
  conflictStrategy: string
  onClose: () => void
  onSyncComplete: () => void
}

export default function ProjectSpacePanel({
  open,
  tools,
  syncMode,
  conflictStrategy,
  onClose,
  onSyncComplete,
}: Props) {
  const [projectPath, setProjectPath] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [batchSyncOpen, setBatchSyncOpen] = useState(false)
  const [batchSyncTargetToolId, setBatchSyncTargetToolId] = useState('')
  const [batchSyncing, setBatchSyncing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importSkillName, setImportSkillName] = useState('')
  const [importSourceToolId, setImportSourceToolId] = useState('')
  const [importing, setImporting] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)

  const loadProjectSpace = useToolboxStore((state) => state.loadProjectSpace)
  const importToProject = useToolboxStore((state) => state.importToProject)
  const exportFromProject = useToolboxStore((state) => state.exportFromProject)
  const syncFromProjectToTool = useToolboxStore((state) => state.syncFromProjectToTool)
  const projectSpace = useToolboxStore((state) => state.projectSpace)
  const isProjectSpaceLoading = useToolboxStore((state) => state.isProjectSpaceLoading)

  const loadSkills = useCallback(async () => {
    if (!projectPath) return
    try {
      await loadProjectSpace(projectPath)
    } catch (error) {
      message.error(getErrorMessage(error, '加载失败'))
    }
  }, [projectPath, loadProjectSpace])

  useEffect(() => {
    if (open && projectPath) {
      void loadSkills()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开时重置筛选状态
      setKeyword('')
      setSelectedSkills(new Set())
    }
  }, [open, projectPath, loadSkills])

  const filteredSkills = useMemo(() => {
    if (!projectSpace) return []
    let result = projectSpace.skills
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase()
      result = result.filter(
        (s: { name: string; description?: string }) =>
          s.name.toLowerCase().includes(k) || (s.description ?? '').toLowerCase().includes(k),
      )
    }
    return result
  }, [projectSpace, keyword])

  const toggleSkillSelection = (name: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const openBatchSyncModal = () => {
    if (selectedSkills.size === 0) {
      message.warning('请至少选择一个技能')
      return
    }
    setBatchSyncTargetToolId(tools[0]?.id ?? '')
    setBatchSyncOpen(true)
  }

  const handleBatchSync = async () => {
    if (!batchSyncTargetToolId || !projectPath) {
      message.warning('请选择目标工具')
      return
    }
    setBatchSyncing(true)
    try {
      for (const skillName of selectedSkills) {
        await syncFromProjectToTool(skillName, projectPath, batchSyncTargetToolId)
      }
      message.success(`已同步 ${selectedSkills.size} 个技能`)
      setBatchSyncOpen(false)
      setSelectedSkills(new Set())
      onSyncComplete()
    } catch (error) {
      message.error(getErrorMessage(error, '同步失败'))
    } finally {
      setBatchSyncing(false)
    }
  }

  const openImportModal = (skillName: string) => {
    setImportSkillName(skillName)
    setImportSourceToolId(tools[0]?.id ?? '')
    setImportOpen(true)
  }

  const handleImport = async () => {
    if (!importSourceToolId || !projectPath) {
      message.warning('请选择源工具')
      return
    }
    setImporting(true)
    try {
      await importToProject(importSkillName, projectPath, importSourceToolId)
      message.success('导入成功')
      setImportOpen(false)
      await loadSkills()
    } catch (error) {
      message.error(getErrorMessage(error, '导入失败'))
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async (skillName: string) => {
    if (!projectPath) return
    try {
      await exportFromProject(skillName, projectPath)
      message.success('导出成功')
      await loadSkills()
    } catch (error) {
      message.error(getErrorMessage(error, '导出失败'))
    }
  }

  const handleSelectProject = async () => {
    if (!projectPath.trim()) {
      message.warning('请输入项目路径')
      return
    }
    await loadSkills()
    setAddProjectOpen(false)
  }

  const toolOptions = useMemo(() => tools.map((t) => ({ label: t.name, value: t.id })), [tools])

  return (
    <>
      <Drawer
        className="project-space-drawer"
        title={
          <div className="project-space-title">
            <Title level={4} className="project-space-title__text">
              项目空间
            </Title>
            {projectPath && (
              <Text className="project-space-title__meta" ellipsis style={{ maxWidth: 300 }}>
                {projectPath}
              </Text>
            )}
          </div>
        }
        placement="right"
        size="large"
        open={open}
        onClose={onClose}
        extra={
          <Space className="project-space-actions">
            <Button icon={<FolderOpenOutlined />} onClick={() => setAddProjectOpen(true)}>
              选择项目
            </Button>
            <Button
              icon={<PlusOutlined />}
              loading={isProjectSpaceLoading}
              onClick={() => void loadSkills()}
            >
              刷新
            </Button>
          </Space>
        }
      >
        {!projectPath ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请先选择项目目录"
            style={{ marginTop: 80 }}
          />
        ) : (
          <div className="project-space-shell">
            <div className="project-space-toolbar">
              <Input
                className="project-space-search"
                prefix={<SearchOutlined />}
                placeholder="搜索技能名称或描述"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                allowClear
              />
            </div>

            {selectedSkills.size > 0 && (
              <Card className="project-space-selection" bordered={false}>
                <div className="project-space-selection__info">
                  <CheckSquareOutlined />
                  <Text>已选择 {selectedSkills.size} 个技能</Text>
                </div>
                <div className="project-space-selection__actions">
                  <Button size="small" type="primary" onClick={openBatchSyncModal}>
                    批量同步
                  </Button>
                  <Button size="small" onClick={() => setSelectedSkills(new Set())}>
                    取消
                  </Button>
                </div>
              </Card>
            )}

            {isProjectSpaceLoading ? (
              <div className="project-space-loading">
                <Spin size="large" />
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="project-space-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={keyword.trim() ? '未找到匹配结果' : '项目暂无技能'}
                />
              </div>
            ) : (
              <div className="project-space-list">
                {filteredSkills.map((skill) => {
                  const selected = selectedSkills.has(skill.name)

                  return (
                    <Card
                      key={skill.name}
                      className={`project-space-card ${selected ? 'is-selected' : ''}`}
                      bordered={false}
                    >
                      <div className="project-space-card__select">
                        <Checkbox
                          checked={selected}
                          onChange={() => toggleSkillSelection(skill.name)}
                        />
                      </div>

                      <div className="project-space-card__main">
                        <div className="project-space-card__top">
                          <div className="project-space-card__identity">
                            <Text className="project-space-card__name">{skill.name}</Text>
                            {skill.hasSkillMd && (
                              <Tag className="project-space-card__doc-tag" color="green">
                                skill.md
                              </Tag>
                            )}
                          </div>
                        </div>

                        {skill.description && (
                          <p className="project-space-card__description">{skill.description}</p>
                        )}
                      </div>

                      <div className="project-space-card__ops">
                        <Tooltip title="同步到工具">
                          <Button
                            icon={<SyncOutlined />}
                            size="small"
                            onClick={() => {
                              if (tools.length > 0 && projectPath) {
                                syncFromProjectToTool(skill.name, projectPath, tools[0].id)
                              }
                            }}
                          />
                        </Tooltip>
                        <Tooltip title="从工具导入">
                          <Button
                            icon={<CloudDownloadOutlined />}
                            size="small"
                            onClick={() => openImportModal(skill.name)}
                          />
                        </Tooltip>
                        <Tooltip title="导出到中央仓库">
                          <Button
                            icon={<CloudUploadOutlined />}
                            size="small"
                            onClick={() => handleExport(skill.name)}
                          />
                        </Tooltip>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 选择项目 */}
      <Modal
        title="选择项目目录"
        open={addProjectOpen}
        onOk={handleSelectProject}
        onCancel={() => {
          setAddProjectOpen(false)
          setProjectPath('')
        }}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>项目路径：</Text>
          <Input
            placeholder="/path/to/your/project"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            支持包含 .claude/skills、.codex/skills 等项目目录
          </Text>
        </Space>
      </Modal>

      {/* 从工具导入 */}
      <Modal
        title={`导入技能到项目：${importSkillName}`}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => setImportOpen(false)}
        confirmLoading={importing}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择源工具：</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择源工具"
            value={importSourceToolId}
            onChange={setImportSourceToolId}
            options={toolOptions}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            将从源工具的技能目录中导入 {importSkillName} 到项目空间
          </Text>
        </Space>
      </Modal>

      {/* 批量同步 */}
      <Modal
        title={`批量同步 ${selectedSkills.size} 个技能到工具`}
        open={batchSyncOpen}
        onOk={handleBatchSync}
        onCancel={() => setBatchSyncOpen(false)}
        confirmLoading={batchSyncing}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择目标工具：</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择目标工具"
            value={batchSyncTargetToolId}
            onChange={setBatchSyncTargetToolId}
            options={toolOptions}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            同步模式：{syncMode}，冲突策略：{conflictStrategy}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            将同步：{Array.from(selectedSkills).join(', ')}
          </Text>
        </Space>
      </Modal>
    </>
  )
}
