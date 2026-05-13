import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  ScanOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  batchImportToCenter,
  batchSyncFromCenter,
  deleteCenterSkill,
  discoverCenterSkills,
  installSkillFromGitToCenter,
  listCenterSkills,
  setSkillCategory,
  syncFromCenter,
  importToCenter,
} from '../lib/toolboxApi'
import type { CenterSkillInfo, DiscoveredSkill, ImportOutcome, SyncOutcome } from '../lib/toolboxApi'
import type { SyncMode, ConflictStrategy, ToolItem } from '../types/toolbox'

const { Text, Title } = Typography

interface Props {
  open: boolean
  tools: ToolItem[]
  syncMode: SyncMode
  conflictStrategy: ConflictStrategy
  onClose: () => void
  onSyncComplete: () => void
}

export default function CenterRepoPanel({
  open,
  tools,
  syncMode,
  conflictStrategy,
  onClose,
  onSyncComplete,
}: Props) {
  const [skills, setSkills] = useState<CenterSkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [installOpen, setInstallOpen] = useState(false)
  const [gitUrl, setGitUrl] = useState('')
  const [installing, setInstalling] = useState(false)

  const [syncOpen, setSyncOpen] = useState(false)
  const [syncSkillName, setSyncSkillName] = useState('')
  const [syncTargetToolId, setSyncTargetToolId] = useState('')
  const [syncing, setSyncing] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importSkillName, setImportSkillName] = useState('')
  const [importSourceToolId, setImportSourceToolId] = useState('')
  const [importing, setImporting] = useState(false)

  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredSkill[]>([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [selectedDiscovered, setSelectedDiscovered] = useState<Set<string>>(new Set())
  const [importingDiscovered, setImportingDiscovered] = useState(false)

  const [filterType, setFilterType] = useState<'all' | 'unsynced' | 'partial' | 'fullySynced'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'custom' | 'git'>('custom')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [batchSyncOpen, setBatchSyncOpen] = useState(false)
  const [batchSyncTargetToolId, setBatchSyncTargetToolId] = useState('')
  const [batchSyncing, setBatchSyncing] = useState(false)

  const [batchCategoryOpen, setBatchCategoryOpen] = useState(false)
  const [batchCategoryValue, setBatchCategoryValue] = useState('custom')
  const [settingCategory, setSettingCategory] = useState(false)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listCenterSkills()
      setSkills(data)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      void loadSkills()
      setKeyword('')
      setFilterType('all')
      setSourceFilter('custom')
      setSelectedSkills(new Set())
    }
  }, [open, loadSkills])

  const getSkillFilterStatus = (skill: CenterSkillInfo) => {
    const statuses = skill.syncStatuses
    if (statuses.length === 0) return 'unsynced' as const
    const syncedCount = statuses.filter((s) => s.synced).length
    if (syncedCount === 0) return 'unsynced' as const
    if (syncedCount === statuses.length) return 'fullySynced' as const
    return 'partial' as const
  }

  const filteredSkills = useMemo(() => {
    let result = skills
    if (sourceFilter === 'custom') {
      result = result.filter((s) => s.sourceType === 'custom')
    } else if (sourceFilter === 'git') {
      result = result.filter((s) => s.sourceType === 'git')
    }
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(k) ||
          (s.description ?? '').toLowerCase().includes(k),
      )
    }
    if (filterType !== 'all') {
      result = result.filter((s) => getSkillFilterStatus(s) === filterType)
    }
    return result
  }, [skills, keyword, filterType, sourceFilter])

  const handleInstall = async () => {
    if (!gitUrl.trim()) {
      message.warning('请输入 Git 地址')
      return
    }
    setInstalling(true)
    try {
      const result = await installSkillFromGitToCenter(gitUrl.trim())
      message.success(result)
      setInstallOpen(false)
      setGitUrl('')
      await loadSkills()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '安装失败')
    } finally {
      setInstalling(false)
    }
  }

  const handleDelete = (skillName: string) => {
    Modal.confirm({
      title: '删除中央仓库技能',
      content: `确定要删除 ${skillName} 吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteCenterSkill(skillName)
          message.success('删除成功')
          await loadSkills()
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败')
        }
      },
    })
  }

  const openSyncModal = (skillName: string) => {
    setSyncSkillName(skillName)
    setSyncTargetToolId(tools[0]?.id ?? '')
    setSyncOpen(true)
  }

  const handleSync = async () => {
    if (!syncTargetToolId) {
      message.warning('请选择目标工具')
      return
    }
    setSyncing(true)
    try {
      const result: SyncOutcome = await syncFromCenter(
        syncSkillName,
        syncTargetToolId,
        syncMode,
        conflictStrategy,
      )
      if (result.status === 'success') {
        message.success(`同步成功: ${result.message}`)
      } else {
        message.warning(`同步结果: ${result.message}`)
      }
      setSyncOpen(false)
      onSyncComplete()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const openImportModal = (skillName: string) => {
    setImportSkillName(skillName)
    setImportSourceToolId(tools[0]?.id ?? '')
    setImportOpen(true)
  }

  const handleImport = async () => {
    if (!importSourceToolId) {
      message.warning('请选择源工具')
      return
    }
    setImporting(true)
    try {
      const result = await importToCenter(importSkillName, importSourceToolId)
      message.success(result)
      setImportOpen(false)
      await loadSkills()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleDiscover = async () => {
    setDiscoverLoading(true)
    setDiscoverOpen(true)
    try {
      const data = await discoverCenterSkills()
      setDiscovered(data)
      setSelectedDiscovered(new Set(data.map((s) => s.name)))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '扫描失败')
    } finally {
      setDiscoverLoading(false)
    }
  }

  const handleImportDiscovered = async () => {
    if (selectedDiscovered.size === 0) {
      message.warning('请至少选择一个技能')
      return
    }
    setImportingDiscovered(true)
    try {
      const items = discovered
        .filter((s) => selectedDiscovered.has(s.name))
        .map((s) => ({
          skillName: s.name,
          sourceToolId: s.sources[0]?.toolId ?? '',
        }))
        .filter((item) => item.sourceToolId)

      const outcomes: ImportOutcome[] = await batchImportToCenter(items)
      const success = outcomes.filter((o) => o.status === 'success').length
      const errors = outcomes.filter((o) => o.status === 'error')

      if (errors.length > 0) {
        message.warning(
          `导入完成，成功 ${success} 个，失败 ${errors.length} 个: ${errors.map((e) => `${e.skillName}: ${e.message}`).join('; ')}`,
        )
      } else {
        message.success(`成功导入 ${success} 个技能到中央仓库`)
      }

      setDiscoverOpen(false)
      setSelectedDiscovered(new Set())
      await loadSkills()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImportingDiscovered(false)
    }
  }

  const toggleDiscovered = (name: string) => {
    setSelectedDiscovered((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

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
    if (!batchSyncTargetToolId) {
      message.warning('请选择目标工具')
      return
    }
    setBatchSyncing(true)
    try {
      const skillNames = Array.from(selectedSkills)
      const outcomes: SyncOutcome[] = await batchSyncFromCenter(
        skillNames,
        batchSyncTargetToolId,
        syncMode,
        conflictStrategy,
      )
      const success = outcomes.filter((o) => o.status === 'success').length
      const skipped = outcomes.filter((o) => o.status === 'skipped').length
      const errors = outcomes.filter((o) => o.status === 'error')

      if (errors.length > 0) {
        message.warning(
          `同步完成，成功 ${success} 个，跳过 ${skipped} 个，失败 ${errors.length} 个`,
        )
      } else {
        message.success(`同步完成，成功 ${success} 个，跳过 ${skipped} 个`)
      }

      setBatchSyncOpen(false)
      setSelectedSkills(new Set())
      await loadSkills()
      onSyncComplete()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '同步失败')
    } finally {
      setBatchSyncing(false)
    }
  }

  const handleSetCategory = async (skillName: string, category: string) => {
    try {
      await setSkillCategory(skillName, category)
      message.success(`已标记 ${skillName} 为 ${category}`)
      await loadSkills()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '标记失败')
    }
  }

  const openBatchCategoryModal = () => {
    if (selectedSkills.size === 0) {
      message.warning('请至少选择一个技能')
      return
    }
    setBatchCategoryValue('custom')
    setBatchCategoryOpen(true)
  }

  const handleBatchSetCategory = async () => {
    setSettingCategory(true)
    try {
      const names = Array.from(selectedSkills)
      for (const name of names) {
        await setSkillCategory(name, batchCategoryValue)
      }
      message.success(`已批量标记 ${names.length} 个技能为 ${batchCategoryValue}`)
      setBatchCategoryOpen(false)
      setSelectedSkills(new Set())
      await loadSkills()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批量标记失败')
    } finally {
      setSettingCategory(false)
    }
  }

  const toolOptions = useMemo(
    () => tools.map((t) => ({ label: t.name, value: t.id })),
    [tools],
  )

  const categoryOptions = [
    { label: '自定义', value: 'custom' },
    { label: '市场', value: 'git' },
    { label: '系统', value: 'system' },
  ]

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Title level={5} style={{ margin: 0 }}>中央仓库</Title>
            <Tag variant="filled" color="blue">
              {skills.length} 个技能
            </Tag>
          </div>
        }
        placement="right"
        width={560}
        open={open}
        onClose={onClose}
        extra={
          <Space>
            <Button
              icon={<ScanOutlined />}
              loading={discoverLoading}
              onClick={() => void handleDiscover()}
            >
              扫描发现
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => void loadSkills()}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setInstallOpen(true)}
            >
              从 Git 安装
            </Button>
          </Space>
        }
      >
        <Input.Search
          placeholder="搜索技能..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ marginBottom: 12 }}
          allowClear
        />

        <Space style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap' }}>
          <Button
            size="small"
            type={sourceFilter === 'custom' ? 'primary' : 'default'}
            onClick={() => setSourceFilter('custom')}
          >
            自定义 ({skills.filter((s) => s.sourceType === 'custom').length})
          </Button>
          <Button
            size="small"
            type={sourceFilter === 'git' ? 'primary' : 'default'}
            onClick={() => setSourceFilter('git')}
          >
            市场 ({skills.filter((s) => s.sourceType === 'git').length})
          </Button>
          <Button
            size="small"
            type={sourceFilter === 'all' ? 'primary' : 'default'}
            onClick={() => setSourceFilter('all')}
          >
            全部 ({skills.length})
          </Button>
        </Space>

        {sourceFilter === 'all' && (
          <Space style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: `全部同步状态` },
              { key: 'unsynced', label: `未同步 (${skills.filter((s) => getSkillFilterStatus(s) === 'unsynced').length})` },
              { key: 'partial', label: `部分同步 (${skills.filter((s) => getSkillFilterStatus(s) === 'partial').length})` },
              { key: 'fullySynced', label: `已全量同步 (${skills.filter((s) => getSkillFilterStatus(s) === 'fullySynced').length})` },
            ].map((item) => (
              <Button
                key={item.key}
                size="small"
                type={filterType === item.key ? 'primary' : 'default'}
                onClick={() => setFilterType(item.key as typeof filterType)}
              >
                {item.label}
              </Button>
            ))}
          </Space>
        )}

        {selectedSkills.size > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary">已选 {selectedSkills.size} 个</Text>
            <Button size="small" type="primary" onClick={openBatchSyncModal}>
              批量同步到工具
            </Button>
            <Button size="small" onClick={openBatchCategoryModal}>
              批量修改分类
            </Button>
            <Button size="small" onClick={() => setSelectedSkills(new Set())}>
              取消选择
            </Button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : filteredSkills.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={keyword.trim() ? '未找到匹配结果' : '中央仓库暂无技能'}
          />
        ) : (
          <List
            dataSource={filteredSkills}
            renderItem={(skill) => (
              <List.Item
                actions={[
                  <Tooltip title="同步到工具" key="sync">
                    <Button
                      icon={<SyncOutlined />}
                      size="small"
                      onClick={() => openSyncModal(skill.name)}
                    />
                  </Tooltip>,
                  <Tooltip title="从工具导入" key="import">
                    <Button
                      icon={<CloudDownloadOutlined />}
                      size="small"
                      onClick={() => openImportModal(skill.name)}
                    />
                  </Tooltip>,
                  <Tooltip title="删除" key="delete">
                    <Button
                      icon={<DeleteOutlined />}
                      size="small"
                      danger
                      onClick={() => handleDelete(skill.name)}
                    />
                  </Tooltip>,
                ]}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={selectedSkills.has(skill.name)}
                    onChange={() => toggleSkillSelection(skill.name)}
                    style={{ marginTop: 6 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <Text strong>{skill.name}</Text>
                      <Select
                        size="small"
                        variant="borderless"
                        value={skill.sourceType}
                        options={categoryOptions}
                        onChange={(val) => handleSetCategory(skill.name, val)}
                        style={{ width: 80 }}
                      />
                      {skill.hasSkillMd && (
                        <Tag variant="filled" color="green">
                          skill.md
                        </Tag>
                      )}
                    </div>
                    {skill.description && (
                      <div
                        style={{
                          marginBottom: 4,
                          color: 'rgba(0,0,0,0.65)',
                          fontSize: 13,
                          lineHeight: '1.5',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {skill.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
                      {skill.syncStatuses.slice(0, 4).map((status) => (
                        <Tag
                          key={status.toolId}
                          color={status.synced ? 'success' : 'default'}
                          style={{ fontSize: 11, flexShrink: 0 }}
                        >
                          {status.toolName} {status.synced ? '✓' : '✗'}
                        </Tag>
                      ))}
                      {skill.syncStatuses.length > 4 && (
                        <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                          +{skill.syncStatuses.length - 4}
                        </Text>
                      )}
                      {skill.syncStatuses.length === 0 && (
                        <Text type="secondary" style={{ fontSize: 11 }}>未同步到任何工具</Text>
                      )}
                    </div>
                  </div>
                </div>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* 从 Git 安装 */}
      <Modal
        title="从 Git 安装到中央仓库"
        open={installOpen}
        onOk={handleInstall}
        onCancel={() => {
          setInstallOpen(false)
          setGitUrl('')
        }}
        confirmLoading={installing}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>Git 仓库地址：</Text>
          <Input
            placeholder="https://github.com/user/repo.git"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
          />
        </Space>
      </Modal>

      {/* 同步到工具 */}
      <Modal
        title={`同步技能：${syncSkillName}`}
        open={syncOpen}
        onOk={handleSync}
        onCancel={() => setSyncOpen(false)}
        confirmLoading={syncing}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择目标工具：</Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择目标工具"
            value={syncTargetToolId}
            onChange={setSyncTargetToolId}
            options={toolOptions}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            同步模式：{syncMode}，冲突策略：{conflictStrategy}
          </Text>
        </Space>
      </Modal>

      {/* 从工具导入 */}
      <Modal
        title={`导入技能到中央仓库：${importSkillName}`}
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
            将从源工具的技能目录中导入 {importSkillName} 到中央仓库
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

      {/* 批量修改分类 */}
      <Modal
        title={`批量修改 ${selectedSkills.size} 个技能的分类`}
        open={batchCategoryOpen}
        onOk={handleBatchSetCategory}
        onCancel={() => setBatchCategoryOpen(false)}
        confirmLoading={settingCategory}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>选择分类：</Text>
          <Select
            style={{ width: '100%' }}
            value={batchCategoryValue}
            onChange={setBatchCategoryValue}
            options={categoryOptions}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            将修改：{Array.from(selectedSkills).join(', ')}
          </Text>
        </Space>
      </Modal>

      {/* 扫描发现 */}
      <Modal
        title="扫描发现"
        open={discoverOpen}
        onOk={handleImportDiscovered}
        onCancel={() => {
          setDiscoverOpen(false)
          setSelectedDiscovered(new Set())
        }}
        confirmLoading={importingDiscovered}
        destroyOnClose
        width={560}
        okText="一键导入"
        cancelText="取消"
      >
        {discoverLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : discovered.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未发现新的技能"
          />
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">
                发现 {discovered.length} 个技能分散在各工具中，尚未入库
              </Text>
            </div>
            <List
              dataSource={discovered}
              renderItem={(skill) => (
                <List.Item
                  onClick={() => toggleDiscovered(skill.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                    <input
                      type="checkbox"
                      checked={selectedDiscovered.has(skill.name)}
                      onChange={() => toggleDiscovered(skill.name)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text strong>{skill.name}</Text>
                        <Tag variant="filled" color="default">
                          {skill.sources.map((s) => s.toolName).join(', ')}
                        </Tag>
                      </div>
                      {skill.description && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {skill.description}
                        </Text>
                      )}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </>
        )}
      </Modal>
    </>
  )
}
