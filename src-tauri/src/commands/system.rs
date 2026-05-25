#[tauri::command]
pub fn healthcheck() -> &'static str {
    "ok"
}
