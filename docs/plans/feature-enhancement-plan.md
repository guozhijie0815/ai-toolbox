# ai-toolbox 四大功能增强实现计划

> **Goal:** 基于 skills-manager 设计理念，增强 ai-toolbox 四个核心功能：项目级技能管理、预设状态感知、技能卡片同步徽标、Git 备份与版本恢复

> **Architecture:** 渐进式增强策略。功能一（项目空间）新增独立视图和数据库表；功能二（预设状态）增强现有 UI 和状态计算；功能三（工具徽标）改造中央仓库面板交互；功能四（Git 备份）复用现有 central_repo 架构扩展版本管理能力。

> **Tech Stack:** React 18 + Zustand + Ant Design 5 (前端) | Rust + Tauri 2 + SQLite (后端)

---

## 功能一：项目级技能管理

### 概述

新增「项目空间」视图，允许为特定项目（仓库）管理专属技能集。技能可从中央仓库导入到项目，也可从项目导出到中央仓库。

### 文件结构

```
src/
├── components/
│   └── ProjectSpaces/
│       ├── index.tsx              # 主视图组件
│       ├── ProjectCard.tsx        # 项目卡片
│       ├── ProjectSkillList.tsx   # 项目内技能列表
│       └── AddProjectDialog.tsx   # 添加项目对话框
├── store/
│   └── useProjectSpacesStore.ts   # 项目空间状态管理
├── lib/
│   └── projectSpacesApi.ts        # 项目空间 API 调用
└── types/
    └── projectSpaces.ts           # 项目空间类型定义

src-tauri/src/
├── project_spaces.rs              # 项目空间核心逻辑
├── project_spaces_store.rs        # 项目空间数据持久化
└── lib.rs                         # 注册新命令
```

### 任务清单

#### 任务 1: 类型定义

**Files:**
- Create: `src/types/projectSpaces.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// src/types/projectSpaces.ts

export interface ProjectSpace {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
}

export interface ProjectSkill {
  skillName: string
  syncMode: 'copy' | 'symlink'
  syncedAt: number
  localPath: string
}

export interface ProjectDiscoveryResult {
  name: string
  path: string
  existingSkills: string[]
  recommendedSkills: string[]
}

export interface ProjectSkillSummary {
  projectPath: string
  skills: ProjectSkill[]
  globalOnlySkills: string[]
  projectOnlySkills: string[]
  sharedSkills: string[]
}
```

#### 任务 2: Rust 类型和数据库操作

**Files:**
- Modify: `src-tauri/src/types.rs` - 新增 Rust 类型
- Create: `src-tauri/src/project_spaces_store.rs` - 数据持久化

- [ ] **Step 1: 添加 Rust 类型到 types.rs**

```rust
// src-tauri/src/types.rs 新增

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSpace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkill {
    pub skill_name: String,
    pub sync_mode: String,
    pub synced_at: u64,
    pub local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillSummary {
    pub project_path: String,
    pub skills: Vec<ProjectSkill>,
    pub global_only_skills: Vec<String>,
    pub project_only_skills: Vec<String>,
    pub shared_skills: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportToProjectRequest {
    pub skill_name: String,
    pub project_path: String,
    pub source_tool_id: String,
    pub sync_mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFromProjectRequest {
    pub skill_name: String,
    pub project_path: String,
    pub target_tool_id: String,
    pub mode: String,
    pub conflict_policy: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDiscoveryResult {
    pub name: String,
    pub path: String,
    pub existing_skills: Vec<String>,
    pub recommended_skills: Vec<String>,
}
```

- [ ] **Step 2: 创建 project_spaces_store.rs**

```rust
// src-tauri/src/project_spaces_store.rs

use crate::db::DbPool;
use crate::types::{ProjectSpace, ProjectSkill};
use rusqlite::params;
use std::path::Path;

pub fn list_projects(db: &DbPool) -> Result<Vec<ProjectSpace>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, name, path, created_at, updated_at FROM project_spaces ORDER BY name")
            .map_err(|e| e.to_string())?;

        let projects = stmt
            .query_map([], |row| {
                Ok(ProjectSpace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(projects)
    })
}

pub fn create_project(db: &DbPool, name: &str, path: &str) -> Result<ProjectSpace, String> {
    let now = crate::types::current_timestamp();
    let id = format!("project-{}-{}", name.to_lowercase().replace(' ', "-"), now);

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO project_spaces (id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, path, now, now],
        )
        .map_err(|e| e.to_string())?;
    })?;

    Ok(ProjectSpace {
        id,
        name: name.to_string(),
        path: path.to_string(),
        created_at: now,
        updated_at: now,
    })
}

pub fn delete_project(db: &DbPool, project_id: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        conn.execute("DELETE FROM project_spaces WHERE id = ?1", [project_id])
            .map_err(|e| e.to_string())?;
    })
}

pub fn get_project_skills(db: &DbPool, project_path: &str) -> Result<Vec<ProjectSkill>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT skill_name, sync_mode, synced_at FROM project_skills WHERE project_path = ?1")
            .map_err(|e| e.to_string())?;

        stmt.query_map([project_path], |row| {
            let skill_name: String = row.get(0)?;
            let local_path = format!("{}/.skills/{}", project_path, skill_name);
            Ok(ProjectSkill {
                skill_name,
                sync_mode: row.get(1)?,
                synced_at: row.get(2)?,
                local_path,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
    })
}
```

- [ ] **Step 3: 添加数据库表迁移**

在 `db.rs` 的 `init_schema` 函数中添加：

```rust
// db.rs 新增迁移
fn migrate_project_spaces(conn: &Connection) -> Result<(), String> {
    let has_table: bool = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_spaces'")
        .and_then(|mut stmt| stmt.exists([]))
        .map_err(|e| e.to_string())?;

    if !has_table {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS project_spaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_skills (
                project_path TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                sync_mode TEXT NOT NULL DEFAULT 'copy',
                synced_at INTEGER NOT NULL,
                PRIMARY KEY (project_path, skill_name)
            );",
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

#### 任务 3: Rust 核心逻辑

**Files:**
- Create: `src-tauri/src/project_spaces.rs`

- [ ] **Step 1: 创建 project_spaces.rs 核心逻辑**

```rust
// src-tauri/src/project_spaces.rs

use crate::central_repo::{center_repo_dir, center_skill_path};
use crate::db::DbPool;
use crate::project_spaces_store::{create_project, delete_project, get_project_skills, list_projects};
use crate::types::{CreateProjectRequest, ProjectDiscoveryResult, ProjectSkillSummary};
use std::fs;
use std::path::Path;

pub fn discover_project(path: &str) -> Result<ProjectDiscoveryResult, String> {
    let project_path = Path::new(path);
    if !project_path.exists() {
        return Err("目录不存在".to_string());
    }

    let name = project_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Unknown".to_string());

    let skills_dir = project_path.join(".skills");
    let existing_skills = if skills_dir.exists() {
        fs::read_dir(&skills_dir)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
            .collect()
    } else {
        Vec::new()
    };

    Ok(ProjectDiscoveryResult {
        name,
        path: path.to_string(),
        existing_skills,
        recommended_skills: Vec::new(),
    })
}

pub fn scan_project_skills(
    db: &DbPool,
    project_path: &str,
) -> Result<ProjectSkillSummary, String> {
    let project_skills = get_project_skills(db, project_path)?;
    let project_skills_set: std::collections::HashSet<String> =
        project_skills.iter().map(|s| s.skill_name.clone()).collect();

    let center_skills = crate::central_repo::scan_center_skills()?;
    let center_skills_set: std::collections::HashSet<String> =
        center_skills.iter().map(|s| s.name.clone()).collect();

    let mut global_only_skills = Vec::new();
    let mut project_only_skills = Vec::new();
    let mut shared_skills = Vec::new();

    for center_skill in &center_skills {
        if project_skills_set.contains(&center_skill.name) {
            shared_skills.push(center_skill.name.clone());
        } else {
            global_only_skills.push(center_skill.name.clone());
        }
    }

    for project_skill in &project_skills {
        if !center_skills_set.contains(&project_skill.skill_name) {
            project_only_skills.push(project_skill.skill_name.clone());
        }
    }

    Ok(ProjectSkillSummary {
        project_path: project_path.to_string(),
        skills: project_skills,
        global_only_skills,
        project_only_skills,
        shared_skills,
    })
}

pub fn import_skill_to_project(
    db: &DbPool,
    skill_name: &str,
    project_path: &str,
    sync_mode: &str,
) -> Result<(), String> {
    let center_path = center_skill_path(skill_name);
    if !center_path.exists() {
        return Err(format!("中央仓库中不存在技能: {}", skill_name));
    }

    let project_skills_dir = Path::new(project_path).join(".skills");
    fs::create_dir_all(&project_skills_dir).map_err(|e| e.to_string())?;

    let target_path = project_skills_dir.join(skill_name);

    match sync_mode {
        "symlink" => {
            crate::central_repo::create_symlink_internal(&center_path, &target_path)?;
        }
        _ => {
            crate::lib::copy_dir_recursive(&center_path, &target_path)?;
        }
    }

    let now = crate::types::current_timestamp();
    db.with_conn(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO project_skills (project_path, skill_name, sync_mode, synced_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![project_path, skill_name, sync_mode, now],
        )
        .map_err(|e| e.to_string())
    })?;

    Ok(())
}

pub fn export_skill_from_project(
    db: &DbPool,
    skill_name: &str,
    project_path: &str,
) -> Result<(), String> {
    let project_skills_dir = Path::new(project_path).join(".skills");
    let source_path = project_skills_dir.join(skill_name);

    if !source_path.exists() {
        return Err(format!("项目中不存在技能: {}", skill_name));
    }

    crate::central_repo::import_skill_from_local(&source_path.to_string_lossy(), Some(skill_name))?;

    Ok(())
}

pub fn sync_skill_from_project_to_tool(
    skill_name: &str,
    project_path: &str,
    target_tool_id: &str,
    mode: &str,
    conflict_policy: &str,
) -> Result<crate::central_repo::SyncOutcome, String> {
    let project_skills_dir = Path::new(project_path).join(".skills");
    let source_path = project_skills_dir.join(skill_name);

    if !source_path.exists() {
        return Err(format!("项目中不存在技能: {}", skill_name));
    }

    let registry = crate::lib::load_tool_registry()?;
    let tool = registry
        .iter()
        .find(|t| t.id == target_tool_id)
        .ok_or_else(|| format!("未知工具: {}", target_tool_id))?;

    let target_skill_dir = tool
        .skill_dir
        .as_deref()
        .ok_or_else(|| format!("工具 {} 没有技能目录", target_tool_id))?;

    let target_path = Path::new(target_skill_dir).join(skill_name);
    let target_skill_dir_str = target_skill_dir.to_string();

    match mode {
        "symlink" => {
            crate::central_repo::create_symlink_internal(&source_path, &target_path)?;
        }
        _ => {
            crate::lib::copy_dir_recursive(&source_path, &target_path)?;
        }
    }

    Ok(crate::central_repo::SyncOutcome {
        skill_name: skill_name.to_string(),
        target_tool_id: target_tool_id.to_string(),
        target_path: target_path.to_string_lossy().into_owned(),
        status: "success".to_string(),
        message: format!("已从项目同步到 {}", tool.name),
    })
}
```

#### 任务 4: Tauri 命令注册

**Files:**
- Modify: `src-tauri/src/lib.rs` - 注册新命令

- [ ] **Step 1: 在 lib.rs 中注册命令**

```rust
// src-tauri/src/lib.rs 添加

#[tauri::command]
fn list_project_spaces(db: tauri::State<'_, DbPool>) -> Result<Vec<types::ProjectSpace>, String> {
    project_spaces_store::list_projects(&db)
}

#[tauri::command]
fn create_project_space(
    db: tauri::State<'_, DbPool>,
    name: String,
    path: String,
) -> Result<types::ProjectSpace, String> {
    project_spaces_store::create_project(&db, &name, &path)
}

#[tauri::command]
fn delete_project_space(db: tauri::State<'_, DbPool>, id: String, path: String) -> Result<(), String> {
    project_spaces_store::delete_project(&db, &id)
}

#[tauri::command]
fn scan_project_skills(
    db: tauri::State<'_, DbPool>,
    project_path: String,
) -> Result<types::ProjectSkillSummary, String> {
    project_spaces::scan_project_skills(&db, &project_path)
}

#[tauri::command]
fn discover_project_path(path: String) -> Result<types::ProjectDiscoveryResult, String> {
    project_spaces::discover_project(&path)
}

#[tauri::command]
fn import_skill_to_project(
    db: tauri::State<'_, DbPool>,
    skill_name: String,
    project_path: String,
    source_tool_id: String,
    sync_mode: String,
) -> Result<(), String> {
    project_spaces::import_skill_to_project(&db, &skill_name, &project_path, &sync_mode)
}

#[tauri::command]
fn export_skill_from_project(
    db: tauri::State<'_, DbPool>,
    skill_name: String,
    project_path: String,
) -> Result<(), String> {
    project_spaces::export_skill_from_project(&db, &skill_name, &project_path)
}

#[tauri::command]
fn sync_skill_from_project_to_tool(
    skill_name: String,
    project_path: String,
    target_tool_id: String,
    mode: String,
    conflict_policy: String,
) -> Result<central_repo::SyncOutcome, String> {
    project_spaces::sync_skill_from_project_to_tool(&skill_name, &project_path, &target_tool_id, &mode, &conflict_policy)
}
```

同时在 `mod` 声明中添加：

```rust
mod project_spaces;
mod project_spaces_store;
```

#### 任务 5: 前端 API 和状态管理

**Files:**
- Create: `src/lib/projectSpacesApi.ts`
- Create: `src/store/useProjectSpacesStore.ts`

- [ ] **Step 1: 创建 API 模块**

```typescript
// src/lib/projectSpacesApi.ts

import { invoke } from '@tauri-apps/api/core'
import type { ProjectSpace, ProjectSkill, ProjectDiscoveryResult, ProjectSkillSummary } from '../types/projectSpaces'

export async function listProjectSpaces(): Promise<ProjectSpace[]> {
  return invoke('list_project_spaces')
}

export async function createProjectSpace(name: string, path: string): Promise<ProjectSpace> {
  return invoke('create_project_space', { name, path })
}

export async function deleteProjectSpace(id: string, path: string): Promise<void> {
  return invoke('delete_project_space', { id, path })
}

export async function scanProjectSkills(projectPath: string): Promise<ProjectSkillSummary> {
  return invoke('scan_project_skills', { projectPath })
}

export async function discoverProjectPath(path: string): Promise<ProjectDiscoveryResult> {
  return invoke('discover_project_path', { path })
}

export async function importSkillToProject(
  skillName: string,
  projectPath: string,
  sourceToolId: string,
  syncMode: 'copy' | 'symlink'
): Promise<void> {
  return invoke('import_skill_to_project', {
    skillName,
    projectPath,
    sourceToolId,
    syncMode,
  })
}

export async function exportSkillFromProject(
  skillName: string,
  projectPath: string
): Promise<void> {
  return invoke('export_skill_from_project', { skillName, projectPath })
}

export async function syncSkillFromProjectToTool(
  skillName: string,
  projectPath: string,
  targetToolId: string,
  mode: string,
  conflictPolicy: string
): Promise<void> {
  return invoke('sync_skill_from_project_to_tool', {
    skillName,
    projectPath,
    targetToolId,
    mode,
    conflictPolicy,
  })
}
```

- [ ] **Step 2: 创建 Zustand Store**

```typescript
// src/store/useProjectSpacesStore.ts

import { create } from 'zustand'
import {
  listProjectSpaces,
  createProjectSpace,
  deleteProjectSpace,
  scanProjectSkills,
  discoverProjectPath,
  importSkillToProject,
  exportSkillFromProject,
  syncSkillFromProjectToTool,
} from '../lib/projectSpacesApi'
import type { ProjectSpace, ProjectSkillSummary, ProjectDiscoveryResult } from '../types/projectSpaces'
import type { SyncMode } from '../types/toolbox'

interface ProjectSpacesStore {
  projects: ProjectSpace[]
  selectedProject: ProjectSkillSummary | null
  isLoading: boolean
  isProjectLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  refreshProjects: () => Promise<void>
  addProject: (name: string, path: string) => Promise<void>
  removeProject: (id: string, path: string) => Promise<void>
  selectProject: (projectPath: string) => Promise<void>
  discoverProject: (path: string) => Promise<ProjectDiscoveryResult>
  importSkill: (
    skillName: string,
    projectPath: string,
    sourceToolId: string,
    syncMode: SyncMode
  ) => Promise<void>
  exportSkill: (skillName: string, projectPath: string) => Promise<void>
  syncToTool: (
    skillName: string,
    projectPath: string,
    targetToolId: string,
    mode: SyncMode,
    conflictPolicy: string
  ) => Promise<void>
}

export const useProjectSpacesStore = create<ProjectSpacesStore>((set, get) => ({
  projects: [],
  selectedProject: null,
  isLoading: false,
  isProjectLoading: false,
  error: null,

  initialize: async () => {
    await get().refreshProjects()
  },

  refreshProjects: async () => {
    set({ isLoading: true, error: null })
    try {
      const projects = await listProjectSpaces()
      set({ projects })
    } catch (error) {
      set({ error: String(error) })
    } finally {
      set({ isLoading: false })
    }
  },

  addProject: async (name, path) => {
    try {
      await createProjectSpace(name, path)
      await get().refreshProjects()
    } catch (error) {
      set({ error: String(error) })
      throw error
    }
  },

  removeProject: async (id, path) => {
    try {
      await deleteProjectSpace(id, path)
      if (get().selectedProject?.projectPath === path) {
        set({ selectedProject: null })
      }
      await get().refreshProjects()
    } catch (error) {
      set({ error: String(error) })
      throw error
    }
  },

  selectProject: async (projectPath) => {
    set({ isProjectLoading: true })
    try {
      const summary = await scanProjectSkills(projectPath)
      set({ selectedProject: summary })
    } catch (error) {
      set({ error: String(error) })
    } finally {
      set({ isProjectLoading: false })
    }
  },

  discoverProject: async (path) => {
    return discoverProjectPath(path)
  },

  importSkill: async (skillName, projectPath, sourceToolId, syncMode) => {
    await importSkillToProject(skillName, projectPath, sourceToolId, syncMode)
    await get().selectProject(projectPath)
  },

  exportSkill: async (skillName, projectPath) => {
    await exportSkillFromProject(skillName, projectPath)
  },

  syncToTool: async (skillName, projectPath, targetToolId, mode, conflictPolicy) => {
    await syncSkillFromProjectToTool(skillName, projectPath, targetToolId, mode, conflictPolicy)
  },
}))
```

#### 任务 6: UI 组件

**Files:**
- Create: `src/components/ProjectSpaces/index.tsx`
- Create: `src/components/ProjectSpaces/AddProjectDialog.tsx`
- Create: `src/components/ProjectSpaces/ProjectCard.tsx`
- Create: `src/components/ProjectSpaces/ProjectSkillList.tsx`

- [ ] **Step 1: 创建 AddProjectDialog 组件**

```tsx
// src/components/ProjectSpaces/AddProjectDialog.tsx

import { useState } from 'react'
import { Modal, Input, Button, message } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AddProjectDialog({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)

  const addProject = useProjectSpacesStore((s) => s.addProject)
  const discoverProject = useProjectSpacesStore((s) => s.discoverProject)

  const handleSelectFolder = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        const dirPath = files[0].webkitRelativePath.split('/')[0]
        setPath(dirPath)
        try {
          const result = await discoverProject(dirPath)
          if (!name) {
            setName(result.name)
          }
        } catch {
          // ignore
        }
      }
    }
    input.click()
  }

  const handleOk = async () => {
    if (!name.trim() || !path.trim()) {
      message.warning('请填写项目名称和路径')
      return
    }
    setLoading(true)
    try {
      await addProject(name.trim(), path.trim())
      message.success('项目添加成功')
      handleClose()
    } catch {
      message.error('添加失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setPath('')
    onClose()
  }

  return (
    <Modal
      title="添加项目空间"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>项目名称</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：OA 项目"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>项目路径</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="选择或输入路径"
              style={{ flex: 1 }}
            />
            <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder}>
              选择
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: 创建 ProjectCard 组件**

```tsx
// src/components/ProjectSpaces/ProjectCard.tsx

import { Card, Tag, Button, Dropdown } from 'antd'
import { DeleteOutlined, MoreOutlined, FolderOpenOutlined } from '@ant-design/icons'
import type { ProjectSpace } from '../../types/projectSpaces'

interface Props {
  project: ProjectSpace
  onSelect: (projectPath: string) => void
  onDelete: (id: string, path: string) => void
}

export default function ProjectCard({ project, onSelect, onDelete }: Props) {
  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <Card
      hoverable
      onClick={() => onSelect(project.path)}
      className="project-card"
      actions={[
        <Button
          key="open"
          icon={<FolderOpenOutlined />}
          size="small"
          onClick={handleOpenFolder}
        >
          打开目录
        </Button>,
        <Dropdown
          key="more"
          menu={{
            items: [
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: '删除项目',
                danger: true,
                onClick: (e) => {
                  e.domEvent.stopPropagation()
                  onDelete(project.id, project.path)
                },
              },
            ],
          }}
          trigger={['click']}
        >
          <Button size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>,
      ]}
    >
      <Card.Meta
        title={project.name}
        description={
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{project.path}</div>
        }
      />
    </Card>
  )
}
```

- [ ] **Step 3: 创建 ProjectSkillList 组件**

```tsx
// src/components/ProjectSpaces/ProjectSkillList.tsx

import { List, Tag, Button, Popconfirm, message, Empty, Space, Modal, Select, Tooltip } from 'antd'
import { DeleteOutlined, CloudUploadOutlined, SyncOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'
import type { ProjectSkillSummary } from '../../types/projectSpaces'
import type { ToolItem } from '../../types/toolbox'

interface Props {
  project: ProjectSkillSummary
  tools: ToolItem[]
  onRefresh: () => void
}

export default function ProjectSkillList({ project, tools, onRefresh }: Props) {
  const { exportSkill, syncToTool, removeProject } = useProjectSpacesStore()
  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [selectedSkill, setSelectedSkill] = useState('')
  const [targetToolId, setTargetToolId] = useState('')
  const [syncMode, setSyncMode] = useState<'copy' | 'symlink'>('copy')

  const handleExport = async (skillName: string) => {
    try {
      await exportSkill(skillName, project.projectPath)
      message.success(`已导出 ${skillName} 到中央仓库`)
      onRefresh()
    } catch {
      message.error('导出失败')
    }
  }

  const openSyncModal = (skillName: string) => {
    setSelectedSkill(skillName)
    setTargetToolId(tools[0]?.id ?? '')
    setSyncModalOpen(true)
  }

  const handleSync = async () => {
    if (!selectedSkill || !targetToolId) return
    try {
      await syncToTool(selectedSkill, project.projectPath, targetToolId, syncMode, 'skip')
      message.success('同步成功')
      setSyncModalOpen(false)
      onRefresh()
    } catch {
      message.error('同步失败')
    }
  }

  const handleRemove = async (skillName: string) => {
    try {
      await removeProject(project.projectPath, skillName)
      message.success(`已移除 ${skillName}`)
      onRefresh()
    } catch {
      message.error('移除失败')
    }
  }

  if (project.skills.length === 0) {
    return <Empty description="项目暂无技能，从中央仓库导入开始" />
  }

  return (
    <>
      <List
        dataSource={project.skills}
        renderItem={(skill) => (
          <List.Item
            actions={[
              <Tooltip key="export" title="导出到中央仓库">
                <Button
                  size="small"
                  icon={<CloudUploadOutlined />}
                  onClick={() => handleExport(skill.skillName)}
                />
              </Tooltip>,
              <Tooltip key="sync" title="同步到工具">
                <Button
                  size="small"
                  icon={<SyncOutlined />}
                  onClick={() => openSyncModal(skill.skillName)}
                />
              </Tooltip>,
              <Popconfirm
                key="remove"
                title="确定要从项目移除此技能？"
                onConfirm={() => handleRemove(skill.skillName)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={skill.skillName}
              description={
                <Space>
                  <Tag>{skill.syncMode}</Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>{skill.localPath}</span>
                </Space>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        title={`同步技能：${selectedSkill}`}
        open={syncModalOpen}
        onOk={handleSync}
        onCancel={() => setSyncModalOpen(false)}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <label>目标工具</label>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={targetToolId}
              onChange={setTargetToolId}
              options={tools.map((t) => ({ label: t.name, value: t.id }))}
            />
          </div>
          <div>
            <label>同步模式</label>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={syncMode}
              onChange={setSyncMode}
              options={[
                { label: '复制', value: 'copy' },
                { label: '符号链接', value: 'symlink' },
              ]}
            />
          </div>
        </Space>
      </Modal>
    </>
  )
}
```

- [ ] **Step 4: 创建主视图组件**

```tsx
// src/components/ProjectSpaces/index.tsx

import { useState } from 'react'
import { Button, Empty, Spin, Tabs, Modal, Select, message, Card, Tag, Space, Alert } from 'antd'
import { PlusOutlined, ReloadOutlined, FolderOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'
import { listCenterSkills } from '../../lib/toolboxApi'
import AddProjectDialog from './AddProjectDialog'
import ProjectCard from './ProjectCard'
import ProjectSkillList from './ProjectSkillList'
import type { CenterSkillInfo } from '../../lib/toolboxApi'
import type { ToolItem, SyncMode } from '../../types/toolbox'

interface Props {
  tools: ToolItem[]
}

export default function ProjectSpaces({ tools }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([])
  const [syncMode, setSyncMode] = useState<SyncMode>('copy')
  const [centerSkills, setCenterSkills] = useState<CenterSkillInfo[]>([])

  const {
    projects,
    selectedProject,
    isLoading,
    isProjectLoading,
    refreshProjects,
    selectProject,
    removeProject,
    importSkill,
  } = useProjectSpacesStore()

  const handleSelectProject = async (projectPath: string) => {
    await selectProject(projectPath)
  }

  const handleDeleteProject = async (id: string, path: string) => {
    Modal.confirm({
      title: '删除项目',
      content: '确定要删除此项目空间？技能文件将保留。',
      onOk: async () => {
        try {
          await removeProject(id, path)
        } catch {
          message.error('删除失败')
        }
      },
    })
  }

  const handleOpenImport = async () => {
    const skills = await listCenterSkills()
    setCenterSkills(skills)
    setImportOpen(true)
  }

  const handleImport = async () => {
    if (!selectedProject || selectedSkillNames.length === 0) {
      message.warning('请选择项目和技能')
      return
    }
    try {
      for (const skillName of selectedSkillNames) {
        await importSkill(skillName, selectedProject.projectPath, tools[0]?.id ?? '', syncMode)
      }
      message.success(`已导入 ${selectedSkillNames.length} 个技能`)
      setImportOpen(false)
      setSelectedSkillNames([])
      await selectProject(selectedProject.projectPath)
    } catch {
      message.error('导入失败')
    }
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="project-spaces">
      <div
        className="project-spaces__header"
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="project-spaces__title">
          <FolderOutlined />
          <span style={{ marginLeft: 8 }}>项目空间</span>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshProjects()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            添加项目
          </Button>
        </Space>
      </div>

      <Tabs
        activeKey={selectedProject ? 'detail' : 'list'}
        onChange={(key) => {
          if (key === 'list') {
            useProjectSpacesStore.getState().selectedProject && useProjectSpacesStore.setState({ selectedProject: null })
          }
        }}
        items={[
          {
            key: 'list',
            label: '项目列表',
            children: (
              <div className="project-spaces__grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {projects.length === 0 ? (
                  <Empty description="暂无项目空间，点击添加按钮创建" />
                ) : (
                  projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onSelect={handleSelectProject}
                      onDelete={handleDeleteProject}
                    />
                  ))
                )}
              </div>
            ),
          },
          ...(selectedProject
            ? [
                {
                  key: 'detail',
                  label: selectedProject.projectPath.split('/').pop() || '项目详情',
                  children: (
                    <div className="project-spaces__detail">
                      <Alert
                        message="项目技能"
                        description={
                          <Space>
                            <Tag color="blue">{selectedProject.skills.length} 个项目技能</Tag>
                            <Tag color="green">{selectedProject.sharedSkills.length} 个共享技能</Tag>
                            <Tag color="orange">{selectedProject.globalOnlySkills.length} 个仅中央仓库</Tag>
                            <Tag color="red">{selectedProject.projectOnlySkills.length} 个仅项目</Tag>
                          </Space>
                        }
                        type="info"
                        style={{ marginBottom: 16 }}
                      />
                      <Card
                        extra={
                          <Space>
                            <Select
                              value={syncMode}
                              onChange={setSyncMode}
                              options={[
                                { label: '复制', value: 'copy' },
                                { label: '符号链接', value: 'symlink' },
                              ]}
                              style={{ width: 100 }}
                            />
                            <Button
                              type="primary"
                              icon={<CloudDownloadOutlined />}
                              onClick={() => void handleOpenImport()}
                            >
                              导入技能
                            </Button>
                          </Space>
                        }
                      >
                        <ProjectSkillList
                          project={selectedProject}
                          tools={tools}
                          onRefresh={() => selectProject(selectedProject.projectPath)}
                        />
                      </Card>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />

      <AddProjectDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <Modal
        title="从中央仓库导入技能"
        open={importOpen}
        onOk={handleImport}
        onCancel={() => setImportOpen(false)}
        destroyOnClose
      >
        <Select
          mode="multiple"
          placeholder="选择要导入的技能"
          style={{ width: '100%' }}
          value={selectedSkillNames}
          onChange={setSelectedSkillNames}
          options={centerSkills.map((s) => ({ label: s.name, value: s.name }))}
        />
      </Modal>
    </div>
  )
}
```

---

## 功能二：预设状态从「按钮」变成「可识别状态」

### 概述

增强预设的 UI 表达，显示当前安装状态（全部/部分/未安装），支持点击已安装预设直接移除。

### 文件变更

```
src/
├── components/
│   └── PresetManager.tsx    # 修改
└── store/
    └── useToolboxStore.ts   # 修改 - 已有相关逻辑
```

### 任务清单

#### 任务 7: 类型扩展

**Files:**
- Modify: `src/types/toolbox.ts`

- [ ] **Step 1: 添加预设状态类型**

在 `toolbox.ts` 中已有的 `PresetApplicationStatus` 类型已经包含：
- `status: 'all_installed' | 'partial' | 'not_installed'`
- `installedCount: number`
- `totalCount: number`

当前类型已经足够，无需额外修改。

#### 任务 8: Store 增强

**Files:**
- Modify: `src/store/useToolboxStore.ts`

检查现有的 `getPresetStatus` 方法和 `removePresetFromTools` 方法是否完整。

当前已有实现：
- `getPresetStatus` (行 634-658): 计算预设安装状态
- `removePresetFromTools` (行 606-632): 从工具移除预设技能

现有实现需要调整：`removePresetFromTools` 应该删除实际技能文件，而不是仅清除停用标记。

- [ ] **Step 1: 修改 removePresetFromTools 逻辑**

```typescript
// useToolboxStore.ts 中的 removePresetFromTools 方法需要修改

removePresetFromTools: async (presetId: string, targetToolIds: string[]) => {
  const preset = get().presets.find((p) => p.id === presetId)
  if (!preset) {
    set({ feedback: buildFeedback('error', '预设不存在') })
    return
  }
  const skillNames = preset.skills.map((s) => s.skillName)
  try {
    const results: string[] = []
    for (const toolId of targetToolIds) {
      const tool = get().tools.find((t) => t.id === toolId)
      if (!tool) continue
      const toolSkillNames = new Set(tool.skills.map((s) => s.name))
      const toRemove = skillNames.filter((name) => toolSkillNames.has(name))
      for (const skillName of toRemove) {
        await deleteSkill({ toolId, skillName })
      }
      results.push(`${toolId}: ${toRemove.length} 个技能已移除`)
    }
    await get().refreshTools()
    await get().refreshPresets()
    set({
      feedback: buildFeedback('success', '预设已从工具移除', results.join('；')),
    })
  } catch (error) {
    set({
      feedback: buildFeedback('error', '移除预设失败', getErrorMessage(error)),
    })
  }
},
```

#### 任务 9: UI 增强

**Files:**
- Modify: `src/components/PresetManager.tsx`

- [ ] **Step 1: 改造 PresetPill 显示状态**

修改 `PresetManager.tsx` 中的预设卡片渲染，添加状态徽标：

```tsx
// 在 PresetManager.tsx 中找到预设渲染部分，修改为：

{presets.map((preset) => {
  const status = getPresetStatus(preset.id)
  const statusColor =
    status.status === 'all_installed'
      ? '#52c41a'
      : status.status === 'partial'
        ? '#fa8c16'
        : '#d9d9d9'

  return (
    <Dropdown
      key={preset.id}
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'apply',
            icon: <CheckCircleOutlined />,
            label: '应用到工具',
            onClick: () => openApplyModal(preset.id),
          },
          ...(status.status !== 'not_installed'
            ? [
                {
                  key: 'remove',
                  icon: <MinusCircleOutlined />,
                  label: '从工具移除',
                  onClick: () => {
                    Modal.confirm({
                      title: '移除预设',
                      content: `确定要从所有工具移除「${preset.name}」吗？`,
                      okText: '移除',
                      okType: 'danger',
                      cancelText: '取消',
                      onOk: () => {
                        const toolIds = tools.map((t) => t.id)
                        onRemoveFromTools(preset.id, toolIds)
                      },
                    })
                  },
                },
              ]
            : []),
          // ... 其他菜单项
        ],
      }}
    >
      <button
        type="button"
        className="preset-pill"
        title={preset.skills.map((s) => s.skillName).join('、')}
      >
        <span
          className="preset-pill__status-dot"
          style={{
            backgroundColor: statusColor,
            width: 8,
            height: 8,
            borderRadius: '50%',
            display: 'inline-block',
            marginRight: 6,
          }}
        />
        <span className="preset-pill__name">{preset.name}</span>
        {status.status === 'partial' && (
          <Tag
            color="orange"
            style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}
          >
            {status.installedCount}/{status.totalCount}
          </Tag>
        )}
        <MoreOutlined className="preset-pill__more" />
      </button>
    </Dropdown>
  )
})}
```

- [ ] **Step 2: 添加 CSS 样式**

在 `App.css` 中添加：

```css
.preset-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  margin: 4px;
}

.preset-pill:hover {
  border-color: #1890ff;
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.1);
}

.preset-pill__name {
  font-size: 13px;
  color: #262626;
}

.preset-pill__more {
  color: #8c8c8c;
  font-size: 12px;
}

.preset-pill__more:hover {
  color: #1890ff;
}
```

---

## 功能三：技能卡片直接显示同步目标

### 概述

在中央仓库面板的技能卡片上直接显示已同步到哪些工具，通过工具徽标点击快速安装/移除。

### 文件变更

```
src/
└── components/
    └── CenterRepoPanel.tsx    # 修改
```

### 任务清单

#### 任务 10: UI 改造

**Files:**
- Modify: `src/components/CenterRepoPanel.tsx`

- [ ] **Step 1: 添加工具徽标渲染**

修改 `CenterRepoPanel.tsx` 中的技能卡片 syncStatuses 展示部分，替换为可点击的工具徽标：

找到以下代码块（约第 607-627 行）：

```tsx
// 原代码
<div className="center-repo-card__sync">
  {skill.syncStatuses.length === 0 ? (
    <Text className="center-repo-card__sync-empty">未同步到任何工具</Text>
  ) : (
    <>
      {skill.syncStatuses.slice(0, 4).map((syncStatus) => (
        <Tag
          key={syncStatus.toolId}
          className={`center-repo-card__tool-tag ${syncStatus.synced ? 'is-synced' : ''}`}
        >
          {syncStatus.toolName} {syncStatus.synced ? '✓' : '×'}
        </Tag>
      ))}
      {skill.syncStatuses.length > 4 && (
        <Text className="center-repo-card__more">
          +{skill.syncStatuses.length - 4}
        </Text>
      )}
    </>
  )}
</div>
```

替换为：

```tsx
// 新代码：可点击的工具徽标
<div className="center-repo-card__tools">
  {skill.syncStatuses.length === 0 ? (
    <Text className="center-repo-card__sync-empty">未同步到任何工具</Text>
  ) : (
    <>
      {skill.syncStatuses.slice(0, 6).map((syncStatus) => (
        <Tooltip
          key={syncStatus.toolId}
          title={
            syncStatus.synced
              ? `已同步到 ${syncStatus.toolName}，点击移除`
              : `未同步到 ${syncStatus.toolName}，点击安装`
          }
        >
          <Tag
            className={`tool-badge ${syncStatus.synced ? 'is-synced' : 'is-unsynced'}`}
            onClick={() => handleToolBadgeClick(skill.name, syncStatus.toolId, syncStatus.synced)}
          >
            {syncStatus.toolName} {syncStatus.synced ? '✓' : '+'}
          </Tag>
        </Tooltip>
      ))}
      {skill.syncStatuses.length > 6 && (
        <Text className="center-repo-card__more">
          +{skill.syncStatuses.length - 6}
        </Text>
      )}
    </>
  )}
</div>
```

- [ ] **Step 2: 添加快速操作处理函数**

在组件中添加新的处理函数：

```tsx
// 在 handleSetCategory 函数附近添加

const handleToolBadgeClick = async (
  skillName: string,
  toolId: string,
  isSynced: boolean
) => {
  if (isSynced) {
    Modal.confirm({
      title: '移除同步',
      content: `确定要从 ${toolId} 移除技能 ${skillName}？`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const tool = tools.find((t) => t.id === toolId)
          if (tool) {
            await deleteSkill({ toolId, skillName })
            message.success(`已从 ${tool.name} 移除 ${skillName}`)
            await loadSkills()
            onSyncComplete()
          }
        } catch {
          message.error('移除失败')
        }
      },
    })
  } else {
    try {
      const outcomes: SyncOutcome[] = await batchSyncFromCenter(
        [skillName],
        toolId,
        syncMode,
        conflictStrategy,
      )
      const outcome = outcomes[0]
      if (outcome?.status === 'success') {
        const tool = tools.find((t) => t.id === toolId)
        message.success(`已同步到 ${tool?.name ?? toolId}`)
        await loadSkills()
        onSyncComplete()
      } else {
        message.warning(outcome?.message ?? '同步失败')
      }
    } catch {
      message.error('同步失败')
    }
  }
}
```

- [ ] **Step 3: 添加 CSS 样式**

在 `App.css` 中添加：

```css
.tool-badge {
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.tool-badge:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tool-badge.is-synced {
  background-color: #f6ffed;
  border-color: #b7eb8f;
  color: #52c41a;
}

.tool-badge.is-synced:hover {
  background-color: #e6fff0;
}

.tool-badge.is-unsynced {
  background-color: #f5f5f5;
  border-color: #d9d9d9;
  color: #8c8c8c;
}

.tool-badge.is-unsynced:hover {
  background-color: #fff;
  border-color: #1890ff;
  color: #1890ff;
}
```

---

## 功能四：Git 备份和版本恢复

### 概述

将中央仓库目录作为 Git 仓库管理，支持提交、版本历史查看和恢复到特定版本。

### 文件结构

```
src/
├── components/
│   └── GitBackupPanel.tsx    # 新增
└── lib/
    └── gitBackupApi.ts       # 新增

src-tauri/src/
├── git_backup.rs             # 新增
└── lib.rs                    # 修改
```

### 任务清单

#### 任务 11: 类型定义

**Files:**
- Create: `src/types/gitBackup.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// src/types/gitBackup.ts

export interface GitStatus {
  isRepo: boolean
  branch: string
  hasUncommitted: boolean
  uncommittedFiles: string[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  timestamp: number
}
```

#### 任务 12: Rust 核心逻辑

**Files:**
- Create: `src-tauri/src/git_backup.rs`

- [ ] **Step 1: 创建 Git 备份核心逻辑**

```rust
// src-tauri/src/git_backup.rs

use crate::central_repo::center_repo_dir;
use crate::types::current_timestamp;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub has_uncommitted: bool,
    pub uncommitted_files: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: u64,
}

pub fn get_git_status() -> Result<GitStatus, String> {
    let repo_path = center_repo_dir();

    let is_repo = repo_path.join(".git").exists();
    if !is_repo {
        return Ok(GitStatus {
            is_repo: false,
            branch: String::new(),
            has_uncommitted: false,
            uncommitted_files: Vec::new(),
        });
    }

    let branch = run_git_command(&repo_path, &["branch", "--show-current"])
        .unwrap_or_else(|_| "main".to_string());

    let status_output = run_git_command(&repo_path, &["status", "--porcelain"])
        .unwrap_or_default();

    let uncommitted_files: Vec<String> = status_output
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with("??"))
        .map(|line| line[3..].to_string())
        .collect();

    Ok(GitStatus {
        is_repo: true,
        branch,
        has_uncommitted: !uncommitted_files.is_empty(),
        uncommitted_files,
    })
}

pub fn git_commit(message: &str) -> Result<GitCommit, String> {
    let repo_path = center_repo_dir();

    run_git_command(&repo_path, &["add", "-A"])?;
    run_git_command(&repo_path, &["commit", "-m", message])?;

    let hash = run_git_command(&repo_path, &["rev-parse", "HEAD"])?
        .trim()
        .to_string();

    let short_hash = hash[..7.min(hash.len())].to_string();

    let commit_message = run_git_command(&repo_path, &["log", "-1", "--format=%s"])
        .unwrap_or_else(|_| message.to_string());

    let author = run_git_command(&repo_path, &["log", "-1", "--format=%an"])
        .unwrap_or_else(|_| "Unknown".to_string());

    let timestamp: u64 = run_git_command(&repo_path, &["log", "-1", "--format=%at"])
        .unwrap_or_else(|_| "0".to_string())
        .trim()
        .parse()
        .unwrap_or(0);

    Ok(GitCommit {
        hash,
        short_hash,
        message: commit_message,
        author,
        timestamp,
    })
}

pub fn git_log(limit: usize) -> Result<Vec<GitCommit>, String> {
    let repo_path = center_repo_dir();
    let output = run_git_command(
        &repo_path,
        &["log", &format!("--max-count={}", limit), "--format=%H|%s|%an|%at"],
    )?;

    let commits = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() >= 4 {
                let hash = parts[0].to_string();
                Some(GitCommit {
                    hash: hash.clone(),
                    short_hash: hash[..7.min(hash.len())].to_string(),
                    message: parts[1].to_string(),
                    author: parts[2].to_string(),
                    timestamp: parts[3].parse().unwrap_or(0),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

pub fn git_restore(commit_hash: &str) -> Result<String, String> {
    let repo_path = center_repo_dir();
    run_git_command(&repo_path, &["restore", "--source", commit_hash, "."])?;
    Ok(format!("已恢复到 commit {}", &commit_hash[..7.min(commit_hash.len())]))
}

pub fn init_git_repo() -> Result<String, String> {
    let repo_path = center_repo_dir();
    if repo_path.join(".git").exists() {
        return Err("中央仓库已经是 Git 仓库".to_string());
    }

    run_git_command(&repo_path, &["init"])?;
    run_git_command(&repo_path, &["config", "user.email", "ai-toolbox@local"])?;
    run_git_command(&repo_path, &["config", "user.name", "ai-toolbox"])?;
    run_git_command(&repo_path, &["add", "-A"])?;
    run_git_command(&repo_path, &["commit", "-m", "Initial commit"])?;

    Ok("中央仓库已初始化为 Git 仓库".to_string())
}

pub fn create_snapshot(name: &str) -> Result<String, String> {
    let status = get_git_status()?;

    if !status.is_repo {
        return Err("中央仓库还不是 Git 仓库，请先初始化".to_string());
    }

    if status.has_uncommitted {
        git_commit(&format!("Snapshot: {}", name))?;
    }

    let hash = run_git_command(&center_repo_dir(), &["rev-parse", "HEAD"])?
        .trim()
        .to_string();

    Ok(format!("快照已创建: {} -> {}", name, &hash[..7.min(hash.len())]))
}

fn run_git_command(repo_path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("Git 命令执行失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git 命令失败: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
```

#### 任务 13: Tauri 命令注册

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 添加模块声明和命令注册**

在 `mod` 声明区域添加：

```rust
mod git_backup;
```

在 `lib.rs` 的命令定义区域添加：

```rust
#[tauri::command]
fn get_center_git_status() -> Result<git_backup::GitStatus, String> {
    git_backup::get_git_status()
}

#[tauri::command]
fn commit_center_snapshot(message: String) -> Result<git_backup::GitCommit, String> {
    git_backup::git_commit(&message)
}

#[tauri::command]
fn get_center_git_history(limit: usize) -> Result<Vec<git_backup::GitCommit>, String> {
    git_backup::git_log(limit)
}

#[tauri::command]
fn restore_center_snapshot(commit_hash: String) -> Result<String, String> {
    git_backup::git_restore(&commit_hash)
}

#[tauri::command]
fn init_center_git_repo() -> Result<String, String> {
    git_backup::init_git_repo()
}

#[tauri::command]
fn create_center_snapshot(name: String) -> Result<String, String> {
    git_backup::create_snapshot(&name)
}
```

在 `invoke_handler` 中添加：

```rust
get_center_git_status,
commit_center_snapshot,
get_center_git_history,
restore_center_snapshot,
init_center_git_repo,
create_center_snapshot,
```

#### 任务 14: 前端 API

**Files:**
- Create: `src/lib/gitBackupApi.ts`

- [ ] **Step 1: 创建 API 模块**

```typescript
// src/lib/gitBackupApi.ts

import { invoke } from '@tauri-apps/api/core'
import type { GitStatus, GitCommit } from '../types/gitBackup'

export async function getGitBackupStatus(): Promise<GitStatus> {
  return invoke('get_center_git_status')
}

export async function commitCenterSnapshot(message: string): Promise<GitCommit> {
  return invoke('commit_center_snapshot', { message })
}

export async function getCenterGitHistory(limit: number = 20): Promise<GitCommit[]> {
  return invoke('get_center_git_history', { limit })
}

export async function restoreCenterSnapshot(commitHash: string): Promise<string> {
  return invoke('restore_center_snapshot', { commitHash })
}

export async function initCenterGitRepo(): Promise<string> {
  return invoke('init_center_git_repo')
}

export async function createCenterSnapshot(name: string): Promise<string> {
  return invoke('create_center_snapshot', { name })
}
```

#### 任务 15: UI 组件

**Files:**
- Create: `src/components/GitBackupPanel.tsx`

- [ ] **Step 1: 创建 Git 备份面板**

```tsx
// src/components/GitBackupPanel.tsx

import { useEffect, useState } from 'react'
import { Button, Card, Timeline, Tag, Modal, Input, message, Space, Alert, Typography } from 'antd'
import {
  GitBranchOutlined,
  ReloadOutlined,
  CommitOutlined,
  RollbackOutlined,
  CloudOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import {
  getGitBackupStatus,
  commitCenterSnapshot,
  getCenterGitHistory,
  restoreCenterSnapshot,
  initCenterGitRepo,
  createCenterSnapshot,
} from '../lib/gitBackupApi'
import type { GitStatus, GitCommit } from '../types/gitBackup'

const { Text, Paragraph } = Typography

export default function GitBackupPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statusData, commitsData] = await Promise.all([
        getGitBackupStatus(),
        getCenterGitHistory(20),
      ])
      setStatus(statusData)
      setCommits(commitsData)
    } catch (error) {
      message.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleInit = async () => {
    try {
      const result = await initCenterGitRepo()
      message.success(result)
      await loadData()
    } catch (error) {
      message.error(String(error))
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      message.warning('请输入提交信息')
      return
    }
    setCommitting(true)
    try {
      await commitCenterSnapshot(commitMessage.trim())
      message.success('提交成功')
      setCommitOpen(false)
      setCommitMessage('')
      await loadData()
    } catch (error) {
      message.error(String(error))
    } finally {
      setCommitting(false)
    }
  }

  const handleRestore = async (commit: GitCommit) => {
    Modal.confirm({
      title: '确认恢复',
      content: `确定要恢复到版本 ${commit.shortHash}?`,
      onOk: async () => {
        try {
          const result = await restoreCenterSnapshot(commit.hash)
          message.success(result)
          await loadData()
        } catch (error) {
          message.error(String(error))
        }
      },
    })
  }

  const handleSnapshot = async () => {
    try {
      const result = await createCenterSnapshot(`Snapshot ${new Date().toLocaleString()}`)
      message.success(result)
      await loadData()
    } catch (error) {
      message.error(String(error))
    }
  }

  if (loading) {
    return <Card loading />
  }

  if (!status?.isRepo) {
    return (
      <Card title={<Space><GitBranchOutlined /> Git 备份</Space>}>
        <Alert
          type="info"
          message="中央仓库尚未初始化为 Git 仓库"
          description="初始化后可以享受版本管理的便利，包括提交、回滚、快照等功能。"
        />
        <div style={{ marginTop: 16 }}>
          <Button type="primary" icon={<CloudOutlined />} onClick={() => void handleInit()}>
            初始化 Git 仓库
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card
      title={
        <Space>
          <GitBranchOutlined />
          <span>Git 备份</span>
          <Tag color="green">{status.branch}</Tag>
        </Space>
      }
      extra={
        <Space>
          {status.hasUncommitted && (
            <Button icon={<CommitOutlined />} onClick={() => setCommitOpen(true)}>
              提交变更
            </Button>
          )}
          <Button icon={<InboxOutlined />} onClick={() => void handleSnapshot()}>
            创建快照
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            刷新
          </Button>
        </Space>
      }
    >
      {status.hasUncommitted && (
        <Alert
          type="warning"
          message={`有 ${status.uncommittedFiles.length} 个未提交的变更`}
          description={
            <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
              {status.uncommittedFiles.slice(0, 5).join(', ')}
              {status.uncommittedFiles.length > 5 && `...等${status.uncommittedFiles.length}个文件`}
            </Paragraph>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Text strong style={{ display: 'block', marginBottom: 12 }}>版本历史</Text>
      <Timeline
        items={commits.map((commit) => ({
          color: 'green',
          children: (
            <div className="git-commit-item">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <Tag>{commit.shortHash}</Tag>
                <Text>{commit.author}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(commit.timestamp * 1000).toLocaleString()}
                </Text>
              </div>
              <div style={{ marginBottom: 8 }}>{commit.message}</div>
              <Button
                size="small"
                icon={<RollbackOutlined />}
                onClick={() => handleRestore(commit)}
              >
                恢复此版本
              </Button>
            </div>
          ),
        }))}
      />

      <Modal
        title="提交变更"
        open={commitOpen}
        onOk={handleCommit}
        onCancel={() => setCommitOpen(false)}
        confirmLoading={committing}
        destroyOnClose
      >
        <Input.TextArea
          rows={3}
          placeholder="输入提交信息"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
        />
      </Modal>
    </Card>
  )
}
```

---

## 实施顺序建议

| 顺序 | 功能 | 复杂度 | 理由 |
|------|------|--------|------|
| 1 | 功能三：技能卡片工具徽标 | 低 | UI 改动最小，用户感知明显 |
| 2 | 功能二：预设状态感知 | 中 | 需要改动 PresetManager，状态计算逻辑已有基础 |
| 3 | 功能一：项目级技能管理 | 高 | 需要新增数据库表、多个组件和状态管理 |
| 4 | 功能四：Git 备份恢复 | 中 | Rust 逻辑较独立，UI 组件独立 |

---

## 测试计划

每个功能完成后，执行以下验证：

1. **功能三测试**
   - 打开中央仓库面板
   - 验证技能卡片显示工具徽标
   - 点击徽标测试同步/移除

2. **功能二测试**
   - 创建包含多个技能的预设
   - 将预设应用到部分工具
   - 验证预设状态显示正确（部分/全部/未安装）
   - 验证从工具移除功能

3. **功能一测试**
   - 添加一个新的项目空间
   - 从中央仓库导入技能到项目
   - 验证项目目录结构正确
   - 测试导出和同步到工具功能

4. **功能四测试**
   - 初始化 Git 仓库
   - 进行文件变更并提交
   - 查看版本历史
   - 测试恢复到特定版本
