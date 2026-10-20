//! Pending consent queue with durable decisions and session overrides.
//! Routes/executors must authenticate callers and apply ownership/policy before use.
//! Synchronous persistence adapters run on the caller's database/blocking lane;
//! expiration always dispatches to a blocking task instead of blocking Tokio I/O.
use crate::{
    db::identifiers::uuidv7,
    security::{
        contracts::Risk,
        tool_permissions::{ConsentLevel, PolicySource},
    },
    time::{Clock, default_clock, iso},
};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::watch,
    task::AbortHandle,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConsentStatus {
    Pending,
    Approved,
    Rejected,
    Timeout,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DecisionVia {
    Click,
    Voice,
    Auto,
    Timeout,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequestPolicy {
    pub consent_level: ConsentLevel,
    pub description: String,
    pub known_tool: bool,
    pub source: PolicySource,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentRequest {
    pub id: String,
    pub action_id: String,
    pub tool_name: String,
    pub summary: String,
    pub preview: Map<String, Value>,
    pub risk: Risk,
    pub policy: ConsentRequestPolicy,
    pub session_id: String,
    pub created_at: String,
    pub expires_at: String,
    pub status: ConsentStatus,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentDecision {
    pub request_id: String,
    pub action_id: String,
    pub approved: bool,
    pub decided_at: String,
    pub decided_via: DecisionVia,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConsent {
    pub action_id: String,
    pub tool_name: String,
    pub summary: String,
    pub preview: Map<String, Value>,
    pub risk: Risk,
    pub policy: ConsentRequestPolicy,
    pub session_id: String,
    pub timeout_ms: Option<f64>,
}
/// Shared request identity: a retained get/onRequest value observes terminal status.
#[derive(Clone, Debug)]
pub struct SharedRequest(Arc<Mutex<ConsentRequest>>);
impl SharedRequest {
    pub fn snapshot(&self) -> ConsentRequest {
        self.0.lock().unwrap().clone()
    }
}
pub trait ConsentPersistence: Send + Sync {
    fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String>;
    fn persist_session_approve_all(
        &self,
        session: &str,
        enabled: bool,
        at: &str,
    ) -> Result<(), String>;
    fn persist_decision(
        &self,
        request: &ConsentRequest,
        decision: &ConsentDecision,
    ) -> Result<(), String>;
}
/// Existing consent tables only; never opens the default/production database.
pub struct SqliteConsentStore {
    pub db: Arc<Mutex<Connection>>,
}
impl ConsentPersistence for SqliteConsentStore {
    fn hydrate_session_approve_all(&self) -> Result<Vec<String>, String> {
        let db = self.db.lock().unwrap();
        let mut query = db
            .prepare("SELECT session_id FROM consent_session_approvals WHERE approve_all=1")
            .map_err(|e| e.to_string())?;
        query
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    fn persist_session_approve_all(
        &self,
        session: &str,
        enabled: bool,
        at: &str,
    ) -> Result<(), String> {
        let db = self.db.lock().unwrap();
        if enabled {
            db.execute("INSERT INTO consent_session_approvals(session_id,approve_all,updated_at) VALUES(?1,1,?2) ON CONFLICT(session_id) DO UPDATE SET approve_all=1,updated_at=excluded.updated_at",params![session,at])
        } else {db.execute("DELETE FROM consent_session_approvals WHERE session_id=?1",[session])}.map(|_|()).map_err(|e|e.to_string())
    }
    fn persist_decision(
        &self,
        request: &ConsentRequest,
        decision: &ConsentDecision,
    ) -> Result<(), String> {
        let status = if decision.approved {
            "approved"
        } else if decision.decided_via == DecisionVia::Timeout {
            "timeout"
        } else {
            "rejected"
        };
        let via = match decision.decided_via {
            DecisionVia::Click => "click",
            DecisionVia::Voice => "voice",
            DecisionVia::Auto => "auto",
            DecisionVia::Timeout => "timeout",
        };
        self.db.lock().unwrap().execute("INSERT INTO consent_log(id,action_id,tool_name,decision,decided_at,decided_via) VALUES(?1,?2,?3,?4,?5,?6)",params![uuidv7().to_string(),request.action_id,request.tool_name,status,decision.decided_at,via]).map(|_|()).map_err(|e|e.to_string())
    }
}
pub type RequestObserver = Arc<dyn Fn(SharedRequest) -> Result<(), String> + Send + Sync>;
pub type DecisionObserver = Arc<dyn Fn(ConsentDecision) -> Result<(), String> + Send + Sync>;
pub struct ConsentManagerOptions {
    pub default_timeout_ms: f64,
    pub store: Option<Arc<dyn ConsentPersistence>>,
    pub clock: Clock,
    pub on_request: Option<RequestObserver>,
    pub on_decision: Option<DecisionObserver>,
}
impl Default for ConsentManagerOptions {
    fn default() -> Self {
        Self {
            default_timeout_ms: 120_000.0,
            store: None,
            clock: default_clock(),
            on_request: None,
            on_decision: None,
        }
    }
}
#[derive(Clone, Debug)]
enum Answer {
    Waiting,
    Settled(Result<ConsentDecision, String>),
}
pub struct ConsentHandle {
    pub id: String,
    answer: watch::Receiver<Answer>,
    // Preserve a waiting promise when a decision observer throws, matching JS.
    _keepalive: watch::Sender<Answer>,
    _owner: Arc<Inner>,
}
impl ConsentHandle {
    pub fn outcome(&self) -> Option<Result<ConsentDecision, String>> {
        match self.answer.borrow().clone() {
            Answer::Waiting => None,
            Answer::Settled(result) => Some(result),
        }
    }
    pub async fn wait(&mut self) -> Result<ConsentDecision, String> {
        loop {
            if let Some(result) = self.outcome() {
                return result;
            }
            self.answer
                .changed()
                .await
                .map_err(|_| "consent answer channel closed".to_string())?;
        }
    }
}
struct Pending {
    request: SharedRequest,
    send: Option<watch::Sender<Answer>>,
    timer: AbortHandle,
}
struct State {
    pending: Vec<Pending>,
    approve_all: HashSet<String>,
}
struct Inner {
    state: Mutex<State>,
    options: ConsentManagerOptions,
}
impl Drop for Inner {
    fn drop(&mut self) {
        for entry in &self.state.get_mut().unwrap().pending {
            entry.timer.abort();
        }
    }
}
#[derive(Clone)]
pub struct ConsentManager {
    inner: Arc<Inner>,
}
impl Default for ConsentManager {
    fn default() -> Self {
        Self::new(ConsentManagerOptions::default())
    }
}
impl ConsentManager {
    pub fn new(options: ConsentManagerOptions) -> Self {
        let approve_all = options
            .store
            .as_ref()
            .and_then(|store| store.hydrate_session_approve_all().ok())
            .unwrap_or_default()
            .into_iter()
            .collect();
        Self {
            inner: Arc::new(Inner {
                state: Mutex::new(State {
                    pending: Vec::new(),
                    approve_all,
                }),
                options,
            }),
        }
    }
    /// Register immediately, before observers run, like the JS Promise executor.
    /// `Err` means the request could not be constructed (invalid expiry).
    pub fn request_consent(&self, input: RequestConsent) -> Result<ConsentHandle, String> {
        let timeout = input
            .timeout_ms
            .unwrap_or(self.inner.options.default_timeout_ms);
        let now = (self.inner.options.clock)();
        let expires = (now as f64 + timeout).trunc();
        if !expires.is_finite() || expires.abs() > 8_640_000_000_000_000.0 {
            return Err("Invalid time value".into());
        }
        let request = SharedRequest(Arc::new(Mutex::new(ConsentRequest {
            id: uuidv7().to_string(),
            action_id: input.action_id,
            tool_name: input.tool_name,
            summary: input.summary,
            preview: input.preview,
            risk: input.risk,
            policy: input.policy,
            session_id: input.session_id,
            created_at: iso(now)?,
            expires_at: iso(expires as i64)?,
            status: ConsentStatus::Pending,
        })));
        let id = request.snapshot().id;
        let (send, answer) = watch::channel(Answer::Waiting);
        let handle = ConsentHandle {
            id: id.clone(),
            answer,
            _keepalive: send.clone(),
            _owner: self.inner.clone(),
        };
        // JS timers clamp non-positive/out-of-i32 delays to one millisecond.
        let delay = if !(1.0..=2_147_483_647.0).contains(&timeout) {
            1
        } else {
            timeout.trunc() as u64
        };
        let deadline = Instant::now() + Duration::from_millis(delay);
        {
            let mut state = self.inner.state.lock().unwrap();
            let weak = Arc::downgrade(&self.inner);
            let timer_id = id.clone();
            let timer = tokio::spawn(async move {
                tokio::time::sleep_until(deadline).await;
                if let Some(inner) = weak.upgrade() {
                    let _ = tokio::task::spawn_blocking(move || {
                        ConsentManager { inner }.timeout(&timer_id)
                    })
                    .await;
                }
            })
            .abort_handle();
            state.pending.push(Pending {
                request: request.clone(),
                send: Some(send),
                timer,
            });
        }
        if let Some(observe) = &self.inner.options.on_request
            && let Err(error) = observe(request)
        {
            let mut state = self.inner.state.lock().unwrap();
            if let Some(entry) = state
                .pending
                .iter_mut()
                .find(|e| e.request.snapshot().id == id)
                && let Some(send) = entry.send.take()
            {
                let _ = send.send(Answer::Settled(Err(error)));
            }
        }
        Ok(handle)
    }
    pub fn get_request(&self, id: &str) -> Option<SharedRequest> {
        self.inner
            .state
            .lock()
            .unwrap()
            .pending
            .iter()
            .find(|e| e.request.snapshot().id == id)
            .map(|e| e.request.clone())
    }
    pub fn list_pending(&self, session: Option<&str>) -> Vec<SharedRequest> {
        self.inner
            .state
            .lock()
            .unwrap()
            .pending
            .iter()
            .filter(|e| {
                session
                    .filter(|s| !s.is_empty())
                    .is_none_or(|s| s == e.request.snapshot().session_id)
            })
            .map(|e| e.request.clone())
            .collect()
    }
    pub fn pending_count(&self) -> usize {
        self.inner.state.lock().unwrap().pending.len()
    }
    pub fn approve(
        &self,
        id: &str,
        via: Option<DecisionVia>,
        reason: Option<String>,
    ) -> Result<bool, String> {
        self.decide(id, true, via.unwrap_or(DecisionVia::Click), reason, false)
    }
    pub fn reject(
        &self,
        id: &str,
        via: Option<DecisionVia>,
        reason: Option<String>,
    ) -> Result<bool, String> {
        self.decide(id, false, via.unwrap_or(DecisionVia::Click), reason, false)
    }
    fn timeout(&self, id: &str) -> Result<bool, String> {
        self.decide(
            id,
            false,
            DecisionVia::Timeout,
            Some("Consent request timed out".into()),
            true,
        )
    }
    fn decide(
        &self,
        id: &str,
        approved: bool,
        via: DecisionVia,
        reason: Option<String>,
        timeout: bool,
    ) -> Result<bool, String> {
        let (entry, decision) = {
            let mut state = self.inner.state.lock().unwrap();
            let Some(index) = state
                .pending
                .iter()
                .position(|e| e.request.snapshot().id == id)
            else {
                return Ok(false);
            };
            state.pending[index].timer.abort();
            let decision = ConsentDecision {
                request_id: id.into(),
                action_id: state.pending[index].request.snapshot().action_id,
                approved,
                decided_at: iso((self.inner.options.clock)())?,
                decided_via: via,
                reason,
            };
            let entry = state.pending.remove(index);
            (entry, decision)
        };
        let request = {
            let mut request = entry.request.0.lock().unwrap();
            request.status = if timeout {
                ConsentStatus::Timeout
            } else if approved {
                ConsentStatus::Approved
            } else {
                ConsentStatus::Rejected
            };
            request.clone()
        };
        if let Some(store) = &self.inner.options.store {
            let _ = store.persist_decision(&request, &decision);
        }
        if let Some(observe) = &self.inner.options.on_decision {
            observe(decision.clone())?;
        }
        if let Some(send) = entry.send {
            let _ = send.send(Answer::Settled(Ok(decision)));
        }
        Ok(true)
    }
    pub fn enable_approve_all_for_session(&self, session: &str) {
        self.set_approve_all(session, true)
    }
    pub fn disable_approve_all_for_session(&self, session: &str) {
        self.set_approve_all(session, false)
    }
    fn set_approve_all(&self, session: &str, enabled: bool) {
        {
            let mut state = self.inner.state.lock().unwrap();
            if enabled {
                state.approve_all.insert(session.into());
            } else {
                state.approve_all.remove(session);
            }
        }
        if let Some(store) = &self.inner.options.store
            && let Ok(at) = iso((self.inner.options.clock)())
        {
            let _ = store.persist_session_approve_all(session, enabled, &at);
        }
    }
    pub fn is_approve_all_enabled_for_session(&self, session: &str) -> bool {
        self.inner
            .state
            .lock()
            .unwrap()
            .approve_all
            .contains(session)
    }
    pub fn cancel_all(&self, reason: Option<&str>) -> Result<(), String> {
        let ids: Vec<_> = self
            .list_pending(None)
            .into_iter()
            .map(|r| r.snapshot().id)
            .collect();
        for id in ids {
            self.decide(
                &id,
                false,
                DecisionVia::Auto,
                Some(reason.unwrap_or("shutdown").into()),
                false,
            )?;
        }
        Ok(())
    }
}
