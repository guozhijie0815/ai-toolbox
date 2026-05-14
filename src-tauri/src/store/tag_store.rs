use crate::db::DbPool;
use rusqlite::params;

// ============================================================================
// 技能标签 CRUD
// ============================================================================

pub fn get_all_tags(db: &DbPool) -> Result<Vec<String>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT DISTINCT tag FROM skill_tags ORDER BY tag")
            .map_err(|e| e.to_string())?;

        let tag_iter = stmt
            .query_map([], |row| {
                let tag: String = row.get(0)?;
                Ok(tag)
            })
            .map_err(|e| e.to_string())?;

        let mut tags = Vec::new();
        for tag in tag_iter {
            tags.push(tag.map_err(|e| e.to_string())?);
        }

        Ok(tags)
    })
}

pub fn get_skill_tags(db: &DbPool, skill_name: &str) -> Result<Vec<String>, String> {
    db.with_conn(|conn| {
        let mut stmt = conn
            .prepare("SELECT tag FROM skill_tags WHERE skill_name = ?1 ORDER BY tag")
            .map_err(|e| e.to_string())?;

        let tag_iter = stmt
            .query_map([skill_name], |row| {
                let tag: String = row.get(0)?;
                Ok(tag)
            })
            .map_err(|e| e.to_string())?;

        let mut tags = Vec::new();
        for tag in tag_iter {
            tags.push(tag.map_err(|e| e.to_string())?);
        }

        Ok(tags)
    })
}

pub fn set_skill_tags(db: &DbPool, skill_name: &str, tags: Vec<String>) -> Result<(), String> {
    db.with_conn(|conn| {
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 删除该技能的所有旧标签
        tx.execute("DELETE FROM skill_tags WHERE skill_name = ?1", [skill_name])
            .map_err(|e| e.to_string())?;

        // 插入新标签
        for tag in tags {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO skill_tags (skill_name, tag) VALUES (?1, ?2)",
                params![skill_name, trimmed],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
}

