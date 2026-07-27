use std::path::Path;

use crate::central_repo;
use crate::db::get_db;
use crate::store;
use crate::utils::{expand_path, load_tool_registry, registry_tool_by_id, resolve_skill_dir};

#[tauri::command]
pub fn list_center_skills() -> Result<Vec<central_repo::CenterSkillInfo>, String> {
    let mut skills = central_repo::scan_center_skills()?;
    let db = get_db()?;
    let registry = load_tool_registry()?;
    let tools: Vec<(String, String, String)> = registry
        .iter()
        .filter(|t| t.enabled)
        .filter_map(|t| {
            t.skill_dir.as_ref().and_then(|dir| {
                expand_path(dir)
                    .ok()
                    .map(|abs| (t.id.clone(), t.name.clone(), abs.to_string_lossy().into_owned()))
            })
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
            Some("system") => "system".to_string(),
            Some("custom") => "custom".to_string(),
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
pub fn set_skill_category(skill_name: String, category: String) -> Result<(), String> {
    if !matches!(category.as_str(), "custom" | "git" | "system") {
        return Err(format!("不支持的技能来源分类: {}", category));
    }
    let db = get_db()?;
    store::center_skill_store::set_skill_source_type(db, &skill_name, &category)
}

#[tauri::command]
pub fn batch_sync_from_center(
    skill_names: Vec<String>,
    target_tool_id: String,
    mode: String,
    conflict_policy: String,
) -> Result<Vec<central_repo::SyncOutcome>, String> {
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &target_tool_id)
        .ok_or_else(|| format!("未知工具: {}", target_tool_id))?;
    let skill_dir = resolve_skill_dir(
        tool
            .skill_dir
            .as_deref()
            .ok_or_else(|| format!("工具 {} 没有技能目录", target_tool_id))?,
    )?;
    let skill_dir_str = skill_dir.to_string_lossy().into_owned();

    let mut outcomes = Vec::new();
    for skill_name in skill_names {
        match central_repo::sync_skill_to_tool(&skill_name, &skill_dir_str, &mode, &conflict_policy) {
            Ok(outcome) => outcomes.push(outcome),
            Err(e) => outcomes.push(central_repo::SyncOutcome {
                skill_name,
                target_tool_id: target_tool_id.clone(),
                target_path: skill_dir_str.clone(),
                status: "error".to_string(),
                message: e,
            }),
        }
    }
    Ok(outcomes)
}

#[tauri::command]
pub fn delete_center_skill_command(skill_name: String) -> Result<String, String> {
    central_repo::delete_center_skill(&skill_name)
}

#[tauri::command]
pub fn discover_center_skills() -> Result<Vec<central_repo::DiscoveredSkill>, String> {
    let registry = load_tool_registry()?;
    central_repo::discover_skills_from_tools(registry.as_slice())
}

#[tauri::command]
pub fn batch_import_to_center(
    request: Vec<central_repo::ImportSkillRequest>,
) -> Result<Vec<central_repo::ImportOutcome>, String> {
    let db = get_db()?;
    let registry = load_tool_registry()?;
    central_repo::batch_import_skills_to_center(db, registry.as_slice(), request.as_slice())
}
