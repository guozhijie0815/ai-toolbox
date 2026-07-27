import {
  CheckCircleOutlined,
  DiffOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { Button, Empty, Tag, Typography } from 'antd'

import type { ModelDiff } from '../lib/modelSync'

const { Text, Title } = Typography

interface ModelSyncSidePanelProps {
  remoteCount: number
  localCount: number
  diff: ModelDiff
  dirty: boolean
  saving?: boolean
  onApply: () => void
}

function ModelSyncSidePanel({
  remoteCount,
  localCount,
  diff,
  dirty,
  saving,
  onApply,
}: ModelSyncSidePanelProps) {
  return (
    <aside className="panel panel--insights model-sync-side">
      <div className="panel-header">
        <div>
          <Text className="panel-kicker">Preview</Text>
          <Title level={4} style={{ margin: 0 }}>
            变更预览
          </Title>
        </div>
        <Tag color={dirty ? 'warning' : 'success'}>{dirty ? '有变更' : '已同步'}</Tag>
      </div>

      <div className="model-sync-side__body">
        <div className="model-sync-side__stats">
          <div className="model-sync-side__stat">
            <span className="model-sync-side__stat-label">远端</span>
            <b>{remoteCount}</b>
          </div>
          <div className="model-sync-side__stat">
            <span className="model-sync-side__stat-label">本地</span>
            <b>{localCount}</b>
          </div>
          <div className="model-sync-side__stat model-sync-side__stat--add">
            <span className="model-sync-side__stat-label">新增</span>
            <b className="is-add">+{diff.adds.length}</b>
          </div>
          <div className="model-sync-side__stat model-sync-side__stat--del">
            <span className="model-sync-side__stat-label">移除</span>
            <b>−{diff.dels.length}</b>
          </div>
        </div>

        <div className="model-sync-side__meta">
          {diff.orderChanged ? <Tag color="warning">顺序变更</Tag> : null}
          {diff.nameChanged ? <Tag color="warning">显示名变更</Tag> : null}
          {!dirty ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              与配置一致
            </Tag>
          ) : null}
          <Tag icon={<DiffOutlined />}>保留 {diff.keep}</Tag>
        </div>

        <div className="model-sync-side__section">
          <Text strong className="model-sync-side__section-title is-add">
            <PlusCircleOutlined /> 将新增
          </Text>
          {diff.adds.length ? (
            <div className="model-sync-side__list model-sync-side__list--add">
              {diff.adds.map((id) => (
                <div key={id}>+ {id}</div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无新增" />
          )}
        </div>

        <div className="model-sync-side__section">
          <Text strong>
            <MinusCircleOutlined /> 将移除
          </Text>
          {diff.dels.length ? (
            <div className="model-sync-side__list model-sync-side__list--del">
              {diff.dels.map((id) => (
                <div key={id}>− {id}</div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无移除" />
          )}
        </div>
      </div>

      <div className="model-sync-side__footer">
        <Button
          type="primary"
          block
          size="large"
          icon={<SwapOutlined />}
          disabled={!dirty || localCount === 0}
          loading={saving}
          onClick={onApply}
        >
          {dirty ? '确认同步' : '无需同步'}
        </Button>
      </div>
    </aside>
  )
}

export default ModelSyncSidePanel
