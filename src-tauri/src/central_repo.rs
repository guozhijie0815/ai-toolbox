use crate::db::DbPool;
use crate::store::center_skill_store::{upsert_center_skill, CenterSkill};
use crate::types::{
    current_timestamp, metadata_mtime, path_to_string, read_skill_descriptions, sanitize_skill_name,
    UserToolSpec,
};
use crate::utils::expand_path;
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================================
// 类型定义
// ============================================================================

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CenterSkillInfo {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub source_type: String,
    pub updated_at: Option<u64>,
    pub has_skill_md: bool,
    pub sync_statuses: Vec<ToolSyncStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutcome {
    pub skill_name: String,
    pub target_tool_id: String,
    pub target_path: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSyncStatus {
    pub tool_id: String,
    pub tool_name: String,
    pub synced: bool,
    pub path: Option<String>,
    pub last_synced_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSource {
    pub tool_id: String,
    pub tool_name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSkill {
    pub name: String,
    pub description: Option<String>,
    pub sources: Vec<DiscoveredSource>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillRequest {
    pub skill_name: String,
    pub source_tool_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub skill_name: String,
    pub status: String,
    pub message: String,
}

// ============================================================================
// 路径与目录管理
// ============================================================================

pub fn center_repo_dir() -> PathBuf {
    crate::utils::get_home_dir()
        .map(|h| h.join(".ai-toolbox/skills"))
        .unwrap_or_else(|_| PathBuf::from(".ai-toolbox/skills"))
}

pub fn ensure_center_repo() -> Result<PathBuf, String> {
    let dir = center_repo_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn center_skill_path(skill_name: &str) -> PathBuf {
    center_repo_dir().join(skill_name)
}

// ============================================================================
// 扫描中央仓库
// ============================================================================

pub fn scan_center_skills() -> Result<Vec<CenterSkillInfo>, String> {
    let dir = center_repo_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("读取中央仓库失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = meta.is_dir()
            || (meta.file_type().is_symlink()
                && fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false));
        if !is_dir {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        let skill_md = path.join("SKILL.md");
        let (description, _, _) = if skill_md.exists() {
            read_skill_descriptions(&skill_md)
        } else {
            (None, None, None)
        };

        skills.push(CenterSkillInfo {
            name: name.clone(),
            path: path_to_string(&path),
            description,
            source_type: "local".to_string(),
            updated_at: metadata_mtime(&path),
            has_skill_md: skill_md.exists(),
            sync_statuses: Vec::new(),
        });
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

// ============================================================================
// 扫描各工具目录，发现中央仓库中还没有的技能
// ============================================================================

pub fn discover_skills_from_tools(tools: &[UserToolSpec]) -> Result<Vec<DiscoveredSkill>, String> {
    let center_dir = center_repo_dir();
    let mut map: std::collections::HashMap<String, (Option<String>, Vec<DiscoveredSource>)> =
        std::collections::HashMap::new();

    for tool in tools {
        if !tool.enabled {
            continue;
        }
        let Some(skill_dir) = &tool.skill_dir else {
            continue;
        };
        let Ok(path) = expand_path(skill_dir) else {
            continue;
        };
        if !path.exists() || !path.is_dir() {
            continue;
        }

        let entries = match fs::read_dir(path) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let skill_path = entry.path();
            if !skill_path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();

            // 跳过已在中央仓库的
            if center_dir.join(&name).exists() {
                continue;
            }

            let skill_md = skill_path.join("SKILL.md");
            let (description, _, _) = if skill_md.exists() {
                read_skill_descriptions(&skill_md)
            } else {
                (None, None, None)
            };

            let source = DiscoveredSource {
                tool_id: tool.id.clone(),
                tool_name: tool.name.clone(),
                path: path_to_string(&skill_path),
            };

            let entry = map.entry(name).or_insert_with(|| (None, Vec::new()));
            if entry.0.is_none() && description.is_some() {
                entry.0 = description;
            }
            entry.1.push(source);
        }
    }

    let mut skills: Vec<DiscoveredSkill> = map
        .into_iter()
        .map(|(name, (description, sources))| DiscoveredSkill {
            name,
            description,
            sources,
        })
        .collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

// ============================================================================
// 批量导入技能到中央仓库
// ============================================================================

pub fn batch_import_skills_to_center(
    db: &DbPool,
    tools: &[UserToolSpec],
    items: &[ImportSkillRequest],
) -> Result<Vec<ImportOutcome>, String> {
    let mut outcomes = Vec::new();

    for item in items {
        let tool = match tools.iter().find(|t| t.id == item.source_tool_id) {
            Some(t) => t,
            None => {
                outcomes.push(ImportOutcome {
                    skill_name: item.skill_name.clone(),
                    status: "error".to_string(),
                    message: format!("未知工具: {}", item.source_tool_id),
                });
                continue;
            }
        };

        let skill_dir = match tool.skill_dir.as_deref().and_then(|d| expand_path(d).ok()) {
            Some(d) => d,
            None => {
                outcomes.push(ImportOutcome {
                    skill_name: item.skill_name.clone(),
                    status: "error".to_string(),
                    message: format!("工具 {} 没有技能目录", tool.id),
                });
                continue;
            }
        };
        let skill_dir_str = skill_dir.to_string_lossy();

        match import_skill_from_tool(&item.skill_name, &skill_dir_str) {
            Ok(message) => {
                // 写入数据库
                let now = current_timestamp();
                let center_path = center_skill_path(&item.skill_name);
                let skill_md = center_path.join("SKILL.md");
                let (description, _, _) = if skill_md.exists() {
                    read_skill_descriptions(&skill_md)
                } else {
                    (None, None, None)
                };

                let skill = CenterSkill {
                    id: format!("center-{}-{}", item.skill_name, now),
                    name: item.skill_name.clone(),
                    source_type: "imported".to_string(),
                    source_url: Some(format!("tool:{}", tool.id)),
                    description,
                    installed_at: now,
                    updated_at: now,
                    version: None,
                    tags: Vec::new(),
                };

                let _ = upsert_center_skill(db, &skill);

                outcomes.push(ImportOutcome {
                    skill_name: item.skill_name.clone(),
                    status: "success".to_string(),
                    message,
                });
            }
            Err(e) => {
                outcomes.push(ImportOutcome {
                    skill_name: item.skill_name.clone(),
                    status: "error".to_string(),
                    message: e,
                });
            }
        }
    }

    Ok(outcomes)
}

// ============================================================================
// 同步：中央仓库 → 工具
// ============================================================================

pub fn sync_skill_to_tool(
    skill_name: &str,
    target_skill_dir: &str,
    mode: &str,
    conflict_policy: &str,
) -> Result<SyncOutcome, String> {
    let center_path = center_skill_path(skill_name);
    if !center_path.exists() {
        return Err(format!("中央仓库中不存在技能: {}", skill_name));
    }

    fs::create_dir_all(target_skill_dir).map_err(|e| e.to_string())?;
    let target_path = Path::new(target_skill_dir).join(skill_name);

    let (target_path, conflict_message, should_sync) =
        if target_path.exists() || symlink_exists(&target_path) {
            match conflict_policy {
                "skip" => {
                    return Ok(SyncOutcome {
                        skill_name: skill_name.to_string(),
                        target_tool_id: target_skill_dir.to_string(),
                        target_path: path_to_string(&target_path),
                        status: "skipped".to_string(),
                        message: "目标已存在".to_string(),
                    });
                }
                "overwrite" => {
                    remove_existing_path(&target_path)?;
                    (target_path, "overwritten".to_string(), true)
                }
                "rename" => {
                    let new_path = build_renamed_path(&target_path);
                    (new_path, "renamed".to_string(), true)
                }
                _ => return Err(format!("不支持的冲突策略: {}", conflict_policy)),
            }
        } else {
            (target_path, "created".to_string(), true)
        };

    if should_sync {
        match mode {
            "copy" => copy_dir_recursive(&center_path, &target_path)?,
            "symlink" => create_symlink(&center_path, &target_path)?,
            _ => return Err(format!("不支持的同步模式: {}", mode)),
        }
    }

    Ok(SyncOutcome {
        skill_name: skill_name.to_string(),
        target_tool_id: target_skill_dir.to_string(),
        target_path: path_to_string(&target_path),
        status: "success".to_string(),
        message: conflict_message,
    })
}

// ============================================================================
// 导入：工具 → 中央仓库
// ============================================================================

pub fn import_skill_from_tool(
    skill_name: &str,
    source_skill_dir: &str,
) -> Result<String, String> {
    ensure_center_repo()?;
    sanitize_skill_name(skill_name)?;

    let source_path = Path::new(source_skill_dir).join(skill_name);
    if !source_path.exists() {
        return Err(format!("源工具中不存在技能: {}", skill_name));
    }

    let target_path = center_skill_path(skill_name);
    if target_path.exists() {
        remove_existing_path(&target_path)?;
    }

    copy_dir_recursive(&source_path, &target_path)?;

    Ok(format!(
        "已将技能 {} 从 {} 导入中央仓库",
        skill_name, source_skill_dir
    ))
}

// ============================================================================
// 检查同步状态
// ============================================================================

pub fn check_sync_status(
    skill_name: &str,
    tools: &[(String, String, String)], // (tool_id, tool_name, skill_dir)
) -> Result<Vec<ToolSyncStatus>, String> {
    let center_path = center_skill_path(skill_name);
    if !center_path.exists() {
        return Ok(Vec::new());
    }

    let mut statuses = Vec::new();

    for (tool_id, tool_name, skill_dir) in tools.iter() {
        let tool_path = Path::new(skill_dir).join(skill_name);
        let exists = tool_path.exists();

        statuses.push(ToolSyncStatus {
            tool_id: tool_id.clone(),
            tool_name: tool_name.clone(),
            synced: exists,
            path: if exists {
                Some(path_to_string(&tool_path))
            } else {
                None
            },
            last_synced_at: metadata_mtime(&tool_path),
        });
    }

    Ok(statuses)
}

// ============================================================================
// 删除中央仓库技能
// ============================================================================

pub fn delete_center_skill(skill_name: &str) -> Result<String, String> {
    let path = center_skill_path(skill_name);
    if !path.exists() && !symlink_exists(&path) {
        return Err(format!("中央仓库中不存在技能: {}", skill_name));
    }

    remove_existing_path(&path)?;
    Ok(format!("已从中央仓库删除技能 {}", skill_name))
}

// ============================================================================
// 文件工具函数
// ============================================================================

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    use std::collections::HashSet;

    let mut visited = HashSet::<PathBuf>::new();
    copy_dir_recursive_inner(source, target, &mut visited)
}

fn copy_dir_recursive_inner(
    source: &Path,
    target: &Path,
    visited: &mut std::collections::HashSet<PathBuf>,
) -> Result<(), String> {
    let meta = fs::symlink_metadata(source)
        .map_err(|e| format!("无法检查 {}: {}", source.display(), e))?;

    if meta.file_type().is_symlink() {
        let resolved = fs::metadata(source)
            .map_err(|e| format!("无法解析软链接 {}: {}", source.display(), e))?;
        if resolved.is_dir() {
            let canonical = fs::canonicalize(source)
                .map_err(|e| format!("无法解析 {}: {}", source.display(), e))?;
            if !visited.insert(canonical) {
                return Ok(());
            }
            fs::create_dir_all(target)
                .map_err(|e| format!("无法创建 {}: {}", target.display(), e))?;
            copy_children(source, target, visited)?;
            return Ok(());
        }
        return copy_file(source, target);
    }

    if meta.is_dir() {
        let canonical = fs::canonicalize(source)
            .map_err(|e| format!("无法解析 {}: {}", source.display(), e))?;
        if !visited.insert(canonical) {
            return Ok(());
        }
        fs::create_dir_all(target)
            .map_err(|e| format!("无法创建 {}: {}", target.display(), e))?;
        copy_children(source, target, visited)?;
        return Ok(());
    }

    copy_file(source, target)
}

fn copy_children(
    source: &Path,
    target: &Path,
    visited: &mut std::collections::HashSet<PathBuf>,
) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(source)
        .map_err(|e| format!("无法读取 {}: {}", source.display(), e))?
        .flatten()
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        copy_dir_recursive_inner(&entry.path(), &target.join(entry.file_name()), visited)?;
    }
    Ok(())
}

fn copy_file(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建 {}: {}", parent.display(), e))?;
    }
    fs::copy(source, target).map_err(|e| {
        format!("无法复制 {} -> {}: {}", source.display(), target.display(), e)
    })?;
    Ok(())
}

fn remove_existing_path(path: &Path) -> Result<(), String> {
    if !path.exists() && !symlink_exists(path) {
        return Ok(());
    }

    let meta = fs::symlink_metadata(path)
        .map_err(|e| format!("无法检查 {}: {}", path.display(), e))?;

    if meta.file_type().is_symlink() || meta.is_file() {
        fs::remove_file(path)
            .map_err(|e| format!("无法删除 {}: {}", path.display(), e))?;
    } else if meta.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("无法删除 {}: {}", path.display(), e))?;
    }
    Ok(())
}

fn symlink_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn create_symlink(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, target)
            .map_err(|e| format!("创建软链接失败: {}", e))
    }
    #[cfg(not(unix))]
    {
        Err("软链接模式仅在 Unix 系统支持".to_string())
    }
}

fn build_renamed_path(path: &Path) -> PathBuf {
    let ts = current_timestamp();
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("skill");
    let candidate = path.with_file_name(format!("{}.{}", file_name, ts));
    if !candidate.exists() && !symlink_exists(&candidate) {
        return candidate;
    }
    for i in 1.. {
        let candidate = path.with_file_name(format!("{}.{}.{}", file_name, ts, i));
        if !candidate.exists() && !symlink_exists(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}


