import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  SearchOutlined,
} from '@ant-design/icons'
import {
  Empty,
  Input,
  Modal,
  Tag,
  Typography,
} from 'antd'

const { Text } = Typography

interface ToolItem {
  id: string
  name: string
}

interface SkillItem {
  id: string
  name: string
  description?: string
  toolId: string
  toolName: string
}

interface Props {
  open: boolean
  tools: ToolItem[]
  skills: SkillItem[]
  onSelectTool: (toolId: string) => void
  onSelectSkill: (toolId: string, skillName: string) => void
  onClose: () => void
  /** 可选：当组件内部监听到 Cmd+K 且当前未打开时调用 */
  onOpen?: () => void
}

export default function CommandPalette({
  open,
  tools,
  skills,
  onSelectTool,
  onSelectSkill,
  onClose,
  onOpen,
}: Props) {
  const [keyword, setKeyword] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<any>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const trimmedKeyword = keyword.trim().toLowerCase()

  const filteredTools = useMemo(() => {
    if (!trimmedKeyword) return tools
    return tools.filter((tool) =>
      tool.name.toLowerCase().includes(trimmedKeyword) ||
      tool.id.toLowerCase().includes(trimmedKeyword)
    )
  }, [tools, trimmedKeyword])

  const filteredSkills = useMemo(() => {
    if (!trimmedKeyword) return skills
    return skills.filter((skill) =>
      skill.name.toLowerCase().includes(trimmedKeyword) ||
      (skill.description ?? '').toLowerCase().includes(trimmedKeyword) ||
      skill.toolName.toLowerCase().includes(trimmedKeyword)
    )
  }, [skills, trimmedKeyword])

  const allResults = useMemo(() => {
    const list: Array<
      | { type: 'tool'; data: ToolItem }
      | { type: 'skill'; data: SkillItem }
    > = []
    filteredTools.forEach((tool) => list.push({ type: 'tool', data: tool }))
    filteredSkills.forEach((skill) => list.push({ type: 'skill', data: skill }))
    return list
  }, [filteredTools, filteredSkills])

  // 重置选中项当搜索结果变化时
  useEffect(() => {
    setActiveIndex(0)
  }, [trimmedKeyword])

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => window.clearTimeout(timer)
    }
  }, [open])

  // 关闭时清空关键词
  useEffect(() => {
    if (!open) {
      setKeyword('')
      setActiveIndex(0)
    }
  }, [open])

  // 键盘事件监听
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey

      // Cmd+K / Ctrl+K 打开
      if (isCmdOrCtrl && event.key === 'k') {
        event.preventDefault()
        if (open) {
          onClose()
        } else {
          onOpen?.()
        }
        return
      }

      if (!open) return

      // ESC 关闭
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      // 上下导航
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) =>
          prev >= allResults.length - 1 ? 0 : prev + 1
        )
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) =>
          prev <= 0 ? allResults.length - 1 : prev - 1
        )
        return
      }

      // Enter 选中
      if (event.key === 'Enter') {
        event.preventDefault()
        const item = allResults[activeIndex]
        if (!item) return
        if (item.type === 'tool') {
          onSelectTool(item.data.id)
        } else {
          onSelectSkill(item.data.toolId, item.data.name)
        }
        onClose()
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, onOpen, allResults, activeIndex, onSelectTool, onSelectSkill])

  // 滚动到选中项
  useEffect(() => {
    const el = itemRefs.current[activeIndex]
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  const handleMouseEnter = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const handleClick = useCallback(
    (index: number) => {
      const item = allResults[index]
      if (!item) return
      if (item.type === 'tool') {
        onSelectTool(item.data.id)
      } else {
        onSelectSkill(item.data.toolId, item.data.name)
      }
      onClose()
    },
    [allResults, onSelectTool, onSelectSkill, onClose]
  )

  const renderResultItem = (
    item: { type: 'tool'; data: ToolItem } | { type: 'skill'; data: SkillItem },
    index: number
  ) => {
    const isActive = index === activeIndex
    const refCallback = (el: HTMLDivElement | null) => {
      itemRefs.current[index] = el
    }

    if (item.type === 'tool') {
      const tool = item.data
      return (
        <div
          key={`tool-${tool.id}`}
          ref={refCallback}
          className={`command-palette__item${isActive ? ' is-active' : ''}`}
          onMouseEnter={() => handleMouseEnter(index)}
          onClick={() => handleClick(index)}
          role="option"
          aria-selected={isActive}
        >
          <div className="command-palette__item-main">
            <span className="command-palette__item-name">{tool.name}</span>
            <Tag variant="filled" color="blue">工具</Tag>
          </div>
          <Text className="command-palette__item-meta">{tool.id}</Text>
        </div>
      )
    }

    const skill = item.data
    return (
      <div
        key={`skill-${skill.toolId}-${skill.id}`}
        ref={refCallback}
        className={`command-palette__item${isActive ? ' is-active' : ''}`}
        onMouseEnter={() => handleMouseEnter(index)}
        onClick={() => handleClick(index)}
        role="option"
        aria-selected={isActive}
      >
        <div className="command-palette__item-main">
          <span className="command-palette__item-name">{skill.name}</span>
            <Tag variant="filled" color="cyan">技能</Tag>
        </div>
        {skill.description ? (
          <Text className="command-palette__item-desc">{skill.description}</Text>
        ) : null}
        <Text className="command-palette__item-meta">
          所属工具: {skill.toolName}
        </Text>
      </div>
    )
  }

  const hasResults = allResults.length > 0
  const totalCount = tools.length + skills.length

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={600}
      centered
      className="command-palette-modal"
      wrapClassName="command-palette-wrap"
      maskStyle={{ background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(2px)' }}
      destroyOnClose={false}
      afterOpenChange={(visible) => {
        if (visible) {
          inputRef.current?.focus()
        }
      }}
    >
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette__search">
          <SearchOutlined className="command-palette__search-icon" />
          <Input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索工具或技能..."
            variant="borderless"
            className="command-palette__input"
          />
          <kbd className="command-palette__shortcut">ESC</kbd>
        </div>

        <div
          className="command-palette__results"
          ref={listRef}
          role="listbox"
          aria-label="搜索结果"
        >
          {!hasResults && trimmedKeyword ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="未找到匹配结果"
              className="command-palette__empty"
            />
          ) : !hasResults && !trimmedKeyword ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={`共 ${totalCount} 个条目，输入关键词开始搜索`}
              className="command-palette__empty"
            />
          ) : (
            allResults.map((item, index) => renderResultItem(item, index))
          )}
        </div>

        <div className="command-palette__footer">
          <div className="command-palette__hints">
            <span><kbd>↑</kbd> <kbd>↓</kbd> 导航</span>
            <span><kbd>Enter</kbd> 选择</span>
            <span><kbd>ESC</kbd> 关闭</span>
          </div>
          <Text className="command-palette__count">
            {allResults.length} 个结果
          </Text>
        </div>
      </div>
    </Modal>
  )
}
