import { FileTextOutlined, LockOutlined } from '@ant-design/icons'
import { Empty, Tag, Typography } from 'antd'

import { useToolboxStore } from '../store/useToolboxStore'
import type { ToolItem } from '../types/toolbox'

const { Text, Title } = Typography

interface ToolListPanelProps {
  visibleTools: ToolItem[]
  selectedTool?: ToolItem
  editorMode: boolean
  setEditorMode: (next: boolean) => void
  setMiddleTab: (next: 'skills' | 'editor' | 'sync') => void
}

function ToolListPanel({
  visibleTools,
  selectedTool,
  editorMode,
  setEditorMode,
  setMiddleTab,
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
                {hasConfig && !tool.isSystem && (
                  <span
                    className="tool-item__edit"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (editorMode) {
                        // 如果已经在编辑模式，点击则关闭
                        setEditorMode(false)
                        setMiddleTab('skills')
                      } else if (active) {
                        setEditorMode(true)
                        setMiddleTab('editor')
                        if (!selectedConfigId && tool.configFiles[0]) {
                          void selectConfigFile(tool.configFiles[0].id)
                        }
                      } else {
                        void selectTool(tool.id)
                        setTimeout(() => {
                          setEditorMode(true)
                          setMiddleTab('editor')
                          if (tool.configFiles[0]) {
                            void selectConfigFile(tool.configFiles[0].id)
                          }
                        }, 50)
                      }
                    }}
                    title="编辑配置"
                  >
                    <FileTextOutlined />
                  </span>
                )}
              </div>
              {tool.description ? (
                <Text className="tool-item__desc">{tool.description}</Text>
              ) : null}
              <div className="tool-item__meta">
                <span>{tool.configFiles.length} configs</span>
                <span>{tool.skills.length} skills</span>
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
