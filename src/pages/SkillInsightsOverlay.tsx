import { Button, Dropdown, Empty, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, MoreOutlined, SyncOutlined } from '@ant-design/icons'
import { Modal } from 'antd'
import { App as AntdApp } from 'antd'

import { deleteSkill } from '../lib/toolboxApi'
import { useToolboxStore } from '../store/useToolboxStore'
import type { SkillInsightEntry, SkillItem, ToolItem } from '../types/toolbox'
import { formatTime } from '../utils/appUtils'

const { Text, Title } = Typography

interface SkillInsightsOverlayProps {
  selectedTool?: ToolItem
  currentSkills: SkillItem[]
  filteredCurrentSkills: SkillItem[]
  onOpenSyncModal: () => void
  onTriggerSync: (toolIds: string[], skillName: string) => void
}

function SkillInsightsOverlay({
  selectedTool,
  currentSkills,
  filteredCurrentSkills,
  onOpenSyncModal,
  onTriggerSync,
}: SkillInsightsOverlayProps) {
  const { message: messageApi } = AntdApp.useApp()

  const skillInsights = useToolboxStore((state) => state.skillInsights)
  const isInsightsLoading = useToolboxStore((state) => state.isInsightsLoading)
  const refreshInsights = useToolboxStore((state) => state.refreshInsights)
  const refreshTools = useToolboxStore((state) => state.refreshTools)

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

  return (
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
              <Button size="small" icon={<SyncOutlined />} onClick={onOpenSyncModal}>
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
                        <span className="skill-entry__time">{formatTime(skill.updatedAt)}</span>
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工具没有技能" />
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
              skillInsights.map((insight: SkillInsightEntry) => (
                <div key={insight.skillName} className="skill-insight-card">
                  <div className="skill-insight-card__row">
                    <div className="skill-insight-card__info">
                      <div className="skill-insight-card__info-top">
                        <span className="skill-insight-card__name">{insight.skillName}</span>
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
                        onTriggerSync(
                          insight.laggingTools.map((lag) => lag.toolId),
                          insight.skillName,
                        )
                      }}
                    />
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
  )
}

export default SkillInsightsOverlay
