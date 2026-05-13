use rusqlite::{Connection, Result as SqlResult};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub struct DbPool {
    conn: Mutex<Connection>,
}

impl DbPool {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        let pool = Self {
            conn: Mutex::new(conn),
        };
        pool.init_schema()?;
        Ok(pool)
    }

    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        let pool = Self {
            conn: Mutex::new(conn),
        };
        pool.init_schema()?;
        Ok(pool)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA_V1).map_err(|e| e.to_string())?;
        Self::migrate_add_is_system(&conn)?;
        Ok(())
    }

    fn migrate_add_is_system(conn: &Connection) -> Result<(), String> {
        let has_column: bool = conn
            .prepare("SELECT 1 FROM pragma_table_info('tools') WHERE name='is_system'")
            .and_then(|mut stmt| stmt.exists([]))
            .map_err(|e| e.to_string())?;
        if !has_column {
            conn.execute(
                "ALTER TABLE tools ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn with_conn<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut Connection) -> Result<R, String>,
    {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        f(&mut conn)
    }
}

const SCHEMA_V1: &str = r#"
-- 工具注册表
CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    skill_dir TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 工具配置文件
CREATE TABLE IF NOT EXISTS tool_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_id TEXT NOT NULL,
    label TEXT NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'plaintext',
    FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE
);

-- 技能标签
CREATE TABLE IF NOT EXISTS skill_tags (
    skill_name TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (skill_name, tag)
);

-- 预设
CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 预设技能
CREATE TABLE IF NOT EXISTS preset_skills (
    preset_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    PRIMARY KEY (preset_id, skill_name),
    FOREIGN KEY (preset_id) REFERENCES presets(id) ON DELETE CASCADE
);

-- 中央仓库技能
CREATE TABLE IF NOT EXISTS center_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL, -- 'git', 'local', 'zip', 'market'
    source_url TEXT,
    description TEXT,
    installed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version TEXT
);

-- 中央仓库技能标签关联
CREATE TABLE IF NOT EXISTS center_skill_tags (
    skill_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (skill_id, tag),
    FOREIGN KEY (skill_id) REFERENCES center_skills(id) ON DELETE CASCADE
);

-- 同步记录
CREATE TABLE IF NOT EXISTS sync_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    source_tool_id TEXT,
    target_tool_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    synced_at INTEGER NOT NULL
);

-- 技能停用记录
CREATE TABLE IF NOT EXISTS skill_disabled (
    tool_id TEXT NOT NULL,
    skill_name TEXT NOT NULL,
    disabled_at INTEGER NOT NULL,
    PRIMARY KEY (tool_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_tool_configs_tool_id ON tool_configs(tool_id);
CREATE INDEX IF NOT EXISTS idx_skill_tags_skill ON skill_tags(skill_name);
CREATE INDEX IF NOT EXISTS idx_preset_skills_preset ON preset_skills(preset_id);
CREATE INDEX IF NOT EXISTS idx_center_skill_tags_skill ON center_skill_tags(skill_id);
CREATE INDEX IF NOT EXISTS idx_sync_records_skill ON sync_records(skill_name);
"#;

impl DbPool {
    pub fn is_skill_disabled(&self, tool_id: &str, skill_name: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM skill_disabled WHERE tool_id = ?1 AND skill_name = ?2",
                [tool_id, skill_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    pub fn list_disabled_skills(&self, tool_id: &str) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT skill_name FROM skill_disabled WHERE tool_id = ?1 ORDER BY skill_name")
            .map_err(|e| e.to_string())?;
        let names = stmt
            .query_map([tool_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(names)
    }

    pub fn disable_skill(&self, tool_id: &str, skill_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        conn.execute(
            "INSERT OR REPLACE INTO skill_disabled (tool_id, skill_name, disabled_at) VALUES (?1, ?2, ?3)",
            [tool_id, skill_name, now.to_string().as_str()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn enable_skill(&self, tool_id: &str, skill_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM skill_disabled WHERE tool_id = ?1 AND skill_name = ?2",
            [tool_id, skill_name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn clear_disabled_skills(&self, tool_id: &str, skill_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM skill_disabled WHERE tool_id = ?1 AND skill_name = ?2",
            [tool_id, skill_name],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

static DB_POOL: OnceLock<DbPool> = OnceLock::new();

pub fn init_db_pool() -> Result<(), String> {
    let dir = PathBuf::from("/Users/smzdm/.ai-toolbox");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let pool = DbPool::new(dir.join("toolbox.db"))?;
    DB_POOL.set(pool).map_err(|_| "数据库已初始化".to_string())
}

pub fn get_db() -> Result<&'static DbPool, String> {
    DB_POOL.get().ok_or_else(|| "数据库未初始化".to_string())
}
