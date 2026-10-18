use serde_json::{Value, json};

/// Absent and foreign resources deliberately return the same response.
pub fn assert_ownership(
    owner: Option<Option<&str>>,
    user_id: &str,
    error_message: &str,
) -> Result<(), (u16, Value)> {
    if owner == Some(Some(user_id)) {
        Ok(())
    } else {
        Err((404, json!({"error": error_message})))
    }
}
