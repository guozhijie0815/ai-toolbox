use md5::{Digest, Md5};
use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SETTINGS_PATH: &str = "/Users/smzdm/.claude/settings.json";
const CSWITCH_DB_PATH: &str = "/Users/smzdm/.cc-switch/cc-switch.db";
const CSWITCH_BACKUP_DIR: &str = "/Users/smzdm/.cc-switch/backups";
const SNAPSHOT_DIR: &str = "/Users/smzdm/.ai-toolbox/snapshots/claude-settings";
const COMMON_CONFIG_KEY: &str = "common_config_claude";
const MAX_SNAPSHOTS: usize = 50;

const EXCLUDE_FIELDS: &[&str] = &["env", "model", "apiKeyHelper"];

fn is_excluded(key: &str) -> bool {
    EXCLUDE_FIELDS.contains(&key)
}

// ============================================================================
// 类型定义
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum BaselineKind {
    Live,
    Richest,
    Snapshot { ts: u64 },
}

impl Default for BaselineKind {
    fn default() -> Self {
        BaselineKind::Live
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConfigDiffType {
    Missing,
    Different,
    Same,
    OnlyInCcSwitch,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueKind {
    Scalar,
    Object,
    Array,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDiffEntry {
    pub field: String,
    pub settings_value: Option<Value>,
    pub cswitch_value: Option<Value>,
    pub diff_type: ConfigDiffType,
    pub value_kind: ValueKind,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub ts: u64,
    pub path: String,
    pub hash: String,
    pub field_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfigDiffResult {
    pub entries: Vec<ConfigDiffEntry>,
    pub baseline_kind: BaselineKind,
    pub baseline_path: Option<String>,
    pub cswitch_db_path: String,
    pub cswitch_locked: bool,
    pub snapshots: Vec<SnapshotMeta>,
    pub settings_path: String,
    pub needs_sync: bool,
    pub excluded_fields: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeConfigSyncResult {
    pub backup_path: String,
    pub applied_fields: Vec<String>,
}

// ============================================================================
// 工具函数
// ============================================================================

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn md5_hex(data: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(data);
    let digest = hasher.finalize();
    digest.iter().map(|b| format!("{:02x}", b)).collect()
}

fn classify_value_kind(v: &Value) -> ValueKind {
    match v {
        Value::Array(_) => ValueKind::Array,
        Value::Object(_) => ValueKind::Object,
        _ => ValueKind::Scalar,
    }
}

fn read_json_as_map(path: &Path) -> Result<Map<String, Value>, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    match value {
        Value::Object(m) => Ok(m),
        _ => Err("JSON 根不是对象".to_string()),
    }
}

// ============================================================================
// 快照管理
// ============================================================================

pub fn list_snapshots() -> Result<Vec<SnapshotMeta>, String> {
    let dir = PathBuf::from(SNAPSHOT_DIR);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut metas: Vec<SnapshotMeta> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) if n.ends_with(".json") => n,
            _ => continue,
        };
        // 文件名格式 {ts}-{hash8}.json
        let stem = name.trim_end_matches(".json");
        let mut parts = stem.splitn(2, '-');
        let ts: u64 = match parts.next().and_then(|s| s.parse().ok()) {
            Some(v) => v,
            None => continue,
        };
        let hash = parts.next().unwrap_or("").to_string();
        let field_count = match fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<Value>(&content) {
                Ok(Value::Object(m)) => m.len(),
                _ => 0,
            },
            Err(_) => 0,
        };
        metas.push(SnapshotMeta {
            ts,
            path: path.to_string_lossy().to_string(),
            hash,
            field_count,
        });
    }
    metas.sort_by(|a, b| b.ts.cmp(&a.ts));
    Ok(metas)
}

pub fn snapshot_settings_if_changed() -> Result<Option<PathBuf>, String> {
    let settings_path = PathBuf::from(SETTINGS_PATH);
    if !settings_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let hash = md5_hex(content.as_bytes());
    let hash8 = &hash[..8.min(hash.len())];

    let metas = list_snapshots().unwrap_or_default();
    // 已有相同 hash 跳过
    if metas.iter().any(|m| m.hash.starts_with(hash8)) {
        return Ok(None);
    }

    let dir = PathBuf::from(SNAPSHOT_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = now_unix();
    let target = dir.join(format!("{}-{}.json", ts, hash8));
    fs::write(&target, &content).map_err(|e| e.to_string())?;

    // 淘汰超过上限的旧快照
    let mut all = list_snapshots().unwrap_or_default();
    if all.len() > MAX_SNAPSHOTS {
        all.sort_by(|a, b| a.ts.cmp(&b.ts)); // 旧的在前
        let excess = all.len() - MAX_SNAPSHOTS;
        for old in all.iter().take(excess) {
            let _ = fs::remove_file(&old.path);
        }
    }

    Ok(Some(target))
}

fn pick_baseline(kind: &BaselineKind) -> Result<(Map<String, Value>, Option<String>), String> {
    match kind {
        BaselineKind::Live => {
            let map = read_json_as_map(Path::new(SETTINGS_PATH))?;
            Ok((map, None))
        }
        BaselineKind::Richest => {
            let metas = list_snapshots()?;
            // 优先选 field_count 最多的快照；若并列取时间最新的
            let best = metas
                .into_iter()
                .max_by(|a, b| {
                    a.field_count
                        .cmp(&b.field_count)
                        .then(a.ts.cmp(&b.ts))
                });
            match best {
                Some(meta) => {
                    let content = fs::read_to_string(&meta.path).map_err(|e| e.to_string())?;
                    let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
                    let map = match value {
                        Value::Object(m) => m,
                        _ => return Err("快照内容不是对象".to_string()),
                    };
                    Ok((map, Some(meta.path)))
                }
                None => {
                    // 没有快照，回退 Live
                    let map = read_json_as_map(Path::new(SETTINGS_PATH))?;
                    Ok((map, None))
                }
            }
        }
        BaselineKind::Snapshot { ts } => {
            let metas = list_snapshots()?;
            let target = metas
                .into_iter()
                .find(|m| m.ts == *ts)
                .ok_or_else(|| format!("快照 ts={} 不存在", ts))?;
            let content = fs::read_to_string(&target.path).map_err(|e| e.to_string())?;
            let value: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            let map = match value {
                Value::Object(m) => m,
                _ => return Err("快照内容不是对象".to_string()),
            };
            Ok((map, Some(target.path)))
        }
    }
}

// ============================================================================
// cc-switch 数据库读写
// ============================================================================

fn read_cswitch_common_config() -> Result<Map<String, Value>, String> {
    let db_path = PathBuf::from(CSWITCH_DB_PATH);
    if !db_path.exists() {
        return Err(format!("cc-switch 数据库不存在: {}", CSWITCH_DB_PATH));
    }
    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("打开 cc-switch.db 失败: {}", e))?;

    let value_str: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [COMMON_CONFIG_KEY],
            |row| row.get(0),
        )
        .map_err(|e| format!("读取 common_config_claude 失败: {}", e))?;
    let value: Value = serde_json::from_str(&value_str).map_err(|e| e.to_string())?;
    match value {
        Value::Object(m) => Ok(m),
        _ => Err("common_config_claude 不是对象".to_string()),
    }
}

pub fn check_cswitch_write_lock() -> bool {
    let db_path = PathBuf::from(CSWITCH_DB_PATH);
    if !db_path.exists() {
        return false;
    }
    let conn = match Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_URI,
    ) {
        Ok(c) => c,
        Err(_) => return true, // 打开失败视为锁定
    };
    let _ = conn.busy_timeout(Duration::from_millis(200));
    let res = conn.execute("BEGIN IMMEDIATE", []);
    let locked = res.is_err();
    if !locked {
        let _ = conn.execute("ROLLBACK", []);
    }
    locked
}

fn backup_cswitch_db() -> Result<PathBuf, String> {
    let src = PathBuf::from(CSWITCH_DB_PATH);
    let dir = PathBuf::from(CSWITCH_BACKUP_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = now_unix();
    let dst = dir.join(format!("cc-switch.db.aitoolbox-bak.{}", ts));

    let src_conn = Connection::open_with_flags(
        &src,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("打开源 db 失败: {}", e))?;
    let mut dst_conn = Connection::open(&dst).map_err(|e| format!("创建备份 db 失败: {}", e))?;
    {
        let backup = Backup::new(&src_conn, &mut dst_conn).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(100, Duration::from_millis(50), None)
            .map_err(|e| format!("备份失败: {}", e))?;
    }
    Ok(dst)
}

fn write_cswitch_common_config(merged: &Map<String, Value>) -> Result<(), String> {
    let db_path = PathBuf::from(CSWITCH_DB_PATH);
    let conn = Connection::open_with_flags(
        &db_path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("打开 cc-switch.db 失败: {}", e))?;
    let _ = conn.busy_timeout(Duration::from_secs(3));

    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| format!("获取写锁失败（cc-switch 可能正在运行）: {}", e))?;

    let value_str = serde_json::to_string_pretty(&Value::Object(merged.clone()))
        .map_err(|e| e.to_string())?;
    let res = conn.execute(
        "UPDATE settings SET value = ?1 WHERE key = ?2",
        rusqlite::params![value_str, COMMON_CONFIG_KEY],
    );

    match res {
        Ok(_) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(format!("写入 common_config_claude 失败: {}", e))
        }
    }
}

// ============================================================================
// Diff 计算
// ============================================================================

fn compute_diff(
    baseline: &Map<String, Value>,
    cswitch: &Map<String, Value>,
) -> Vec<ConfigDiffEntry> {
    let mut keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    keys.extend(baseline.keys().cloned());
    keys.extend(cswitch.keys().cloned());

    let mut entries = Vec::new();
    for key in keys {
        // EXCLUDE_FIELDS（env/model/apiKeyHelper）是 provider 私有，不参与对比
        if is_excluded(&key) {
            continue;
        }
        let s_val = baseline.get(&key);
        let c_val = cswitch.get(&key);
        let diff_type = match (s_val, c_val) {
            (Some(s), Some(c)) if s == c => ConfigDiffType::Same,
            (Some(_), Some(_)) => ConfigDiffType::Different,
            (Some(_), None) => ConfigDiffType::Missing,
            (None, Some(_)) => ConfigDiffType::OnlyInCcSwitch,
            (None, None) => continue,
        };
        let value_kind = s_val
            .map(classify_value_kind)
            .unwrap_or_else(|| c_val.map(classify_value_kind).unwrap_or(ValueKind::Scalar));
        entries.push(ConfigDiffEntry {
            field: key,
            settings_value: s_val.cloned(),
            cswitch_value: c_val.cloned(),
            diff_type,
            value_kind,
        });
    }
    entries
}

// ============================================================================
// 对外 API
// ============================================================================

pub fn get_claude_config_diff(baseline_kind: BaselineKind) -> Result<ClaudeConfigDiffResult, String> {
    // 启动时机会被反复调用；每次先尝试做一次快照
    let _ = snapshot_settings_if_changed();

    let (baseline_map, baseline_path) = pick_baseline(&baseline_kind)?;
    let cswitch_map = read_cswitch_common_config().unwrap_or_default();
    let entries = compute_diff(&baseline_map, &cswitch_map);
    let cswitch_locked = check_cswitch_write_lock();
    let snapshots = list_snapshots().unwrap_or_default();

    let needs_sync = entries.iter().any(|e| {
        matches!(
            e.diff_type,
            ConfigDiffType::Missing | ConfigDiffType::Different
        )
    });

    Ok(ClaudeConfigDiffResult {
        entries,
        baseline_kind,
        baseline_path,
        cswitch_db_path: CSWITCH_DB_PATH.to_string(),
        cswitch_locked,
        snapshots,
        settings_path: SETTINGS_PATH.to_string(),
        needs_sync,
        excluded_fields: EXCLUDE_FIELDS.iter().map(|s| s.to_string()).collect(),
    })
}

/// 整段同步：把 settings.json（baseline）中除 EXCLUDE_FIELDS 之外的所有字段
/// 整体覆盖到 cc-switch 公共配置；cc-switch 中 EXCLUDE_FIELDS 字段的原值保留；
/// cc-switch 独有的非 EXCLUDE 字段也保留（即 permissive merge）。
pub fn apply_claude_config_full_sync(
    baseline_kind: BaselineKind,
) -> Result<ClaudeConfigSyncResult, String> {
    let (baseline_map, _) = pick_baseline(&baseline_kind)?;
    let cswitch_map = read_cswitch_common_config().unwrap_or_default();

    // 起点：cswitch 现有公共配置（保留独有字段 + EXCLUDE 字段原值）
    let mut merged = cswitch_map.clone();
    let mut applied = Vec::new();

    // 用 baseline 的非 EXCLUDE 字段覆盖
    for (k, v) in &baseline_map {
        if is_excluded(k) {
            continue;
        }
        if cswitch_map.get(k) != Some(v) {
            applied.push(k.clone());
        }
        merged.insert(k.clone(), v.clone());
    }

    if applied.is_empty() {
        return Err("无需同步：两边非排除字段已一致".to_string());
    }

    let backup_path = backup_cswitch_db()?;
    write_cswitch_common_config(&merged)?;

    Ok(ClaudeConfigSyncResult {
        backup_path: backup_path.to_string_lossy().to_string(),
        applied_fields: applied,
    })
}

pub fn restore_cswitch_db_from_backup(backup_path: String) -> Result<(), String> {
    let src = PathBuf::from(&backup_path);
    if !src.exists() {
        return Err(format!("备份文件不存在: {}", backup_path));
    }

    let dst = PathBuf::from(CSWITCH_DB_PATH);
    let src_conn = Connection::open_with_flags(
        &src,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("打开备份 db 失败: {}", e))?;
    let mut dst_conn = Connection::open_with_flags(
        &dst,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("打开 cc-switch.db 失败: {}", e))?;
    let _ = dst_conn.busy_timeout(Duration::from_secs(3));
    {
        let backup = Backup::new(&src_conn, &mut dst_conn).map_err(|e| e.to_string())?;
        backup
            .run_to_completion(100, Duration::from_millis(50), None)
            .map_err(|e| format!("还原失败: {}", e))?;
    }
    Ok(())
}
