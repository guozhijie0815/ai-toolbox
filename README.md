# AI Toolbox

AI 工具箱 —— 一个基于 Tauri + React 的桌面端 Agent 技能管理工具。

## 功能特性

### 工具管理
- 多工具注册与管理（Claude Code、Cline、Cursor、Windsurf 等）
- 自动扫描工具目录，识别配置文件和技能目录
- 工具启用/禁用切换

### 技能同步
- 一键同步技能到多个目标工具
- 支持软链接和物理复制两种模式
- 冲突策略：跳过/覆盖/保留最新
- 实时显示技能在各工具间的同步状态

### 配置编辑
- 内置 Monaco Editor 代码编辑器
- 支持 JSON/YAML/TOML 等配置格式
- 自动保存与手动保存
- 配置文件备份与恢复

### 变动洞察
- 实时监控各工具技能差异
- 识别领先工具与滞后工具
- 显示技能更新时间对比

## 技术架构

```
├── src/                          # 前端 (React + TypeScript)
│   ├── App.tsx                   # 主界面
│   ├── App.css                   # 样式
│   ├── lib/
│   │   └── toolboxApi.ts         # Tauri 命令封装
│   ├── store/
│   │   └── useToolboxStore.ts    # 状态管理 (Zustand)
│   └── types/
│       └── toolbox.ts            # 类型定义
│
├── src-tauri/                    # 后端 (Rust)
│   ├── src/
│   │   ├── lib.rs               # Tauri 命令实现
│   │   └── toolbox.rs           # 工具箱核心逻辑
│   └── Cargo.toml               # Rust 依赖
│
├── package.json                  # 前端版本 0.1.0
└── src-tauri/Cargo.toml          # 后端版本 0.2.0
```

## 开发环境

- **前端**: React 19 + TypeScript + Vite + Ant Design 6
- **后端**: Rust + Tauri 2
- **编辑器**: Monaco Editor
- **状态管理**: Zustand

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri:dev

# 构建
npm run tauri:build
```

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.2.0 | 2025-05 | 新增变动洞察、UI 重构、技能目录配置 |
| v0.1.0 | 2025-04 | 初始版本，工具管理与技能同步 |

## 分支说明

- `main` — 主分支，稳定版本
- `codex/tool-registry-management` — 功能开发分支
- 版本标签：`v0.1.0`、`v0.2.0`

## License

MIT
