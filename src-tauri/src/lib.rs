use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFile {
    label: String,
    path: String,
    kind: String,
    exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillEntry {
    name: String,
    description: Option<String>,
    full_description: Option<String>,
    summary: Option<String>,
    path: String,
    has_skill_md: bool,
    is_symlink: bool,
    link_target: Option<String>,
    updated_at: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolEntry {
    id: String,
    name: String,
    config_files: Vec<ConfigFile>,
    skill_dir: Option<String>,
    skills: Vec<SkillEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigPayload {
    path: String,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveConfigResult {
    path: String,
    backup_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntry {
    path: String,
    name: String,
    updated_at: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveConfigRequest {
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncSkillsRequest {
    source_tool_id: String,
    skill_names: Vec<String>,
    target_tool_ids: Vec<String>,
    mode: String,
    conflict_policy: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteSkillRequest {
    tool_id: String,
    skill_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncSkillOutcome {
    source_tool_id: String,
    source_skill: String,
    target_tool_id: String,
    target_path: String,
    status: String,
    message: String,
}

#[derive(Clone)]
struct ToolSpec {
    id: &'static str,
    name: &'static str,
    config_files: &'static [(&'static str, &'static str, &'static str)],
    skill_dir: Option<&'static str>,
}

const TOOL_SPECS: &[ToolSpec] = &[
    ToolSpec {
        id: "codex",
        name: "Codex",
        config_files: &[("config.toml", "/Users/smzdm/.codex/config.toml", "toml")],
        skill_dir: Some("/Users/smzdm/.codex/skills"),
    },
    ToolSpec {
        id: "claude",
        name: "Claude Code",
        config_files: &[("settings.json", "/Users/smzdm/.claude/settings.json", "json")],
        skill_dir: Some("/Users/smzdm/.claude/skills"),
    },
    ToolSpec {
        id: "cursor",
        name: "Cursor",
        config_files: &[
            (
                "settings.json",
                "/Users/smzdm/Library/Application Support/Cursor/User/settings.json",
                "json",
            ),
            ("mcp.json", "/Users/smzdm/.cursor/mcp.json", "json"),
            ("hooks.json", "/Users/smzdm/.cursor/hooks.json", "json"),
        ],
        skill_dir: Some("/Users/smzdm/.cursor/skills-cursor"),
    },
    ToolSpec {
        id: "qoder",
        name: "Qoder",
        config_files: &[(
            "settings.json",
            "/Users/smzdm/Library/Application Support/Qoder/User/settings.json",
            "json",
        )],
        skill_dir: Some("/Users/smzdm/.qoder/skills"),
    },
    ToolSpec {
        id: "trae",
        name: "Trae",
        config_files: &[
            (
                "settings.json",
                "/Users/smzdm/Library/Application Support/Trae CN/User/settings.json",
                "json",
            ),
            ("skill-config.json", "/Users/smzdm/.trae-cn/skill-config.json", "json"),
        ],
        skill_dir: Some("/Users/smzdm/.trae-cn/skills"),
    },
    ToolSpec {
        id: "opencode",
        name: "OpenCode",
        config_files: &[
            ("opencode.jsonc", "/Users/smzdm/.config/opencode/opencode.jsonc", "jsonc"),
            ("config.json", "/Users/smzdm/.config/opencode/config.json", "json"),
        ],
        skill_dir: Some("/Users/smzdm/.config/opencode/skills"),
    },
    ToolSpec {
        id: "agents",
        name: "Agents Skills",
        config_files: &[],
        skill_dir: Some("/Users/smzdm/.agents/skills"),
    },
];

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn metadata_mtime(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

fn read_skill_descriptions(skill_md: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let Ok(content) = fs::read_to_string(skill_md) else {
        return (None, None, None);
    };

    let mut lines = content.lines().peekable();
    let mut description = None;
    let mut full_description = None;

    if matches!(lines.peek(), Some(line) if line.trim() == "---") {
        lines.next();
        for line in lines.by_ref() {
            let trimmed = line.trim();
            if trimmed == "---" {
                break;
            }
            if let Some(rest) = trimmed.strip_prefix("description:") {
                let value = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                if !value.is_empty() {
                    description = Some(value.clone());
                    full_description = Some(value);
                }
            }
        }
    }

    if description.is_some() {
        return (description.clone(), full_description, description);
    }

    let mut paragraph = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !paragraph.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        paragraph.push(trimmed.to_string());
        if paragraph.len() >= 3 {
            break;
        }
    }

    if paragraph.is_empty() {
        return (None, None, None);
    }

    let joined = paragraph.join(" ");
    let summary = joined.chars().take(96).collect::<String>();
    let summary = if joined.chars().count() > 96 {
        format!("{summary}...")
    } else {
        summary
    };

    (Some(summary.clone()), Some(joined), Some(summary))
}

fn sanitize_skill_name(value: &str) -> Result<String, String> {
    if value.is_empty() || value == "." || value == ".." || value.contains('/') {
        return Err(format!("invalid skill name: {value}"));
    }

    Ok(value.to_string())
}

fn tool_spec_by_id(id: &str) -> Option<&'static ToolSpec> {
    TOOL_SPECS.iter().find(|spec| spec.id == id)
}

fn scan_skill_dir(skill_dir: &Path) -> Vec<SkillEntry> {
    let mut items = Vec::new();

    let Ok(entries) = fs::read_dir(skill_dir) else {
        return items;
    };

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
        });
    }

    items.sort_by(|left, right| left.name.cmp(&right.name));
    items
}

fn build_tool_entry(spec: &ToolSpec) -> ToolEntry {
    let config_files = spec
        .config_files
        .iter()
        .map(|(label, path, kind)| ConfigFile {
            label: (*label).to_string(),
            path: (*path).to_string(),
            kind: (*kind).to_string(),
            exists: Path::new(path).exists(),
        })
        .collect::<Vec<_>>();

    let skill_dir = spec.skill_dir.map(String::from);
    let skills = spec
        .skill_dir
        .map(|path| scan_skill_dir(Path::new(path)))
        .unwrap_or_default();

    ToolEntry {
        id: spec.id.to_string(),
        name: spec.name.to_string(),
        config_files,
        skill_dir,
        skills,
    }
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
fn list_tools() -> Result<Vec<ToolEntry>, String> {
    Ok(TOOL_SPECS.iter().map(build_tool_entry).collect())
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
    let source_tool = tool_spec_by_id(&request.source_tool_id)
        .ok_or_else(|| format!("unknown source tool: {}", request.source_tool_id))?;
    let source_root = Path::new(
        source_tool
            .skill_dir
            .ok_or_else(|| format!("tool {} has no skill directory", source_tool.id))?,
    );

    let mut outcomes = Vec::new();
    for target_tool_id in &request.target_tool_ids {
        let target_tool = tool_spec_by_id(target_tool_id)
            .ok_or_else(|| format!("unknown target tool: {target_tool_id}"))?;
        let target_root = Path::new(
            target_tool
                .skill_dir
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
                Ok(_) => outcomes.push(SyncSkillOutcome {
                    source_tool_id: source_tool.id.to_string(),
                    source_skill: skill_name.clone(),
                    target_tool_id: target_tool.id.to_string(),
                    target_path: path_to_string(&target_path),
                    status: "success".to_string(),
                    message: conflict_message,
                }),
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
    let tool = tool_spec_by_id(&request.tool_id)
        .ok_or_else(|| format!("unknown tool: {}", request.tool_id))?;
    let skill_root = Path::new(
        tool.skill_dir
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
fn healthcheck() -> &'static str {
    "ok"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            list_tools,
            read_config_file,
            save_config_file,
            list_config_backups,
            open_path_in_finder,
            sync_skills,
            delete_skill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
