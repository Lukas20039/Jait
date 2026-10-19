//! Chat-owned exclusive computer-control leases. Transport authorization is a caller boundary.
use crate::time::{self, Clock};
use serde::Serialize;
use std::collections::HashMap;
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputerControlSession {
    pub id: String,
    pub node_id: String,
    pub owner_session_id: String,
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
}
pub struct ComputerControlSessionService {
    sessions: HashMap<String, (ComputerControlSession, i64)>,
    order: Vec<String>,
    clock: Clock,
    lease_ms: i64,
}
impl Default for ComputerControlSessionService {
    fn default() -> Self {
        Self::new(time::default_clock(), 30 * 60_000)
    }
}
impl ComputerControlSessionService {
    pub fn new(clock: Clock, lease_ms: i64) -> Self {
        Self {
            sessions: HashMap::new(),
            order: vec![],
            clock,
            lease_ms,
        }
    }
    fn remove_expired(&mut self) {
        let now = (self.clock)();
        self.sessions.retain(|_, (_, expires)| *expires > now);
        self.order.retain(|id| self.sessions.contains_key(id));
    }
    pub fn start(&mut self, owner: &str, node: &str) -> Result<ComputerControlSession, String> {
        self.remove_expired();
        if let Some((session, _)) = self.sessions.values().find(|(s, _)| s.node_id == node) {
            return Err(if session.owner_session_id == owner {
                format!(
                    "Computer session {} is already active on {node}",
                    session.id
                )
            } else {
                format!("Computer {node} is already controlled by another chat")
            });
        }
        let now = (self.clock)();
        let expires = now.checked_add(self.lease_ms).ok_or("Invalid time value")?;
        let session = ComputerControlSession {
            id: uuid::Uuid::new_v4().to_string(),
            node_id: node.into(),
            owner_session_id: owner.into(),
            status: "active".into(),
            created_at: time::iso(now)?,
            expires_at: time::iso(expires)?,
        };
        self.order.push(session.id.clone());
        self.sessions
            .insert(session.id.clone(), (session.clone(), expires));
        Ok(session)
    }
    pub fn get(&mut self, id: &str) -> Option<ComputerControlSession> {
        self.remove_expired();
        self.sessions.get(id).map(|(s, _)| s.clone())
    }
    pub fn require_owned(
        &mut self,
        id: &str,
        owner: &str,
    ) -> Result<ComputerControlSession, String> {
        let session = self
            .get(id)
            .ok_or_else(|| format!("Computer session {id} is not active"))?;
        if session.owner_session_id != owner {
            return Err(format!("Computer session {id} belongs to another chat"));
        }
        Ok(session)
    }
    pub fn list_for_owner(&mut self, owner: &str) -> Vec<ComputerControlSession> {
        self.remove_expired();
        self.order
            .iter()
            .filter_map(|id| self.sessions.get(id))
            .filter(|(s, _)| s.owner_session_id == owner)
            .map(|(s, _)| s.clone())
            .collect()
    }
    // Deliberately does not expire first: stopping a stored expired lease returns it.
    pub fn stop(&mut self, id: &str) -> Option<ComputerControlSession> {
        self.order.retain(|key| key != id);
        self.sessions.remove(id).map(|(s, _)| s)
    }
}
