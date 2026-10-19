//! Identity-safe, asynchronous chat/thread continuation callbacks.
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
};
pub type ResumeHandler =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<Value, String>> + Send + Sync>;
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ResumeKind {
    Chat,
    Thread,
}
type Handlers = HashMap<(ResumeKind, String), ResumeHandler>;
#[derive(Clone, Default)]
pub struct InterventionRunResumeRegistry {
    handlers: Arc<Mutex<Handlers>>,
}
pub struct ResumeSubscription {
    handlers: Weak<Mutex<Handlers>>,
    kind: ResumeKind,
    id: String,
    handler: ResumeHandler,
}
impl ResumeSubscription {
    pub fn unsubscribe(&self) {
        if let Some(handlers) = self.handlers.upgrade() {
            let mut handlers = handlers.lock().unwrap();
            let key = (self.kind, self.id.clone());
            if handlers
                .get(&key)
                .is_some_and(|h| Arc::ptr_eq(h, &self.handler))
            {
                handlers.remove(&key);
            }
        }
    }
}
impl InterventionRunResumeRegistry {
    pub fn register(
        &self,
        kind: ResumeKind,
        id: &str,
        handler: ResumeHandler,
    ) -> ResumeSubscription {
        self.handlers
            .lock()
            .unwrap()
            .insert((kind, id.into()), handler.clone());
        ResumeSubscription {
            handlers: Arc::downgrade(&self.handlers),
            kind,
            id: id.into(),
            handler,
        }
    }
    pub async fn resume(&self, kind: ResumeKind, id: &str, message: &str) -> Value {
        let handler = self
            .handlers
            .lock()
            .unwrap()
            .get(&(kind, id.into()))
            .cloned();
        let Some(handler) = handler else {
            return json!({"status":"not-running"});
        };
        match handler(message.into()).await {
            Ok(value) => value,
            Err(error) => json!({"status":"error","error":error}),
        }
    }
    pub fn clear(&self) {
        self.handlers.lock().unwrap().clear();
    }
}
