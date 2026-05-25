import { useState } from 'react'

import { SearchOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Checkbox,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'

import { syncSkills } from '../../lib/toolboxApi'
import { useToolboxStore } from '../../store/useToolboxStore'
import type { ConflictStrategy, SkillItem, SyncMode, ToolItem } from '../../types/toolbox'
import { formatTime } from '../../utils/appUtils'
import { getErrorMessage } from '../../utils/errorUtils'
import { conflictOptions, modeOptions } from '../types'

const { Text } = Typography

interface SyncSkillsModalProps {
  open: boolean
  onClose: () => void
  selectedTool?: ToolItem
  visibleTools: ToolItem[]
  currentSkills: SkillItem[]
  sortedSkills: SkillItem[]
  syncTargetOptions: { label: string; value: string }[]
  syncTargetToolIds: string[]
  setSyncTargetToolIds: (next: string[]) => void
  syncSelectedSkillIds: string[]
  setSyncSelectedSkillIds: React.Dispatch<React.SetStateAction<string[]>>
  syncMode: SyncMode
  setSyncMode: (next: SyncMode) => void
  conflictStrategy: ConflictStrategy
  setConflictStrategy: (next: ConflictStrategy) => void
}

function SyncSkillsModal({
  open,
  onClose,
  selectedTool,
  visibleTools,
  currentSkills,
  sortedSkills,
  syncTargetOptions,
  syncTargetToolIds,
  setSyncTargetToolIds,
  syncSelectedSkillIds,
  setSyncSelectedSkillIds,
  syncMode,
  setSyncMode,
  conflictStrategy,
  setConflictStrategy,
}: SyncSkillsModalProps) {
  const { message: messageApi } = AntdApp.useApp()
  const refreshTools = useToolboxStore((state) => state.refreshTools)

  const [syncKeyword, setSyncKeyword] = useState('')
  const [isSyncSubmitting, setIsSyncSubmitting] = useState(false)

  const canSubmitSync = syncTargetToolIds.length > 0 && syncSelectedSkillIds.length > 0

  const filteredSyncSkills = (() => {
    const keyword = syncKeyword.trim().toLowerCase()
    if (!keyword) return sortedSkills
    return sortedSkills.filter((skill) => {
      return (
        skill.name.toLowerCase().includes(keyword) ||
        (skill.description ?? '').toLowerCase().includes(keyword) ||
        (skill.path ?? '').toLowerCase().includes(keyword)
      )
    })
  })()

  const selectedSyncTargetNames = visibleTools
    .filter((tool) => syncTargetToolIds.includes(tool.id))
    .map((tool) => tool.name)
    .join('、')

  const handleSyncSubmit = async () => {
    if (!selectedTool) {
      void messageApi.error('没有可用的源工具')
      return
    }

    const targetTools = visibleTools.filter(
      (tool) =>
        syncTargetToolIds.includes(tool.id) &&
        syncTargetOptions.some((option) => option.value === tool.id),
    )
    if (targetTools.length === 0) {
      void messageApi.warning('至少选择一个目标工具')
      return
    }

    if (syncSelectedSkillIds.length === 0) {
      void messageApi.warning('至少选择一个技能')
      return
    }

    setIsSyncSubmitting(true)
    try {
      const syncMessage = await syncSkills({
        sourceTool: selectedTool,
        targetTools,
        skills: syncSelectedSkillIds,
        mode: syncMode,
        conflictStrategy,
      })
      void messageApi.success(syncMessage)
      onClose()
      await refreshTools()
    } catch (error) {
      void messageApi.error(getErrorMessage(error))
    } finally {
      setIsSyncSubmitting(false)
    }
  }

  return (
    <Modal
      title="同步技能"
      open={open}
      onCancel={onClose}
      onOk={() => void handleSyncSubmit()}
      okText="执行同步"
      cancelText="取消"
      width={950}
      centered
      confirmLoading={isSyncSubmitting}
      okButtonProps={{ disabled: !canSubmitSync }}
      className="sync-modal"
      wrapClassName="sync-modal-wrap"
    >
      <div className="sync-modal__layout">
        <div className="sync-modal__controls sync-modal__card">
          <div className="sync-control-group">
            <Text className="field-label">源工具</Text>
            <div className="fixed-source-tool">{selectedTool?.name ?? '-'}</div>
          </div>

          <div className="sync-control-group">
            <Text className="field-label">目标工具</Text>
            <Select
              mode="multiple"
              size="large"
              value={syncTargetToolIds}
              options={syncTargetOptions}
              placeholder="可多选"
              onChange={setSyncTargetToolIds}
              style={{ width: '100%' }}
            />
            <div className="quick-actions">
              <Button
                size="small"
                onClick={() => setSyncTargetToolIds(syncTargetOptions.map((item) => item.value))}
              >
                全选
              </Button>
              <Button size="small" onClick={() => setSyncTargetToolIds([])}>
                清空
              </Button>
            </div>
          </div>

          <div className="sync-control-group">
            <Text className="field-label">同步模式</Text>
            <Segmented
              block
              size="large"
              options={modeOptions}
              value={syncMode}
              onChange={(value) => setSyncMode(value as SyncMode)}
            />
          </div>

          <div className="sync-control-group">
            <Text className="field-label">冲突策略</Text>
            <Segmented
              className="conflict-segmented"
              block
              size="large"
              options={conflictOptions}
              value={conflictStrategy}
              onChange={(value) => setConflictStrategy(value as ConflictStrategy)}
            />
          </div>

          <div className="sync-summary">
            {canSubmitSync
              ? `将 ${syncSelectedSkillIds.length} 个技能同步到 ${selectedSyncTargetNames}`
              : '请选择目标工具和技能后执行同步'}
          </div>
        </div>

        <div className="sync-modal__skills sync-modal__card">
          <div className="sync-modal__skills-header">
            <Text className="field-label">技能选择</Text>
            <Space>
              <Tag variant="filled" color="cyan">
                {syncSelectedSkillIds.length}/{currentSkills.length}
              </Tag>
              <Button
                size="small"
                onClick={() => setSyncSelectedSkillIds(filteredSyncSkills.map((skill) => skill.id))}
              >
                全选
              </Button>
              <Button size="small" onClick={() => setSyncSelectedSkillIds([])}>
                清空
              </Button>
            </Space>
          </div>

          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="按技能名、描述、路径搜索"
            value={syncKeyword}
            onChange={(event) => setSyncKeyword(event.target.value)}
          />

          <div className="sync-skill-scroll">
            {filteredSyncSkills.map((skill) => (
              <label
                key={skill.id}
                className={`skill-item ${syncSelectedSkillIds.includes(skill.id) ? 'is-selected' : ''}`}
              >
                <div className="skill-item__checkbox">
                  <Checkbox
                    checked={syncSelectedSkillIds.includes(skill.id)}
                    onChange={(event) => {
                      setSyncSelectedSkillIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, skill.id])]
                          : current.filter((skillId) => skillId !== skill.id),
                      )
                    }}
                  />
                </div>
                <div className="skill-item__body">
                  <div className="skill-item__top">
                    <span className="skill-item__name" title={skill.name}>
                      {skill.name}
                    </span>
                    {skill.updatedAt ? (
                      <span className="skill-item__time">{formatTime(skill.updatedAt)}</span>
                    ) : null}
                  </div>
                  {(skill.summary ?? skill.description) ? (
                    <Text className="skill-item__desc">{skill.summary ?? skill.description}</Text>
                  ) : null}
                  {skill.isSymlink && (
                    <div className="skill-item__tags">
                      <Tag variant="filled" color="gold">
                        软链接
                      </Tag>
                    </div>
                  )}
                  {skill.path ? <Text className="skill-item__path">{skill.path}</Text> : null}
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default SyncSkillsModal
