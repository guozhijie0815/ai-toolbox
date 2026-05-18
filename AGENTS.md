# 项目开发规则

## 输出风格

- 中文回复必须简洁、直接、有信息量。
- 不写寒暄、客套、情绪表演、虚假互动。
- 不使用咨询黑话、网络流行语、过度戏剧化表达。
- 能一句话说清的内容不要拆成多句。
- 删掉后不影响意思的句子不要写。

## 结构化表达

- 对比、参数、配置优先用表格。
- 步骤优先用编号列表。
- 命令、配置、代码片段使用带语言标注的代码块。
- 流程、架构、调用关系、状态机使用 Mermaid。

## Git 与回滚安全规则

- 每个新需求必须先创建独立分支，默认使用 `qoder/` 前缀。
- 执行代码回滚、分支切换、清理文件、覆盖文件前，必须先检查 `git status`。
- 发现未提交改动时，禁止直接执行会丢失改动的命令。
- 回滚代码前必须先备份当前改动。
- 未确认安全前，不使用 `git reset --hard`、`git checkout -- .`、`git restore .` 等破坏性命令。
- 需要回滚未提交改动时，先生成 patch 或创建备份分支并提交。

### 回滚前备份方式

```bash
git status
git diff > backup-$(date +%Y%m%d-%H%M%S).patch
git diff --staged > backup-staged-$(date +%Y%m%d-%H%M%S).patch
git ls-files --others --exclude-standard
```

更稳妥的方式是创建备份分支：

```bash
git checkout -b qoder/backup-before-rollback-$(date +%Y%m%d-%H%M%S)
git add -A
git commit -m "chore: 回滚前备份当前未提交改动"
```

完成备份后，再回到目标分支执行回滚。

## 文档同步规则

- 每次需求提交前，必须检查改动是否影响项目说明。
- 涉及核心功能、使用方式、配置方式、技术架构、目录结构、版本信息时，必须同步更新 `README.md` 或 `CHANGELOG.md`。
- 涉及开发流程、分支规范、回滚规则时，必须同步更新 `AGENTS.md`。
- 只涉及小范围 bug 修复、样式微调、内部实现优化，且不影响用户使用和项目信息时，可以不更新 `README.md`。
- 提交前需要检查 `README.md`、`CHANGELOG.md`、`AGENTS.md` 是否仍与代码一致。

## Commit Message 规范

### 格式

```
<type>: <subject>

tool: <工具名>
```

### 示例

```
feat: add docs download preview

tool: codex
```

### 工具标识

| 值 | 工具 |
|----|------|
| `codex` | OpenAI Codex |
| `qoder` | Qoder |
| `trae` | Trae |
| `cursor` | Cursor |
| `manual` | 手动编写 |

### 规则

- `tool:` 字段放在 commit body/footer，不影响 subject 行
- AI 工具提交时必须标注，手动开发可省略
