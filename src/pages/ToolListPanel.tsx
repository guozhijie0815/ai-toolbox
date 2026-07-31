import { LockOutlined } from '@ant-design/icons'
import { useToolboxStore } from '../store/useToolboxStore'
import type { ToolItem } from '../types/toolbox'
import type { ToolCapability } from './types'

const TOOL_MARKS: Record<string, string> = {
  codex: 'CX',
  claude: 'CC',
  cursor: 'C',
  qoder: 'Q',
  trae: 'T',
  opencode: 'O',
}

function getToolCapabilities(tool: ToolItem) {
  const capabilities = [`${tool.configFiles.length} 配置`, `${tool.skills.length} 技能`]

  if (tool.id === 'claude') capabilities.push('同步')
  if (tool.id === 'opencode') capabilities.push('模型')

  return capabilities
}

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
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="label">工具</span>
        <span className="count">{visibleTools.length}</span>
      </div>
      <div className="tool-list">
        {visibleTools.length === 0 && !isToolsLoading ? (
          <div
            style={{
              padding: '12px',
              textAlign: 'center',
              color: 'var(--muted-text)',
              fontSize: '12px',
            }}
          >
            没有可用工具
          </div>
        ) : null}

        {visibleTools.map((tool) => {
          const active = tool.id === selectedTool?.id
          const hasConfig = tool.configFiles.length > 0
          const capabilities = getToolCapabilities(tool)

          return (
            <div
              key={tool.id}
              className={`tool-item${active ? ' is-active' : ''}`}
              data-tool={tool.id}
              onClick={() => void selectTool(tool.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void selectTool(tool.id)
                }
              }}
            >
              <span className="tool-item__icon" data-tool={tool.id} aria-hidden="true">
                <span>{TOOL_MARKS[tool.id] ?? tool.name.slice(0, 1).toUpperCase()}</span>
              </span>
              <div className="tool-item__info">
                <div className="tool-item__name">
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
                </div>
                <div className="tool-item__meta">
                  {capabilities.map((item, index) => (
                    <span key={item}>
                      {index > 0 ? <span className="dot" aria-hidden="true" /> : null}
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              {hasConfig && !tool.isSystem ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="tool-item__edit"
                  title="编辑配置"
                  aria-label={`${tool.name} 编辑配置`}
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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.currentTarget.click()
                    }
                  }}
                >
                  ✎
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export default ToolListPanel
