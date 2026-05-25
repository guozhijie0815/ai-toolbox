use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::types::{
    BackupEntry, ConfigPayload, SaveConfigRequest, SaveConfigResult, current_timestamp,
    metadata_mtime, path_to_string,
};
use crate::utils::ensure_parent_dir;

#[tauri::command]
pub fn read_config_file(path: String) -> Result<ConfigPayload, String> {
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    Ok(ConfigPayload { path, content })
}

#[tauri::command]
pub fn save_config_file(request: SaveConfigRequest) -> Result<SaveConfigResult, String> {
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
pub fn list_config_backups(path: String) -> Result<Vec<BackupEntry>, String> {
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
pub fn open_path_in_finder(path: String) -> Result<(), String> {
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
