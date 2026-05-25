use crate::claude_config;

#[tauri::command]
pub fn get_claude_config_diff(
    baseline: Option<claude_config::BaselineKind>,
) -> Result<claude_config::ClaudeConfigDiffResult, String> {
    let kind = baseline.unwrap_or_default();
    claude_config::get_claude_config_diff(kind)
}

#[tauri::command]
pub fn apply_claude_config_full_sync(
    baseline: Option<claude_config::BaselineKind>,
) -> Result<claude_config::ClaudeConfigSyncResult, String> {
    let kind = baseline.unwrap_or_default();
    claude_config::apply_claude_config_full_sync(kind)
}

#[tauri::command]
pub fn list_claude_settings_snapshots() -> Result<Vec<claude_config::SnapshotMeta>, String> {
    claude_config::list_snapshots()
}

#[tauri::command]
pub fn restore_cswitch_db_from_backup(backup_path: String) -> Result<(), String> {
    claude_config::restore_cswitch_db_from_backup(backup_path)
}
