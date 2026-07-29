import { useMemo } from 'react'
import {
  App as AntdApp,
  Button,
  Dropdown,
  Empty,
  Input,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Modal } from 'antd'

import PresetManager from '../components/PresetManager'
import TagFilter from '../components/TagFilter'
import { deleteSkill, openPathInFinder } from '../lib/toolboxApi'
import { useToolboxStore } from '../store/useToolboxStore'
import type { SkillItem, ToolItem } from '../types/toolbox'
import { formatTime } from '../utils/appUtils'

const { Text, Title } = Typography

interface SkillListViewProps {
  selectedTool?: ToolItem
  currentSkills: SkillItem[]
  filteredCurrentSkills: SkillItem[]
  skillKeyword: string
  setSkillKeyword: (next: string) => void
  skillCategoryFilter: string[]
  setSkillCategoryFilter: (next: string[]) => void
  allSkills: string[]
  onOpenSyncModal: () => void
}

function SkillListView({
  selectedTool,
  currentSkills,
  filteredCurrentSkills,
  skillKeyword,
  setSkillKeyword,
  skillCategoryFilter,
  setSkillCategoryFilter,
  allSkills,
  onOpenSyncModal,
}: SkillListViewProps) {
  const { message: messageApi } = AntdApp.useApp()

  const tools = useToolboxStore((state) => state.tools)
  const presets = useToolboxStore((state) => state.presets)
  const isPresetsLoading = useToolboxStore((state) => state.isPresetsLoading)
  const createPreset = useToolboxStore((state) => state.createPreset)
  const updatePreset = useToolboxStore((state) => state.updatePreset)
  const removePreset = useToolboxStore((state) => state.removePreset)
  const applyPreset = useToolboxStore((state) => state.applyPreset)
  const removePresetFromTools = useToolboxStore((state) => state.removePresetFromTools)
  const getPresetStatus = useToolboxStore((state) => state.getPresetStatus)
  const allTags = useToolboxStore((state) => state.allTags)
  const selectedTags = useToolboxStore((state) => state.selectedTags)
  const setSelectedTags = useToolboxStore((state) => state.setSelectedTags)
  const updateSkillTags = useToolboxStore((state) => state.updateSkillTags)
  const toggleSkillEnabled = useToolboxStore((state) => state.toggleSkillEnabled)
  const loadSkillDetail = useToolboxStore((state) => state.loadSkillDetail)
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

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { custom: 0, git: 0, system: 0, '': 0 }
    filteredCurrentSkills.forEach((skill) => {
      const cat = skill.category || ''
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [filteredCurrentSkills])

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
    <div className="panel-slide">
      <div className="panel-header">
        <div>
          <Text className="panel-kicker">Skills</Text>
          <Title level={4}>当前技能</Title>
        </div>
        <Space>
          <Tag variant="filled" color="cyan">
            {filteredCurrentSkills.length}/{currentSkills.length}
          </Tag>
          <Button
            className="skill-sync-btn"
            type="primary"
            icon={<SyncOutlined />}
            onClick={onOpenSyncModal}
          >
            同步技能
          </Button>
        </Space>
      </div>

      <PresetManager
        presets={presets}
        tools={tools.map((t) => ({ id: t.id, name: t.name }))}
        allSkills={allSkills}
        onApply={(presetId, targetToolIds) => {
          void applyPreset(presetId, targetToolIds)
        }}
        onCreate={(name, skills) => {
          void createPreset(name, skills)
        }}
        onUpdate={(presetId, name, skills) => {
          void updatePreset(presetId, name, skills)
        }}
        onDelete={(presetId) => {
          void removePreset(presetId)
        }}
        onRemoveFromTools={(presetId, targetToolIds) => {
          void removePresetFromTools(presetId, targetToolIds)
        }}
        getPresetStatus={getPresetStatus}
        isLoading={isPresetsLoading}
      />

      {allTags.length > 0 && (
        <TagFilter allTags={allTags} selectedTags={selectedTags} onChange={setSelectedTags} />
      )}

      <div className="skill-view-list">
        <div className="skill-view-toolbar">
          <Input
            allowClear
            size="middle"
            prefix={<SearchOutlined />}
            placeholder="筛选当前工具已有技能"
            value={skillKeyword}
            onChange={(event) => setSkillKeyword(event.target.value)}
            className="skill-view-search"
            style={{ flex: 1 }}
          />
          {[
            { label: '自定义', value: 'custom' },
            { label: '市场', value: 'git' },
            { label: '系统', value: 'system' },
          ].map((cat) => {
            const active = skillCategoryFilter.includes(cat.value)
            return (
              <Button
                key={cat.value}
                size="small"
                type={active ? 'primary' : 'default'}
                onClick={() => {
                  setSkillCategoryFilter(
                    active
                      ? skillCategoryFilter.filter((v) => v !== cat.value)
                      : [...skillCategoryFilter, cat.value],
                  )
                }}
              >
                {cat.label} {categoryCounts[cat.value]}
              </Button>
            )
          })}
          {categoryCounts[''] > 0 && (
            <Button
              size="small"
              type={skillCategoryFilter.includes('') ? 'primary' : 'default'}
              onClick={() => {
                setSkillCategoryFilter(
                  skillCategoryFilter.includes('')
                    ? skillCategoryFilter.filter((v) => v !== '')
                    : [...skillCategoryFilter, ''],
                )
              }}
            >
              未分类 {categoryCounts['']}
            </Button>
          )}
        </div>

        {filteredCurrentSkills.length > 0 ? (
          filteredCurrentSkills.map((skill, idx) => (
            <div
              key={skill.id}
              className={`skill-entry${skill.enabled === false ? ' is-disabled' : ''}${
                !skill.summary && !skill.description && !skill.path ? ' is-compact' : ''
              }`}
            >
              <span className="skill-entry__accent" aria-hidden="true" />
              <div className="skill-entry__top">
                <span className="skill-entry__index">{idx + 1}</span>
                <span
                  className="skill-entry__name"
                  title={skill.name}
                  onClick={() => {
                    if (selectedTool) {
                      loadSkillDetail(selectedTool.id, skill.name)
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {skill.name}
                </span>
                {skill.category && (
                  <Tag
                    color={
                      skill.category === 'custom'
                        ? 'orange'
                        : skill.category === 'git'
                          ? 'blue'
                          : 'default'
                    }
                    style={{ fontSize: 11, lineHeight: '18px', marginLeft: 4 }}
                  >
                    {skill.category === 'custom'
                      ? '自定义'
                      : skill.category === 'git'
                        ? '市场'
                        : '系统'}
                  </Tag>
                )}
                <div className="skill-entry__actions">
                  {skill.updatedAt ? (
                    <span className="skill-entry__time">{formatTime(skill.updatedAt)}</span>
                  ) : null}
                  {renderSkillMeta(skill)}
                  <Switch
                    size="small"
                    checked={skill.enabled !== false}
                    onChange={(checked) => {
                      if (selectedTool) {
                        toggleSkillEnabled(selectedTool.id, skill.name, checked)
                      }
                    }}
                  />
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'detail',
                          icon: <FileTextOutlined />,
                          label: '查看详情',
                          onClick: () => {
                            if (selectedTool) {
                              loadSkillDetail(selectedTool.id, skill.name)
                            }
                          },
                        },
                        {
                          key: 'tags',
                          icon: null,
                          label: (
                            <div>
                              <div style={{ marginBottom: 4 }}>编辑标签</div>
                              <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 200 }}>
                                <Select
                                  mode="tags"
                                  size="small"
                                  style={{ width: '100%' }}
                                  placeholder="输入标签"
                                  value={skill.tags || []}
                                  onChange={(tags: string[]) => {
                                    if (selectedTool) {
                                      updateSkillTags(selectedTool.id, skill.name, tags)
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          ),
                        },
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
              {(skill.tags?.length ?? 0) > 0 && (
                <div className="skill-entry__tags">
                  {skill.tags!.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </div>
              )}
              {skill.path ? (
                <div className="skill-entry__path-row">
                  <Text
                    className="skill-entry__path skill-entry__path--no-margin"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {skill.path}
                  </Text>
                  <button
                    type="button"
                    className="skill-open-location"
                    onClick={() => void openPathInFinder(skill.path!)}
                  >
                    <FolderOpenOutlined />
                    打开位置
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={currentSkills.length > 0 ? '没有匹配的技能' : '当前工具没有技能'}
          />
        )}
      </div>
    </div>
  )
}

export default SkillListView
