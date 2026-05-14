# Changelog

## v0.2.2 (开发中)

### 工程质量改进

- **移除所有硬编码路径**：Rust 后端 6 个模块 + 前端均改为运行时动态获取 Home 目录，支持跨平台（macOS/Windows/Linux）
- **Prettier 代码格式化**：统一代码风格（单引号、无分号、100 字符宽度）
- **Husky + lint-staged**：pre-commit 自动执行 ESLint + Prettier
- **ESLint 增强**：集成 eslint-config-prettier，添加 unused-vars/explicit-any 规则
- **TypeScript strict 模式**：启用全量严格类型检查
- **Vite 构建优化**：添加 `@` 路径别名 + manualChunks 分包（vendor/antd/editor）
- **统一错误处理**：提取 `getErrorMessage()` 工具函数，消除 26 处重复的 `error instanceof Error` 模式
- **提取公共模块**：`src/utils/appUtils.ts`（hasTauriRuntime/normalizeFsPath/formatTime）和 `src/utils/errorUtils.ts`
- **Vitest 测试框架**：14 个单元测试覆盖核心工具函数

## v0.2.1

### 新增
- **GitHub Actions 自动发布**：推送 `v*` 标签或手动运行工作流时，自动构建安装包并创建草稿 Release

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
