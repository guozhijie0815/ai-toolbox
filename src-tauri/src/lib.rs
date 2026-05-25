mod types;
mod db;
mod store;
mod central_repo;
mod file_watcher;
mod claude_config;
mod toolbox;
mod utils;
mod commands;

use std::path::PathBuf;
use std::sync::Arc;

use db::init_db_pool;
use utils::{cleanup_legacy_system_tools, get_home_dir, load_tool_registry};

use commands::center_repo_cmd::{
    batch_import_to_center, batch_sync_from_center, delete_center_skill_command,
    discover_center_skills, list_center_skills, set_skill_category,
};
use commands::claude_config_cmd::{
    apply_claude_config_full_sync, get_claude_config_diff, list_claude_settings_snapshots,
    restore_cswitch_db_from_backup,
};
use commands::config::{
    list_config_backups, open_path_in_finder, read_config_file, save_config_file,
};
use commands::preset::{delete_preset_command, list_presets_command, save_preset_command};
use commands::skill::{delete_skill, get_skill_detail, sync_skills, toggle_skill_enabled};
use commands::system::healthcheck;
use commands::tag::{get_skill_tags_command, set_skill_tags_command, update_skill_tags};
use commands::tool::{
    delete_tool_registry_item, detect_tool_paths, get_home_dir_path, get_skill_insights,
    list_tool_registry, list_tools, upsert_tool_registry_item,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化数据库
    if let Err(e) = init_db_pool() {
        eprintln!("数据库初始化失败: {}", e);
    }

    // 清理旧版本注入的伪系统工具（一次性迁移）
    if let Err(e) = cleanup_legacy_system_tools() {
        eprintln!("清理旧系统工具失败: {}", e);
    }

    let watcher_handle = Arc::new(file_watcher::FileWatcherHandle::new());

    tauri::Builder::default()
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 启动文件监控
            if let Ok(tools) = load_tool_registry() {
                let mut watch_paths: Vec<PathBuf> = tools
                    .into_iter()
                    .filter(|t| t.enabled)
                    .filter_map(|t| t.skill_dir.map(PathBuf::from))
                    .filter(|p| p.exists())
                    .collect();

                // 追加 Claude Code Config Sync 监听的两个路径
                if let Ok(home) = get_home_dir() {
                    for extra in [
                        home.join(".claude/settings.json"),
                        home.join(".cc-switch/cc-switch.db"),
                    ] {
                        if extra.exists() {
                            watch_paths.push(extra);
                        }
                    }
                }

                // 启动期做一次种子快照
                let _ = claude_config::snapshot_settings_if_changed();

                if !watch_paths.is_empty() {
                    let app_handle = app.handle().clone();
                    if let Err(e) = file_watcher::start_file_watcher(
                        app_handle,
                        watcher_handle.clone(),
                        watch_paths,
                    ) {
                        log::warn!("启动文件监控失败: {}", e);
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            get_home_dir_path,
            list_tools,
            get_skill_insights,
            list_tool_registry,
            upsert_tool_registry_item,
            delete_tool_registry_item,
            detect_tool_paths,
            read_config_file,
            save_config_file,
            list_config_backups,
            open_path_in_finder,
            sync_skills,
            delete_skill,
            toggle_skill_enabled,
            get_skill_tags_command,
            set_skill_tags_command,
            update_skill_tags,
            get_skill_detail,
            list_presets_command,
            save_preset_command,
            delete_preset_command,
            list_center_skills,
            delete_center_skill_command,
            discover_center_skills,
            batch_import_to_center,
            batch_sync_from_center,
            set_skill_category,
            // Claude Code Config Sync
            get_claude_config_diff,
            apply_claude_config_full_sync,
            list_claude_settings_snapshots,
            restore_cswitch_db_from_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
