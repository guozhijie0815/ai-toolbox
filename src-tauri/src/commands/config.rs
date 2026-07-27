use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::types::{
    metadata_mtime, path_to_string, BackupEntry, ConfigPayload, SaveConfigRequest, SaveConfigResult,
};
use crate::utils::{ensure_parent_dir, expand_path};

#[tauri::command]
pub fn read_config_file(path: String) -> Result<ConfigPayload, String> {
    let abs = expand_path(&path)?;
    let abs_str = path_to_string(&abs);
    if !abs.exists() {
        // 文件尚未创建：返回空内容，允许用户新建保存
        return Ok(ConfigPayload {
            path: abs_str,
            content: String::new(),
        });
    }
    let content = fs::read_to_string(&abs).map_err(|err| err.to_string())?;
    Ok(ConfigPayload {
        path: abs_str,
        content,
    })
}

#[tauri::command]
pub fn save_config_file(request: SaveConfigRequest) -> Result<SaveConfigResult, String> {
    let path = expand_path(&request.path)?;
    let abs_str = path_to_string(&path);
    ensure_parent_dir(&path)?;
    // 按产品要求：直接覆盖写入，不生成 .bak 备份文件
    fs::write(&path, request.content).map_err(|err| err.to_string())?;

    Ok(SaveConfigResult {
        path: abs_str,
        backup_path: String::new(),
    })
}

#[tauri::command]
pub fn list_config_backups(path: String) -> Result<Vec<BackupEntry>, String> {
    let target = expand_path(&path)?;
    let parent = target
        .parent()
        .ok_or_else(|| format!("missing parent directory for {}", path))?;
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("invalid file name for {}", path))?;
    let prefix = format!("{file_name}.bak.");

    if !parent.exists() {
        return Ok(Vec::new());
    }

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
    let target = expand_path(&path).unwrap_or_else(|_| PathBuf::from(&path));
    let mut command = Command::new("open");

    if target.exists() && target.is_file() {
        command.arg("-R").arg(&target);
    } else if target.exists() {
        command.arg(&target);
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| format!("missing parent directory for {}", path))?;
        if parent.exists() {
            command.arg(parent);
        } else {
            return Err(format!("路径不存在: {}", path));
        }
    }

    command
        .status()
        .map_err(|err| err.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("failed to open finder for {}", path))
            }
        })
}
