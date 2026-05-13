import { Drawer, Spin, Typography } from 'antd'

export interface SkillDetailPayload {
  skillName: string
  skillMdContent?: string
  readmeContent?: string
}

export interface Props {
  open: boolean
  detail: SkillDetailPayload | null
  isLoading: boolean
  onClose: () => void
}

const { Title, Text } = Typography

export default function SkillDetailDrawer({ open, detail, isLoading, onClose }: Props) {
  return (
    <Drawer
      title={detail?.skillName ?? '技能详情'}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnClose
    >
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <Spin size="large" tip="加载中..." />
        </div>
      ) : !detail ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ant-color-text-secondary)' }}>
          <Text type="secondary">暂无内容</Text>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {detail.skillMdContent && (
            <section>
              <Title level={5} style={{ marginBottom: 12 }}>
                SKILL.md
              </Title>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'var(--ant-color-bg-container-secondary)',
                  borderRadius: 8,
                  border: '1px solid var(--ant-color-border)',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--ant-color-text)',
                  }}
                >
                  {detail.skillMdContent}
                </pre>
              </div>
            </section>
          )}

          {detail.readmeContent && (
            <section>
              <Title level={5} style={{ marginBottom: 12 }}>
                README.md
              </Title>
              <div
                style={{
                  padding: 16,
                  backgroundColor: 'var(--ant-color-bg-container-secondary)',
                  borderRadius: 8,
                  border: '1px solid var(--ant-color-border)',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--ant-color-text)',
                  }}
                >
                  {detail.readmeContent}
                </pre>
              </div>
            </section>
          )}

          {!detail.skillMdContent && !detail.readmeContent && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Text type="secondary">该技能没有文档内容</Text>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
