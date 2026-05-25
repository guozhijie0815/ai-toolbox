import { Button, Empty, Tag, Typography } from 'antd'
import { SyncOutlined } from '@ant-design/icons'

import { useToolboxStore } from '../store/useToolboxStore'
import type { SkillInsightEntry, ToolItem } from '../types/toolbox'
import { formatTime } from '../utils/appUtils'

const { Text, Title } = Typography

interface InsightsPanelProps {
  selectedTool?: ToolItem
  onTriggerSync: (toolIds: string[], skillName: string) => void
}

function InsightsPanel({ selectedTool, onTriggerSync }: InsightsPanelProps) {
  const skillInsights = useToolboxStore((state) => state.skillInsights)
  const isInsightsLoading = useToolboxStore((state) => state.isInsightsLoading)
  const refreshInsights = useToolboxStore((state) => state.refreshInsights)

  return (
    <div className="insights-content">
      <div className="panel-header">
        <div>
          <Text className="panel-kicker">Insights</Text>
          <Title level={4}>变动洞察</Title>
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

      {skillInsights.length > 0 ? (
        <div className="skill-insights__list" style={{ overflow: 'auto', flex: 1 }}>
          {skillInsights.map((insight: SkillInsightEntry) => (
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
                    <span className="skill-insight-card__leader" data-tool={insight.leaderToolId}>
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
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无变动洞察"
          style={{ marginTop: 40 }}
        />
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
  )
}

export default InsightsPanel
