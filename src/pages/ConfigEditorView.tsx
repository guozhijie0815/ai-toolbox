import { useEffect, useState } from 'react'

import Editor from '@monaco-editor/react'
import { App as AntdApp, Button, Empty, Space, Spin, Switch } from 'antd'
import {
  CloseOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  SaveOutlined,
} from '@ant-design/icons'

import { openPathInFinder } from '../lib/toolboxApi'
import { useToolboxStore } from '../store/useToolboxStore'
import type { ConfigFileItem, ToolItem } from '../types/toolbox'

interface ConfigEditorViewProps {
  selectedTool?: ToolItem
  selectedFile?: ConfigFileItem
  monacoTheme: 'vs' | 'vs-dark'
  setEditorMode: (next: boolean) => void
  setMiddleTab: (next: 'skills' | 'editor' | 'sync') => void
}

function ConfigEditorView({
  selectedTool,
  selectedFile,
  monacoTheme,
  setEditorMode,
  setMiddleTab,
}: ConfigEditorViewProps) {
  const { message: messageApi } = AntdApp.useApp()

  const selectedConfigId = useToolboxStore((state) => state.selectedConfigId)
  const isConfigLoading = useToolboxStore((state) => state.isConfigLoading)
  const isSaving = useToolboxStore((state) => state.isSaving)
  const selectConfigFile = useToolboxStore((state) => state.selectConfigFile)
  const setEditorContent = useToolboxStore((state) => state.setEditorContent)
  const saveCurrentFile = useToolboxStore((state) => state.saveCurrentFile)

  const [autoSave, setAutoSave] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('ai-toolbox-autosave') === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ai-toolbox-autosave', autoSave ? '1' : '0')
  }, [autoSave])

  useEffect(() => {
    if (!autoSave || !selectedFile?.dirty || isSaving) return
    const timer = window.setTimeout(() => {
      void saveCurrentFile({ silent: true })
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [
    autoSave,
    isSaving,
    saveCurrentFile,
    selectedFile?.dirty,
    selectedFile?.content,
    selectedFile?.id,
  ])

  return (
    <div className="panel-slide">
      <div className="editor-content__header">
        <div className="config-strip" style={{ flex: 1, marginBottom: 0 }}>
          {selectedTool?.configFiles.length ? (
            selectedTool.configFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`config-tab${file.id === selectedConfigId ? ' is-active' : ''}`}
                onClick={() => void selectConfigFile(file.id)}
              >
                <span className="config-tab__name">
                  <FileTextOutlined />
                  {file.name}
                </span>
                <span className="config-tab__meta">
                  <span>{file.language}</span>
                  {file.dirty ? <span className="dirty-dot" /> : null}
                </span>
              </button>
            ))
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前工具没有配置文件" />
          )}
        </div>
        <Space>
          <Switch
            checked={autoSave}
            onChange={setAutoSave}
            checkedChildren="自动保存"
            unCheckedChildren="自动保存"
          />
          <Button
            icon={<FolderOpenOutlined />}
            disabled={!selectedFile}
            onClick={() => selectedFile && void openPathInFinder(selectedFile.path)}
          >
            打开目录
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={isSaving}
            disabled={!selectedFile || !selectedFile.dirty}
            onClick={async () => {
              try {
                await saveCurrentFile()
                void messageApi.success('保存成功')
              } catch {
                void messageApi.error('保存失败')
              }
            }}
          >
            保存
          </Button>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => {
              setEditorMode(false)
              setMiddleTab('skills')
            }}
            title="关闭编辑"
            style={{ fontSize: 16 }}
          />
        </Space>
      </div>

      <div className="editor-content__body">
        <div className="editor-content__editor">
          {selectedFile ? (
            <>
              <Editor
                height="100%"
                defaultLanguage={selectedFile.language}
                language={selectedFile.language}
                theme={monacoTheme}
                loading={<Spin />}
                options={{
                  automaticLayout: true,
                  fontSize: 14,
                  minimap: { enabled: false },
                  padding: { top: 18, bottom: 18 },
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  smoothScrolling: true,
                  cursorSmoothCaretAnimation: 'on',
                }}
                value={selectedFile.content ?? ''}
                onChange={(value) => setEditorContent(value ?? '')}
              />
              {isConfigLoading ? (
                <div className="editor-mask">
                  <Spin size="large" />
                </div>
              ) : null}
            </>
          ) : (
            <div className="editor-empty">
              <Empty description="请选择要编辑的配置文件" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConfigEditorView
