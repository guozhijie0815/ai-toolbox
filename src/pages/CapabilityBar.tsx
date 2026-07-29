import type { ReactNode } from 'react'

import {
  ApiOutlined,
  CloudSyncOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import type { ToolItem } from '../types/toolbox'
import { getToolCapabilities } from './capability'
import type { ToolCapability } from './types'

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
    <div className="cap-tabs">
      {options.map((item) => {
        const isActive = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            className={`cap-tab${isActive ? ' active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            <span className="cap-tab__icon">{CAPABILITY_ICONS[item.key]}</span>
            <span>{item.title}</span>
            {item.key === 'sync' ? (
              <span className="cap-tab__sync">5</span>
            ) : item.key === 'skills' ? (
              <span className="cap-tab__meta">{selectedTool.skills.length}</span>
            ) : item.key === 'editor' ? (
              <span className="cap-tab__meta">{selectedTool.configFiles.length}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export default CapabilityBar
