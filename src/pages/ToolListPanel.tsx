import { FileTextOutlined, LockOutlined } from '@ant-design/icons'
import { Empty, Tag, Typography } from 'antd'

import { useToolboxStore } from '../store/useToolboxStore'
import type { ToolItem } from '../types/toolbox'
import type { ToolCapability } from './types'

const { Text, Title } = Typography

interface ToolListPanelProps {
  visibleTools: ToolItem[]
  selectedTool?: ToolItem
  capability: ToolCapability
  onCapabilityChange: (next: ToolCapability) => void
}

function ToolListPanel({
  visibleTools,
  selectedTool,
  capability,
  onCapabilityChange,
}: ToolListPanelProps) {
  const isToolsLoading = useToolboxStore((state) => state.isToolsLoading)
  const selectedConfigId = useToolboxStore((state) => state.selectedConfigId)
  const selectTool = useToolboxStore((state) => state.selectTool)
  const selectConfigFile = useToolboxStore((state) => state.selectConfigFile)

  return (
    <aside className="panel panel--nav">
      <div className="panel-header">
        <div>
          <Text className="panel-kicker">Source</Text>
          <Title level={4}>工具列表</Title>
        </div>
        <Tag variant="filled" color="orange">
          {visibleTools.length}
        </Tag>
      </div>

      <div className="tool-list">
        {visibleTools.length === 0 && !isToolsLoading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可用工具" />
        ) : null}

        {visibleTools.map((tool) => {
          const active = tool.id === selectedTool?.id
          const dirtyCount = tool.configFiles.filter((item) => item.dirty).length
          const hasConfig = tool.configFiles.length > 0

          return (
            <button
              key={tool.id}
              type="button"
              className={`tool-item${active ? ' is-active' : ''}`}
              data-tool={tool.id}
              onClick={() => void selectTool(tool.id)}
            >
              <div className="tool-item__title">
                <span className="tool-item__name">
                  {tool.name}
                  {tool.isSystem ? (
                    <LockOutlined
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: 'var(--ant-color-text-tertiary)',
                      }}
                    />
                  ) : null}
                </span>
                {hasConfig && !tool.isSystem ? (
                  <span
                    className="tool-item__edit"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (capability === 'editor' && active) {
                        onCapabilityChange('skills')
                        return
                      }
                      const openEditor = () => {
                        onCapabilityChange('editor')
                        if (!selectedConfigId && tool.configFiles[0]) {
                          void selectConfigFile(tool.configFiles[0].id)
                        } else if (tool.configFiles[0] && tool.id !== selectedTool?.id) {
                          void selectConfigFile(tool.configFiles[0].id)
                        }
                      }
                      if (active) {
                        openEditor()
                      } else {
                        void selectTool(tool.id)
                        window.setTimeout(openEditor, 50)
                      }
                    }}
                    title="编辑配置"
                  >
                    <FileTextOutlined />
                  </span>
                ) : null}
              </div>
              {tool.description ? (
                <Text className="tool-item__desc">{tool.description}</Text>
              ) : null}
              <div className="tool-item__meta">
                <span>{tool.configFiles.length} configs</span>
                <span>{tool.skills.length} skills</span>
                {tool.id === 'opencode' ? <span>models</span> : null}
                {dirtyCount > 0 ? <span>{dirtyCount} unsaved</span> : null}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default ToolListPanel
