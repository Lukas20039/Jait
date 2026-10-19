//! Model/provider protocols and capabilities belong here, behind a common stream API.
//! Reuse pooled HTTP clients; use local protocol peers for deterministic acceptance.
//! Provider adapters and outbound clients remain unported.

pub mod acp_terminal;
pub mod jait_mcp;
pub mod registry;
pub mod todo_result;

pub mod opencode_credentials;
pub mod snapshot;

pub mod provider_auth;

pub mod pi_mcp_provision;
