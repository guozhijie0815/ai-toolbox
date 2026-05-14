import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Select } from 'antd'

export interface ToolItem {
  id: string
  name: string
}

export interface Props {
  open: boolean
  tools: ToolItem[]
  isInstalling: boolean
  onInstall: (gitUrl: string, targetToolId: string, skillName?: string) => void
  onClose: () => void
}

function inferSkillName(gitUrl: string): string {
  const trimmed = gitUrl.trim()
  if (!trimmed) return ''

  // Remove trailing .git
  const withoutGit = trimmed.replace(/\.git$/, '')

  // Handle HTTPS or SSH URLs
  const parts = withoutGit.split(/[:/]/)
  const last = parts[parts.length - 1]
  return last || ''
}

export default function GitInstallDialog({ open, tools, isInstalling, onInstall, onClose }: Props) {
  const [form] = Form.useForm<{
    gitUrl: string
    targetToolId: string
    skillName: string
  }>()
  const [customNameVisible, setCustomNameVisible] = useState(false)

  const toolOptions = useMemo(
    () =>
      tools.map((tool) => ({
        label: tool.name,
        value: tool.id,
      })),
    [tools],
  )

  useEffect(() => {
    if (open) {
      form.resetFields()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomNameVisible(false)
    }
  }, [open, form])

  const handleGitUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const url = event.target.value
    const inferred = inferSkillName(url)
    form.setFieldValue('skillName', inferred)
  }

  const handleInstall = async () => {
    try {
      const values = await form.validateFields()
      onInstall(
        values.gitUrl.trim(),
        values.targetToolId,
        customNameVisible ? values.skillName?.trim() || undefined : undefined,
      )
    } catch {
      // Validation failed
    }
  }

  const handleClose = () => {
    form.resetFields()
    setCustomNameVisible(false)
    onClose()
  }

  return (
    <Modal
      title="从 Git 仓库安装技能"
      open={open}
      onCancel={handleClose}
      footer={null}
      width={520}
      centered
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          label="Git 仓库地址"
          name="gitUrl"
          rules={[{ required: true, message: '请输入 Git 仓库地址' }]}
        >
          <Input
            placeholder="https://github.com/user/repo.git"
            onChange={handleGitUrlChange}
            disabled={isInstalling}
          />
        </Form.Item>

        <Form.Item
          label="目标工具"
          name="targetToolId"
          rules={[{ required: true, message: '请选择目标工具' }]}
        >
          <Select placeholder="选择要安装到的工具" options={toolOptions} disabled={isInstalling} />
        </Form.Item>

        <Form.Item>
          <Button
            type="link"
            size="small"
            onClick={() => setCustomNameVisible((prev) => !prev)}
            style={{ padding: 0, height: 'auto' }}
          >
            {customNameVisible ? '使用默认名称' : '自定义技能名称'}
          </Button>
        </Form.Item>

        {customNameVisible && (
          <Form.Item
            label="技能名称"
            name="skillName"
            rules={[{ required: true, message: '请输入技能名称' }]}
          >
            <Input placeholder="从 URL 自动推断" disabled={isInstalling} />
          </Form.Item>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 8,
          }}
        >
          <Button onClick={handleClose} disabled={isInstalling}>
            取消
          </Button>
          <Button type="primary" loading={isInstalling} onClick={handleInstall}>
            安装
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
