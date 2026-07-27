use std::path::Path;

use crate::types::{
    path_to_string, ConfigFile, DeleteToolRequest, DetectToolPathsRequest, DetectToolPathsResult,
    LaggingToolInfo, SkillInsightEntry, ToolEntry, ToolRegistryEntry, UpsertToolRequest,
};
use crate::utils::{
    build_tool_entry_from_user, compare_skill_folders, detect_tool_paths_from_name, expand_path,
    get_home_dir, load_tool_registry, sanitize_upsert_request, save_tool_registry,
};

fn registry_config_files(files: &[crate::types::UserToolConfigFile]) -> Vec<ConfigFile> {
    files
        .iter()
        .map(|file| {
            let abs = expand_path(&file.path)
                .map(|p| path_to_string(&p))
                .unwrap_or_else(|_| file.path.clone());
            ConfigFile {
                label: file.label.clone(),
                path: abs.clone(),
                kind: file.kind.clone(),
                exists: Path::new(&abs).exists(),
            }
        })
        .collect()
}

#[tauri::command]
pub fn get_home_dir_path() -> Result<String, String> {
    get_home_dir().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_tools() -> Result<Vec<ToolEntry>, String> {
    let items = load_tool_registry()?;
    Ok(items
        .iter()
        .filter(|item| item.enabled)
        .map(build_tool_entry_from_user)
        .collect())
}

#[tauri::command]
pub fn get_skill_insights() -> Result<Vec<SkillInsightEntry>, String> {
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
pub fn list_tool_registry() -> Result<Vec<ToolRegistryEntry>, String> {
    let items = load_tool_registry()?;
    Ok(items
        .iter()
        .map(|item| ToolRegistryEntry {
            id: item.id.clone(),
            name: item.name.clone(),
            enabled: item.enabled,
            config_files: registry_config_files(&item.config_files),
            skill_dir: item.skill_dir.clone(),
            is_system: item.is_system,
        })
        .collect())
}

#[tauri::command]
pub fn upsert_tool_registry_item(request: UpsertToolRequest) -> Result<ToolRegistryEntry, String> {
    let next = sanitize_upsert_request(request)?;
    let mut items = load_tool_registry()?;
    if let Some(index) = items.iter().position(|item| item.id == next.id) {
        if items[index].is_system {
            return Err("系统工具不能修改".to_string());
        }
        items[index] = crate::types::UserToolSpec {
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
        config_files: registry_config_files(&next.config_files),
        skill_dir: next.skill_dir,
        is_system: false,
    })
}

#[tauri::command]
pub fn delete_tool_registry_item(request: DeleteToolRequest) -> Result<String, String> {
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
pub fn detect_tool_paths(request: DetectToolPathsRequest) -> Result<DetectToolPathsResult, String> {
    let lookup = request
        .id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(request.name.as_deref())
        .unwrap_or("");
    Ok(detect_tool_paths_from_name(lookup))
}
