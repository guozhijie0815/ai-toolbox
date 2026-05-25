use serde::Deserialize;

use crate::utils::{get_skill_tags, set_skill_tags};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTagsRequest {
    pub skill_name: String,
    pub tags: Vec<String>,
}

#[tauri::command]
pub fn get_skill_tags_command(skill_name: String) -> Result<Vec<String>, String> {
    get_skill_tags(&skill_name)
}

#[tauri::command]
pub fn set_skill_tags_command(request: SkillTagsRequest) -> Result<(), String> {
    set_skill_tags(&request.skill_name, request.tags)
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn update_skill_tags(toolId: String, skillName: String, tags: Vec<String>) -> Result<(), String> {
    let _ = toolId;
    set_skill_tags(&skillName, tags)
}
