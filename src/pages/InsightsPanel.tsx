import { Button, Empty, Typography, App as AntdApp, Tooltip } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import { useState } from 'react'

import { useToolboxStore } from '../store/useToolboxStore'
import type { SkillInsightEntry } from '../types/toolbox'
import { formatTime } from '../utils/appUtils'

const { Text } = Typography

interface InsightsPanelProps {
  onTriggerSync: (
    sourceToolId: string,
    targetToolIds: string[],
    skillName: string,
  ) => Promise<string | undefined>
}

function InsightsPanel({ onTriggerSync }: InsightsPanelProps) {
  const { message: messageApi } = AntdApp.useApp()
  const tools = useToolboxStore((state) => state.tools)
  const skillInsights = useToolboxStore((state) => state.skillInsights)
  const [syncingName, setSyncingName] = useState<string | null>(null)
  const customSkillNames = new Set(
    tools.flatMap((tool) => tool.skills.filter((s) => s.category === 'custom').map((s) => s.name)),
  )
  const totalConfigs = tools.reduce((total, tool) => total + tool.configFiles.length, 0)

  return (
    <div className="insights-content">
      <div className="insights-content__scroll">
        {skillInsights.length > 0 ? (
          <div className="skill-insights__list">
            {skillInsights.map((insight: SkillInsightEntry) => (
              <div key={insight.skillName} className="skill-insight-card">
                <div className="insight-card-top">
                  <span className="insight-card-name">{insight.skillName}</span>
                  <Tooltip title={insight.laggingTools.map((t) => t.toolName).join('、')}>
                    <span className="insight-badge">
                      {insight.laggingTools.length} 个工具未同步
                    </span>
                  </Tooltip>
                </div>
                <div className="insight-card-bottom">
                  <div className="insight-meta">
                    <span
                      className={`tool-chip ${insight.leaderToolId === 'codex' ? 'light' : 'dark'}`}
                    >
                      {insight.leaderToolName}
                    </span>
                    <span className="insight-time">{formatTime(insight.leaderUpdatedAt)}</span>
                  </div>
                  <Button
                    aria-label={`同步 ${insight.skillName}`}
                    className="btn-sync"
                    type="text"
                    size="small"
                    icon={<SyncOutlined />}
                    loading={syncingName === insight.skillName}
                    onClick={async () => {
                      setSyncingName(insight.skillName)
                      try {
                        const msg = await onTriggerSync(
                          insight.leaderToolId,
                          insight.laggingTools.map((lag) => lag.toolId),
                          insight.skillName,
                        )
                        messageApi.success(`${insight.skillName}：${msg}`)
                      } catch {
                        messageApi.error(`${insight.skillName} 同步失败`)
                      } finally {
                        setSyncingName(null)
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            className="insights-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无变动洞察"
          />
        )}
      </div>

      {/* 工具统计信息 */}
      <div className="tool-info-section">
        <Text className="field-label">工具统计</Text>
        <div className="tool-info-grid">
          <div className="tool-info-item">
            <span className="tool-info-value">{tools.length}</span>
            <span className="tool-info-label">工具</span>
          </div>
          <div className="tool-info-item">
            <span className="tool-info-value">{customSkillNames.size}</span>
            <span className="tool-info-label">自定义技能</span>
          </div>
          <div className="tool-info-item">
            <span className="tool-info-value">{totalConfigs}</span>
            <span className="tool-info-label">配置</span>
          </div>
          <div className="tool-info-item">
            <span className="tool-info-value">{skillInsights.length}</span>
            <span className="tool-info-label">未同步</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InsightsPanel
