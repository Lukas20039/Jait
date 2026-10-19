//! Tool dispatch, child processes, PTY, filesystem and OS execution belong here.
//! Require validated policy/consent before effects; bound output and reap descendants.
//! Generic execution does not grant assessment scope. Execution remains unported.

pub mod command_timeout;
pub mod completion_output;
pub mod shell_prompt;
