import React from 'react'
import { Tag, Space, Button } from 'antd'
import { CloseCircleOutlined } from '@ant-design/icons'

interface Props {
  allTags: string[]
  selectedTags: string[]
  onChange: (tags: string[]) => void
}

const TagFilter: React.FC<Props> = ({ allTags, selectedTags, onChange }) => {
  const handleToggle = (tag: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedTags, tag])
    } else {
      onChange(selectedTags.filter((t) => t !== tag))
    }
  }

  const handleClear = () => {
    onChange([])
  }

  if (allTags.length === 0) {
    return null
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Space size={[8, 8]} wrap>
        {allTags.map((tag) => (
          <Tag.CheckableTag
            key={tag}
            checked={selectedTags.includes(tag)}
            onChange={(checked) => handleToggle(tag, checked)}
            style={{ padding: '4px 12px', fontSize: 13, borderRadius: 4 }}
          >
            {tag}
          </Tag.CheckableTag>
        ))}
        {selectedTags.length > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={handleClear}
            style={{ fontSize: 13 }}
          >
            清空筛选
          </Button>
        )}
      </Space>
    </div>
  )
}

export default TagFilter
