//! Process lifecycle and bounded work. Domain services do not own the runtime.
pub mod blocking;
mod server;

pub use server::Gateway;

pub mod command;
