use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy)]
struct ToolDefinition {
    id: &'static str,
    label: &'static str,
    config_files: &'static [ConfigFileDefinition],
    skills_dir: Option<&'static str>,
}

#[derive(Clone, Copy)]
struct ConfigFileDefinition {
    id: &'static str,
    label: &'static str,
    path: &'static str,
    is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDescriptor {
    pub id: String,
    pub label: String,
    pub config_files: Vec<ConfigFileDescriptor>,
    pub skills_dir: Option<SkillsDirectoryDescriptor>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileDescriptor {
    pub id: String,
    pub label: String,
    pub path: String,
    pub exists: bool,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsDirectoryDescriptor {
    pub path: String,
    pub exists: bool,
    pub skill_count: usize,
    pub skills: Vec<SkillEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    pub name: String,
    pub path: String,
    pub skill_file_path: String,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileContent {
    pub tool: String,
    pub config_file: ConfigFileDescriptor,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigResult {
    pub tool: String,
    pub config_file: ConfigFileDescriptor,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSyncResult {
    pub source_tool: String,
    pub target_tool: String,
    pub source_path: String,
    pub target_path: String,
    pub mode: String,
    pub conflict: String,
    pub operations: Vec<SkillSyncOperation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSyncOperation {
    pub name: String,
    pub source_path: String,
    pub target_path: String,
    pub entry_type: String,
    pub action: String,
    pub conflict_resolution: String,
    pub is_symlink: bool,
}

const EMPTY_CONFIGS: &[ConfigFileDefinition] = &[];

const CODEX_CONFIGS: &[ConfigFileDefinition] = &[ConfigFileDefinition {
    id: "config",
    label: "Config",
    path: "/Users/smzdm/.codex/config.toml",
    is_primary: true,
}];

const CLAUDE_CONFIGS: &[ConfigFileDefinition] = &[ConfigFileDefinition {
    id: "settings",
    label: "Settings",
    path: "/Users/smzdm/.claude/settings.json",
    is_primary: true,
}];

const CURSOR_CONFIGS: &[ConfigFileDefinition] = &[
    ConfigFileDefinition {
        id: "settings",
        label: "Settings",
        path: "/Users/smzdm/Library/Application Support/Cursor/User/settings.json",
        is_primary: true,
    },
    ConfigFileDefinition {
        id: "mcp",
        label: "MCP",
        path: "/Users/smzdm/.cursor/mcp.json",
        is_primary: false,
    },
    ConfigFileDefinition {
        id: "hooks",
        label: "Hooks",
        path: "/Users/smzdm/.cursor/hooks.json",
        is_primary: false,
    },
];

const QODER_CONFIGS: &[ConfigFileDefinition] = &[ConfigFileDefinition {
    id: "settings",
    label: "Settings",
    path: "/Users/smzdm/Library/Application Support/Qoder/User/settings.json",
    is_primary: true,
}];

const TRAE_CONFIGS: &[ConfigFileDefinition] = &[
    ConfigFileDefinition {
        id: "settings",
        label: "Settings",
        path: "/Users/smzdm/Library/Application Support/Trae CN/User/settings.json",
        is_primary: true,
    },
    ConfigFileDefinition {
        id: "skill-config",
        label: "Skill Config",
        path: "/Users/smzdm/.trae-cn/skill-config.json",
        is_primary: false,
    },
];

const OPENCODE_CONFIGS: &[ConfigFileDefinition] = &[
    ConfigFileDefinition {
        id: "opencode",
        label: "OpenCode",
        path: "/Users/smzdm/.config/opencode/opencode.jsonc",
        is_primary: true,
    },
    ConfigFileDefinition {
        id: "config",
        label: "Config",
        path: "/Users/smzdm/.config/opencode/config.json",
        is_primary: false,
    },
];

const TOOLS: &[ToolDefinition] = &[
    ToolDefinition {
        id: "codex",
        label: "Codex",
        config_files: CODEX_CONFIGS,
        skills_dir: Some("/Users/smzdm/.codex/skills"),
    },
    ToolDefinition {
        id: "claude",
        label: "Claude",
        config_files: CLAUDE_CONFIGS,
        skills_dir: Some("/Users/smzdm/.claude/skills"),
    },
    ToolDefinition {
        id: "cursor",
        label: "Cursor",
        config_files: CURSOR_CONFIGS,
        skills_dir: Some("/Users/smzdm/.cursor/skills-cursor"),
    },
    ToolDefinition {
        id: "qoder",
        label: "Qoder",
        config_files: QODER_CONFIGS,
        skills_dir: Some("/Users/smzdm/.qoder/skills"),
    },
    ToolDefinition {
        id: "trae",
        label: "Trae",
        config_files: TRAE_CONFIGS,
        skills_dir: Some("/Users/smzdm/.trae-cn/skills"),
    },
    ToolDefinition {
        id: "opencode",
        label: "OpenCode",
        config_files: OPENCODE_CONFIGS,
        skills_dir: Some("/Users/smzdm/.config/opencode/skills"),
    },
    ToolDefinition {
        id: "agents",
        label: "Agents",
        config_files: EMPTY_CONFIGS,
        skills_dir: Some("/Users/smzdm/.agents/skills"),
    },
];

pub fn list_tools() -> Result<Vec<ToolDescriptor>, String> {
    TOOLS
        .iter()
        .map(build_tool_descriptor)
        .collect::<Result<Vec<_>, _>>()
}

pub fn read_config_file(
    tool: &str,
    config_id: Option<&str>,
    path: Option<&str>,
) -> Result<ConfigFileContent, String> {
    let tool_def = find_tool(tool)?;
    let config_def = resolve_config_file(tool_def, config_id, path)?;
    let content = fs::read_to_string(config_def.path)
        .map_err(|error| format!("failed to read {}: {}", config_def.path, error))?;

    Ok(ConfigFileContent {
        tool: tool_def.id.to_string(),
        config_file: build_config_descriptor(config_def),
        content,
    })
}

pub fn read_config_file_by_path(path: &str) -> Result<ConfigFileContent, String> {
    let (tool, config) = resolve_config_file_by_path(path)?;
    read_config_file(tool.id, Some(config.id), Some(config.path))
}

pub fn save_config_file(
    tool: &str,
    content: &str,
    config_id: Option<&str>,
    path: Option<&str>,
) -> Result<SaveConfigResult, String> {
    let tool_def = find_tool(tool)?;
    let config_def = resolve_config_file(tool_def, config_id, path)?;
    let config_path = Path::new(config_def.path);

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create parent dir {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    let backup_path = if config_path.exists() {
        let backup_path = build_backup_path(config_path);
        fs::copy(config_path, &backup_path).map_err(|error| {
            format!(
                "failed to create backup {}: {}",
                backup_path.display(),
                error
            )
        })?;
        Some(path_to_string(&backup_path))
    } else {
        None
    };

    fs::write(config_path, content)
        .map_err(|error| format!("failed to write {}: {}", config_path.display(), error))?;

    Ok(SaveConfigResult {
        tool: tool_def.id.to_string(),
        config_file: build_config_descriptor(config_def),
        backup_path,
    })
}

pub fn save_config_file_by_path(path: &str, content: &str) -> Result<SaveConfigResult, String> {
    let (tool, config) = resolve_config_file_by_path(path)?;
    save_config_file(tool.id, content, Some(config.id), Some(config.path))
}

pub fn sync_skills(
    source_tool: &str,
    target_tool: &str,
    mode: Option<&str>,
    conflict: Option<&str>,
) -> Result<SkillSyncResult, String> {
    let source_def = find_tool(source_tool)?;
    let target_def = find_tool(target_tool)?;

    if source_def.id == target_def.id {
        return Err("source_tool and target_tool must be different".to_string());
    }

    let mode = normalize_mode(mode)?;
    let conflict = normalize_conflict(conflict)?;
    let source_root = PathBuf::from(
        source_def
            .skills_dir
            .ok_or_else(|| format!("tool {} does not expose skills", source_def.id))?,
    );
    let target_root = PathBuf::from(
        target_def
            .skills_dir
            .ok_or_else(|| format!("tool {} does not expose skills", target_def.id))?,
    );

    if !source_root.exists() {
        return Err(format!(
            "source skills dir does not exist: {}",
            source_root.display()
        ));
    }

    fs::create_dir_all(&target_root)
        .map_err(|error| format!("failed to create {}: {}", target_root.display(), error))?;

    let mut operations = Vec::new();
    let mut entries = fs::read_dir(&source_root)
        .map_err(|error| format!("failed to read {}: {}", source_root.display(), error))?
        .collect::<Result<Vec<_>, io::Error>>()
        .map_err(|error| format!("failed to scan {}: {}", source_root.display(), error))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let source_path = entry.path();
        let entry_name = entry.file_name().to_string_lossy().into_owned();
        let base_target_path = target_root.join(&entry_name);
        let source_meta = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("failed to inspect {}: {}", source_path.display(), error))?;
        let entry_type = describe_entry_type(&source_meta);
        let is_symlink = source_meta.file_type().is_symlink();

        let (target_path, conflict_resolution, should_sync) =
            if base_target_path.exists() || symlink_exists(&base_target_path) {
                match conflict {
                    ConflictStrategy::Skip => (base_target_path, "skip".to_string(), false),
                    ConflictStrategy::Overwrite => {
                        remove_existing_path(&base_target_path)?;
                        (base_target_path, "overwrite".to_string(), true)
                    }
                    ConflictStrategy::Rename => (
                        build_renamed_target_path(&base_target_path),
                        "rename".to_string(),
                        true,
                    ),
                }
            } else {
                (base_target_path, "none".to_string(), true)
            };

        if should_sync {
            match mode {
                SyncMode::Copy => copy_skill_entry(&source_path, &target_path)?,
                SyncMode::Symlink => create_symlink_entry(&source_path, &target_path)?,
            }
        }

        operations.push(SkillSyncOperation {
            name: entry_name,
            source_path: path_to_string(&source_path),
            target_path: path_to_string(&target_path),
            entry_type,
            action: if should_sync {
                mode.as_str().to_string()
            } else {
                "skip".to_string()
            },
            conflict_resolution,
            is_symlink,
        });
    }

    Ok(SkillSyncResult {
        source_tool: source_def.id.to_string(),
        target_tool: target_def.id.to_string(),
        source_path: path_to_string(&source_root),
        target_path: path_to_string(&target_root),
        mode: mode.as_str().to_string(),
        conflict: conflict.as_str().to_string(),
        operations,
    })
}

fn build_tool_descriptor(tool: &ToolDefinition) -> Result<ToolDescriptor, String> {
    let config_files = tool
        .config_files
        .iter()
        .map(build_config_descriptor)
        .collect::<Vec<_>>();
    let skills_dir = tool.skills_dir.map(scan_skills_dir).transpose()?;

    Ok(ToolDescriptor {
        id: tool.id.to_string(),
        label: tool.label.to_string(),
        config_files,
        skills_dir,
    })
}

fn build_config_descriptor(config: &ConfigFileDefinition) -> ConfigFileDescriptor {
    ConfigFileDescriptor {
        id: config.id.to_string(),
        label: config.label.to_string(),
        path: config.path.to_string(),
        exists: Path::new(config.path).exists(),
        is_primary: config.is_primary,
    }
}

fn scan_skills_dir(root: &str) -> Result<SkillsDirectoryDescriptor, String> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return Ok(SkillsDirectoryDescriptor {
            path: root.to_string(),
            exists: false,
            skill_count: 0,
            skills: Vec::new(),
        });
    }

    let mut skills = BTreeMap::<String, SkillEntry>::new();
    let mut visited_dirs = HashSet::<PathBuf>::new();
    collect_skills(root_path, root_path, &mut visited_dirs, &mut skills)?;
    let skills = skills.into_values().collect::<Vec<_>>();

    Ok(SkillsDirectoryDescriptor {
        path: root.to_string(),
        exists: true,
        skill_count: skills.len(),
        skills,
    })
}

fn collect_skills(
    root: &Path,
    current: &Path,
    visited_dirs: &mut HashSet<PathBuf>,
    skills: &mut BTreeMap<String, SkillEntry>,
) -> Result<(), String> {
    let meta = fs::symlink_metadata(current)
        .map_err(|error| format!("failed to inspect {}: {}", current.display(), error))?;

    if meta.is_file() && current.file_name().and_then(|name| name.to_str()) == Some("SKILL.md") {
        let skill_dir = current
            .parent()
            .ok_or_else(|| format!("invalid skill file path: {}", current.display()))?;
        let dir_meta = fs::symlink_metadata(skill_dir)
            .map_err(|error| format!("failed to inspect {}: {}", skill_dir.display(), error))?;
        let key = path_to_string(skill_dir);
        skills.entry(key.clone()).or_insert_with(|| SkillEntry {
            name: skill_dir
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| key.clone()),
            path: key,
            skill_file_path: path_to_string(current),
            is_symlink: dir_meta.file_type().is_symlink(),
            symlink_target: if dir_meta.file_type().is_symlink() {
                fs::read_link(skill_dir)
                    .ok()
                    .map(|target| path_to_string(resolve_symlink_target(skill_dir, &target)))
            } else {
                None
            },
        });
        return Ok(());
    }

    let is_dir = meta.is_dir()
        || (meta.file_type().is_symlink()
            && fs::metadata(current)
                .map(|resolved| resolved.is_dir())
                .unwrap_or(false));
    if !is_dir {
        return Ok(());
    }

    let canonical = fs::canonicalize(current)
        .map_err(|error| format!("failed to resolve {}: {}", current.display(), error))?;
    if !visited_dirs.insert(canonical) {
        return Ok(());
    }

    let mut entries = fs::read_dir(current)
        .map_err(|error| format!("failed to read {}: {}", current.display(), error))?
        .collect::<Result<Vec<_>, io::Error>>()
        .map_err(|error| format!("failed to scan {}: {}", current.display(), error))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        if path.starts_with(root) || symlink_exists(&path) {
            collect_skills(root, &path, visited_dirs, skills)?;
        }
    }

    Ok(())
}

fn find_tool(tool: &str) -> Result<&'static ToolDefinition, String> {
    TOOLS
        .iter()
        .find(|definition| definition.id.eq_ignore_ascii_case(tool))
        .ok_or_else(|| format!("unknown tool: {}", tool))
}

fn resolve_config_file<'a>(
    tool: &'a ToolDefinition,
    config_id: Option<&str>,
    path: Option<&str>,
) -> Result<&'a ConfigFileDefinition, String> {
    if tool.config_files.is_empty() {
        return Err(format!("tool {} does not expose config files", tool.id));
    }

    if let Some(path) = path {
        return tool
            .config_files
            .iter()
            .find(|config| config.path == path)
            .ok_or_else(|| format!("path is not registered for {}: {}", tool.id, path));
    }

    if let Some(config_id) = config_id {
        return tool
            .config_files
            .iter()
            .find(|config| config.id.eq_ignore_ascii_case(config_id))
            .ok_or_else(|| format!("unknown config_id for {}: {}", tool.id, config_id));
    }

    tool.config_files
        .iter()
        .find(|config| config.is_primary)
        .or_else(|| tool.config_files.first())
        .ok_or_else(|| format!("tool {} does not expose config files", tool.id))
}

fn resolve_config_file_by_path(
    path: &str,
) -> Result<(&'static ToolDefinition, &'static ConfigFileDefinition), String> {
    for tool in TOOLS {
        if let Some(config) = tool.config_files.iter().find(|config| config.path == path) {
            return Ok((tool, config));
        }
    }

    Err(format!("path is not registered for any tool: {}", path))
}

fn build_backup_path(path: &Path) -> PathBuf {
    let timestamp = current_timestamp();
    let mut backup = PathBuf::from(path);
    let file_name = path
        .file_name()
        .map(|name| format!("{}.bak.{}", name.to_string_lossy(), timestamp))
        .unwrap_or_else(|| format!("backup.bak.{}", timestamp));
    backup.set_file_name(file_name);
    backup
}

fn current_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn symlink_exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn remove_existing_path(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|error| format!("failed to inspect {}: {}", path.display(), error))?;

    if meta.file_type().is_symlink() || meta.is_file() {
        fs::remove_file(path)
            .map_err(|error| format!("failed to remove {}: {}", path.display(), error))?;
    } else if meta.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("failed to remove {}: {}", path.display(), error))?;
    }

    Ok(())
}

fn build_renamed_target_path(path: &Path) -> PathBuf {
    let timestamp = current_timestamp();
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "skill".to_string());
    let candidate = path.with_file_name(format!("{}.{}", file_name, timestamp));
    if !candidate.exists() && !symlink_exists(&candidate) {
        return candidate;
    }

    for index in 1.. {
        let candidate = path.with_file_name(format!("{}.{}.{}", file_name, timestamp, index));
        if !candidate.exists() && !symlink_exists(&candidate) {
            return candidate;
        }
    }

    unreachable!()
}

fn copy_skill_entry(source: &Path, target: &Path) -> Result<(), String> {
    let mut visited_dirs = HashSet::<PathBuf>::new();
    copy_path_recursive(source, target, &mut visited_dirs)
}

fn copy_path_recursive(
    source: &Path,
    target: &Path,
    visited_dirs: &mut HashSet<PathBuf>,
) -> Result<(), String> {
    let meta = fs::symlink_metadata(source)
        .map_err(|error| format!("failed to inspect {}: {}", source.display(), error))?;
    if meta.file_type().is_symlink() {
        let resolved_meta = fs::metadata(source)
            .map_err(|error| format!("failed to resolve {}: {}", source.display(), error))?;
        if resolved_meta.is_dir() {
            let canonical = fs::canonicalize(source)
                .map_err(|error| format!("failed to resolve {}: {}", source.display(), error))?;
            if !visited_dirs.insert(canonical) {
                return Ok(());
            }

            fs::create_dir_all(target)
                .map_err(|error| format!("failed to create {}: {}", target.display(), error))?;
            let mut entries = fs::read_dir(source)
                .map_err(|error| format!("failed to read {}: {}", source.display(), error))?
                .collect::<Result<Vec<_>, io::Error>>()
                .map_err(|error| format!("failed to scan {}: {}", source.display(), error))?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                copy_path_recursive(&entry.path(), &target.join(entry.file_name()), visited_dirs)?;
            }
            return Ok(());
        }

        copy_regular_file(source, target)?;
        return Ok(());
    }

    if meta.is_dir() {
        let canonical = fs::canonicalize(source)
            .map_err(|error| format!("failed to resolve {}: {}", source.display(), error))?;
        if !visited_dirs.insert(canonical) {
            return Ok(());
        }

        fs::create_dir_all(target)
            .map_err(|error| format!("failed to create {}: {}", target.display(), error))?;
        let mut entries = fs::read_dir(source)
            .map_err(|error| format!("failed to read {}: {}", source.display(), error))?
            .collect::<Result<Vec<_>, io::Error>>()
            .map_err(|error| format!("failed to scan {}: {}", source.display(), error))?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            copy_path_recursive(&entry.path(), &target.join(entry.file_name()), visited_dirs)?;
        }
        return Ok(());
    }

    copy_regular_file(source, target)
}

fn copy_regular_file(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {}", parent.display(), error))?;
    }

    fs::copy(source, target).map_err(|error| {
        format!(
            "failed to copy {} -> {}: {}",
            source.display(),
            target.display(),
            error
        )
    })?;
    Ok(())
}

fn create_symlink_entry(source: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {}", parent.display(), error))?;
    }

    let points_to_dir = fs::metadata(source)
        .map(|meta| meta.is_dir())
        .unwrap_or(false);

    create_platform_symlink(source, target, points_to_dir).map_err(|error| {
        format!(
            "failed to link {} -> {}: {}",
            target.display(),
            source.display(),
            error
        )
    })
}

#[cfg(unix)]
fn create_platform_symlink(source: &Path, target: &Path, _is_dir: bool) -> io::Result<()> {
    std::os::unix::fs::symlink(source, target)
}

#[cfg(windows)]
fn create_platform_symlink(source: &Path, target: &Path, is_dir: bool) -> io::Result<()> {
    if is_dir {
        std::os::windows::fs::symlink_dir(source, target)
    } else {
        std::os::windows::fs::symlink_file(source, target)
    }
}

fn resolve_symlink_target(link_path: &Path, target: &Path) -> PathBuf {
    if target.is_absolute() {
        target.to_path_buf()
    } else {
        link_path
            .parent()
            .map(|parent| parent.join(target))
            .unwrap_or_else(|| target.to_path_buf())
    }
}

fn describe_entry_type(meta: &fs::Metadata) -> String {
    if meta.is_dir() {
        "directory".to_string()
    } else if meta.is_file() {
        "file".to_string()
    } else if meta.file_type().is_symlink() {
        "symlink".to_string()
    } else {
        "other".to_string()
    }
}

enum SyncMode {
    Copy,
    Symlink,
}

impl SyncMode {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Copy => "copy",
            Self::Symlink => "symlink",
        }
    }
}

enum ConflictStrategy {
    Skip,
    Overwrite,
    Rename,
}

impl ConflictStrategy {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Skip => "skip",
            Self::Overwrite => "overwrite",
            Self::Rename => "rename",
        }
    }
}

fn normalize_mode(mode: Option<&str>) -> Result<SyncMode, String> {
    match mode.unwrap_or("copy").to_ascii_lowercase().as_str() {
        "copy" => Ok(SyncMode::Copy),
        "symlink" => Ok(SyncMode::Symlink),
        value => Err(format!("unsupported sync mode: {}", value)),
    }
}

fn normalize_conflict(conflict: Option<&str>) -> Result<ConflictStrategy, String> {
    match conflict.unwrap_or("skip").to_ascii_lowercase().as_str() {
        "skip" => Ok(ConflictStrategy::Skip),
        "overwrite" => Ok(ConflictStrategy::Overwrite),
        "rename" => Ok(ConflictStrategy::Rename),
        value => Err(format!("unsupported conflict strategy: {}", value)),
    }
}
