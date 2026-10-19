//! Model/provider protocols and capabilities belong here, behind a common stream API.
//! Reuse pooled HTTP clients; use local protocol peers for deterministic acceptance.
//! Provider adapters and outbound clients remain unported.

pub mod todo_result;

pub mod opencode_credentials;
pub mod snapshot;
