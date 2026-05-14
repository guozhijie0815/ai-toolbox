use crate::db::DbPool;
use rusqlite::params;

// ============================================================================
// 中央仓库技能类型
// ============================================================================

#[derive(Debug, Clone)]
pub struct CenterSkill {
    pub id: String,
    pub name: String,
    pub source_type: String, // "git", "local", "zip"
    pub source_url: Option<String>,
    pub description: Option<String>,
    pub installed_at: u64,
    pub updated_at: u64,
    pub version: Option<String>,
    pub tags: Vec<String>,
}

// ============================================================================
// 中央仓库技能 CRUD
// ============================================================================

pub fn list_center_skills(db: &DbPool) -> Result<Vec<CenterSkill>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, source_type, source_url, description, installed_at, updated_at, version FROM center_skills ORDER BY name",
            )
            .map_err(|e| e.to_string())?;

        let skill_iter = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let source_type: String = row.get(2)?;
                let source_url: Option<String> = row.get(3)?;
                let description: Option<String> = row.get(4)?;
                let installed_at: u64 = row.get(5)?;
                let updated_at: u64 = row.get(6)?;
                let version: Option<String> = row.get(7)?;
                Ok((
                    id,
                    name,
                    source_type,
                    source_url,
                    description,
                    installed_at,
                    updated_at,
                    version,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut skills = Vec::new();
        for skill_result in skill_iter {
            let (id, name, source_type, source_url, description, installed_at, updated_at, version) =
                skill_result.map_err(|e| e.to_string())?;

            // 加载标签
            let tags = load_tags_for_skill(conn, &id)?;

            skills.push(CenterSkill {
                id,
                name,
                source_type,
                source_url,
                description,
                installed_at,
                updated_at,
                version,
                tags,
            });
        }

        Ok(skills)
    })
}

pub fn get_center_skill_by_name(db: &DbPool, name: &str) -> Result<Option<CenterSkill>, String> {
    db.with_conn(|conn| {
        let skill_row: Option<(
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            u64,
            u64,
            Option<String>,
        )> = conn
            .query_row(
                "SELECT id, name, source_type, source_url, description, installed_at, updated_at, version FROM center_skills WHERE name = ?1",
                [name],
                |row| Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                )),
            )
            .ok();

        let Some((id, name, source_type, source_url, description, installed_at, updated_at, version)) = skill_row else {
            return Ok(None);
        };

        let tags = load_tags_for_skill(conn, &id)?;

        Ok(Some(CenterSkill {
            id,
            name,
            source_type,
            source_url,
            description,
            installed_at,
            updated_at,
            version,
            tags,
        }))
    })
}

pub fn upsert_center_skill(db: &DbPool, skill: &CenterSkill) -> Result<(), String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 检查是否存在
        let exists: bool = tx
            .query_row(
                "SELECT 1 FROM center_skills WHERE id = ?1",
                [&skill.id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if exists {
            tx.execute(
                "UPDATE center_skills SET name = ?2, source_type = ?3, source_url = ?4, description = ?5, installed_at = ?6, updated_at = ?7, version = ?8 WHERE id = ?1",
                params![
                    skill.id,
                    skill.name,
                    skill.source_type,
                    skill.source_url,
                    skill.description,
                    skill.installed_at,
                    skill.updated_at,
                    skill.version,
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "INSERT INTO center_skills (id, name, source_type, source_url, description, installed_at, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    skill.id,
                    skill.name,
                    skill.source_type,
                    skill.source_url,
                    skill.description,
                    skill.installed_at,
                    skill.updated_at,
                    skill.version,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        // 更新标签：先删除再插入
        tx.execute(
            "DELETE FROM center_skill_tags WHERE skill_id = ?1",
            [&skill.id],
        )
        .map_err(|e| e.to_string())?;

        for tag in &skill.tags {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO center_skill_tags (skill_id, tag) VALUES (?1, ?2)",
                params![skill.id, trimmed],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn set_skill_source_type(db: &DbPool, name: &str, source_type: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        let rows = conn
            .execute(
                "UPDATE center_skills SET source_type = ?2 WHERE name = ?1",
                params![name, source_type],
            )
            .map_err(|e| e.to_string())?;

        if rows == 0 {
            // 如果数据库中没有记录，创建一个简单的记录
            let now = crate::types::current_timestamp();
            conn.execute(
                "INSERT INTO center_skills (id, name, source_type, installed_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![format!("center-{}-{}", name, now), name, source_type, now, now],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    })
}

pub fn delete_center_skill(db: &DbPool, name: &str) -> Result<(), String> {
    db.with_conn(|conn| {
        // 由于外键关联，删除 center_skills 会自动级联删除 center_skill_tags
        let rows_affected = conn
            .execute("DELETE FROM center_skills WHERE name = ?1", [name])
            .map_err(|e| e.to_string())?;

        if rows_affected == 0 {
            return Err(format!("未找到中央仓库技能: {}", name));
        }

        Ok(())
    })
}

pub fn get_center_skill_tags(db: &DbPool, skill_id: &str) -> Result<Vec<String>, String> {
    db.with_conn(|conn| load_tags_for_skill(conn, skill_id))
}

pub fn set_center_skill_tags(
    db: &DbPool,
    skill_id: &str,
    tags: Vec<String>,
) -> Result<(), String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 删除旧标签
        tx.execute(
            "DELETE FROM center_skill_tags WHERE skill_id = ?1",
            [skill_id],
        )
        .map_err(|e| e.to_string())?;

        // 插入新标签
        for tag in tags {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO center_skill_tags (skill_id, tag) VALUES (?1, ?2)",
                params![skill_id, trimmed],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
}

// ============================================================================
// 内部辅助函数
// ============================================================================

fn load_tags_for_skill(
    conn: &rusqlite::Connection,
    skill_id: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT tag FROM center_skill_tags WHERE skill_id = ?1 ORDER BY tag")
        .map_err(|e| e.to_string())?;

    let tag_iter = stmt
        .query_map([skill_id], |row| {
            let tag: String = row.get(0)?;
            Ok(tag)
        })
        .map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }

    Ok(tags)
}
