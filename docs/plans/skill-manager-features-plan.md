# ai-toolbox 功能增强实现计划

> **Goal:** 基于 skills-manager 的设计理念，增强 ai-toolbox 的四个核心功能：项目级技能管理、预设状态感知、技能卡片同步徽标、Git 备份与版本恢复

> **Architecture:** 采用渐进式增强策略，在现有中央仓库架构基础上扩展。项目空间作为独立视图层，Git 备份复用现有文件操作能力，UI 增强以状态驱动方式实现。

---

## 功能一：项目级技能管理

### 概述
新增「项目空间」视图，允许用户为特定项目（仓库）管理专属技能集，与全局工具目录分离。

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

### 数据库变更 (src-tauri/src/db.rs)

新增表：

```sql
-- 项目空间
CREATE TABLE IF NOT EXISTS project_spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL,           -- 项目根目录
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 项目技能关联（记录哪些中央仓库技能被导入到项目）
CREATE TABLE IF NOT EXISTS project_skills (
    project_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    sync_mode TEXT NOT NULL,       -- 'copy' | 'symlink'
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (project_id, skill_name),
    FOREIGN KEY (project_id) REFERENCES project_spaces(id) ON DELETE CASCADE
);
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
  skills: ProjectSkill[]
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

export interface ImportToProjectRequest {
  projectId: string
  skillNames: string[]
  syncMode: 'copy' | 'symlink'
}
```

#### 任务 2: Rust 类型和数据库操作

**Files:**
- Modify: `src-tauri/src/types.rs` - 新增 Rust 类型
- Modify: `src-tauri/src/db.rs` - 新增表和迁移
- Create: `src-tauri/src/project_spaces.rs` - 项目空间核心逻辑
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportToProjectRequest {
    pub project_id: String,
    pub skill_names: Vec<String>,
    pub sync_mode: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveFromProjectRequest {
    pub project_id: String,
    pub skill_name: String,
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

- [ ] **Step 2: 添加数据库迁移到 db.rs**

```rust
// db.rs 中 init_schema 添加迁移调用

fn migrate_project_spaces(conn: &Connection) -> Result<(), String> {
    // 检查表是否存在
    let has_table: bool = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_spaces'")
        .and_then(|mut stmt| stmt.exists([]))
        .map_err(|e| e.to_string())?;

    if !has_table {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS project_spaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

             CREATE TABLE IF NOT EXISTS project_skills (
                project_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                sync_mode TEXT NOT NULL,
                synced_at INTEGER NOT NULL,
                PRIMARY KEY (project_id, skill_name),
                FOREIGN KEY (project_id) REFERENCES project_spaces(id) ON DELETE CASCADE
            );",
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

- [ ] **Step 3: 创建 project_spaces_store.rs**

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
                    skills: Vec::new(), // 后续加载
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
        skills: Vec::new(),
    })
}

pub fn delete_project(db: &DbPool, project_id: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        let rows = conn
            .execute("DELETE FROM project_spaces WHERE id = ?1", [project_id])
            .map_err(|e| e.to_string())?;
        if rows == 0 {
            return Err("项目不存在".to_string());
        }
        Ok(())
    })
}

pub fn list_project_skills(db: &DbPool, project_id: &str) -> Result<Vec<ProjectSkill>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT skill_name, sync_mode, synced_at FROM project_skills WHERE project_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        stmt.query_map([project_id], |row| {
            let skill_name: String = row.get(0)?;
            let skill_path = get_project_skill_path_internal(conn, project_id, &skill_name)?;
            Ok(ProjectSkill {
                skill_name,
                sync_mode: row.get(1)?,
                synced_at: row.get(2)?,
                local_path: skill_path,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
    })
}

fn get_project_skill_path_internal(
    conn: &rusqlite::Connection,
    project_id: &str,
    skill_name: &str,
) -> Result<String, String> {
    let path: Option<String> = conn
        .query_row(
            "SELECT path FROM project_spaces WHERE id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let base = path.ok_or("项目不存在")?;
    Ok(format!("{}/.skills/{}", base, skill_name))
}
```

- [ ] **Step 4: 创建 project_spaces.rs 核心逻辑**

```rust
// src-tauri/src/project_spaces.rs

use crate::central_repo::{center_skill_path, copy_dir_recursive, create_symlink};
use crate::db::DbPool;
use crate::project_spaces_store::{
    create_project, delete_project, list_project_skills, list_projects,
};
use crate::types::{CreateProjectRequest, ImportToProjectRequest, ProjectDiscoveryResult};
use crate::utils::get_home_dir;
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

    // 扫描现有 .skills 目录
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

pub fn import_skills_to_project(
    db: &DbPool,
    project_id: &str,
    skill_names: &[String],
    sync_mode: &str,
) -> Result<Vec<String>, String> {
    // 获取项目路径
    let project_path = db
        .with_conn::<String, _, _>(|conn| {
            conn.query_row(
                "SELECT path FROM project_spaces WHERE id = ?1",
                [project_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())
        })?;

    let skills_dir = Path::new(&project_path).join(".skills");
    fs::create_dir_all(&skills_dir).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    let now = crate::types::current_timestamp();

    for skill_name in skill_names {
        let center_path = center_skill_path(skill_name);
        if !center_path.exists() {
            results.push(format!("{}: 中央仓库中不存在", skill_name));
            continue;
        }

        let target_path = skills_dir.join(skill_name);

        // 复制或创建符号链接
        match sync_mode {
            "symlink" => {
                create_symlink(&center_path, &target_path)?;
            }
            _ => {
                copy_dir_recursive(&center_path, &target_path)?;
            }
        }

        // 记录到数据库
        db.with_conn::<_, _, _>(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO project_skills (project_id, skill_name, sync_mode, synced_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![project_id, skill_name, sync_mode, now],
            )
            .map_err(|e| e.to_string())
        })?;

        results.push(format!("{}: 已导入", skill_name));
    }

    Ok(results)
}

pub fn remove_skill_from_project(
    db: &DbPool,
    project_id: &str,
    skill_name: &str,
) -> Result<String, String> {
    // 从数据库删除记录
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM project_skills WHERE project_id = ?1 AND skill_name = ?2",
            [project_id, skill_name],
        )
        .map_err(|e| e.to_string())?;
    })?;

    // 从文件系统删除
    let project_path = db
        .with_conn::<String, _, _>(|conn| {
            conn.query_row(
                "SELECT path FROM project_spaces WHERE id = ?1",
                [project_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())
        })?;

    let skill_path = Path::new(&project_path).join(".skills").join(skill_name);
    if skill_path.exists() {
        if skill_path.is_symlink() {
            fs::remove_file(&skill_path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_dir_all(&skill_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(format!("已从项目移除 {}", skill_name))
}
```

#### 任务 3: Tauri 命令注册

**Files:**
- Modify: `src-tauri/src/lib.rs` - 注册新命令

- [ ] **Step 1: 在 lib.rs 中注册命令**

```rust
// src-tauri/src/lib.rs 添加

#[tauri::command]
fn list_project_spaces(db: tauri::State<'_, DbPool>) -> Result<Vec<ProjectSpace>, String> {
    project_spaces_store::list_projects(&db)
}

#[tauri::command]
fn create_project_space(
    db: tauri::State<'_, DbPool>,
    name: String,
    path: String,
) -> Result<ProjectSpace, String> {
    project_spaces_store::create_project(&db, &name, &path)
}

#[tauri::command]
fn delete_project_space(db: tauri::State<'_, DbPool>, id: String) -> Result<(), String> {
    project_spaces_store::delete_project(&db, &id)
}

#[tauri::command]
fn list_project_space_skills(
    db: tauri::State<'_, DbPool>,
    project_id: String,
) -> Result<Vec<ProjectSkill>, String> {
    project_spaces_store::list_project_skills(&db, &project_id)
}

#[tauri::command]
fn discover_project_path(path: String) -> Result<ProjectDiscoveryResult, String> {
    project_spaces::discover_project(&path)
}

#[tauri::command]
fn import_skills_to_project(
    db: tauri::State<'_, DbPool>,
    project_id: String,
    skill_names: Vec<String>,
    sync_mode: String,
) -> Result<Vec<String>, String> {
    project_spaces::import_skills_to_project(&db, &project_id, &skill_names, &sync_mode)
}

#[tauri::command]
fn remove_skill_from_project(
    db: tauri::State<'_, DbPool>,
    project_id: String,
    skill_name: String,
) -> Result<String, String> {
    project_spaces::remove_skill_from_project(&db, &project_id, &skill_name)
}
```

#### 任务 4: 前端 API 和状态管理

**Files:**
- Create: `src/lib/projectSpacesApi.ts`
- Create: `src/store/useProjectSpacesStore.ts`

- [ ] **Step 1: 创建 API 模块**

```typescript
// src/lib/projectSpacesApi.ts

import { invoke } from '@tauri-apps/api/core'
import type { ProjectSpace, ProjectSkill, ProjectDiscoveryResult } from '../types/projectSpaces'

export async function listProjectSpaces(): Promise<ProjectSpace[]> {
  return invoke('list_project_spaces')
}

export async function createProjectSpace(name: string, path: string): Promise<ProjectSpace> {
  return invoke('create_project_space', { name, path })
}

export async function deleteProjectSpace(id: string): Promise<void> {
  return invoke('delete_project_space', { id })
}

export async function listProjectSpaceSkills(projectId: string): Promise<ProjectSkill[]> {
  return invoke('list_project_space_skills', { projectId })
}

export async function discoverProjectPath(path: string): Promise<ProjectDiscoveryResult> {
  return invoke('discover_project_path', { path })
}

export async function importSkillsToProject(
  projectId: string,
  skillNames: string[],
  syncMode: 'copy' | 'symlink'
): Promise<string[]> {
  return invoke('import_skills_to_project', {
    projectId,
    skillNames,
    syncMode,
  })
}

export async function removeSkillFromProject(
  projectId: string,
  skillName: string
): Promise<string> {
  return invoke('remove_skill_from_project', { projectId, skillName })
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
  listProjectSpaceSkills,
  discoverProjectPath,
  importSkillsToProject,
  removeSkillFromProject,
} from '../lib/projectSpacesApi'
import type { ProjectSpace, ProjectSkill, ProjectDiscoveryResult } from '../types/projectSpaces'

interface ProjectSpacesStore {
  projects: ProjectSpace[]
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null

  initialize: () => Promise<void>
  refreshProjects: () => Promise<void>
  selectProject: (projectId: string | null) => void
  addProject: (name: string, path: string) => Promise<void>
  removeProject: (projectId: string) => Promise<void>
  getProjectSkills: (projectId: string) => Promise<ProjectSkill[]>
  discoverProject: (path: string) => Promise<ProjectDiscoveryResult>
  importSkills: (
    projectId: string,
    skillNames: string[],
    syncMode: 'copy' | 'symlink'
  ) => Promise<void>
  removeSkill: (projectId: string, skillName: string) => Promise<void>
}

export const useProjectSpacesStore = create<ProjectSpacesStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
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

  selectProject: (projectId) => set({ selectedProjectId: projectId }),

  addProject: async (name, path) => {
    try {
      await createProjectSpace(name, path)
      await get().refreshProjects()
    } catch (error) {
      set({ error: String(error) })
      throw error
    }
  },

  removeProject: async (projectId) => {
    try {
      await deleteProjectSpace(projectId)
      if (get().selectedProjectId === projectId) {
        set({ selectedProjectId: null })
      }
      await get().refreshProjects()
    } catch (error) {
      set({ error: String(error) })
      throw error
    }
  },

  getProjectSkills: async (projectId) => {
    return listProjectSpaceSkills(projectId)
  },

  discoverProject: async (path) => {
    return discoverProjectPath(path)
  },

  importSkills: async (projectId, skillNames, syncMode) => {
    await importSkillsToProject(projectId, skillNames, syncMode)
  },

  removeSkill: async (projectId, skillName) => {
    await removeSkillFromProject(projectId, skillName)
  },
}))
```

#### 任务 5: UI 组件

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
import { open } from '@tauri-apps/plugin-dialog'
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

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择项目目录',
    })
    if (selected) {
      setPath(selected as string)
      try {
        const result = await discoverProject(selected as string)
        if (!name) {
          setName(result.name)
        }
      } catch {
        // ignore
      }
    }
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
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="选择或输入路径" style={{ flex: 1 }} />
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

import { Card, Tag, Space, Button, Dropdown, message } from 'antd'
import { DeleteOutlined, MoreOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'
import type { ProjectSpace } from '../../types/projectSpaces'
import { open } from '@tauri-apps/api/shell'

interface Props {
  project: ProjectSpace
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
}

export default function ProjectCard({ project, onSelect, onDelete }: Props) {
  const openProjectFolder = async () => {
    try {
      await open(project.path)
    } catch {
      message.error('无法打开目录')
    }
  }

  const handleDelete = () => {
    onDelete(project.id)
  }

  return (
    <Card
      hoverable
      onClick={() => onSelect(project.id)}
      className="project-card"
      actions={[
        <Button key="open" icon={<FolderOpenOutlined />} size="small" onClick={(e) => { e.stopPropagation(); openProjectFolder() }}>
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
                onClick: (e) => { e.domEvent.stopPropagation(); handleDelete() },
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
          <div>
            <Tag>{project.skills.length} 个技能</Tag>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{project.path}</div>
          </div>
        }
      />
    </Card>
  )
}
```

- [ ] **Step 3: 创建 ProjectSkillList 组件**

```tsx
// src/components/ProjectSpaces/ProjectSkillList.tsx

import { useEffect, useState } from 'react'
import { List, Tag, Button, Popconfirm, message, Empty, Spin } from 'antd'
import { DeleteOutlined, SyncOutlined } from '@ant-design/icons'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'
import type { ProjectSkill } from '../../types/projectSpaces'

interface Props {
  projectId: string
}

export default function ProjectSkillList({ projectId }: Props) {
  const [skills, setSkills] = useState<ProjectSkill[]>([])
  const [loading, setLoading] = useState(true)

  const getProjectSkills = useProjectSpacesStore((s) => s.getProjectSkills)
  const removeSkill = useProjectSpacesStore((s) => s.removeSkill)

  useEffect(() => {
    loadSkills()
  }, [projectId])

  const loadSkills = async () => {
    setLoading(true)
    try {
      const data = await getProjectSkills(projectId)
      setSkills(data)
    } catch {
      message.error('加载技能失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (skillName: string) => {
    try {
      await removeSkill(projectId, skillName)
      message.success(`已移除 ${skillName}`)
      await loadSkills()
    } catch {
      message.error('移除失败')
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }

  if (skills.length === 0) {
    return <Empty description="项目暂无技能" />
  }

  return (
    <List
      dataSource={skills}
      renderItem={(skill) => (
        <List.Item
          actions={[
            <Tag key="mode">{skill.syncMode}</Tag>,
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
            description={<span style={{ fontSize: 12 }}>{skill.localPath}</span>}
          />
        </List.Item>
      )}
    />
  )
}
```

- [ ] **Step 4: 创建主视图组件**

```tsx
// src/components/ProjectSpaces/index.tsx

import { useState } from 'react'
import { Button, Empty, Spin, Tabs, Modal, Select, message, Card } from 'antd'
import { PlusOutlined, ReloadOutlined, FolderOutlined } from '@ant-design/icons'
import { useProjectSpacesStore } from '../../store/useProjectSpacesStore'
import { listCenterSkills } from '../../lib/toolboxApi'
import AddProjectDialog from './AddProjectDialog'
import ProjectCard from './ProjectCard'
import ProjectSkillList from './ProjectSkillList'
import type { CenterSkillInfo } from '../../lib/toolboxApi'
import type { SyncMode } from '../../types/toolbox'

export default function ProjectSpaces() {
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [centerSkills, setCenterSkills] = useState<CenterSkillInfo[]>([])
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([])
  const [syncMode, setSyncMode] = useState<SyncMode>('copy')

  const { projects, isLoading, refreshProjects, removeProject, importSkills } = useProjectSpacesStore()

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
  }

  const handleDeleteProject = async (projectId: string) => {
    Modal.confirm({
      title: '删除项目',
      content: '确定要删除此项目空间？技能文件将保留。',
      onOk: async () => {
        try {
          await removeProject(projectId)
          if (selectedProjectId === projectId) {
            setSelectedProjectId(null)
          }
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
    if (!selectedProjectId || selectedSkillNames.length === 0) {
      message.warning('请选择项目和技能')
      return
    }
    try {
      await importSkills(selectedProjectId, selectedSkillNames, syncMode)
      message.success(`已导入 ${selectedSkillNames.length} 个技能`)
      setImportOpen(false)
      setSelectedSkillNames([])
    } catch {
      message.error('导入失败')
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="project-spaces">
      <div className="project-spaces__header">
        <div className="project-spaces__title">
          <FolderOutlined />
          <span>项目空间</span>
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
        activeKey={selectedProjectId ? 'detail' : 'list'}
        onChange={(key) => {
          if (key === 'list') {
            setSelectedProjectId(null)
          }
        }}
        items={[
          {
            key: 'list',
            label: '项目列表',
            children: (
              <div className="project-spaces__grid">
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
                  label: selectedProject.name,
                  children: (
                    <div className="project-spaces__detail">
                      <Card
                        title="项目技能"
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
                            <Button type="primary" onClick={() => void handleOpenImport()}>
                              导入技能
                            </Button>
                          </Space>
                        }
                      >
                        <ProjectSkillList projectId={selectedProjectId!} />
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
        <div style={{ marginBottom: 12 }}>
          <Select
            mode="multiple"
            placeholder="选择要导入的技能"
            style={{ width: '100%' }}
            value={selectedSkillNames}
            onChange={setSelectedSkillNames}
            options={centerSkills.map((s) => ({ label: s.name, value: s.name }))}
          />
        </div>
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
├── store/
│   └── useToolboxStore.ts   # 修改 - 添加预设状态计算
└── types/
    └── toolbox.ts           # 修改 - 扩展 PresetEntry
```

### 任务清单

#### 任务 6: 类型扩展

**Files:**
- Modify: `src/types/toolbox.ts`

- [ ] **Step 1: 添加预设状态类型**

```typescript
// src/types/toolbox.ts 添加

export type PresetInstallStatus = 'all_installed' | 'partial' | 'none_installed'

export interface PresetWithStatus extends PresetEntry {
  installStatus: PresetInstallStatus
  installedCount: number
  totalCount: number
  installedTools: string[]  // 哪些工具已安装此预设
}
```

#### 任务 7: Store 增强

**Files:**
- Modify: `src/store/useToolboxStore.ts`

- [ ] **Step 1: 添加预设状态计算**

在 `useToolboxStore` 中添加计算预设安装状态的方法：

```typescript
// 在 ToolboxStore 接口中添加
interface ToolboxStore {
  // ... 现有字段

  getPresetStatus: (
    preset: PresetEntry,
    tools: ToolItem[]
  ) => { status: PresetInstallStatus; installedCount: number; installedTools: string[] }
  removePresetFromTools: (presetId: string, targetToolIds: string[]) => Promise<void>
}
```

实现：

```typescript
getPresetStatus: (preset, tools) => {
  const skillNames = preset.skills.map((s) => s.skillName)
  const results = {
    status: 'none_installed' as PresetInstallStatus,
    installedCount: 0,
    installedTools: [] as string[],
  }

  for (const tool of tools) {
    const toolSkillNames = tool.skills.map((s) => s.name)
    const installed = skillNames.filter((name) => toolSkillNames.includes(name))
    if (installed.length > 0) {
      results.installedTools.push(tool.id)
      results.installedCount += installed.length
    }
  }

  if (results.installedTools.length === 0) {
    results.status = 'none_installed'
  } else if (results.installedTools.length === tools.length) {
    results.status = 'all_installed'
  } else {
    results.status = 'partial'
  }

  return results
},

removePresetFromTools: async (presetId, targetToolIds) => {
  const preset = get().presets.find((p) => p.id === presetId)
  if (!preset) return

  const skillNames = preset.skills.map((s) => s.skillName)
  for (const toolId of targetToolIds) {
    for (const skillName of skillNames) {
      try {
        await toggleSkillEnabledApi({ toolId, skillName, enabled: false })
      } catch {
        // ignore
      }
    }
  }
  await get().refreshTools()
}
```

#### 任务 8: UI 增强

**Files:**
- Modify: `src/components/PresetManager.tsx`

- [ ] **Step 1: 改造 PresetPill 显示状态**

```tsx
// 在 PresetManager.tsx 中修改 preset-pill 渲染部分

// 添加状态显示样式映射
const statusStyles = {
  all_installed: {
    color: 'green',
    icon: <CheckCircleOutlined />,
    label: '已安装',
  },
  partial: {
    color: 'orange',
    icon: null,
    label: null,
  },
  none_installed: {
    color: 'default',
    icon: null,
    label: null,
  },
}

// 在 preset-pill 渲染时添加状态指示器
<button type="button" className="preset-pill">
  {preset.installStatus === 'all_installed' && (
    <CheckCircleOutlined className="preset-pill__status-icon" style={{ color: 'green' }} />
  )}
  {preset.installStatus === 'partial' && (
    <span className="preset-pill__status-count" style={{ color: 'orange' }}>
      {`${preset.installedCount}/${preset.totalCount}`}
    </span>
  )}
  <span className="preset-pill__name">{preset.name}</span>
  <Tag className="preset-pill__count">{preset.skills.length} 个技能</Tag>
  <MoreOutlined className="preset-pill__more" />
</button>
```

- [ ] **Step 2: 添加卸载预设选项**

在 dropdown menu 中添加：

```tsx
menu={{
  items: [
    // ... 现有项
    {
      key: 'uninstall',
      icon: <StopOutlined />,
      label: '从工具移除',
      onClick: () => openUninstallModal(preset.id),
    },
  ],
}}
```

- [ ] **Step 3: 添加卸载确认 Modal**

```tsx
// 新增 ApplyPresetModal 类似结构的 UninstallModal
function UninstallPresetModal({ ... }) {
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([])

  const handleConfirm = async () => {
    // 调用 store.removePresetFromTools
  }

  // UI 结构类似 ApplyPresetModal
}
```

---

## 功能三：技能卡片直接显示同步目标

### 概述
在中央仓库面板的技能卡片上直接显示已同步到哪些工具，通过工具徽标点击快速安装/移除。

### 文件变更

```
src/
├── components/
│   └── CenterRepoPanel.tsx    # 修改
└── types/
    └── toolbox.ts            # 修改
```

### 任务清单

#### 任务 9: 类型扩展

**Files:**
- Modify: `src/types/toolbox.ts`

- [ ] **Step 1: 添加工具徽标类型**

```typescript
// src/types/toolbox.ts 添加

export interface ToolSyncBadge {
  toolId: string
  toolName: string
  isSynced: boolean
}

export interface SkillCardData extends CenterSkillInfo {
  toolBadges: ToolSyncBadge[]
}
```

#### 任务 10: UI 改造

**Files:**
- Modify: `src/components/CenterRepoPanel.tsx`

- [ ] **Step 1: 改造技能卡片显示工具徽标**

在技能卡片中，将原来的 syncStatuses 展示改为可点击的工具徽标：

```tsx
// 在 center-repo-card 中替换 syncStatuses 显示部分

<div className="center-repo-card__tools">
  {tools.map((tool) => {
    const isSynced = skill.syncStatuses.some(
      (s) => s.toolId === tool.id && s.synced
    )
    return (
      <Tooltip
        key={tool.id}
        title={isSynced ? `已同步到 ${tool.name}，点击移除` : `未同步到 ${tool.name}，点击安装`}
      >
        <Tag
          className={`tool-badge ${isSynced ? 'is-synced' : 'is-unsynced'}`}
          onClick={() => handleToolBadgeClick(skill.name, tool.id, isSynced)}
        >
          {tool.name} {isSynced ? '✓' : '+'}
        </Tag>
      </Tooltip>
    )
  })}
</div>
```

- [ ] **Step 2: 添加快速同步/移除处理函数**

```tsx
const handleToolBadgeClick = async (
  skillName: string,
  toolId: string,
  isSynced: boolean
) => {
  if (isSynced) {
    // 快速移除
    try {
      await deleteCenterSkill(skillName) // 或者调用专门的移除 API
      message.success(`已从 ${toolId} 移除 ${skillName}`)
      await loadSkills()
    } catch {
      message.error('移除失败')
    }
  } else {
    // 快速同步
    try {
      await syncFromCenter(skillName, toolId, syncMode, conflictStrategy)
      message.success(`已同步到 ${toolId}`)
      await loadSkills()
    } catch {
      message.error('同步失败')
    }
  }
}
```

---

## 功能四：Git 备份和版本恢复

### 概述
将中央仓库目录作为 Git 仓库管理，支持提交、拉取、版本历史查看和恢复到特定版本。

### 文件结构

```
src/
├── components/
│   └── GitBackupPanel.tsx    # 新增
├── lib/
│   └── gitBackupApi.ts       # 新增
└── types/
    └── gitBackup.ts          # 新增

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
  ahead: number
  behind: number
  hasUncommitted: boolean
  uncommittedFiles: string[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  date: number
}

export interface GitSnapshot {
  id: string
  name: string
  commitHash: string
  createdAt: number
  description?: string
}

export interface BackupResult {
  success: boolean
  snapshotId?: string
  message: string
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
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: String,
    pub ahead: i32,
    pub behind: i32,
    pub has_uncommitted: bool,
    pub uncommitted_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: u64,
}

pub fn get_git_status() -> Result<GitStatus, String> {
    let repo_path = center_repo_dir();

    // 检查是否是 git 仓库
    let is_repo = repo_path.join(".git").exists();
    if !is_repo {
        return Ok(GitStatus {
            is_repo: false,
            branch: String::new(),
            ahead: 0,
            behind: 0,
            has_uncommitted: false,
            uncommitted_files: Vec::new(),
        });
    }

    // 获取当前分支
    let branch = run_git_command(&repo_path, &["branch", "--show-current"])
        .unwrap_or_else(|_| "main".to_string());

    // 检查是否有未提交的更改
    let status_output = run_git_command(&repo_path, &["status", "--porcelain"])
        .unwrap_or_default();

    let uncommitted_files: Vec<String> = status_output
        .lines()
        .filter(|line| !line.starts_with("??"))
        .map(|line| line[3..].to_string())
        .collect();

    // 获取 ahead/behind
    let (ahead, behind) = get_ahead_behind(&repo_path);

    Ok(GitStatus {
        is_repo: true,
        branch,
        ahead,
        behind,
        has_uncommitted: !uncommitted_files.is_empty(),
        uncommitted_files,
    })
}

pub fn git_commit(message: &str) -> Result<GitCommit, String> {
    let repo_path = center_repo_dir();

    // Stage 所有更改
    run_git_command(&repo_path, &["add", "-A"])?;

    // Commit
    run_git_command(&repo_path, &["commit", "-m", message])?;

    // 获取最新 commit 信息
    let hash = run_git_command(&repo_path, &["rev-parse", "HEAD"])?
        .trim()
        .to_string();

    let short_hash = hash[..7.min(hash.len())].to_string();

    let message = run_git_command(&repo_path, &["log", "-1", "--format=%s"])
        .unwrap_or_else(|_| message.to_string());

    let author = run_git_command(&repo_path, &["log", "-1", "--format=%an"])
        .unwrap_or_else(|_| "Unknown".to_string());

    Ok(GitCommit {
        hash,
        short_hash,
        message,
        author,
        date: current_timestamp(),
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
                    date: parts[3].parse().unwrap_or(0),
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
    Ok(format!("已恢复到 commit {}", &commit_hash[..7]))
}

pub fn init_git_repo() -> Result<String, String> {
    let repo_path = center_repo_dir();
    if repo_path.join(".git").exists() {
        return Err("中央仓库已经是 Git 仓库".to_string());
    }

    run_git_command(&repo_path, &["init"])?;
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

    Ok(format!("Snapshot created: {} -> {}", name, &hash[..7]))
}

// ============================================================================
// 内部工具函数
// ============================================================================

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

fn get_ahead_behind(repo_path: &Path) -> (i32, i32) {
    // 简化实现，实际应该解析 git rev-list --left-right --count
    (0, 0)
}
```

#### 任务 13: Tauri 命令注册

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 注册 Git 备份命令**

```rust
#[tauri::command]
fn get_git_backup_status() -> Result<GitStatus, String> {
    git_backup::get_git_status()
}

#[tauri::command]
fn git_backup_commit(message: String) -> Result<GitCommit, String> {
    git_backup::git_commit(&message)
}

#[tauri::command]
fn git_backup_log(limit: usize) -> Result<Vec<GitCommit>, String> {
    git_backup::git_log(limit)
}

#[tauri::command]
fn git_backup_restore(commit_hash: String) -> Result<String, String> {
    git_backup::git_restore(&commit_hash)
}

#[tauri::command]
fn init_git_backup_repo() -> Result<String, String> {
    git_backup::init_git_repo()
}

#[tauri::command]
fn create_git_snapshot(name: String) -> Result<String, String> {
    git_backup::create_snapshot(&name)
}
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
  return invoke('get_git_backup_status')
}

export async function gitCommit(message: string): Promise<GitCommit> {
  return invoke('git_backup_commit', { message })
}

export async function gitLog(limit: number = 20): Promise<GitCommit[]> {
  return invoke('git_backup_log', { limit })
}

export async function gitRestore(commitHash: string): Promise<string> {
  return invoke('git_backup_restore', { commitHash })
}

export async function initGitRepo(): Promise<string> {
  return invoke('init_git_backup_repo')
}

export async function createSnapshot(name: string): Promise<string> {
  return invoke('create_git_snapshot', { name })
}
```

#### 任务 15: UI 组件

**Files:**
- Create: `src/components/GitBackupPanel.tsx`

- [ ] **Step 1: 创建 Git 备份面板**

```tsx
// src/components/GitBackupPanel.tsx

import { useEffect, useState } from 'react'
import { Button, Card, Timeline, Tag, Modal, Input, message, Space, Alert } from 'antd'
import {
  GitBranchOutlined,
  ReloadOutlined,
  CommitOutlined,
  RollbackOutlined,
  CloudOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { getGitBackupStatus, gitCommit, gitLog, gitRestore, initGitRepo, createSnapshot } from '../lib/gitBackupApi'
import type { GitStatus, GitCommit } from '../types/gitBackup'

const { Text } = Typography

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
        gitLog(20),
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
      const result = await initGitRepo()
      message.success(result)
      await loadData()
    } catch {
      message.error('初始化失败')
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      message.warning('请输入提交信息')
      return
    }
    setCommitting(true)
    try {
      await gitCommit(commitMessage.trim())
      message.success('提交成功')
      setCommitOpen(false)
      setCommitMessage('')
      await loadData()
    } catch {
      message.error('提交失败')
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
          const result = await gitRestore(commit.hash)
          message.success(result)
          await loadData()
        } catch {
          message.error('恢复失败')
        }
      },
    })
  }

  const handleSnapshot = async () => {
    try {
      const result = await createSnapshot(`Snapshot ${new Date().toLocaleString()}`)
      message.success(result)
      await loadData()
    } catch {
      message.error('创建快照失败')
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
  }

  if (!status?.isRepo) {
    return (
      <Card title="Git 备份">
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
          {status.ahead > 0 && <Tag color="blue">+{status.ahead}</Tag>}
          {status.behind > 0 && <Tag color="orange">-{status.behind}</Tag>}
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
          description={status.uncommittedFiles.slice(0, 5).join(', ')}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="git-backup-timeline">
        <Text strong style={{ display: 'block', marginBottom: 12 }}>版本历史</Text>
        <Timeline
          items={commits.map((commit) => ({
            color: 'green',
            children: (
              <div className="git-commit-item">
                <div className="git-commit-item__header">
                  <Tag>{commit.shortHash}</Tag>
                  <Text>{commit.author}</Text>
                  <Text type="secondary">
                    {new Date(commit.date * 1000).toLocaleString()}
                  </Text>
                </div>
                <div className="git-commit-item__message">{commit.message}</div>
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
      </div>

      <Modal
        title="提交变更"
        open={commitOpen}
        onOk={handleCommit}
        onCancel={() => setCommitOpen(false)}
        confirmLoading={committing}
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
| 2 | 功能二：预设状态感知 | 中 | 需要改动 PresetManager，状态计算逻辑独立 |
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

3. **功能一测试**
   - 添加一个新的项目空间
   - 从中央仓库导入技能到项目
   - 验证项目目录结构正确
   - 测试移除技能

4. **功能四测试**
   - 初始化 Git 仓库
   - 进行文件变更并提交
   - 查看版本历史
   - 测试恢复到特定版本
