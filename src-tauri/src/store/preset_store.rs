use crate::db::DbPool;
use crate::types::{PresetEntry, PresetSkill};
use rusqlite::params;

// ============================================================================
// 预设管理 CRUD
// ============================================================================

pub fn list_presets(db: &DbPool) -> Result<Vec<PresetEntry>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, name, icon FROM presets ORDER BY created_at")
            .map_err(|e| e.to_string())?;

        let preset_iter = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let icon: Option<String> = row.get(2)?;
                Ok((id, name, icon))
            })
            .map_err(|e| e.to_string())?;

        let mut presets = Vec::new();
        for preset_result in preset_iter {
            let (id, name, icon) = preset_result.map_err(|e| e.to_string())?;

            // 加载该预设的技能列表
            let mut skill_stmt = conn
                .prepare("SELECT skill_name FROM preset_skills WHERE preset_id = ?1 ORDER BY skill_name")
                .map_err(|e| e.to_string())?;

            let skill_iter = skill_stmt
                .query_map([&id], |row| {
                    let skill_name: String = row.get(0)?;
                    Ok(PresetSkill { skill_name })
                })
                .map_err(|e| e.to_string())?;

            let mut skills = Vec::new();
            for skill in skill_iter {
                skills.push(skill.map_err(|e| e.to_string())?);
            }

            presets.push(PresetEntry {
                id,
                name,
                icon,
                skills,
            });
        }

        Ok(presets)
    })
}

pub fn upsert_preset(
    db: &DbPool,
    id: Option<&str>,
    name: &str,
    icon: Option<&str>,
    skills: Vec<String>,
) -> Result<PresetEntry, String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let now = crate::types::current_timestamp();
        let preset_id = id
            .filter(|v| !v.trim().is_empty())
            .map(|v| v.to_string())
            .unwrap_or_else(|| format!("preset-{}", crate::types::current_timestamp_millis()));

        // 检查是否存在
        let exists: bool = tx
            .query_row(
                "SELECT 1 FROM presets WHERE id = ?1",
                [&preset_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            tx.execute(
                "UPDATE presets SET name = ?2, icon = ?3, updated_at = ?4 WHERE id = ?1",
                params![preset_id, name, icon, now],
            )
            .map_err(|e| e.to_string())?;

            // 删除旧技能关联
            tx.execute("DELETE FROM preset_skills WHERE preset_id = ?1", [&preset_id])
                .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "INSERT INTO presets (id, name, icon, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![preset_id, name, icon, now, now],
            )
            .map_err(|e| e.to_string())?;
        }

        // 插入技能关联
        for skill_name in &skills {
            let trimmed = skill_name.trim();
            if trimmed.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO preset_skills (preset_id, skill_name) VALUES (?1, ?2)",
                params![preset_id, trimmed],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;

        let preset_skills: Vec<PresetSkill> = skills
            .into_iter()
            .filter(|s| !s.trim().is_empty())
            .map(|skill_name| PresetSkill { skill_name })
            .collect();

        Ok(PresetEntry {
            id: preset_id,
            name: name.to_string(),
            icon: icon.map(|s| s.to_string()),
            skills: preset_skills,
        })
    })
}

pub fn delete_preset(db: &DbPool, id: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        let rows_affected = conn
            .execute("DELETE FROM presets WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;

        if rows_affected == 0 {
            return Err("未找到预设".to_string());
        }

        Ok(())
    })
}

pub fn get_preset_by_id(db: &DbPool, id: &str) -> Result<Option<PresetEntry>, String> {
    db.with_conn(|conn| {
        let preset_row: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT id, name, icon FROM presets WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let Some((id, name, icon)) = preset_row else {
            return Ok(None);
        };

        let mut skill_stmt = conn
            .prepare("SELECT skill_name FROM preset_skills WHERE preset_id = ?1 ORDER BY skill_name")
            .map_err(|e| e.to_string())?;

        let skill_iter = skill_stmt
            .query_map([&id], |row| {
                let skill_name: String = row.get(0)?;
                Ok(PresetSkill { skill_name })
            })
            .map_err(|e| e.to_string())?;

        let mut skills = Vec::new();
        for skill in skill_iter {
            skills.push(skill.map_err(|e| e.to_string())?);
        }

        Ok(Some(PresetEntry {
            id,
            name,
            icon,
            skills,
        }))
    })
}
