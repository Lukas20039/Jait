use std::{
    fmt,
    path::{Path, PathBuf},
};

#[derive(Debug, PartialEq, Eq)]
pub struct StatePathError(pub &'static str);
impl fmt::Display for StatePathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for StatePathError {}

/// Takes the platform home explicitly so callers/tests never mutate global environment.
pub fn state_directory(home: &Path, configured: Option<&str>) -> Result<PathBuf, StatePathError> {
    let value = crate::text::js_trim(configured.unwrap_or_default());
    if value.is_empty() {
        return Ok(home.join(".jait"));
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(StatePathError("JAIT_STATE_DIR must be an absolute path"));
    }
    Ok(path)
}
pub fn resolve_database_path(
    explicit: Option<&str>,
    lookup: impl Fn(&str) -> Option<String>,
    home: &Path,
) -> Result<PathBuf, StatePathError> {
    if let Some(path) = explicit.filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = lookup("JAIT_DB_PATH").filter(|p| !crate::text::js_trim(p).is_empty()) {
        return Ok(PathBuf::from(crate::text::js_trim(&path)));
    }
    if lookup("NODE_ENV").as_deref() == Some("test") {
        return Err(StatePathError(
            "Refusing to open the default Jait database in test mode. Pass ':memory:' or set JAIT_DB_PATH.",
        ));
    }
    Ok(state_directory(home, lookup("JAIT_STATE_DIR").as_deref())?.join("data/jait.db"))
}
