# Changelog

## v0.2.0

### 修复
- **macOS 窗口圆角**：启用 `transparent: true`，恢复 `html/body` 透明背景与 `#root` 圆角裁剪
- **交通灯按钮**：补充 `core:window:allow-close` / `allow-minimize` 权限，关闭/最小化恢复正常
- **头部紧凑度**：减小 `.app-header` 与 `.title-bar` 间距，布局更紧凑
- **命令面板 key 重复**：跨工具同名 skill 的 key 改为 `skill-${toolId}-${id}`

### 恢复（从打包代码提取）
- `toolboxApi.ts`：补充 `listCenterSkills`、`deleteCenterSkill`、`syncFromCenter`、`importToCenter`、`installSkillFromGitToCenter`、`getSkillDetail` 等缺失 API
- `useToolboxStore.ts`：补充 `commandPaletteOpen`、`skillDetailOpen`、`selectedSkillDetail`、`loadSkillDetail` 等缺失状态与 action
- `types/toolbox.ts`：补充 `SkillDetailPayload`、`PresetSkill`、`PresetEntry` 等类型
- 图标：重新生成公文包风格图标（`icon-source.svg`）
