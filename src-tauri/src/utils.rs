use std::path::PathBuf;

/// 获取用户主目录，跨平台兼容
pub fn get_home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())
}

/// 在 Home 目录下拼接子路径
pub fn home_path(sub: &str) -> Result<PathBuf, String> {
    Ok(get_home_dir()?.join(sub))
}
