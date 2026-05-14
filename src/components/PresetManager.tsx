import { useState, useMemo } from 'react'
import { Button, Dropdown, Modal, Form, Input, Select, Tag, Empty, message } from 'antd'
import {
  PlusOutlined,
  MoreOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'

export interface PresetEntry {
  id: string
  name: string
  icon?: string
  skills: Array<{ skillName: string }>
}

export interface ToolItem {
  id: string
  name: string
}

interface CreatePresetDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: (name: string, skills: string[]) => void
  existingSkills: string[]
}

function CreatePresetDialog({
  open,
  onCancel,
  onConfirm,
  existingSkills,
}: CreatePresetDialogProps) {
  const [form] = Form.useForm()
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      setConfirmLoading(true)
      await onConfirm(values.name, values.skills || [])
      form.resetFields()
    } catch {
      // validation failed
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setSelectOpen(false)
    onCancel()
  }

  return (
    <Modal
      title="创建预设"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={confirmLoading}
      destroyOnClose
      centered
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          label="预设名称"
          name="name"
          rules={[{ required: true, message: '请输入预设名称' }]}
        >
          <Input placeholder="例如：前端开发套装" />
        </Form.Item>
        <Form.Item
          label="包含技能"
          name="skills"
          rules={[{ required: true, message: '请至少选择一个技能' }]}
        >
          <Select
            mode="multiple"
            placeholder="选择要包含的技能"
            options={existingSkills.map((s) => ({ label: s, value: s }))}
            allowClear
            open={selectOpen}
            onDropdownVisibleChange={setSelectOpen}
            autoClearSearchValue={false}
            onSelect={() => {
              // 选择后保持下拉框打开，并保留搜索值
              setTimeout(() => setSelectOpen(true), 0)
            }}
            onDeselect={() => {
              // 取消选择后也保持打开
              setTimeout(() => setSelectOpen(true), 0)
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

interface ApplyPresetModalProps {
  open: boolean
  presetName: string
  tools: ToolItem[]
  onCancel: () => void
  onConfirm: (toolIds: string[]) => void
}

function ApplyPresetModal({ open, presetName, tools, onCancel, onConfirm }: ApplyPresetModalProps) {
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])
  const [confirmLoading, setConfirmLoading] = useState(false)

  const handleOk = async () => {
    if (selectedToolIds.length === 0) {
      message.warning('请至少选择一个目标工具')
      return
    }
    setConfirmLoading(true)
    try {
      await onConfirm(selectedToolIds)
      setSelectedToolIds([])
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleCancel = () => {
    setSelectedToolIds([])
    onCancel()
  }

  return (
    <Modal
      title={`应用预设：${presetName}`}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={confirmLoading}
      destroyOnClose
      centered
    >
      <div style={{ marginBottom: 12 }}>选择要应用到的目标工具：</div>
      <Select
        mode="multiple"
        placeholder="选择目标工具"
        style={{ width: '100%' }}
        value={selectedToolIds}
        onChange={setSelectedToolIds}
        options={tools.map((t) => ({ label: t.name, value: t.id }))}
        allowClear
      />
    </Modal>
  )
}

interface Props {
  presets: PresetEntry[]
  tools: ToolItem[]
  allSkills: string[]
  onApply: (presetId: string, targetToolIds: string[]) => void
  onCreate: (name: string, skills: string[]) => void
  onDelete: (presetId: string) => void
  isLoading: boolean
}

export default function PresetManager({
  presets,
  tools,
  allSkills,
  onApply,
  onCreate,
  onDelete,
  isLoading,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activePresetId),
    [presets, activePresetId],
  )

  const allSkillNames = allSkills

  const handleApplyConfirm = async (toolIds: string[]) => {
    if (!activePresetId) return
    await onApply(activePresetId, toolIds)
    setApplyOpen(false)
    setActivePresetId(null)
  }

  const openApplyModal = (presetId: string) => {
    setActivePresetId(presetId)
    setApplyOpen(true)
  }

  const handleCreateConfirm = async (name: string, skills: string[]) => {
    await onCreate(name, skills)
    setCreateOpen(false)
  }

  const handleDelete = (presetId: string) => {
    Modal.confirm({
      title: '删除预设',
      content: '确定要删除这个预设吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(presetId),
    })
  }

  if (isLoading) {
    return (
      <div className="preset-manager">
        <div className="preset-manager__header">
          <span className="preset-manager__title">预设管理</span>
        </div>
        <div className="preset-manager__loading">
          <LoadingOutlined style={{ fontSize: 20, marginRight: 8 }} />
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="preset-manager" style={{ marginBottom: 20 }}>
      <div
        className="preset-manager__header"
        style={{
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span className="preset-manager__title">预设管理</span>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          创建预设
        </Button>
      </div>

      {presets.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无预设"
          style={{ marginTop: 24 }}
        />
      ) : (
        <div className="preset-manager__list">
          {presets.map((preset) => (
            <Dropdown
              key={preset.id}
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'apply',
                    icon: <CheckCircleOutlined />,
                    label: '应用到工具',
                    onClick: () => openApplyModal(preset.id),
                  },
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: '编辑',
                    disabled: true,
                  },
                  {
                    type: 'divider',
                  },
                  {
                    key: 'delete',
                    danger: true,
                    icon: <DeleteOutlined />,
                    label: '删除',
                    onClick: () => handleDelete(preset.id),
                  },
                ],
              }}
            >
              <button
                type="button"
                className="preset-pill"
                title={preset.skills.map((s) => s.skillName).join('、')}
              >
                <span className="preset-pill__name">{preset.name}</span>
                <Tag className="preset-pill__count">{preset.skills.length} 个技能</Tag>
                <MoreOutlined className="preset-pill__more" />
              </button>
            </Dropdown>
          ))}
        </div>
      )}

      <CreatePresetDialog
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onConfirm={handleCreateConfirm}
        existingSkills={allSkillNames}
      />

      {activePreset && (
        <ApplyPresetModal
          open={applyOpen}
          presetName={activePreset.name}
          tools={tools}
          onCancel={() => {
            setApplyOpen(false)
            setActivePresetId(null)
          }}
          onConfirm={handleApplyConfirm}
        />
      )}
    </div>
  )
}
