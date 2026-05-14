use crate::db::DbPool;
use crate::types::{DetectToolPathsResult, UserToolConfigFile, UserToolSpec};
use crate::utils::get_home_dir;
use rusqlite::params;
use std::path::{Path, PathBuf};

// ============================================================================
// 工具注册表 CRUD
// ============================================================================

pub fn load_tool_registry(db: &DbPool) -> Result<Vec<UserToolSpec>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, enabled, skill_dir, is_system FROM tools ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;

        let tool_iter = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let enabled: i32 = row.get(2)?;
                let skill_dir: Option<String> = row.get(3)?;
                let is_system: i32 = row.get(4)?;
                Ok((id, name, enabled != 0, skill_dir, is_system != 0))
            })
            .map_err(|e| e.to_string())?;

        let mut tools = Vec::new();
        for tool_result in tool_iter {
            let (id, name, enabled, skill_dir, is_system) = tool_result.map_err(|e| e.to_string())?;

            // 加载该工具的配置文件
            let mut config_stmt = conn
                .prepare("SELECT label, path, kind FROM tool_configs WHERE tool_id = ?1 ORDER BY id")
                .map_err(|e| e.to_string())?;

            let config_iter = config_stmt
                .query_map([&id], |row| {
                    Ok(UserToolConfigFile {
                        label: row.get(0)?,
                        path: row.get(1)?,
                        kind: row.get(2)?,
                    })
                })
                .map_err(|e| e.to_string())?;

            let mut config_files = Vec::new();
            for config in config_iter {
                config_files.push(config.map_err(|e| e.to_string())?);
            }

            tools.push(UserToolSpec {
                id,
                name,
                enabled,
                config_files,
                skill_dir,
                is_system,
            });
        }

        // 数据迁移兼容：codex 的 skill_dir 修正
        let mut changed = false;
        if let Ok(home) = get_home_dir() {
            let old_codex_skills = home.join(".codex/skills").to_string_lossy().to_string();
            let agents_skills = home.join(".agents/skills").to_string_lossy().to_string();
            for tool in &mut tools {
                if tool.id == "codex" && tool.skill_dir.as_deref() == Some(&old_codex_skills) {
                    tool.skill_dir = Some(agents_skills.clone());
                    changed = true;
                }
            }
        }

        if changed {
            save_tool_registry(db, &tools)?;
        }

        // 过滤空 id 和空 name
        tools.retain(|t| !t.id.trim().is_empty() && !t.name.trim().is_empty());

        Ok(tools)
    })
}

pub fn save_tool_registry(db: &DbPool, items: &[UserToolSpec]) -> Result<(), String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 清空现有数据
        tx.execute("DELETE FROM tool_configs", [])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM tools", [])
            .map_err(|e| e.to_string())?;

        let now = crate::types::current_timestamp();

        for item in items {
            tx.execute(
                "INSERT INTO tools (id, name, enabled, skill_dir, is_system, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    item.id,
                    item.name,
                    if item.enabled { 1 } else { 0 },
                    item.skill_dir,
                    if item.is_system { 1 } else { 0 },
                    now,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

            for config in &item.config_files {
                tx.execute(
                    "INSERT INTO tool_configs (tool_id, label, path, kind) VALUES (?1, ?2, ?3, ?4)",
                    params![item.id, config.label, config.path, config.kind],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn upsert_tool(db: &DbPool, item: &UserToolSpec) -> Result<(), String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = crate::types::current_timestamp();

        // 检查是否存在
        let exists: bool = tx
            .query_row(
                "SELECT 1 FROM tools WHERE id = ?1",
                [&item.id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            tx.execute(
                "UPDATE tools SET name = ?2, enabled = ?3, skill_dir = ?4, is_system = ?5, updated_at = ?6 WHERE id = ?1",
                params![
                    item.id,
                    item.name,
                    if item.enabled { 1 } else { 0 },
                    item.skill_dir,
                    if item.is_system { 1 } else { 0 },
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;

            // 删除旧配置，插入新配置
            tx.execute("DELETE FROM tool_configs WHERE tool_id = ?1", [&item.id])
                .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "INSERT INTO tools (id, name, enabled, skill_dir, is_system, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    item.id,
                    item.name,
                    if item.enabled { 1 } else { 0 },
                    item.skill_dir,
                    if item.is_system { 1 } else { 0 },
                    now,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        for config in &item.config_files {
            tx.execute(
                "INSERT INTO tool_configs (tool_id, label, path, kind) VALUES (?1, ?2, ?3, ?4)",
                params![item.id, config.label, config.path, config.kind],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn delete_tool(db: &DbPool, id: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        let is_system: i32 = conn
            .query_row("SELECT is_system FROM tools WHERE id = ?1", [id], |row| row.get(0))
            .unwrap_or(0);
        if is_system != 0 {
            return Err("系统工具不能删除".to_string());
        }
        conn.execute("DELETE FROM tools WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn get_tool_by_id(db: &DbPool, id: &str) -> Result<Option<UserToolSpec>, String> {
    db.with_conn(|conn| {
        let tool_row: Option<(String, String, i32, Option<String>, i32)> = conn
            .query_row(
                "SELECT id, name, enabled, skill_dir, is_system FROM tools WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .ok();

        let Some((id, name, enabled, skill_dir, is_system)) = tool_row else {
            return Ok(None);
        };

        let mut config_stmt = conn
            .prepare("SELECT label, path, kind FROM tool_configs WHERE tool_id = ?1 ORDER BY id")
            .map_err(|e| e.to_string())?;

        let config_iter = config_stmt
            .query_map([&id], |row| {
                Ok(UserToolConfigFile {
                    label: row.get(0)?,
                    path: row.get(1)?,
                    kind: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut config_files = Vec::new();
        for config in config_iter {
            config_files.push(config.map_err(|e| e.to_string())?);
        }

        Ok(Some(UserToolSpec {
            id,
            name,
            enabled: enabled != 0,
            config_files,
            skill_dir,
            is_system: is_system != 0,
        }))
    })
}

// ============================================================================
// 工具路径探测
// ============================================================================

fn apply_detect(
    configs: &[(&str, PathBuf, &str)],
    skills: Option<PathBuf>,
    out: &mut Vec<crate::types::ConfigFile>,
    skill_out: &mut Option<String>,
) {
    for (label, path, kind) in configs {
        if path.exists() {
            out.push(crate::types::ConfigFile {
                label: (*label).to_string(),
                path: path.to_string_lossy().to_string(),
                kind: (*kind).to_string(),
                exists: true,
            });
        }
    }
    if let Some(skills_path) = skills {
        if skills_path.exists() {
            *skill_out = Some(skills_path.to_string_lossy().to_string());
        }
    }
}

pub fn detect_tool_paths(
    _db: &DbPool,
    id: Option<&str>,
    name: Option<&str>,
) -> Result<DetectToolPathsResult, String> {
    let lookup = id
        .filter(|v| !v.trim().is_empty())
        .or(name)
        .unwrap_or("");
    let key = lookup.to_lowercase();

    let mut config_files = Vec::new();
    let mut skill_dir = None::<String>;

    let home = match get_home_dir() {
        Ok(h) => h,
        Err(_) => return Ok(DetectToolPathsResult { config_files, skill_dir }),
    };

    if key.contains("codex") {
        apply_detect(
            &[("config.toml", home.join(".codex/config.toml"), "toml")],
            Some(home.join(".agents/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("claude") {
        apply_detect(
            &[("settings.json", home.join(".claude/settings.json"), "json")],
            Some(home.join(".claude/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("cursor") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Cursor/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Cursor/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Cursor/User/settings.json");

        apply_detect(
            &[
                ("settings.json", settings_path, "json"),
                ("mcp.json", home.join(".cursor/mcp.json"), "json"),
                ("hooks.json", home.join(".cursor/hooks.json"), "json"),
            ],
            Some(home.join(".cursor/skills-cursor")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("qoder") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Qoder/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Qoder/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Qoder/User/settings.json");

        apply_detect(
            &[("settings.json", settings_path, "json")],
            Some(home.join(".qoder/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("trae") {
        #[cfg(target_os = "macos")]
        let settings_path = home.join("Library/Application Support/Trae CN/User/settings.json");
        #[cfg(target_os = "windows")]
        let settings_path = home.join("AppData/Roaming/Trae CN/User/settings.json");
        #[cfg(target_os = "linux")]
        let settings_path = home.join(".config/Trae CN/User/settings.json");

        apply_detect(
            &[
                ("settings.json", settings_path, "json"),
                ("skill-config.json", home.join(".trae-cn/skill-config.json"), "json"),
            ],
            Some(home.join(".trae-cn/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("opencode") {
        apply_detect(
            &[
                ("opencode.jsonc", home.join(".config/opencode/opencode.jsonc"), "jsonc"),
                ("config.json", home.join(".config/opencode/config.json"), "json"),
            ],
            Some(home.join(".config/opencode/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    } else if key.contains("agent") {
        apply_detect(
            &[],
            Some(home.join(".agents/skills")),
            &mut config_files,
            &mut skill_dir,
        );
    }

    Ok(DetectToolPathsResult {
        config_files,
        skill_dir,
    })
}
