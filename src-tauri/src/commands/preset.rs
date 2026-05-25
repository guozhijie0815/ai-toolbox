use crate::db::get_db;
use crate::store;
use crate::types::{self, PresetEntry};

#[tauri::command]
pub fn list_presets_command() -> Result<Vec<PresetEntry>, String> {
    let db = get_db()?;
    store::preset_store::list_presets(db)
}

#[tauri::command]
pub fn save_preset_command(request: types::UpsertPresetRequest) -> Result<PresetEntry, String> {
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
pub fn delete_preset_command(request: types::DeletePresetRequest) -> Result<(), String> {
    let db = get_db()?;
    store::preset_store::delete_preset(db, &request.id)
}
