//! Shared SQL implementation for session and project JSON state.
//! Identifiers come only from the enum; owner IDs and keys are bound parameters.
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map, Value, json};

#[derive(Clone, Copy)]
pub(super) enum Kind {
    Session,
    Project,
}
impl Kind {
    fn table(self) -> &'static str {
        match self {
            Self::Session => "session_state",
            Self::Project => "project_state",
        }
    }
    fn owner(self) -> &'static str {
        match self {
            Self::Session => "session_id",
            Self::Project => "project_id",
        }
    }
}
pub(super) struct JsonState<'a> {
    pub db: &'a Connection,
    pub kind: Kind,
}
pub(super) fn decode(raw: Option<String>) -> Value {
    match raw.filter(|s| !s.is_empty()) {
        Some(raw) => serde_json::from_str(&raw).unwrap_or(Value::String(raw)),
        None => Value::Null,
    }
}
impl<'a> JsonState<'a> {
    pub fn rows(
        &self,
        id: &str,
        keys: Option<&[String]>,
    ) -> rusqlite::Result<Vec<(String, Value)>> {
        let mut statement = self.db.prepare(&format!(
            "SELECT key,value FROM {} WHERE {}=?",
            self.kind.table(),
            self.kind.owner()
        ))?;
        let rows =
            statement.query_map([id], |r| Ok((r.get::<_, String>(0)?, decode(r.get(1)?))))?;
        let mut result = Vec::new();
        for row in rows {
            let (key, value) = row?;
            if keys.is_none_or(|keys| keys.is_empty() || keys.contains(&key)) {
                result.push((key, value));
            }
        }
        Ok(result)
    }
    pub fn get(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<Map<String, Value>> {
        // Assigning __proto__ to a plain reference object creates no JSON own key.
        Ok(self
            .rows(id, keys)?
            .into_iter()
            .filter(|(key, _)| key != "__proto__")
            .collect())
    }
    pub fn delete_key(&self, id: &str, key: &str) -> rusqlite::Result<()> {
        self.db.execute(
            &format!(
                "DELETE FROM {} WHERE {}=? AND key=?",
                self.kind.table(),
                self.kind.owner()
            ),
            params![id, key],
        )?;
        Ok(())
    }
    pub fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        let now: String =
            self.db
                .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
                    r.get(0)
                })?;
        for (key, value) in entries {
            if value.is_null() {
                self.delete_key(id, key)?;
                continue;
            }
            let exists = self
                .db
                .query_row(
                    &format!(
                        "SELECT key FROM {} WHERE {}=? AND key=?",
                        self.kind.table(),
                        self.kind.owner()
                    ),
                    params![id, key],
                    |r| r.get::<_, String>(0),
                )
                .optional()?
                .is_some();
            let value = value.to_string();
            if exists {
                self.db.execute(
                    &format!(
                        "UPDATE {} SET value=?,updated_at=? WHERE {}=? AND key=?",
                        self.kind.table(),
                        self.kind.owner()
                    ),
                    params![value, now, id, key],
                )?;
            } else {
                self.db.execute(
                    &format!(
                        "INSERT INTO {}({},key,value,updated_at) VALUES(?,?,?,?)",
                        self.kind.table(),
                        self.kind.owner()
                    ),
                    params![id, key, value, now],
                )?;
            }
        }
        Ok(())
    }
}
pub struct SessionStateService<'a>(JsonState<'a>);
impl<'a> SessionStateService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(JsonState {
            db,
            kind: Kind::Session,
        })
    }
    pub fn get(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<Map<String, Value>> {
        self.0.get(id, keys)
    }
    pub fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        self.0.set(id, entries)
    }
    pub fn get_by_key(&self, key: &str) -> rusqlite::Result<Vec<Value>> {
        let mut statement = self
            .0
            .db
            .prepare("SELECT session_id,value FROM session_state WHERE key=?")?;
        statement
            .query_map([key], |r| {
                Ok(json!({"sessionId":r.get::<_,String>(0)?,"value":decode(r.get(1)?)}))
            })?
            .collect()
    }
    pub fn delete_all(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .db
            .execute("DELETE FROM session_state WHERE session_id=?", [id])?;
        Ok(())
    }
}
pub struct ProjectStateService<'a>(JsonState<'a>);
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
impl<'a> ProjectStateService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self(JsonState {
            db,
            kind: Kind::Project,
        })
    }
    pub fn set(&self, id: &str, entries: &Map<String, Value>) -> rusqlite::Result<()> {
        self.0.set(id, entries)
    }
    pub fn get(&self, id: &str, keys: Option<&[String]>) -> rusqlite::Result<Map<String, Value>> {
        let mut result = self.0.get(id, keys)?;
        if result.get("project.ui").is_none_or(|v| !truthy(v))
            && keys.is_none_or(|keys| keys.iter().any(|k| k == "project.ui"))
        {
            let all = self.0.get(id, None)?;
            let legacy = [
                "project.panel",
                "project.tabs",
                "project.layout",
                "project.layout.mobile",
                "terminal.panel",
                "dev-preview.panel",
            ];
            if legacy.iter().any(|key| all.contains_key(*key)) {
                let value = |key: &str| {
                    all.get(key)
                        .filter(|v| !v.is_null())
                        .cloned()
                        .unwrap_or(Value::Null)
                };
                let layout = all
                    .get("project.layout")
                    .filter(|v| !v.is_null())
                    .cloned()
                    .unwrap_or_else(|| value("project.layout.mobile"));
                let ui = json!({"panel":value("project.panel"),"tabs":value("project.tabs"),"layout":layout,"terminal":value("terminal.panel"),"preview":value("dev-preview.panel")});
                self.0
                    .set(id, &Map::from_iter([("project.ui".into(), ui.clone())]))?;
                for key in legacy {
                    if all.contains_key(key) {
                        self.0.delete_key(id, key)?;
                    }
                }
                result.insert("project.ui".into(), ui);
            }
        }
        Ok(result)
    }
}
