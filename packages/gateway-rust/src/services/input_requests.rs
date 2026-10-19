//! In-memory user input lifecycles. Callbacks receive metadata, never secret values.
//! Remove under the registry lock, then notify outside it so callbacks may reenter.
use crate::{
    db::identifiers::uuidv7,
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tokio::{sync::oneshot, task::AbortHandle, time::Duration};

pub type Observer = Arc<dyn Fn(InputRequest) + Send + Sync>;
pub type InputResult = Option<Value>;
pub struct InputHandle {
    pub id: String,
    pub result: oneshot::Receiver<InputResult>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequest {
    pub id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub status: String,
    #[serde(flatten)]
    pub details: serde_json::Map<String, Value>,
}
struct Pending {
    request: InputRequest,
    send: oneshot::Sender<InputResult>,
    timer: Option<AbortHandle>,
}
struct Registry {
    pending: Mutex<Vec<Pending>>,
    on_request: Observer,
    on_resolved: Observer,
}
impl Registry {
    fn insert(&self, request: InputRequest) -> InputHandle {
        let (send, result) = oneshot::channel();
        let id = request.id.clone();
        self.pending.lock().unwrap().push(Pending {
            request,
            send,
            timer: None,
        });
        InputHandle { id, result }
    }
    fn list(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.pending
            .lock()
            .unwrap()
            .iter()
            .map(|entry| &entry.request)
            .filter(|r| {
                session
                    .filter(|s| !s.is_empty())
                    .is_none_or(|s| s == r.session_id)
            })
            .filter(|r| {
                user.filter(|s| !s.is_empty()).is_none_or(|u| {
                    r.user_id
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .is_none_or(|owner| owner == u)
                })
            })
            .cloned()
            .collect()
    }
    fn resolve(
        &self,
        id: &str,
        value: InputResult,
        status: &str,
        user: Option<&str>,
        timeout: bool,
    ) -> bool {
        let entry = {
            let mut pending = self.pending.lock().unwrap();
            let Some(index) = pending.iter().position(|e| e.request.id == id) else {
                return false;
            };
            if !timeout
                && pending[index]
                    .request
                    .user_id
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .is_some_and(|owner| Some(owner) != user)
            {
                return false;
            }
            pending.remove(index)
        };
        if let Some(timer) = entry.timer {
            timer.abort();
        }
        let mut request = entry.request;
        request.status = status.into();
        // JS promise reactions run after the synchronous onResolved callback.
        (self.on_resolved)(request);
        let _ = entry.send.send(value);
        true
    }
}
fn registry(on_request: Option<Observer>, on_resolved: Option<Observer>) -> Arc<Registry> {
    Arc::new(Registry {
        pending: Mutex::new(Vec::new()),
        on_request: on_request.unwrap_or_else(|| Arc::new(|_| {})),
        on_resolved: on_resolved.unwrap_or_else(|| Arc::new(|_| {})),
    })
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInput {
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: Option<String>,
    pub attention: Option<String>,
    pub questions: Vec<Value>,
}
#[derive(Clone)]
pub struct UserQuestionService {
    registry: Arc<Registry>,
    clock: Clock,
}
impl Default for UserQuestionService {
    fn default() -> Self {
        Self::new(default_clock(), None, None)
    }
}
impl UserQuestionService {
    pub fn new(clock: Clock, on_request: Option<Observer>, on_resolved: Option<Observer>) -> Self {
        Self {
            registry: registry(on_request, on_resolved),
            clock,
        }
    }
    pub fn ask(&self, input: QuestionInput) -> InputHandle {
        let request = InputRequest {
            id: uuidv7().to_string(), session_id: input.session_id,
            user_id: input.user_id, requested_by: input.requested_by,
            title: input.title.as_deref().map(js_trim).filter(|s| !s.is_empty()).unwrap_or("Input requested").into(),
            created_at: iso((self.clock)()).expect("system time must be representable"), expires_at: None,
            status: "pending".into(),
            details: serde_json::json!({"attention":if input.attention.as_deref()==Some("urgent") {"urgent"} else {"normal"},
                "questions":input.questions}).as_object().unwrap().clone(),
        };
        let handle = self.registry.insert(request.clone());
        (self.registry.on_request)(request);
        handle
    }
    pub fn list_pending(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.registry.list(session, user)
    }
    pub fn submit(&self, id: &str, result: Value, user: Option<&str>) -> bool {
        self.registry
            .resolve(id, Some(result), "submitted", user, false)
    }
    pub fn cancel(&self, id: &str, user: Option<&str>) -> bool {
        self.registry.resolve(id, None, "cancelled", user, false)
    }
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretInput {
    pub session_id: String,
    pub user_id: Option<String>,
    pub requested_by: Option<String>,
    pub title: String,
    pub prompt: String,
    pub command: Option<String>,
    pub rememberable: Option<bool>,
    pub remember_label: Option<String>,
    pub secret_type: Option<String>,
    pub secret_key: Option<String>,
    pub timeout_ms: Option<f64>,
}
#[derive(Clone)]
pub struct SecretInputService {
    registry: Arc<Registry>,
    clock: Clock,
    default_timeout_ms: f64,
}
impl Default for SecretInputService {
    fn default() -> Self {
        Self::new(default_clock(), 120_000.0, None, None)
    }
}
impl SecretInputService {
    pub fn new(
        clock: Clock,
        default_timeout_ms: f64,
        on_request: Option<Observer>,
        on_resolved: Option<Observer>,
    ) -> Self {
        Self {
            registry: registry(on_request, on_resolved),
            clock,
            default_timeout_ms,
        }
    }
    /// Must run inside a Tokio runtime. Nonpositive and overflowing delays follow
    /// the reference timer's one-millisecond scheduling; expiry retains the input.
    pub fn request_secret(&self, input: SecretInput) -> Result<InputHandle, String> {
        let now = (self.clock)();
        let delay = input.timeout_ms.unwrap_or(self.default_timeout_ms);
        let expires = now as f64 + delay;
        if !expires.is_finite() || expires.abs() > 8.64e15 {
            return Err("Invalid time value".into());
        }
        let mut details = serde_json::Map::new();
        details.insert("prompt".into(), Value::String(input.prompt));
        for (key, value) in [
            ("command", input.command.map(Value::String)),
            ("rememberable", input.rememberable.map(Value::Bool)),
            ("rememberLabel", input.remember_label.map(Value::String)),
            ("secretType", input.secret_type.map(Value::String)),
            ("secretKey", input.secret_key.map(Value::String)),
        ] {
            if let Some(value) = value {
                details.insert(key.into(), value);
            }
        }
        let request = InputRequest {
            id: uuidv7().to_string(),
            session_id: input.session_id,
            user_id: input.user_id,
            requested_by: input.requested_by,
            title: input.title,
            created_at: iso(now)?,
            expires_at: Some(iso(expires.trunc() as i64)?),
            status: "pending".into(),
            details,
        };
        let handle = self.registry.insert(request.clone());
        let registry = self.registry.clone();
        let id = request.id.clone();
        let milliseconds = if !(1.0..=2_147_483_647.0).contains(&delay) {
            1
        } else {
            delay.trunc() as u64
        };
        let deadline = tokio::time::Instant::now() + Duration::from_millis(milliseconds);
        (self.registry.on_request)(request.clone());
        let task = tokio::spawn(async move {
            tokio::time::sleep_until(deadline).await;
            registry.resolve(&id, None, "timeout", None, true);
        });
        {
            let mut pending = self.registry.pending.lock().unwrap();
            if let Some(entry) = pending.iter_mut().find(|e| e.request.id == request.id) {
                entry.timer = Some(task.abort_handle());
            } else {
                task.abort();
            }
        }
        Ok(handle)
    }
    pub fn list_pending(&self, session: Option<&str>, user: Option<&str>) -> Vec<InputRequest> {
        self.registry.list(session, user)
    }
    pub fn submit(&self, id: &str, secret: String, user: Option<&str>) -> bool {
        self.registry
            .resolve(id, Some(Value::String(secret)), "submitted", user, false)
    }
    pub fn cancel(&self, id: &str, user: Option<&str>) -> bool {
        self.registry.resolve(id, None, "cancelled", user, false)
    }
}
