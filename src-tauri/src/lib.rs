use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillDiff {
    file_name: String,
    diff_type: String, // "added", "modified", "deleted"
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaggingToolInfo {
    tool_id: String,
    tool_name: String,
    behind_seconds: u64,
    diffs: Vec<SkillDiff>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillInsightEntry {
    skill_name: String,
    leader_tool_id: String,
    leader_tool_name: String,
    leader_updated_at: u64,
    lagging_tools: Vec<LaggingToolInfo>,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserToolConfigFile {
    label: String,
    path: String,
    kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserToolSpec {
    id: String,
    name: String,
    enabled: bool,
    config_files: Vec<UserToolConfigFile>,
    skill_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertToolRequest {
    id: String,
    name: String,
    enabled: bool,
    config_files: Vec<UserToolConfigFile>,
    skill_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteToolRequest {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectToolPathsRequest {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolRegistryEntry {
    id: String,
    name: String,
    enabled: bool,
    config_files: Vec<ConfigFile>,
    skill_dir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectToolPathsResult {
    config_files: Vec<ConfigFile>,
    skill_dir: Option<String>,
}

const TOOL_SPECS: &[ToolSpec] = &[
    ToolSpec {
        id: "codex",
        name: "Codex",
        config_files: &[("config.toml", "/Users/smzdm/.codex/config.toml", "toml")],
        skill_dir: Some("/Users/smzdm/.agents/skills"),
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

fn registry_dir() -> PathBuf {
    PathBuf::from("/Users/smzdm/.ai-toolbox")
}

fn registry_file() -> PathBuf {
    registry_dir().join("tools.json")
}

fn default_user_tools() -> Vec<UserToolSpec> {
    TOOL_SPECS
        .iter()
        .map(|spec| UserToolSpec {
            id: spec.id.to_string(),
            name: spec.name.to_string(),
            enabled: true,
            config_files: spec
                .config_files
                .iter()
                .map(|(label, path, kind)| UserToolConfigFile {
                    label: (*label).to_string(),
                    path: (*path).to_string(),
                    kind: (*kind).to_string(),
                })
                .collect(),
            skill_dir: spec.skill_dir.map(|value| value.to_string()),
        })
        .collect()
}

fn ensure_tool_registry() -> Result<(), String> {
    let file = registry_file();
    if file.exists() {
        return Ok(());
    }
    fs::create_dir_all(registry_dir()).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(&default_user_tools()).map_err(|err| err.to_string())?;
    fs::write(file, data).map_err(|err| err.to_string())
}

fn load_tool_registry() -> Result<Vec<UserToolSpec>, String> {
    ensure_tool_registry()?;
    let content = fs::read_to_string(registry_file()).map_err(|err| err.to_string())?;
    let mut items = serde_json::from_str::<Vec<UserToolSpec>>(&content).map_err(|err| err.to_string())?;
    items.retain(|item| !item.id.trim().is_empty() && !item.name.trim().is_empty());
    let mut changed = false;
    for item in &mut items {
        if item.id == "codex" && item.skill_dir.as_deref() == Some("/Users/smzdm/.codex/skills") {
            item.skill_dir = Some("/Users/smzdm/.agents/skills".to_string());
            changed = true;
        }
    }
    if changed {
        save_tool_registry(&items)?;
    }
    Ok(items)
}

fn save_tool_registry(items: &[UserToolSpec]) -> Result<(), String> {
    fs::create_dir_all(registry_dir()).map_err(|err| err.to_string())?;
    let data = serde_json::to_string_pretty(items).map_err(|err| err.to_string())?;
    fs::write(registry_file(), data).map_err(|err| err.to_string())
}

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

fn normalize_tool_id(id: &str) -> String {
    id.trim()
        .to_lowercase()
        .replace([' ', '/', '\\', ':'], "-")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect::<String>()
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
        .map(|path| scan_skill_dir(Path::new(path)))
        .unwrap_or_default();

    ToolEntry {
        id: spec.id.clone(),
        name: spec.name.clone(),
        config_files,
        skill_dir,
        skills,
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
    })
}

fn detect_tool_paths_from_name(input: &str) -> DetectToolPathsResult {
    let key = input.to_lowercase();
    let mut config_files = Vec::new();
    let mut skill_dir = None::<String>;

    let apply = |configs: &[(&str, &str, &str)], skills: Option<&str>, out: &mut Vec<ConfigFile>, skill_out: &mut Option<String>| {
        for (label, path, kind) in configs {
            if Path::new(path).exists() {
                out.push(ConfigFile {
                    label: (*label).to_string(),
                    path: (*path).to_string(),
                    kind: (*kind).to_string(),
                    exists: true,
                });
            }
        }
        if let Some(skills_path) = skills {
            if Path::new(skills_path).exists() {
                *skill_out = Some(skills_path.to_string());
            }
        }
    };

    if key.contains("codex") {
        apply(
            &[("config.toml", "/Users/smzdm/.codex/config.toml", "toml")],
            Some("/Users/smzdm/.agents/skills"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("claude") {
        apply(
            &[("settings.json", "/Users/smzdm/.claude/settings.json", "json")],
            Some("/Users/smzdm/.claude/skills"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("cursor") {
        apply(
            &[
                ("settings.json", "/Users/smzdm/Library/Application Support/Cursor/User/settings.json", "json"),
                ("mcp.json", "/Users/smzdm/.cursor/mcp.json", "json"),
                ("hooks.json", "/Users/smzdm/.cursor/hooks.json", "json"),
            ],
            Some("/Users/smzdm/.cursor/skills-cursor"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("qoder") {
        apply(
            &[("settings.json", "/Users/smzdm/Library/Application Support/Qoder/User/settings.json", "json")],
            Some("/Users/smzdm/.qoder/skills"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("trae") {
        apply(
            &[
                ("settings.json", "/Users/smzdm/Library/Application Support/Trae CN/User/settings.json", "json"),
                ("skill-config.json", "/Users/smzdm/.trae-cn/skill-config.json", "json"),
            ],
            Some("/Users/smzdm/.trae-cn/skills"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("opencode") {
        apply(
            &[
                ("opencode.jsonc", "/Users/smzdm/.config/opencode/opencode.jsonc", "jsonc"),
                ("config.json", "/Users/smzdm/.config/opencode/config.json", "json"),
            ],
            Some("/Users/smzdm/.config/opencode/skills"),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("agent") {
        apply(&[], Some("/Users/smzdm/.agents/skills"), &mut config_files, &mut skill_dir);
    }

    DetectToolPathsResult { config_files, skill_dir }
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
        })
        .collect())
}

#[tauri::command]
fn upsert_tool_registry_item(request: UpsertToolRequest) -> Result<ToolRegistryEntry, String> {
    let next = sanitize_upsert_request(request)?;
    let mut items = load_tool_registry()?;
    if let Some(index) = items.iter().position(|item| item.id == next.id) {
        items[index] = next.clone();
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
    })
}

#[tauri::command]
fn delete_tool_registry_item(request: DeleteToolRequest) -> Result<String, String> {
    let mut items = load_tool_registry()?;
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
            delete_skill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
