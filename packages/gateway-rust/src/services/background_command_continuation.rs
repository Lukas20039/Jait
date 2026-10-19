//! Continuation payload selection with persisted explicit-null effort precedence.
use super::{
    json_state::SessionStateService,
    thread_defaults::{normalize_reasoning_effort, resolve_thread_selection_defaults},
    users::UserService,
};
use serde_json::{Value, json};
pub struct ContinuationOptions<'a> {
    pub session_id: &'a str,
    pub notification: &'a str,
    pub notice: Option<&'a str>,
    pub user_id: &'a str,
    pub users: &'a UserService<'a>,
    pub session_state: Option<&'a SessionStateService<'a>>,
    pub session_metadata: &'a Value,
}
fn persisted_effort(value: &Value) -> Option<Option<String>> {
    let parsed;
    let metadata = if let Some(s) = value.as_str() {
        parsed = serde_json::from_str::<Value>(s).ok()?;
        &parsed
    } else {
        value
    };
    let effort = metadata
        .as_object()?
        .get("chat")?
        .as_object()?
        .get("reasoningEffort")?;
    if effort.is_null() {
        Some(None)
    } else {
        normalize_reasoning_effort(effort).map(Some)
    }
}
pub fn build_background_command_continuation_payload(
    options: ContinuationOptions<'_>,
) -> rusqlite::Result<Value> {
    let defaults = resolve_thread_selection_defaults(
        Some(options.user_id),
        Some(options.session_id),
        Some(options.users),
        options.session_state,
    )?;
    let provider = defaults.provider_id.as_deref().unwrap_or("jait");
    let effort = if let Some(persisted) = persisted_effort(options.session_metadata) {
        persisted
    } else if defaults.reasoning_effort.is_some() {
        defaults.reasoning_effort
    } else {
        normalize_reasoning_effort(&json!(
            options
                .users
                .get_settings(options.user_id)?
                .reasoning_effort
        ))
    };
    let mut result = json!({"sessionId":options.session_id,"_systemNotification":options.notification,"reasoningEffort":effort});
    if let Some(notice) = options.notice.filter(|s| !s.is_empty()) {
        result["_systemNotice"] = json!(notice);
    }
    if provider != "jait" {
        result["provider"] = json!(provider);
        if let Some(mode) = defaults.runtime_mode {
            result["runtimeMode"] = json!(mode);
        }
        if let Some(model) = defaults.model {
            result["model"] = json!(model);
        }
    }
    Ok(result)
}
