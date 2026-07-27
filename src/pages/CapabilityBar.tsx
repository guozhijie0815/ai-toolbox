import type { ReactNode } from 'react'

import {
  ApiOutlined,
  CloudSyncOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { Tag, Typography } from 'antd'

import type { ToolItem } from '../types/toolbox'
import { getToolCapabilities } from './capability'
import type { ToolCapability } from './types'

const { Text, Title } = Typography

const CAPABILITY_ICONS: Record<ToolCapability, ReactNode> = {
  skills: <ThunderboltOutlined />,
  editor: <FileTextOutlined />,
  sync: <CloudSyncOutlined />,
  models: <ApiOutlined />,
}

interface CapabilityBarProps {
  selectedTool?: ToolItem
  active: ToolCapability
  onChange: (next: ToolCapability) => void
}

function CapabilityBar({ selectedTool, active, onChange }: CapabilityBarProps) {
  const options = getToolCapabilities(selectedTool)

  if (!selectedTool || options.length === 0) return null

  return (
    <div className="capability-bar">
      <div className="capability-bar__head">
        <div>
          <Text className="panel-kicker">Capabilities</Text>
          <Title level={5} style={{ margin: 0 }}>
            {selectedTool.name} · 能力
          </Title>
        </div>
        <Tag>{options.length}</Tag>
      </div>
      <div className="capability-bar__grid">
        {options.map((item) => {
          const isActive = item.key === active
          return (
            <button
              key={item.key}
              type="button"
              className={`capability-card${isActive ? ' is-active' : ''}`}
              onClick={() => onChange(item.key)}
            >
              <span className="capability-card__icon">{CAPABILITY_ICONS[item.key]}</span>
              <span className="capability-card__body">
                <span className="capability-card__title">{item.title}</span>
                <span className="capability-card__desc">{item.desc}</span>
              </span>
              {item.meta ? <span className="capability-card__meta">{item.meta}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CapabilityBar
