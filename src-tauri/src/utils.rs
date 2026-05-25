use std::fs;
use std::path::{Path, PathBuf};

use crate::db::get_db;
use crate::types::{
    ConfigFile, DetectToolPathsResult, SkillEntry, ToolEntry, UpsertToolRequest, UserToolConfigFile,
    UserToolSpec, current_timestamp, metadata_mtime, normalize_tool_id, path_to_string,
    read_skill_descriptions,
};

/// 获取用户主目录，跨平台兼容
pub fn get_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 拼接主目录下的相对路径，返回绝对路径字符串
pub fn home_path(relative: &str) -> Result<String, String> {
    let home = get_home_dir()?;
    Ok(path_to_string(&home.join(relative)))
}

/// 根据当前用户主目录动态生成默认工具配置
pub fn default_tool_specs() -> Result<Vec<UserToolSpec>, String> {
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
pub fn cleanup_legacy_system_tools() -> Result<(), String> {
    let db = get_db()?;
    db.with_conn(|conn| {
        conn.execute("DELETE FROM tools WHERE is_system = 1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn registry_dir() -> Result<PathBuf, String> {
    Ok(get_home_dir()?.join(".ai-toolbox"))
}

pub fn registry_file() -> Result<PathBuf, String> {
    Ok(registry_dir()?.join("tools.json"))
}

pub fn default_user_tools() -> Result<Vec<UserToolSpec>, String> {
    default_tool_specs()
}

pub fn ensure_tool_registry() -> Result<(), String> {
    let file = registry_file()?;
    if file.exists() {
        return Ok(());
    }
    fs::create_dir_all(registry_dir()?).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(&default_user_tools()?).map_err(|err| err.to_string())?;
    fs::write(file, data).map_err(|err| err.to_string())
}

pub fn load_tool_registry() -> Result<Vec<UserToolSpec>, String> {
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

pub fn save_tool_registry(items: &[UserToolSpec]) -> Result<(), String> {
    fs::create_dir_all(registry_dir()?).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(items).map_err(|err| err.to_string())?;
    fs::write(registry_file()?, data).map_err(|err| err.to_string())
}

pub fn registry_tool_by_id<'a>(items: &'a [UserToolSpec], id: &str) -> Option<&'a UserToolSpec> {
    items.iter().find(|item| item.id == id)
}

pub fn build_tool_entry_from_user(spec: &UserToolSpec) -> ToolEntry {
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

pub fn sanitize_upsert_request(request: UpsertToolRequest) -> Result<UserToolSpec, String> {
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

pub fn detect_tool_paths_from_name(input: &str) -> DetectToolPathsResult {
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

pub fn get_skill_tags(skill_name: &str) -> Result<Vec<String>, String> {
    let db = get_db()?;
    crate::store::tag_store::get_skill_tags(db, skill_name)
}

pub fn set_skill_tags(skill_name: &str, tags: Vec<String>) -> Result<(), String> {
    let db = get_db()?;
    crate::store::tag_store::set_skill_tags(db, skill_name, tags)
}

pub fn scan_skill_dir(skill_dir: &Path, tool_id: &str) -> Vec<SkillEntry> {
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

pub fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("missing parent directory for {}", path_to_string(path)))?;
    fs::create_dir_all(parent).map_err(|err| err.to_string())
}

pub fn remove_existing_path(path: &Path) -> Result<(), String> {
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

pub fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
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

pub fn resolve_source_dir(path: &Path) -> Result<PathBuf, String> {
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

pub fn with_conflict_policy(path: &Path, policy: &str) -> Result<(PathBuf, String), String> {
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

pub fn get_skill_files(skill_path: &Path) -> Vec<(String, u64)> {
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

pub fn compare_skill_folders(leader_path: &Path, lagging_path: &Path) -> Vec<crate::types::SkillDiff> {
    let leader_files = get_skill_files(leader_path);
    let lagging_files = get_skill_files(lagging_path);

    let mut diffs = Vec::new();
    let leader_map: std::collections::HashMap<String, u64> = leader_files.into_iter().collect();
    let lagging_map: std::collections::HashMap<String, u64> = lagging_files.into_iter().collect();

    // 检查新增和修改的文件
    for (name, leader_size) in &leader_map {
        if let Some(lagging_size) = lagging_map.get(name) {
            if leader_size != lagging_size {
                diffs.push(crate::types::SkillDiff {
                    file_name: name.clone(),
                    diff_type: "modified".to_string(),
                });
            }
        } else {
            diffs.push(crate::types::SkillDiff {
                file_name: name.clone(),
                diff_type: "added".to_string(),
            });
        }
    }

    // 检查删除的文件
    for (name, _) in &lagging_map {
        if !leader_map.contains_key(name) {
            diffs.push(crate::types::SkillDiff {
                file_name: name.clone(),
                diff_type: "deleted".to_string(),
            });
        }
    }

    diffs.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    diffs
}
