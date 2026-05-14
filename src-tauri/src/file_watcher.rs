use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct FileWatcherHandle {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    watched_paths: Arc<Mutex<Vec<PathBuf>>>,
}

impl FileWatcherHandle {
    pub fn new() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
            watched_paths: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

/// 启动文件监控，监听指定路径的技能目录
pub fn start_file_watcher(
    app: AppHandle,
    handle: Arc<FileWatcherHandle>,
    watch_paths: Vec<PathBuf>,
) -> Result<(), String> {
    // 保存监控路径
    {
        let mut paths = handle
            .watched_paths
            .lock()
            .map_err(|e| e.to_string())?;
        *paths = watch_paths.clone();
    }

    // 创建 watcher
    let app_for_event = app.clone();
    let app_for_debounce = app.clone();
    let watcher_handle = handle.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // 过滤掉临时文件和日志文件
                let relevant = event.paths.iter().any(|p| {
                    let s = p.to_string_lossy();
                    !s.ends_with("~")
                        && !s.ends_with(".tmp")
                        && !s.ends_with(".swp")
                        && !s.ends_with(".bak")
                        && !s.contains("/node_modules/")
                        && !s.contains("/.git/")
                });

                if relevant {
                    // 500ms 去抖动
                    let app = app_for_debounce.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(500));
                        let _ = app.emit("app-files-changed", ());
                    });
                }
            }
        },
        Config::default()
            .with_poll_interval(Duration::from_secs(3))
            .with_compare_contents(false),
    )
    .map_err(|e| format!("创建文件监控失败: {}", e))?;

    let mut watcher_guard = watcher_handle
        .watcher
        .lock()
        .map_err(|e| e.to_string())?;
    *watcher_guard = Some(watcher);

    // 注册监控路径
    drop(watcher_guard);
    let mut watcher_guard = handle
        .watcher
        .lock()
        .map_err(|e| e.to_string())?;

    if let Some(ref mut w) = *watcher_guard {
        for path in &watch_paths {
            if path.exists() {
                if let Err(e) = w.watch(path, RecursiveMode::Recursive) {
                    log::warn!("无法监控路径 {}: {}", path.display(), e);
                }
            }
        }
    }

    log::info!("文件监控已启动，监控 {} 个路径", watch_paths.len());
    Ok(())
}

/// 更新监控路径列表
pub fn update_watch_paths(
    handle: Arc<FileWatcherHandle>,
    new_paths: Vec<PathBuf>,
) -> Result<(), String> {
    let mut paths = handle
        .watched_paths
        .lock()
        .map_err(|e| e.to_string())?;
    *paths = new_paths;
    Ok(())
}

/// 获取当前监控的路径列表
pub fn get_watched_paths(handle: Arc<FileWatcherHandle>) -> Result<Vec<PathBuf>, String> {
    let paths = handle
        .watched_paths
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(paths.clone())
}
