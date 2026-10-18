//! Native gateway. See docs/gateway-rust-architecture.md for ownership and stack decisions.
//! Reserved domain modules define boundaries; they do not represent migrated features.
pub mod assessments;
pub mod config;
pub mod contracts;
pub mod coordination;
pub mod db;
pub mod execution;
pub mod health;
pub mod integrations;
pub mod memory;
pub mod nodes;
pub mod observability;
pub mod providers;
pub mod routes;
pub mod runtime;
pub mod scheduler;
pub mod security;
pub mod services;
pub mod state_directory;
pub mod surfaces;
mod text;
pub mod transport;

// Preserve the public API used by the existing native acceptance suite.
pub use runtime::Gateway;
pub const VERSION: &str = env!("JAIT_GATEWAY_VERSION");
