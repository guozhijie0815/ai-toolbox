import { DiffEditor } from '@monaco-editor/react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
  ReloadOutlined,
  SafetyOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'

import { useToolboxStore } from '../store/useToolboxStore'
import type { BaselineKind, ConfigDiffEntry, ConfigDiffType, SnapshotMeta } from '../types/toolbox'

const { Text } = Typography

interface Props {
  monacoTheme: 'vs' | 'vs-dark'
}

const diffTypeMeta: Record<ConfigDiffType, { label: string; color: string; description: string }> =
  {
    missing: {
      label: '缺失',
      color: 'volcano',
      description: 'settings.json 里有此字段，但 cc-switch 公共配置里没有，需回灌',
    },
    different: {
      label: '不一致',
      color: 'orange',
      description: '两边都有此字段但值不同，回灌会整段覆盖 cc-switch 公共配置的值',
    },
    same: { label: '一致', color: 'success', description: '两边一致，无需操作' },
    onlyInCcSwitch: {
      label: '仅 cc-switch',
      color: 'blue',
      description: 'cc-switch 公共配置里有此字段，但 settings.json 里没有，同步时会保留',
    },
  }

function formatValuePreview(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'string') {
    return value.length > 60 ? value.slice(0, 57) + '...' : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.length} 项]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    return `{${keys.length} 字段}`
  }
  return String(value)
}

function jsonStringify(value: unknown): string {
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function baselineToValue(b: BaselineKind): string {
  if (b.kind === 'snapshot') return `snapshot:${b.ts}`
  return b.kind
}

function valueToBaseline(v: string, snapshots: SnapshotMeta[]): BaselineKind {
  if (v === 'live') return { kind: 'live' }
  if (v === 'richest') return { kind: 'richest' }
  if (v.startsWith('snapshot:')) {
    const ts = Number(v.slice('snapshot:'.length))
    return { kind: 'snapshot', ts }
  }
  const newest = snapshots[0]
  return newest ? { kind: 'snapshot', ts: newest.ts } : { kind: 'live' }
}

export default function ClaudeConfigSyncPanel({ monacoTheme }: Props) {
  const diffResult = useToolboxStore((s) => s.claudeConfigDiff)
  const baseline = useToolboxStore((s) => s.claudeConfigBaseline)
  const isLoading = useToolboxStore((s) => s.isClaudeConfigLoading)
  const isApplying = useToolboxStore((s) => s.isClaudeConfigApplying)
  const loadDiff = useToolboxStore((s) => s.loadClaudeConfigDiff)
  const setBaseline = useToolboxStore((s) => s.setClaudeConfigBaseline)
  const applySync = useToolboxStore((s) => s.applyClaudeConfigSync)

  const [drawerField, setDrawerField] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!diffResult) {
      void loadDiff()
    }
  }, [diffResult, loadDiff])

  const entries = useMemo(() => diffResult?.entries ?? [], [diffResult?.entries])
  const snapshots = useMemo(() => diffResult?.snapshots ?? [], [diffResult?.snapshots])
  const excludedFields = diffResult?.excludedFields ?? []
  const needsSync = diffResult?.needsSync ?? false

  const counts = useMemo(() => {
    const c = { missing: 0, different: 0, same: 0, onlyInCcSwitch: 0 }
    entries.forEach((e) => {
      c[e.diffType] = (c[e.diffType] ?? 0) + 1
    })
    return c
  }, [entries])

  const drawerEntry = useMemo(
    () => entries.find((e) => e.field === drawerField) ?? null,
    [entries, drawerField],
  )

  const baselineOptions = useMemo(() => {
    const opts = [
      { label: '当前文件 (Live)', value: 'live' },
      { label: '字段最全的快照 (Richest)', value: 'richest' },
    ]
    snapshots.forEach((snap) => {
      const date = new Date(snap.ts * 1000)
      const label = `快照 ${date.toLocaleString('zh-CN')} · ${snap.fieldCount} 字段`
      opts.push({ label, value: `snapshot:${snap.ts}` })
    })
    return opts
  }, [snapshots])

  const handleApply = async () => {
    setConfirmOpen(false)
    await applySync()
  }

  const columns: ColumnsType<ConfigDiffEntry> = [
    {
      title: '字段',
      dataIndex: 'field',
      key: 'field',
      width: 200,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '差异',
      dataIndex: 'diffType',
      key: 'diffType',
      width: 130,
      render: (type: ConfigDiffType) => {
        const meta = diffTypeMeta[type]
        return (
          <Tooltip title={meta.description}>
            <Tag color={meta.color}>{meta.label}</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: 'settings.json 值',
      dataIndex: 'settingsValue',
      key: 'settingsValue',
      ellipsis: true,
      render: (value: unknown) => (
        <Text type="secondary" code style={{ fontSize: 12 }}>
          {formatValuePreview(value)}
        </Text>
      ),
    },
    {
      title: 'cc-switch 值',
      dataIndex: 'cswitchValue',
      key: 'cswitchValue',
      ellipsis: true,
      render: (value: unknown) => (
        <Text type="secondary" code style={{ fontSize: 12 }}>
          {formatValuePreview(value)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: ConfigDiffEntry) => (
        <Button type="link" size="small" onClick={() => setDrawerField(record.field)}>
          查看 diff
        </Button>
      ),
    },
  ]

  if (isLoading && !diffResult) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin tip="加载差异中..." />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
      }}
    >
      {/* 状态条 */}
      {diffResult ? (
        needsSync ? (
          <Alert
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            message={`检测到 ${counts.missing + counts.different} 个字段需要回灌到 cc-switch`}
            description={
              <span>
                缺失 <b>{counts.missing}</b> · 不一致 <b>{counts.different}</b> · 一致{' '}
                <b>{counts.same}</b>
                {counts.onlyInCcSwitch > 0 && (
                  <>
                    {' '}
                    · cc-switch 独有 <b>{counts.onlyInCcSwitch}</b>
                    （同步时会保留）
                  </>
                )}
              </span>
            }
          />
        ) : (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="两边已一致，无需同步"
            description={`共比对 ${counts.same} 个字段，cc-switch 独有 ${counts.onlyInCcSwitch} 个字段会保留。`}
          />
        )
      ) : null}

      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Select
          value={baselineToValue(baseline)}
          options={baselineOptions}
          onChange={(v) => setBaseline(valueToBaseline(v, snapshots))}
          style={{ minWidth: 260 }}
          size="small"
        />
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => loadDiff()}
          loading={isLoading}
        >
          刷新
        </Button>
        {diffResult?.cswitchLocked ? (
          <Tag color="warning" icon={<LockOutlined />}>
            cc-switch 持有写锁
          </Tag>
        ) : (
          <Tag color="success" icon={<SafetyOutlined />}>
            可写入
          </Tag>
        )}
        {excludedFields.length > 0 && (
          <Tooltip title="这些字段属于 provider 私有，不参与对比/同步，cc-switch 切换 provider 时会自己管">
            <Tag>排除字段: {excludedFields.join(', ')}</Tag>
          </Tooltip>
        )}
      </div>

      {diffResult?.cswitchLocked && (
        <Alert
          type="warning"
          showIcon
          message="cc-switch 当前持有写锁"
          description="检测到 cc-switch 桌面端可能正在运行。同步前建议先退出 cc-switch GUI，否则写入可能失败。"
        />
      )}

      {/* 字段差异表格 */}
      {entries.length === 0 ? (
        <Empty description="未发现差异字段" />
      ) : (
        <Table<ConfigDiffEntry>
          rowKey="field"
          columns={columns}
          dataSource={entries}
          size="small"
          pagination={false}
          scroll={{ y: 'calc(100vh - 420px)' }}
        />
      )}

      {/* 底部操作栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 12,
          paddingTop: 8,
          borderTop: '1px solid var(--ant-color-border-secondary)',
        }}
      >
        <Button
          type="primary"
          size="small"
          icon={<CloudUploadOutlined />}
          disabled={!needsSync}
          loading={isApplying}
          onClick={() => setConfirmOpen(true)}
        >
          整段同步到 cc-switch
        </Button>
      </div>

      {/* 二次确认 Modal */}
      <Modal
        title="确认整段同步到 cc-switch 公共配置"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={handleApply}
        okText="确认同步"
        cancelText="取消"
        confirmLoading={isApplying}
        okButtonProps={{
          icon: <SyncOutlined />,
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="同步策略：整段合并"
            description={
              <>
                settings.json 里所有非排除字段会**整体覆盖** cc-switch 公共配置中的同名字段；
                <br />
                排除字段（{excludedFields.join(', ') || '无'}）保留 cc-switch 原值；
                <br />
                cc-switch 独有的非排除字段也会保留。
              </>
            }
          />
          {diffResult?.cswitchLocked && (
            <Alert
              type="warning"
              showIcon
              icon={<CloseCircleOutlined />}
              message="cc-switch 可能正在运行"
              description="建议先退出 cc-switch GUI 再继续，否则可能写入失败。"
            />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            操作前会自动备份到 ~/.cc-switch/backups/，可在出错时手动还原。
          </Text>
        </Space>
      </Modal>

      {/* JSON Diff Drawer */}
      <Drawer
        title={drawerField ? `字段 diff: ${drawerField}` : '字段 diff'}
        open={!!drawerField}
        onClose={() => setDrawerField(null)}
        width={800}
        destroyOnHidden
      >
        {drawerEntry && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              height: '100%',
            }}
          >
            <Text type="secondary">
              左：cc-switch 公共配置当前值 &nbsp;|&nbsp; 右：基准（settings.json/快照）的值
            </Text>
            <div
              style={{
                flex: 1,
                minHeight: 480,
                border: '1px solid var(--ant-color-border)',
                borderRadius: 6,
              }}
            >
              <DiffEditor
                height="100%"
                language="json"
                theme={monacoTheme}
                original={jsonStringify(drawerEntry.cswitchValue)}
                modified={jsonStringify(drawerEntry.settingsValue)}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
