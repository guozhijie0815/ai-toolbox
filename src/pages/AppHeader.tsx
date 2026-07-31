import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  CloudOutlined,
  MoonOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { Button, Input } from 'antd'

import { hasTauriRuntime, isInteractiveDragTarget } from '../utils/appUtils'
import type { ThemeMode } from './types'

interface AppHeaderProps {
  resolvedTheme: 'light' | 'dark'
  onToggleTheme: (next: ThemeMode) => void
  onOpenCommandPalette: () => void
  onOpenManager: () => void
  onOpenCenterRepo: () => void
  onRefreshAll: () => void
  isRefreshing: boolean
  searchKeyword: string
  onSearchKeywordChange: (value: string) => void
}

function AppHeader({
  resolvedTheme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenManager,
  onOpenCenterRepo,
  onRefreshAll,
  isRefreshing,
  searchKeyword,
  onSearchKeywordChange,
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
      {/* 交通灯 + 品牌标识 */}
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
        <svg
          viewBox="0 0 32 32"
          fill="none"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            display: 'block',
            marginLeft: 14,
            flexShrink: 0,
          }}
        >
          <rect width="32" height="32" rx="8" fill="url(#brand-grad)" />
          <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
            <line x1="16" y1="16.5" x2="9.5" y2="11.1" />
            <line x1="16" y1="16.5" x2="22.5" y2="11.1" />
            <line x1="16" y1="16.5" x2="9.5" y2="21.9" />
            <line x1="16" y1="16.5" x2="22.5" y2="21.9" />
          </g>
          <g fill="#fff">
            <circle cx="9.5" cy="11.1" r="2.2" />
            <circle cx="22.5" cy="11.1" r="2.2" />
            <circle cx="9.5" cy="21.9" r="2.2" />
            <circle cx="22.5" cy="21.9" r="2.2" />
            <circle cx="16" cy="16.5" r="3.4" />
          </g>
          <circle cx="16" cy="16.5" r="1.5" fill="#d86933" />
          <defs>
            <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fabd7a" />
              <stop offset="45%" stopColor="#f4a261" />
              <stop offset="100%" stopColor="#d86933" />
            </linearGradient>
          </defs>
        </svg>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--muted-text)',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            lineHeight: 1,
            marginLeft: 4,
          }}
        >
          AI Toolbox
        </span>
      </div>

      {/* 搜索 */}
      <div className="header-search">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索技能或工具... (⌘K)"
          value={searchKeyword}
          onChange={(e) => {
            onSearchKeywordChange(e.target.value)
            onOpenCommandPalette()
          }}
          onClick={onOpenCommandPalette}
          className="header-search-input"
        />
      </div>

      {/* 操作按钮 */}
      <div className="header-actions">
        <Button className="header-action-btn" icon={<SettingOutlined />} onClick={onOpenManager}>
          管理工具
        </Button>
        <Button className="header-action-btn" icon={<CloudOutlined />} onClick={onOpenCenterRepo}>
          中央仓库
        </Button>
        <Button
          className="header-action-btn"
          icon={<ReloadOutlined />}
          loading={isRefreshing}
          onClick={onRefreshAll}
        >
          刷新
        </Button>
        <Button
          className="header-theme-btn"
          type="text"
          icon={resolvedTheme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          aria-label={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          title={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          onClick={() => onToggleTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        />
      </div>
    </header>
  )
}

export default AppHeader
