import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  CloudOutlined,
  MoonOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Button, Input, Tag, Typography } from 'antd'

import { hasTauriRuntime, isInteractiveDragTarget } from '../utils/appUtils'
import type { ThemeMode } from './types'

const { Text, Title } = Typography

interface AppHeaderProps {
  visibleToolsCount: number
  isPreview: boolean
  resolvedTheme: 'light' | 'dark'
  onToggleTheme: (next: ThemeMode) => void
  onOpenCommandPalette: () => void
  onOpenManager: () => void
  onOpenCenterRepo: () => void
}

function AppHeader({
  visibleToolsCount,
  isPreview,
  resolvedTheme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenManager,
  onOpenCenterRepo,
}: AppHeaderProps) {
  const handleWindowDragMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (!hasTauriRuntime() || event.button !== 0 || event.detail >= 2) return
    if (event.clientX < 80 || isInteractiveDragTarget(event.target)) return
    void getCurrentWindow().startDragging()
  }

  const handleWindowDragDoubleClick = async (event: React.MouseEvent<HTMLElement>) => {
    if (!hasTauriRuntime() || event.clientX < 80 || isInteractiveDragTarget(event.target)) return
    try {
      const appWindow = getCurrentWindow()
      const maximized = await appWindow.isMaximized()
      if (maximized) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
    } catch (err) {
      console.error('Window maximize/unmaximize failed:', err)
    }
  }

  const handleWindowClose = async () => {
    if (!hasTauriRuntime()) return
    try {
      await getCurrentWindow().close()
    } catch (err) {
      console.error('Window close failed:', err)
    }
  }

  const handleWindowMinimize = async () => {
    if (!hasTauriRuntime()) return
    try {
      await getCurrentWindow().minimize()
    } catch (err) {
      console.error('Window minimize failed:', err)
    }
  }

  const handleWindowMaximize = async () => {
    if (!hasTauriRuntime()) return
    try {
      const appWindow = getCurrentWindow()
      const maximized = await appWindow.isMaximized()
      if (maximized) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
    } catch (err) {
      console.error('Window maximize failed:', err)
    }
  }

  return (
    <header
      className="app-header"
      onMouseDown={handleWindowDragMouseDown}
      onDoubleClick={(event) => void handleWindowDragDoubleClick(event)}
    >
      {/* 交通灯 + 标题 */}
      <div className="title-bar">
        <div className="traffic-lights">
          <button
            type="button"
            className="traffic-light traffic-light--red"
            onClick={() => void handleWindowClose()}
            aria-label="关闭"
          />
          <button
            type="button"
            className="traffic-light traffic-light--yellow"
            onClick={() => void handleWindowMinimize()}
            aria-label="最小化"
          />
          <button
            type="button"
            className="traffic-light traffic-light--green"
            onClick={() => void handleWindowMaximize()}
            aria-label="最大化"
          />
        </div>
        <span className="app-title">AI Toolbox</span>
      </div>

      {/* 标题行：左侧标题 + 右侧操作 */}
      <div className="header-top">
        <div className="header-brand">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 4,
            }}
          >
            <Title level={2} style={{ margin: 0, fontSize: 20 }}>
              AI Toolbox
            </Title>
            <Tag
              variant="filled"
              color={isPreview ? 'gold' : 'success'}
              className="runtime-mini-tag"
            >
              {isPreview ? 'Preview' : 'Tauri'} · {visibleToolsCount} tools
            </Tag>
          </div>
          <Text className="header-copy">先选工具，再选能力：技能管理、配置编辑、模型同步。</Text>
        </div>
        <div className="header-search">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索技能、工具、配置..."
            readOnly
            onClick={onOpenCommandPalette}
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: 10,
              background: 'var(--chip-bg)',
              borderColor: 'transparent',
              padding: '10px 14px',
            }}
          />
        </div>
        <div className="header-actions">
          <Button icon={<SettingOutlined />} onClick={onOpenManager}>
            管理工具
          </Button>
          <Button icon={<CloudOutlined />} onClick={onOpenCenterRepo}>
            中央仓库
          </Button>
          <Button
            type="text"
            icon={resolvedTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={() => onToggleTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            style={{ color: 'var(--color-text-secondary)' }}
          />
        </div>
      </div>
    </header>
  )
}

export default AppHeader
