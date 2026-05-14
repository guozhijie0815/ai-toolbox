mod types;
mod db;
mod store;
mod central_repo;
mod file_watcher;
mod claude_config;
mod toolbox;
mod utils;

use types::*;
use db::get_db;
use db::init_db_pool;
use utils::get_home_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;


/// 拼接主目录下的相对路径，返回绝对路径字符串
fn home_path(relative: &str) -> Result<String, String> {
    let home = get_home_dir()?;
    Ok(path_to_string(&home.join(relative)))
}

/// 根据当前用户主目录动态生成默认工具配置
fn default_tool_specs() -> Result<Vec<UserToolSpec>, String> {
    let h = get_home_dir()?;
    let p = |rel: &str| path_to_string(&h.join(rel));

    #[cfg(target_os = "macos")]
    let specs = vec![
        UserToolSpec {
            id: "codex".into(),
            name: "Codex".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "config.toml".into(), path: p(".codex/config.toml"), kind: "toml".into() },
            ],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "claude".into(),
            name: "Claude Code".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p(".claude/settings.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".claude/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "cursor".into(),
            name: "Cursor".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p("Library/Application Support/Cursor/User/settings.json"), kind: "json".into() },
                UserToolConfigFile { label: "mcp.json".into(), path: p(".cursor/mcp.json"), kind: "json".into() },
                UserToolConfigFile { label: "hooks.json".into(), path: p(".cursor/hooks.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".cursor/skills-cursor")),
            is_system: false,
        },
        UserToolSpec {
            id: "qoder".into(),
            name: "Qoder".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p("Library/Application Support/Qoder/User/settings.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".qoder/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "trae".into(),
            name: "Trae".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p("Library/Application Support/Trae CN/User/settings.json"), kind: "json".into() },
                UserToolConfigFile { label: "skill-config.json".into(), path: p(".trae-cn/skill-config.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".trae-cn/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "opencode".into(),
            name: "OpenCode".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "opencode.jsonc".into(), path: p(".config/opencode/opencode.jsonc"), kind: "jsonc".into() },
                UserToolConfigFile { label: "config.json".into(), path: p(".config/opencode/config.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".config/opencode/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "agents".into(),
            name: "Agents Skills".into(),
            enabled: true,
            config_files: vec![],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
    ];

    #[cfg(target_os = "windows")]
    let specs = vec![
        UserToolSpec {
            id: "codex".into(),
            name: "Codex".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "config.toml".into(), path: p(".codex/config.toml"), kind: "toml".into() },
            ],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "claude".into(),
            name: "Claude Code".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p(".claude/settings.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".claude/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "cursor".into(),
            name: "Cursor".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p("AppData/Roaming/Cursor/User/settings.json"), kind: "json".into() },
                UserToolConfigFile { label: "mcp.json".into(), path: p(".cursor/mcp.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".cursor/skills-cursor")),
            is_system: false,
        },
        UserToolSpec {
            id: "agents".into(),
            name: "Agents Skills".into(),
            enabled: true,
            config_files: vec![],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
    ];

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let specs = vec![
        UserToolSpec {
            id: "codex".into(),
            name: "Codex".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "config.toml".into(), path: p(".codex/config.toml"), kind: "toml".into() },
            ],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "claude".into(),
            name: "Claude Code".into(),
            enabled: true,
            config_files: vec![
                UserToolConfigFile { label: "settings.json".into(), path: p(".claude/settings.json"), kind: "json".into() },
            ],
            skill_dir: Some(p(".claude/skills")),
            is_system: false,
        },
        UserToolSpec {
            id: "agents".into(),
            name: "Agents Skills".into(),
            enabled: true,
            config_files: vec![],
            skill_dir: Some(p(".agents/skills")),
            is_system: false,
        },
    ];

    Ok(specs)
}

/// 清理早期版本注入的伪系统工具（如 claude-code-config），
/// 现在该功能已挪到 Claude Code 工具内部的 tab 中。
fn cleanup_legacy_system_tools() -> Result<(), String> {
    let db = get_db()?;
    db.with_conn(|conn| {
        conn.execute("DELETE FROM tools WHERE is_system = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

fn registry_dir() -> Result<PathBuf, String> {
    Ok(get_home_dir()?.join(".ai-toolbox"))
}

fn registry_file() -> Result<PathBuf, String> {
    Ok(registry_dir()?.join("tools.json"))
}

fn default_user_tools() -> Result<Vec<UserToolSpec>, String> {
    default_tool_specs()
}

fn ensure_tool_registry() -> Result<(), String> {
    let file = registry_file()?;
    if file.exists() {
        return Ok(());
    }
    fs::create_dir_all(registry_dir()?).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(&default_user_tools()?).map_err(|err| err.to_string())?;
    fs::write(file, data).map_err(|err| err.to_string())
}

fn load_tool_registry() -> Result<Vec<UserToolSpec>, String> {
    ensure_tool_registry()?;
    let content = fs::read_to_string(registry_file()?).map_err(|err| err.to_string())?;
    let mut items = serde_json::from_str::<Vec<UserToolSpec>>(&content).map_err(|err| err.to_string())?;
    items.retain(|item| !item.id.trim().is_empty() && !item.name.trim().is_empty());

    // 迁移：旧版 codex 技能目录可能指向 ~/.codex/skills，需修正为 ~/.agents/skills
    let agents_skills_dir = home_path(".agents/skills").ok();
    let codex_old_dir = home_path(".codex/skills").ok();
    let mut changed = false;
    for item in &mut items {
        if item.id == "codex" {
            if let (Some(ref old), Some(ref new_dir)) = (&codex_old_dir, &agents_skills_dir) {
                if item.skill_dir.as_deref() == Some(old.as_str()) {
                    item.skill_dir = Some(new_dir.clone());
                    changed = true;
                }
            }
        }
    }
    if changed {
        save_tool_registry(&items)?;
    }
    Ok(items)
}

fn save_tool_registry(items: &[UserToolSpec]) -> Result<(), String> {
    fs::create_dir_all(registry_dir()?).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(items).map_err(|err| err.to_string())?;
    fs::write(registry_file()?, data).map_err(|err| err.to_string())
}

fn registry_tool_by_id<'a>(items: &'a [UserToolSpec], id: &str) -> Option<&'a UserToolSpec> {
    items.iter().find(|item| item.id == id)
}

fn build_tool_entry_from_user(spec: &UserToolSpec) -> ToolEntry {
    let config_files = spec
        .config_files
        .iter()
        .map(|file| ConfigFile {
            label: file.label.clone(),
            path: file.path.clone(),
            kind: file.kind.clone(),
            exists: Path::new(&file.path).exists(),
        })
        .collect::<Vec<_>>();

    let skill_dir = spec.skill_dir.clone();
    let skills = spec
        .skill_dir
        .as_ref()
        .map(|path| scan_skill_dir(Path::new(path), &spec.id))
        .unwrap_or_default();

    ToolEntry {
        id: spec.id.clone(),
        name: spec.name.clone(),
        config_files,
        skill_dir,
        skills,
        is_system: spec.is_system,
    }
}

fn sanitize_upsert_request(request: UpsertToolRequest) -> Result<UserToolSpec, String> {
    let id = normalize_tool_id(&request.id);
    if id.is_empty() {
        return Err("工具 ID 不能为空".to_string());
    }
    if request.name.trim().is_empty() {
        return Err("工具名称不能为空".to_string());
    }
    if request.config_files.is_empty() && request.skill_dir.as_deref().unwrap_or("").trim().is_empty() {
        return Err("至少提供一个配置文件或技能目录".to_string());
    }

    let mut config_files = Vec::new();
    for item in request.config_files {
        if item.path.trim().is_empty() || item.label.trim().is_empty() {
            continue;
        }
        let kind = if item.kind.trim().is_empty() {
            "plaintext".to_string()
        } else {
            item.kind.trim().to_string()
        };
        config_files.push(UserToolConfigFile {
            label: item.label.trim().to_string(),
            path: item.path.trim().to_string(),
            kind,
        });
    }

    Ok(UserToolSpec {
        id,
        name: request.name.trim().to_string(),
        enabled: request.enabled,
        config_files,
        skill_dir: request
            .skill_dir
            .and_then(|value| if value.trim().is_empty() { None } else { Some(value.trim().to_string()) }),
        is_system: false,
    })
}

fn detect_tool_paths_from_name(input: &str) -> DetectToolPathsResult {
    let key = input.to_lowercase();
    let mut config_files = Vec::new();
    let mut skill_dir = None::<String>;

    let home = match get_home_dir() {
        Ok(h) => h,
        Err(_) => return DetectToolPathsResult { config_files, skill_dir },
    };

    let apply = |configs: &[(&str, PathBuf, &str)], skills: Option<PathBuf>, out: &mut Vec<ConfigFile>, skill_out: &mut Option<String>| {
        for (label, path, kind) in configs {
            if path.exists() {
                out.push(ConfigFile {
                    label: (*label).to_string(),
                    path: path.to_string_lossy().to_string(),
                    kind: (*kind).to_string(),
                    exists: true,
                });
            }
        }
        if let Some(skills_path) = skills {
            if skills_path.exists() {
                *skill_out = Some(skills_path.to_string_lossy().to_string());
            }
        }
    };

    if key.contains("codex") {
        apply(
            &[("config.toml", home.join(".codex/config.toml"), "toml")],
            Some(home.join(".agents/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("claude") {
        apply(
            &[("settings.json", home.join(".claude/settings.json"), "json")],
            Some(home.join(".claude/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("cursor") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Cursor/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Cursor/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Cursor/User/settings.json");

        apply(
            &[
                ("settings.json", settings_path, "json"),
                ("mcp.json", home.join(".cursor/mcp.json"), "json"),
                ("hooks.json", home.join(".cursor/hooks.json"), "json"),
            ],
            Some(home.join(".cursor/skills-cursor")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("qoder") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Qoder/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Qoder/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Qoder/User/settings.json");

        apply(
            &[("settings.json", settings_path, "json")],
            Some(home.join(".qoder/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("trae") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Trae CN/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Trae CN/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Trae CN/User/settings.json");

        apply(
            &[
                ("settings.json", settings_path, "json"),
                ("skill-config.json", home.join(".trae-cn/skill-config.json"), "json"),
            ],
            Some(home.join(".trae-cn/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("opencode") {
        apply(
            &[
                ("opencode.jsonc", home.join(".config/opencode/opencode.jsonc"), "jsonc"),
                ("config.json", home.join(".config/opencode/config.json"), "json"),
            ],
            Some(home.join(".config/opencode/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("agent") {
        apply(&[], Some(home.join(".agents/skills")), &mut config_files, &mut skill_dir);
    }

    DetectToolPathsResult { config_files, skill_dir }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillTagsRequest {
    skill_name: String,
    tags: Vec<String>,
}

fn get_skill_tags(skill_name: &str) -> Result<Vec<String>, String> {
    let db = get_db()?;
    store::tag_store::get_skill_tags(db, skill_name)
}

fn set_skill_tags(skill_name: &str, tags: Vec<String>) -> Result<(), String> {
    let db = get_db()?;
    store::tag_store::set_skill_tags(db, skill_name, tags)
}

fn scan_skill_dir(skill_dir: &Path, tool_id: &str) -> Vec<SkillEntry> {
    let mut items = Vec::new();

    let Ok(entries) = fs::read_dir(skill_dir) else {
        return items;
    };

    let disabled = match get_db() {
        Ok(db) => db.list_disabled_skills(tool_id).unwrap_or_default(),
        Err(_) => Vec::new(),
    };
    let disabled_set: std::collections::HashSet<String> = disabled.into_iter().collect();

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        let is_dir = file_type.is_dir() || (file_type.is_symlink() && path.is_dir());
        if !is_dir {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        let enabled = !disabled_set.contains(&name);

        let skill_md = path.join("SKILL.md");
        let (description, full_description, summary) = if skill_md.exists() {
            read_skill_descriptions(&skill_md)
        } else {
            (None, None, None)
        };
        let link_target = if file_type.is_symlink() {
            fs::read_link(&path)
                .ok()
                .map(|target| {
                    if target.is_absolute() {
                        target
                    } else {
                        path.parent().unwrap_or(skill_dir).join(target)
                    }
                })
                .map(|target| path_to_string(&target))
        } else {
            None
        };

        let tags = get_skill_tags(&name).unwrap_or_default();

        items.push(SkillEntry {
            name,
            description,
            full_description,
            summary,
            path: path_to_string(&path),
            has_skill_md: skill_md.exists(),
            is_symlink: file_type.is_symlink(),
            link_target,
            updated_at: metadata_mtime(&path),
            tags,
            enabled,
        });
    }

    items.sort_by(|left, right| left.name.cmp(&right.name));
    items
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("missing parent directory for {}", path_to_string(path)))?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())
}

fn remove_existing_path(path: &Path) -> Result<(), String> {
    if !path.exists() && fs::symlink_metadata(path).is_err() {
        return Ok(());
    }

    let metadata = fs::symlink_metadata(path).map_err(|err| err.to_string())?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path).map_err(|err| err.to_string())
    } else {
        fs::remove_dir_all(path).map_err(|err| err.to_string())
    }
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|err| err.to_string())?;

    let entries = fs::read_dir(source).map_err(|err| err.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|err| err.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type().map_err(|err| err.to_string())?;

        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
            continue;
        }

        if file_type.is_symlink() {
            let link_target = fs::read_link(&source_path).map_err(|err| err.to_string())?;
            let resolved = if link_target.is_absolute() {
                link_target
            } else {
                source_path
                    .parent()
                    .unwrap_or(source)
                    .join(link_target)
            };
            if resolved.is_dir() {
                copy_dir_recursive(&resolved, &target_path)?;
            } else {
                fs::copy(&resolved, &target_path).map_err(|err| err.to_string())?;
            }
            continue;
        }

        fs::copy(&source_path, &target_path).map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn resolve_source_dir(path: &Path) -> Result<PathBuf, String> {
    if path
        .symlink_metadata()
        .map_err(|err| err.to_string())?
        .file_type()
        .is_symlink()
    {
        fs::canonicalize(path).map_err(|err| err.to_string())
    } else {
        Ok(path.to_path_buf())
    }
}

fn with_conflict_policy(path: &Path, policy: &str) -> Result<(PathBuf, String), String> {
    if !path.exists() && fs::symlink_metadata(path).is_err() {
        return Ok((path.to_path_buf(), "created".to_string()));
    }

    match policy {
        "skip" => Err("target already exists".to_string()),
        "overwrite" => {
            remove_existing_path(path)?;
            Ok((path.to_path_buf(), "overwritten".to_string()))
        }
        "rename" => {
            let stamp = current_timestamp();
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "invalid target name".to_string())?;
            let new_path = path.with_file_name(format!("{file_name}-{stamp}"));
            Ok((new_path, "renamed".to_string()))
        }
        _ => Err(format!("unsupported conflict policy: {policy}")),
    }
}

#[tauri::command]
fn get_home_dir_path() -> Result<String, String> {
    get_home_dir().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn list_tools() -> Result<Vec<ToolEntry>, String> {
    let items = load_tool_registry()?;
    Ok(items
        .iter()
        .filter(|item| item.enabled)
        .map(build_tool_entry_from_user)
        .collect())
}

fn get_skill_files(skill_path: &Path) -> Vec<(String, u64)> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(skill_path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                let name = entry.file_name().to_string_lossy().to_string();
                let size = metadata.len();
                files.push((name, size));
            }
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files
}

fn compare_skill_folders(leader_path: &Path, lagging_path: &Path) -> Vec<SkillDiff> {
    let leader_files = get_skill_files(leader_path);
    let lagging_files = get_skill_files(lagging_path);
    
    let mut diffs = Vec::new();
    let leader_map: std::collections::HashMap<String, u64> = leader_files.into_iter().collect();
    let lagging_map: std::collections::HashMap<String, u64> = lagging_files.into_iter().collect();
    
    // 检查新增和修改的文件
    for (name, leader_size) in &leader_map {
        if let Some(lagging_size) = lagging_map.get(name) {
            if leader_size != lagging_size {
                diffs.push(SkillDiff {
                    file_name: name.clone(),
                    diff_type: "modified".to_string(),
                });
            }
        } else {
            diffs.push(SkillDiff {
                file_name: name.clone(),
                diff_type: "added".to_string(),
            });
        }
    }
    
    // 检查删除的文件
    for (name, _) in &lagging_map {
        if !leader_map.contains_key(name) {
            diffs.push(SkillDiff {
                file_name: name.clone(),
                diff_type: "deleted".to_string(),
            });
        }
    }
    
    diffs.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    diffs
}

#[tauri::command]
fn get_skill_insights() -> Result<Vec<SkillInsightEntry>, String> {
    let items = load_tool_registry()?;
    let enabled_tools: Vec<_> = items
        .iter()
        .filter(|item| item.enabled)
        .map(build_tool_entry_from_user)
        .collect();

    let mut skill_map: std::collections::HashMap<String, Vec<(String, String, u64, String)>> =
        std::collections::HashMap::new();

    for tool in &enabled_tools {
        for skill in &tool.skills {
            if let Some(updated_at) = skill.updated_at {
                skill_map
                    .entry(skill.name.clone())
                    .or_default()
                    .push((
                        tool.id.clone(),
                        tool.name.clone(),
                        updated_at,
                        skill.path.clone(),
                    ));
            }
        }
    }

    let mut insights = Vec::new();
    for (skill_name, mut tool_records) in skill_map {
        if tool_records.len() < 2 {
            continue;
        }
        tool_records.sort_by(|a, b| b.2.cmp(&a.2));
        let leader = &tool_records[0];
        let leader_path = Path::new(&leader.3);
        
        let lagging: Vec<LaggingToolInfo> = tool_records
            .iter()
            .skip(1)
            .filter(|record| record.2 < leader.2)
            .map(|record| {
                let lagging_path = Path::new(&record.3);
                let diffs = if leader_path.exists() && lagging_path.exists() {
                    compare_skill_folders(leader_path, lagging_path)
                } else {
                    Vec::new()
                };
                
                LaggingToolInfo {
                    tool_id: record.0.clone(),
                    tool_name: record.1.clone(),
                    behind_seconds: leader.2 - record.2,
                    diffs,
                }
            })
            .collect();
            
        if !lagging.is_empty() {
            insights.push(SkillInsightEntry {
                skill_name,
                leader_tool_id: leader.0.clone(),
                leader_tool_name: leader.1.clone(),
                leader_updated_at: leader.2,
                lagging_tools: lagging,
            });
        }
    }

    insights.sort_by(|a, b| b.leader_updated_at.cmp(&a.leader_updated_at));
    Ok(insights)
}

#[tauri::command]
fn list_tool_registry() -> Result<Vec<ToolRegistryEntry>, String> {
    let items = load_tool_registry()?;
    Ok(items
        .iter()
        .map(|item| ToolRegistryEntry {
            id: item.id.clone(),
            name: item.name.clone(),
            enabled: item.enabled,
            config_files: item
                .config_files
                .iter()
                .map(|file| ConfigFile {
                    label: file.label.clone(),
                    path: file.path.clone(),
                    kind: file.kind.clone(),
                    exists: Path::new(&file.path).exists(),
                })
                .collect(),
            skill_dir: item.skill_dir.clone(),
            is_system: item.is_system,
        })
        .collect())
}

#[tauri::command]
fn upsert_tool_registry_item(request: UpsertToolRequest) -> Result<ToolRegistryEntry, String> {
    let next = sanitize_upsert_request(request)?;
    let mut items = load_tool_registry()?;
    if let Some(index) = items.iter().position(|item| item.id == next.id) {
        if items[index].is_system {
            return Err("系统工具不能修改".to_string());
        }
        items[index] = UserToolSpec {
            is_system: items[index].is_system,
            ..next.clone()
        };
    } else {
        items.push(next.clone());
    }
    save_tool_registry(&items)?;
    Ok(ToolRegistryEntry {
        id: next.id,
        name: next.name,
        enabled: next.enabled,
        config_files: next
            .config_files
            .iter()
            .map(|file| ConfigFile {
                label: file.label.clone(),
                path: file.path.clone(),
                kind: file.kind.clone(),
                exists: Path::new(&file.path).exists(),
            })
            .collect(),
        skill_dir: next.skill_dir,
        is_system: false,
    })
}

#[tauri::command]
fn delete_tool_registry_item(request: DeleteToolRequest) -> Result<String, String> {
    let mut items = load_tool_registry()?;
    if let Some(item) = items.iter().find(|item| item.id == request.id) {
        if item.is_system {
            return Err("系统工具不能删除".to_string());
        }
    }
    let before = items.len();
    items.retain(|item| item.id != request.id);
    if items.len() == before {
        return Err("未找到工具".to_string());
    }
    let enabled_count = items.iter().filter(|item| item.enabled).count();
    if enabled_count == 0 {
        return Err("至少保留一个启用工具".to_string());
    }
    save_tool_registry(&items)?;
    Ok("工具已删除".to_string())
}

#[tauri::command]
fn detect_tool_paths(request: DetectToolPathsRequest) -> Result<DetectToolPathsResult, String> {
    let lookup = request
        .id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(request.name.as_deref())
        .unwrap_or("");
    Ok(detect_tool_paths_from_name(lookup))
}

#[tauri::command]
fn read_config_file(path: String) -> Result<ConfigPayload, String> {
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    Ok(ConfigPayload { path, content })
}

#[tauri::command]
fn save_config_file(request: SaveConfigRequest) -> Result<SaveConfigResult, String> {
    let path = PathBuf::from(&request.path);
    ensure_parent_dir(&path)?;

    let backup_path = format!("{}.bak.{}", request.path, current_timestamp());
    if path.exists() {
        fs::copy(&path, &backup_path).map_err(|err| err.to_string())?;
    } else {
        fs::write(&backup_path, "").map_err(|err| err.to_string())?;
    }

    fs::write(&path, request.content).map_err(|err| err.to_string())?;

    Ok(SaveConfigResult {
        path: request.path,
        backup_path,
    })
}

#[tauri::command]
fn list_config_backups(path: String) -> Result<Vec<BackupEntry>, String> {
    let target = PathBuf::from(&path);
    let parent = target
        .parent()
        .ok_or_else(|| format!("missing parent directory for {}", path))?;
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("invalid file name for {}", path))?;
    let prefix = format!("{file_name}.bak.");

    let mut items = Vec::new();
    for entry in fs::read_dir(parent).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with(&prefix) {
            continue;
        }

        items.push(BackupEntry {
            path: path_to_string(&entry_path),
            name,
            updated_at: metadata_mtime(&entry_path),
        });
    }

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(items)
}

#[tauri::command]
fn open_path_in_finder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let mut command = Command::new("open");

    if target.exists() && target.is_file() {
        command.arg("-R").arg(&target);
    } else if target.exists() {
        command.arg(&target);
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| format!("missing parent directory for {}", path))?;
        command.arg(parent);
    }

    command.status().map_err(|err| err.to_string()).and_then(|status| {
        if status.success() {
            Ok(())
        } else {
            Err(format!("failed to open finder for {}", path))
        }
    })
}

#[tauri::command]
fn sync_skills(request: SyncSkillsRequest) -> Result<Vec<SyncSkillOutcome>, String> {
    let registry = load_tool_registry()?;
    let source_tool = registry_tool_by_id(&registry, &request.source_tool_id)
        .ok_or_else(|| format!("unknown source tool: {}", request.source_tool_id))?;
    let source_root = Path::new(
        source_tool
            .skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", source_tool.id))?,
    );

    let mut outcomes = Vec::new();
    for target_tool_id in &request.target_tool_ids {
        let target_tool = registry_tool_by_id(&registry, target_tool_id)
            .ok_or_else(|| format!("unknown target tool: {target_tool_id}"))?;
        let target_root = Path::new(
            target_tool
                .skill_dir
                .as_deref()
                .ok_or_else(|| format!("tool {} has no skill directory", target_tool.id))?,
        );

        fs::create_dir_all(target_root).map_err(|err| err.to_string())?;

        for skill_name in &request.skill_names {
            let source_path = source_root.join(skill_name);
            if !source_path.exists() {
                outcomes.push(SyncSkillOutcome {
                    source_tool_id: source_tool.id.to_string(),
                    source_skill: skill_name.clone(),
                    target_tool_id: target_tool.id.to_string(),
                    target_path: path_to_string(&target_root.join(skill_name)),
                    status: "missing_source".to_string(),
                    message: "source skill does not exist".to_string(),
                });
                continue;
            }

            let target_candidate = target_root.join(skill_name);
            let (target_path, conflict_message) =
                match with_conflict_policy(&target_candidate, &request.conflict_policy) {
                    Ok(result) => result,
                    Err(message) if request.conflict_policy == "skip" => {
                        outcomes.push(SyncSkillOutcome {
                            source_tool_id: source_tool.id.to_string(),
                            source_skill: skill_name.clone(),
                            target_tool_id: target_tool.id.to_string(),
                            target_path: path_to_string(&target_candidate),
                            status: "skipped".to_string(),
                            message,
                        });
                        continue;
                    }
                    Err(message) => return Err(message),
                };

            let sync_result = match request.mode.as_str() {
                "copy" => {
                    let resolved_source = resolve_source_dir(&source_path)?;
                    copy_dir_recursive(&resolved_source, &target_path)
                }
                "symlink" => {
                    let resolved_source = resolve_source_dir(&source_path)?;
                    #[cfg(unix)]
                    {
                        std::os::unix::fs::symlink(&resolved_source, &target_path)
                            .map_err(|err| err.to_string())
                    }
                    #[cfg(not(unix))]
                    {
                        Err("symlink mode is only supported on unix hosts".to_string())
                    }
                }
                other => Err(format!("unsupported sync mode: {other}")),
            };

            match sync_result {
                Ok(_) => {
                    // 同步成功后清除目标工具的停用标记
                    if let Ok(db) = get_db() {
                        let _ = db.clear_disabled_skills(&target_tool.id, skill_name);
                    }
                    outcomes.push(SyncSkillOutcome {
                        source_tool_id: source_tool.id.to_string(),
                        source_skill: skill_name.clone(),
                        target_tool_id: target_tool.id.to_string(),
                        target_path: path_to_string(&target_path),
                        status: "success".to_string(),
                        message: conflict_message,
                    })
                }
                Err(message) => outcomes.push(SyncSkillOutcome {
                    source_tool_id: source_tool.id.to_string(),
                    source_skill: skill_name.clone(),
                    target_tool_id: target_tool.id.to_string(),
                    target_path: path_to_string(&target_path),
                    status: "error".to_string(),
                    message,
                }),
            }
        }
    }

    Ok(outcomes)
}

#[tauri::command]
fn delete_skill(request: DeleteSkillRequest) -> Result<String, String> {
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &request.tool_id)
        .ok_or_else(|| format!("unknown tool: {}", request.tool_id))?;
    let skill_root = Path::new(
        tool.skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", tool.id))?,
    );
    let skill_name = sanitize_skill_name(&request.skill_name)?;
    let skill_path = skill_root.join(&skill_name);

    if !skill_path.exists() && fs::symlink_metadata(&skill_path).is_err() {
        return Err(format!("skill {} does not exist", skill_name));
    }

    remove_existing_path(&skill_path)?;
    Ok(format!("已删除 {}", skill_name))
}

#[tauri::command]
fn get_skill_tags_command(skill_name: String) -> Result<Vec<String>, String> {
    get_skill_tags(&skill_name)
}

#[tauri::command]
fn set_skill_tags_command(request: SkillTagsRequest) -> Result<(), String> {
    set_skill_tags(&request.skill_name, request.tags)
}

#[tauri::command]
fn get_skill_detail(tool_id: String, skill_name: String) -> Result<SkillDetailPayload, String> {
    let registry = load_tool_registry()?;
    let tool = registry
        .iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| format!("工具 {} 不存在", tool_id))?;
    let skill_dir = tool
        .skill_dir
        .as_ref()
        .ok_or_else(|| format!("工具 {} 没有技能目录", tool_id))?;
    let skill_path = Path::new(skill_dir).join(&skill_name);
    if !skill_path.exists() {
        return Err(format!("技能 {} 不存在", skill_name));
    }

    let skill_md_path = skill_path.join("SKILL.md");
    let readme_path = skill_path.join("README.md");

    let skill_md_content = if skill_md_path.exists() {
        fs::read_to_string(&skill_md_path).ok()
    } else {
        None
    };

    let readme_content = if readme_path.exists() {
        fs::read_to_string(&readme_path).ok()
    } else {
        None
    };

    Ok(SkillDetailPayload {
        skill_name,
        skill_md_content,
        readme_content,
    })
}

#[tauri::command]
fn list_presets_command() -> Result<Vec<types::PresetEntry>, String> {
    let db = get_db()?;
    store::preset_store::list_presets(db)
}

#[tauri::command]
fn save_preset_command(request: types::UpsertPresetRequest) -> Result<types::PresetEntry, String> {
    let db = get_db()?;
    store::preset_store::upsert_preset(
        db,
        request.id.as_deref(),
        &request.name,
        request.icon.as_deref(),
        request.skills,
    )
}

#[tauri::command]
fn delete_preset_command(request: types::DeletePresetRequest) -> Result<(), String> {
    let db = get_db()?;
    store::preset_store::delete_preset(db, &request.id)
}

#[tauri::command]
fn list_center_skills() -> Result<Vec<central_repo::CenterSkillInfo>, String> {
    let mut skills = central_repo::scan_center_skills()?;
    let db = get_db()?;
    let registry = load_tool_registry()?;
    let tools: Vec<(String, String, String)> = registry
        .iter()
        .filter(|t| t.enabled)
        .filter_map(|t| {
            t.skill_dir
                .as_ref()
                .map(|dir| (t.id.clone(), t.name.clone(), dir.clone()))
        })
        .collect();

    for skill in &mut skills {
        let db_source_type = store::center_skill_store::get_center_skill_by_name(db, &skill.name)
            .ok()
            .flatten()
            .map(|s| s.source_type);

        let has_git = Path::new(&skill.path).join(".git").exists();

        skill.source_type = match db_source_type.as_deref() {
            Some("git") => "git".to_string(),
            Some("imported") => {
                let exists_in_tools = tools
                    .iter()
                    .filter(|(_, _, dir)| Path::new(dir).join(&skill.name).exists())
                    .count();
                if exists_in_tools >= 2 {
                    "system".to_string()
                } else {
                    "custom".to_string()
                }
            }
            _ => {
                if has_git {
                    "git".to_string()
                } else {
                    "custom".to_string()
                }
            }
        };

        skill.sync_statuses = central_repo::check_sync_status(&skill.name, &tools)?;
    }
    Ok(skills)
}

#[tauri::command]
fn set_skill_category(skill_name: String, category: String) -> Result<(), String> {
    let db = get_db()?;
    store::center_skill_store::set_skill_source_type(db, &skill_name, &category)
}

#[tauri::command]
fn batch_sync_from_center(
    skill_names: Vec<String>,
    target_tool_id: String,
    mode: String,
    conflict_policy: String,
) -> Result<Vec<central_repo::SyncOutcome>, String> {
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &target_tool_id)
        .ok_or_else(|| format!("未知工具: {}", target_tool_id))?;
    let skill_dir = tool
        .skill_dir
        .as_deref()
        .ok_or_else(|| format!("工具 {} 没有技能目录", target_tool_id))?;

    let mut outcomes = Vec::new();
    for skill_name in skill_names {
        match central_repo::sync_skill_to_tool(&skill_name, skill_dir, &mode, &conflict_policy) {
            Ok(outcome) => outcomes.push(outcome),
            Err(e) => outcomes.push(central_repo::SyncOutcome {
                skill_name,
                target_tool_id: target_tool_id.clone(),
                target_path: skill_dir.to_string(),
                status: "error".to_string(),
                message: e,
            }),
        }
    }
    Ok(outcomes)
}

#[tauri::command]
fn delete_center_skill_command(skill_name: String) -> Result<String, String> {
    central_repo::delete_center_skill(&skill_name)
}

#[tauri::command]
fn discover_center_skills() -> Result<Vec<central_repo::DiscoveredSkill>, String> {
    let registry = load_tool_registry()?;
    central_repo::discover_skills_from_tools(registry.as_slice())
}

#[tauri::command]
fn batch_import_to_center(
    request: Vec<central_repo::ImportSkillRequest>,
) -> Result<Vec<central_repo::ImportOutcome>, String> {
    let db = get_db()?;
    let registry = load_tool_registry()?;
    central_repo::batch_import_skills_to_center(db, registry.as_slice(), request.as_slice())
}

// ============================================================================
// Claude Code Config Sync commands
// ============================================================================

#[tauri::command]
fn get_claude_config_diff(
    baseline: Option<claude_config::BaselineKind>,
) -> Result<claude_config::ClaudeConfigDiffResult, String> {
    let kind = baseline.unwrap_or_default();
    claude_config::get_claude_config_diff(kind)
}

#[tauri::command]
fn apply_claude_config_full_sync(
    baseline: Option<claude_config::BaselineKind>,
) -> Result<claude_config::ClaudeConfigSyncResult, String> {
    let kind = baseline.unwrap_or_default();
    claude_config::apply_claude_config_full_sync(kind)
}

#[tauri::command]
fn list_claude_settings_snapshots() -> Result<Vec<claude_config::SnapshotMeta>, String> {
    claude_config::list_snapshots()
}

#[tauri::command]
fn restore_cswitch_db_from_backup(backup_path: String) -> Result<(), String> {
    claude_config::restore_cswitch_db_from_backup(backup_path)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToggleSkillEnabledRequest {
    tool_id: String,
    skill_name: String,
    enabled: bool,
}

#[tauri::command]
fn toggle_skill_enabled(request: ToggleSkillEnabledRequest) -> Result<(), String> {
    let db = get_db()?;
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &request.tool_id)
        .ok_or_else(|| format!("unknown tool: {}", request.tool_id))?;
    let skill_root = Path::new(
        tool
            .skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", tool.id))?,
    );
    let skill_name = sanitize_skill_name(&request.skill_name)?;
    let skill_path = skill_root.join(&skill_name);

    if request.enabled {
        // 启用：从数据库删除停用标记
        db.enable_skill(&request.tool_id, &skill_name)?;
    } else {
        // 停用：文件不动，数据库打标记
        if !skill_path.exists() && fs::symlink_metadata(&skill_path).is_err() {
            return Err(format!("skill {} does not exist", skill_name));
        }
        db.disable_skill(&request.tool_id, &skill_name)?;
    }
    Ok(())
}

#[tauri::command]
fn healthcheck() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化数据库
    if let Err(e) = init_db_pool() {
        eprintln!("数据库初始化失败: {}", e);
    }

    // 清理旧版本注入的伪系统工具（一次性迁移）
    if let Err(e) = cleanup_legacy_system_tools() {
        eprintln!("清理旧系统工具失败: {}", e);
    }

    let watcher_handle = Arc::new(file_watcher::FileWatcherHandle::new());

    tauri::Builder::default()
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 启动文件监控
            if let Ok(tools) = load_tool_registry() {
                let mut watch_paths: Vec<PathBuf> = tools
                    .into_iter()
                    .filter(|t| t.enabled)
                    .filter_map(|t| t.skill_dir.map(PathBuf::from))
                    .filter(|p| p.exists())
                    .collect();

                // 追加 Claude Code Config Sync 监听的两个路径
                if let Ok(home) = get_home_dir() {
                    for extra in [
                        home.join(".claude/settings.json"),
                        home.join(".cc-switch/cc-switch.db"),
                    ] {
                        if extra.exists() {
                            watch_paths.push(extra);
                        }
                    }
                }

                // 启动期做一次种子快照
                let _ = claude_config::snapshot_settings_if_changed();

                if !watch_paths.is_empty() {
                    let app_handle = app.handle().clone();
                    if let Err(e) = file_watcher::start_file_watcher(
                        app_handle,
                        watcher_handle.clone(),
                        watch_paths,
                    ) {
                        log::warn!("启动文件监控失败: {}", e);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            get_home_dir_path,
            list_tools,
            get_skill_insights,
            list_tool_registry,
            upsert_tool_registry_item,
            delete_tool_registry_item,
            detect_tool_paths,
            read_config_file,
            save_config_file,
            list_config_backups,
            open_path_in_finder,
            sync_skills,
            delete_skill,
            toggle_skill_enabled,
            get_skill_tags_command,
            set_skill_tags_command,
            get_skill_detail,
            list_presets_command,
            save_preset_command,
            delete_preset_command,
            list_center_skills,
            delete_center_skill_command,
            discover_center_skills,
            batch_import_to_center,
            batch_sync_from_center,
            set_skill_category,
            // Claude Code Config Sync
            get_claude_config_diff,
            apply_claude_config_full_sync,
            list_claude_settings_snapshots,
            restore_cswitch_db_from_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
