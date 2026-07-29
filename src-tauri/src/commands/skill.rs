use std::fs;
use serde::Deserialize;

use crate::db::get_db;
use crate::types::{
    DeleteSkillRequest, SkillDetailPayload, SyncSkillOutcome, SyncSkillsRequest,
    path_to_string, sanitize_skill_name,
};
use crate::utils::{
    copy_dir_recursive, expand_path, load_tool_registry, registry_tool_by_id, remove_existing_path,
    resolve_source_dir, with_conflict_policy,
};

#[tauri::command]
pub fn sync_skills(request: SyncSkillsRequest) -> Result<Vec<SyncSkillOutcome>, String> {
    let registry = load_tool_registry()?;
    let source_tool = registry_tool_by_id(&registry, &request.source_tool_id)
        .ok_or_else(|| format!("unknown source tool: {}", request.source_tool_id))?;
    let source_root = expand_path(
        source_tool
            .skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", source_tool.id))?,
    )?;

    let mut outcomes = Vec::new();
    for target_tool_id in &request.target_tool_ids {
        let target_tool = registry_tool_by_id(&registry, target_tool_id)
            .ok_or_else(|| format!("unknown target tool: {target_tool_id}"))?;
        let target_root = expand_path(
            target_tool
                .skill_dir
                .as_deref()
                .ok_or_else(|| format!("tool {} has no skill directory", target_tool.id))?,
        )?;

        fs::create_dir_all(&target_root).map_err(|err| err.to_string())?;

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
pub fn delete_skill(request: DeleteSkillRequest) -> Result<String, String> {
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &request.tool_id)
        .ok_or_else(|| format!("unknown tool: {}", request.tool_id))?;
    let skill_root = expand_path(
        tool.skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", tool.id))?,
    )?;
    let skill_name = sanitize_skill_name(&request.skill_name)?;
    let skill_path = skill_root.join(&skill_name);

    if !skill_path.exists() && fs::symlink_metadata(&skill_path).is_err() {
        return Err(format!("skill {} does not exist", skill_name));
    }

    remove_existing_path(&skill_path)?;
    Ok(format!("已删除 {}", skill_name))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleSkillEnabledRequest {
    pub tool_id: String,
    pub skill_name: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn toggle_skill_enabled(request: ToggleSkillEnabledRequest) -> Result<(), String> {
    let db = get_db()?;
    let registry = load_tool_registry()?;
    let tool = registry_tool_by_id(&registry, &request.tool_id)
        .ok_or_else(|| format!("unknown tool: {}", request.tool_id))?;
    let skill_root = expand_path(
        tool
            .skill_dir
            .as_deref()
            .ok_or_else(|| format!("tool {} has no skill directory", tool.id))?,
    )?;
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
pub fn get_skill_detail(tool_id: String, skill_name: String) -> Result<SkillDetailPayload, String> {
    let registry = load_tool_registry()?;
    let tool = registry
        .iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| format!("工具 {} 不存在", tool_id))?;
    let skill_dir = tool
        .skill_dir
        .as_ref()
        .ok_or_else(|| format!("工具 {} 没有技能目录", tool_id))?;
    // 与列表扫描保持一致，注册表中允许用 ~/ 保存技能目录。
    let skill_root = expand_path(skill_dir)?;
    let skill_name = sanitize_skill_name(&skill_name)?;
    let skill_path = skill_root.join(&skill_name);
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
