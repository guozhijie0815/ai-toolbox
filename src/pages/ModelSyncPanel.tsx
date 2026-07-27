import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { HolderOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  App as AntdApp,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'

import { readConfigFile, saveConfigFile } from '../lib/toolboxApi'
import {
  DEFAULT_PROVIDER_KEY,
  FALLBACK_MODELS,
  buildNewModels,
  diffModels,
  displayNameOf,
  familyOf,
  fetchRemoteModels,
  formatModelDate,
  generateModelsText,
  mediaTag,
  parseConfiguredModels,
  type ModelConfig,
  type RemoteModel,
} from '../lib/modelSync'
import type { ToolItem } from '../types/toolbox'

const { Text, Title } = Typography

interface ModelSyncPanelProps {
  selectedTool?: ToolItem
  /** 把变更预览暴露给右侧栏 */
  onDiffChange?: (payload: {
    configPath?: string
    providerKey: string
    remoteCount: number
    localCount: number
    diff: ReturnType<typeof diffModels>
    dirty: boolean
    saving: boolean
    onApply: () => void
  }) => void
}

function ModelSyncPanel({ selectedTool, onDiffChange }: ModelSyncPanelProps) {
  const { message: messageApi } = AntdApp.useApp()

  const configFile = useMemo(
    () =>
      selectedTool?.configFiles.find(
        (file) =>
          file.name.includes('opencode') ||
          file.path.includes('opencode.json') ||
          file.path.endsWith('.jsonc'),
      ) ?? selectedTool?.configFiles[0],
    [selectedTool],
  )

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [apiLoading, setApiLoading] = useState(false)
  const [fileText, setFileText] = useState('')
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>(() =>
    FALLBACK_MODELS.map((id) => ({ id })),
  )
  const [configured, setConfigured] = useState<Map<string, ModelConfig>>(new Map())
  const [selected, setSelected] = useState<string[]>([])
  const [baselineOrder, setBaselineOrder] = useState<string[]>([])
  const [nameOverrides, setNameOverrides] = useState<Map<string, string>>(new Map())
  const [checkedL, setCheckedL] = useState<Set<string>>(new Set())
  const [checkedR, setCheckedR] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  /** 默认显示全部远端模型；关闭后隐藏 image/video/embedding 等非对话 */
  const [showMedia, setShowMedia] = useState(true)
  /** 默认按接口顺序；仅在筛选/手动开分组时才按厂商聚合 */
  const [groupByFamily, setGroupByFamily] = useState(false)
  const [familyFilter, setFamilyFilter] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)

  const applyConfigured = useCallback((text: string) => {
    const map = parseConfiguredModels(text, DEFAULT_PROVIDER_KEY)
    const ids = [...map.keys()]
    const names = new Map<string, string>()
    for (const [id, cfg] of map) {
      if (cfg.name) names.set(id, cfg.name)
    }
    setFileText(text)
    setConfigured(map)
    setSelected(ids)
    setBaselineOrder(ids)
    setNameOverrides(names)
    setCheckedL(new Set())
    setCheckedR(new Set())
  }, [])

  const loadConfig = useCallback(async () => {
    if (!selectedTool || !configFile) return
    setLoading(true)
    try {
      const text = await readConfigFile(selectedTool, configFile)
      if (!text.trim()) {
        throw new Error(`${configFile.name} 为空或不存在，请先在「配置编辑」中确认`)
      }
      applyConfigured(text)
    } catch (error) {
      void messageApi.error(error instanceof Error ? error.message : '读取配置失败')
    } finally {
      setLoading(false)
    }
  }, [applyConfigured, configFile, messageApi, selectedTool])

  const loadRemote = useCallback(
    async (manual = false) => {
      setApiLoading(true)
      try {
        const models = await fetchRemoteModels()
        setRemoteModels(models)
        if (manual) void messageApi.success(`模型列表已刷新 · ${models.length} 个`)
      } catch (error) {
        if (manual) {
          void messageApi.error(error instanceof Error ? error.message : '刷新失败')
        }
        setRemoteModels((current) =>
          current.length ? current : FALLBACK_MODELS.map((id) => ({ id })),
        )
      } finally {
        setApiLoading(false)
      }
    },
    [messageApi],
  )

  const apiIds = useMemo(() => remoteModels.map((item) => item.id), [remoteModels])
  const createdMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of remoteModels) {
      if (item.created) map.set(item.id, item.created)
    }
    return map
  }, [remoteModels])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // 异步加载，避免在 effect 内同步 setState
      if (!cancelled) await loadConfig()
      if (!cancelled) await loadRemote(false)
    }
    void run()
    return () => {
      cancelled = true
    }
    // 仅在工具/配置文件变化时重载
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 显式依赖工具与配置路径
  }, [selectedTool?.id, configFile?.path])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  // 有厂商筛选时才聚合展示；否则严格保持接口顺序（新模型在前）
  const shouldGroup = groupByFamily || Boolean(familyFilter)

  const leftIds = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const filtered = apiIds.filter((id) => {
      if (selectedSet.has(id)) return false
      const tag = mediaTag(id)
      if (tag && !showMedia) return false
      if (familyFilter && familyOf(id) !== familyFilter) return false
      if (q) {
        const name = displayNameOf(id, configured, nameOverrides).toLowerCase()
        if (!id.toLowerCase().includes(q) && !name.includes(q)) return false
      }
      return true
    })
    // 仅分组模式重排；默认保持 API 返回顺序
    if (!shouldGroup) return filtered
    return [...filtered].sort((a, b) => {
      const fa = familyOf(a)
      const fb = familyOf(b)
      if (fa !== fb) return fa.localeCompare(fb)
      // 同厂商内仍按接口顺序（用 apiIds 下标）
      return apiIds.indexOf(a) - apiIds.indexOf(b)
    })
  }, [
    apiIds,
    configured,
    familyFilter,
    keyword,
    nameOverrides,
    selectedSet,
    shouldGroup,
    showMedia,
  ])

  const availableCount = useMemo(
    () => apiIds.filter((id) => !selectedSet.has(id)).length,
    [apiIds, selectedSet],
  )

  const hiddenMediaCount = useMemo(() => {
    if (showMedia) return 0
    return apiIds.filter((id) => !selectedSet.has(id) && mediaTag(id)).length
  }, [apiIds, selectedSet, showMedia])

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const id of apiIds) {
      if (selectedSet.has(id)) continue
      if (mediaTag(id) && !showMedia) continue
      const family = familyOf(id)
      counts.set(family, (counts.get(family) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [apiIds, selectedSet, showMedia])

  const diff = useMemo(
    () => diffModels(selected, baselineOrder, configured, nameOverrides),
    [baselineOrder, configured, nameOverrides, selected],
  )

  const openConfirm = useCallback(() => setConfirmOpen(true), [])

  useEffect(() => {
    if (!onDiffChange) return
    onDiffChange({
      configPath: configFile?.path,
      providerKey: DEFAULT_PROVIDER_KEY,
      remoteCount: apiIds.length,
      localCount: selected.length,
      diff,
      dirty: diff.dirty,
      saving,
      onApply: openConfirm,
    })
  }, [apiIds.length, configFile?.path, diff, onDiffChange, openConfirm, saving, selected.length])

  const moveToRight = (ids: string[]) => {
    if (!ids.length) return
    setSelected((current) => {
      const set = new Set(current)
      const next = [...current]
      for (const id of ids) {
        if (!set.has(id)) {
          next.push(id)
          set.add(id)
        }
      }
      return next
    })
    setCheckedL((current) => {
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const moveToLeft = (ids: string[]) => {
    if (!ids.length) return
    const remove = new Set(ids)
    setSelected((current) => current.filter((id) => !remove.has(id)))
    setCheckedR((current) => {
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const toggleCheck = (side: 'L' | 'R', id: string) => {
    const setter = side === 'L' ? setCheckedL : setCheckedR
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renameModel = (id: string, name: string) => {
    setNameOverrides((current) => {
      const next = new Map(current)
      next.set(id, name.trim() || id)
      return next
    })
  }

  const reorderSelected = useCallback((fromId: string, toIndex: number) => {
    setSelected((current) => {
      const from = current.indexOf(fromId)
      if (from < 0 || toIndex < 0 || toIndex > current.length) return current
      if (toIndex === from || toIndex === from + 1) return current
      const next = [...current]
      const [item] = next.splice(from, 1)
      let insertAt = toIndex
      if (from < toIndex) insertAt -= 1
      if (insertAt < 0) insertAt = 0
      if (insertAt > next.length) insertAt = next.length
      next.splice(insertAt, 0, item)
      return next
    })
  }, [])

  const clearDragState = useCallback(() => {
    dragIdRef.current = null
    dropIndexRef.current = null
    pointerIdRef.current = null
    setDragId(null)
    setDropIndex(null)
  }, [])

  const updateDropIndexFromPoint = useCallback((clientY: number) => {
    const root = listRef.current
    if (!root || !dragIdRef.current) return
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-model-id]'))
    if (!rows.length) return

    let nextIndex = rows.length
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const rect = row.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) {
        nextIndex = i
        break
      }
    }
    if (dropIndexRef.current !== nextIndex) {
      dropIndexRef.current = nextIndex
      setDropIndex(nextIndex)
    }
  }, [])

  const finishDrag = useCallback(() => {
    const id = dragIdRef.current
    const to = dropIndexRef.current
    if (id && to !== null && to !== undefined) {
      reorderSelected(id, to)
    }
    clearDragState()
  }, [clearDragState, reorderSelected])

  useEffect(() => {
    if (!dragId) return

    const onMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return
      event.preventDefault()
      updateDropIndexFromPoint(event.clientY)
    }
    const onUp = (event: PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return
      finishDrag()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragId, finishDrag, updateDropIndexFromPoint])

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    // 仅左键；输入框/勾选不触发
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('input,textarea,button,.ant-checkbox-wrapper,.ant-input')) return

    event.preventDefault()
    event.stopPropagation()
    pointerIdRef.current = event.pointerId
    dragIdRef.current = id
    dropIndexRef.current = selected.indexOf(id)
    setDragId(id)
    setDropIndex(selected.indexOf(id))
    updateDropIndexFromPoint(event.clientY)
  }

  const handleSave = async () => {
    if (!selectedTool || !configFile) return
    setSaving(true)
    try {
      const nextText = generateModelsText(
        fileText,
        DEFAULT_PROVIDER_KEY,
        selected,
        configured,
        nameOverrides,
      )
      const message = await saveConfigFile(selectedTool, configFile, nextText)
      const nextConfigured = buildNewModels(selected, configured, nameOverrides)
      setFileText(nextText)
      setConfigured(nextConfigured)
      setBaselineOrder([...selected])
      const names = new Map<string, string>()
      for (const [id, cfg] of nextConfigured) {
        if (cfg.name) names.set(id, cfg.name)
      }
      setNameOverrides(names)
      setConfirmOpen(false)
      void messageApi.success(`${message} · 请重启 OpenCode`)
    } catch (error) {
      void messageApi.error(error instanceof Error ? error.message : '同步失败')
    } finally {
      setSaving(false)
    }
  }

  if (!selectedTool) {
    return <Empty description="请先选择工具" />
  }

  if (!configFile) {
    return <Empty description="当前工具没有可写入的配置文件" />
  }

  const renderLeftList = () => {
    if (!leftIds.length) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的模型" />
    }

    const nodes: ReactNode[] = []
    let lastFamily: string | null = null
    leftIds.forEach((id, index) => {
      if (shouldGroup) {
        const family = familyOf(id)
        if (family !== lastFamily) {
          lastFamily = family
          nodes.push(
            <div key={`fam-${family}-${index}`} className="model-sync__family">
              {family}
            </div>,
          )
        }
      }
      const tag = mediaTag(id)
      const dateText = formatModelDate(createdMap.get(id))
      nodes.push(
        <div
          key={`left-${id}`}
          className={`model-sync__item${checkedL.has(id) ? ' is-checked' : ''}`}
          onClick={() => toggleCheck('L', id)}
          onDoubleClick={() => moveToRight([id])}
        >
          <Checkbox checked={checkedL.has(id)} onClick={(e) => e.stopPropagation()} />
          <span className="model-sync__id" title={id}>
            {id}
          </span>
          {dateText ? (
            <span className="model-sync__date" title={dateText}>
              {dateText}
            </span>
          ) : null}
          {tag ? <Tag className="model-sync__tag">{tag}</Tag> : null}
        </div>,
      )
    })
    return nodes
  }

  const renderRightList = () => {
    if (!selected.length) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧移入模型" />
    }
    return (
      <div ref={listRef} className={`model-sync__dnd${dragId ? ' is-sorting' : ''}`}>
        {selected.map((id, index) => {
          const isNew = !configured.has(id)
          const name = displayNameOf(id, configured, nameOverrides)
          const showDropBefore = Boolean(dragId && dropIndex === index && dragId !== id)
          const showDropAfter =
            Boolean(dragId) && dropIndex === selected.length && index === selected.length - 1
          return (
            <div key={`right-${id}`} className="model-sync__row-wrap">
              {showDropBefore ? <div className="model-sync__drop-line" /> : null}
              <div
                data-model-id={id}
                className={`model-sync__item model-sync__item--right${checkedR.has(id) ? ' is-checked' : ''}${isNew ? ' is-new' : ''}${dragId === id ? ' is-dragging' : ''}`}
                onPointerDown={(event) => handlePointerDown(event, id)}
                onClick={() => {
                  if (dragId) return
                  toggleCheck('R', id)
                }}
                onDoubleClick={() => moveToLeft([id])}
              >
                <span className="model-sync__grip" title="按住拖拽排序">
                  <HolderOutlined />
                </span>
                <Checkbox checked={checkedR.has(id)} onClick={(e) => e.stopPropagation()} />
                <span className="model-sync__ord">{index + 1}</span>
                <span className="model-sync__id" title={id}>
                  {id}
                </span>
                {isNew ? <Tag color="success">新增</Tag> : null}
                <Input
                  size="small"
                  className="model-sync__name"
                  value={name}
                  placeholder="显示名"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => renameModel(id, event.target.value)}
                />
              </div>
              {showDropAfter ? <div className="model-sync__drop-line" /> : null}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="model-sync">
      <div className="model-sync__header">
        <div>
          <Text className="panel-kicker">Model Sync</Text>
          <Title level={4} style={{ margin: 0 }}>
            模型同步
          </Title>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadConfig()}>
            重读配置
          </Button>
          <Button loading={apiLoading} onClick={() => void loadRemote(true)}>
            刷新远端
          </Button>
        </Space>
      </div>

      <div className="model-sync__toolbar">
        <Input
          allowClear
          placeholder="过滤模型 id…"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          style={{ maxWidth: 260 }}
        />
        <label className="model-sync__switch" title="关闭后隐藏 image/video/embedding 等">
          <Switch size="small" checked={showMedia} onChange={setShowMedia} />
          <span>
            含非对话
            {hiddenMediaCount > 0 ? `（已藏 ${hiddenMediaCount}）` : ''}
          </span>
        </label>
        <label className="model-sync__switch">
          <Switch size="small" checked={groupByFamily} onChange={setGroupByFamily} />
          <span>分组</span>
        </label>
        <div className="model-sync__families">
          <button
            type="button"
            className={`model-sync__chip${!familyFilter ? ' is-on' : ''}`}
            onClick={() => setFamilyFilter(null)}
          >
            全部
          </button>
          {familyCounts.map(([family, count]) => (
            <button
              key={family}
              type="button"
              className={`model-sync__chip${familyFilter === family ? ' is-on' : ''}`}
              onClick={() => setFamilyFilter((current) => (current === family ? null : family))}
            >
              {family}
              <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="model-sync__board">
        <section className="model-sync__panel">
          <div className="model-sync__panel-head">
            <span>可选模型</span>
            <Tag
              title={`远端 ${apiIds.length} − 已配置 ${selected.length} = 可选 ${availableCount}`}
            >
              {leftIds.length}
              {leftIds.length !== availableCount ? ` / ${availableCount}` : ''}
            </Tag>
            <Checkbox
              style={{ marginLeft: 'auto' }}
              checked={leftIds.length > 0 && leftIds.every((id) => checkedL.has(id))}
              onChange={(event) => {
                setCheckedL(event.target.checked ? new Set(leftIds) : new Set())
              }}
            >
              全选
            </Checkbox>
          </div>
          <div className="model-sync__list">{renderLeftList()}</div>
        </section>

        <div className="model-sync__transfer" role="group" aria-label="移动模型">
          <button
            type="button"
            className="model-sync__tbtn model-sync__tbtn--primary"
            onClick={() => moveToRight([...checkedL])}
            disabled={checkedL.size === 0}
            title="选中移入"
            aria-label="选中移入"
          >
            ›
          </button>
          <button
            type="button"
            className="model-sync__tbtn model-sync__tbtn--primary"
            onClick={() => moveToLeft([...checkedR])}
            disabled={checkedR.size === 0}
            title="选中移出"
            aria-label="选中移出"
          >
            ‹
          </button>
        </div>

        <section className="model-sync__panel model-sync__panel--right">
          <div className="model-sync__panel-head">
            <span>已配置模型</span>
            <Tag color="success">{selected.length}</Tag>
            <Checkbox
              style={{ marginLeft: 'auto' }}
              checked={selected.length > 0 && selected.every((id) => checkedR.has(id))}
              onChange={(event) => {
                setCheckedR(event.target.checked ? new Set(selected) : new Set())
              }}
            >
              全选
            </Checkbox>
          </div>
          <div className="model-sync__list">{renderRightList()}</div>
        </section>
      </div>

      <Modal
        title="确认同步模型"
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={() => void handleSave()}
        okText="确认同步"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">{configFile.path}</Text>
          <Space size="large">
            <Tag color="blue">新增 {diff.adds.length}</Tag>
            <Tag color="error">移除 {diff.dels.length}</Tag>
            <Tag color="success">保留 {diff.keep}</Tag>
            {diff.orderChanged ? <Tag color="warning">顺序变更</Tag> : null}
            {diff.nameChanged ? <Tag color="warning">显示名变更</Tag> : null}
          </Space>
          {diff.adds.length ? (
            <div>
              <Text strong>新增</Text>
              <div className="model-sync__detail">
                {diff.adds.map((id) => (
                  <div key={id}>+ {id}</div>
                ))}
              </div>
            </div>
          ) : null}
          {diff.dels.length ? (
            <div>
              <Text strong>移除</Text>
              <div className="model-sync__detail">
                {diff.dels.map((id) => (
                  <div key={id}>− {id}</div>
                ))}
              </div>
            </div>
          ) : null}
          <Text type="secondary">确认后直接覆盖写入配置。完成后请重启 OpenCode。</Text>
        </Space>
      </Modal>
    </div>
  )
}

export default ModelSyncPanel
