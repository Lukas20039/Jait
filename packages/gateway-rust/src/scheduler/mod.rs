//! Durable job scheduling and restart recovery belong here.
//! Use persisted state and Tokio timers; revalidate authorization/expiry on each run.
//! Do not hold database transactions across external work. Scheduling remains unported.

pub mod hooks;

pub mod cron;
