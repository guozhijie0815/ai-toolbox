import { useEffect, useState } from 'react'

import { DeleteOutlined, EditOutlined, LockOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'

import {
  deleteToolRegistryItem,
  detectToolPaths,
  listToolRegistry,
  upsertToolRegistryItem,
} from '../../lib/toolboxApi'
import { useToolboxStore } from '../../store/useToolboxStore'
import type { ToolRegistryConfigFile, ToolRegistryEntry } from '../../types/toolbox'
import { getErrorMessage } from '../../utils/errorUtils'

const { Text } = Typography

interface ToolManagerModalProps {
  open: boolean
  onClose: () => void
}

function ToolManagerModal({ open, onClose }: ToolManagerModalProps) {
  const { message: messageApi } = AntdApp.useApp()
  const [toolForm] = Form.useForm()
  const refreshTools = useToolboxStore((state) => state.refreshTools)

  const [registryTools, setRegistryTools] = useState<ToolRegistryEntry[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registrySaving, setRegistrySaving] = useState(false)
  const [editingToolId, setEditingToolId] = useState<string>()
  const [editingConfigFiles, setEditingConfigFiles] = useState<ToolRegistryConfigFile[]>([])

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

  // 弹窗打开时加载列表并重置表单
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开同步表单
    resetToolForm()
    void loadRegistryTools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  return (
    <Modal
      title="工具管理"
      open={open}
      onCancel={onClose}
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
                  <Tag color={enabled ? 'success' : 'default'}>{enabled ? '启用' : '停用'}</Tag>
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
                      setEditingConfigFiles((items) => items.filter((_, idx) => idx !== index))
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
              <Button type="primary" loading={registrySaving} onClick={() => void onSaveTool()}>
                {editingToolId ? '保存修改' : '保存工具'}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </Modal>
  )
}

export default ToolManagerModal
