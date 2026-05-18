use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// ============================================================================
// 响应类型
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    pub label: String,
    pub path: String,
    pub kind: String,
    pub exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEntry {
    pub name: String,
    pub description: Option<String>,
    pub full_description: Option<String>,
    pub summary: Option<String>,
    pub path: String,
    pub has_skill_md: bool,
    pub is_symlink: bool,
    pub link_target: Option<String>,
    pub updated_at: Option<u64>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolEntry {
    pub id: String,
    pub name: String,
    pub config_files: Vec<ConfigFile>,
    pub skill_dir: Option<String>,
    pub skills: Vec<SkillEntry>,
    #[serde(default)]
    pub is_system: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPayload {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigResult {
    pub path: String,
    pub backup_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub name: String,
    pub updated_at: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDiff {
    pub file_name: String,
    pub diff_type: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaggingToolInfo {
    pub tool_id: String,
    pub tool_name: String,
    pub behind_seconds: u64,
    pub diffs: Vec<SkillDiff>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInsightEntry {
    pub skill_name: String,
    pub leader_tool_id: String,
    pub leader_tool_name: String,
    pub leader_updated_at: u64,
    pub lagging_tools: Vec<LaggingToolInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillOutcome {
    pub source_tool_id: String,
    pub source_skill: String,
    pub target_tool_id: String,
    pub target_path: String,
    pub status: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetSkill {
    pub skill_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetEntry {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub skills: Vec<PresetSkill>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserToolConfigFile {
    pub label: String,
    pub path: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserToolSpec {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub config_files: Vec<UserToolConfigFile>,
    pub skill_dir: Option<String>,
    #[serde(default)]
    pub is_system: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRegistryEntry {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub config_files: Vec<ConfigFile>,
    pub skill_dir: Option<String>,
    #[serde(default)]
    pub is_system: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectToolPathsResult {
    pub config_files: Vec<ConfigFile>,
    pub skill_dir: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetailPayload {
    pub skill_name: String,
    pub skill_md_content: Option<String>,
    pub readme_content: Option<String>,
}

// ============================================================================
// Git Version Management
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillInfo {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub has_skill_md: bool,
    pub updated_at: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSpaceInfo {
    pub project_path: String,
    pub skills: Vec<ProjectSkillInfo>,
    pub global_only_skills: Vec<String>,
    pub project_only_skills: Vec<String>,
    pub shared_skills: Vec<String>,
}

// ============================================================================
// Git Version Management
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: u64,
}

// ============================================================================
// Git Skill Update Detection
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSkillUpdateInfo {
    pub skill_name: String,
    pub has_update: bool,
    pub local_hash: String,
    pub remote_hash: String,
    pub last_checked_at: Option<u64>,
}

// ============================================================================
// 请求类型
// ============================================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigRequest {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillsRequest {
    pub source_tool_id: String,
    pub skill_names: Vec<String>,
    pub target_tool_ids: Vec<String>,
    pub mode: String,
    pub conflict_policy: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSkillRequest {
    pub tool_id: String,
    pub skill_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTagsRequest {
    pub tool_id: String,
    pub skill_name: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPresetRequest {
    pub id: Option<String>,
    pub name: String,
    pub icon: Option<String>,
    pub skills: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePresetRequest {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyPresetRequest {
    pub preset_id: String,
    pub target_tool_ids: Vec<String>,
    pub mode: String,
    pub conflict_policy: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSkillFromGitRequest {
    pub git_url: String,
    pub target_tool_id: String,
    pub skill_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertToolRequest {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub config_files: Vec<UserToolConfigFile>,
    pub skill_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteToolRequest {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectToolPathsRequest {
    pub id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectSkillsRequest {
    pub project_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSkillToProjectRequest {
    pub skill_name: String,
    pub project_path: String,
    pub source_tool_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSkillFromProjectRequest {
    pub skill_name: String,
    pub project_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSkillFromProjectRequest {
    pub skill_name: String,
    pub project_path: String,
    pub target_tool_id: String,
    pub mode: String,
    pub conflict_policy: String,
}

// ============================================================================
// 工具函数
// ============================================================================

pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn metadata_mtime(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

pub fn sanitize_skill_name(value: &str) -> Result<String, String> {
    if value.is_empty() || value == "." || value == ".." || value.contains('/') {
        return Err(format!("invalid skill name: {value}"));
    }
    Ok(value.to_string())
}

pub fn normalize_tool_id(id: &str) -> String {
    id.trim()
        .to_lowercase()
        .replace([' ', '/', '\\', ':'], "-")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect::<String>()
}

pub fn read_skill_descriptions(skill_md: &Path) -> (Option<String>, Option<String>, Option<String>) {
    let Ok(content) = std::fs::read_to_string(skill_md) else {
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
