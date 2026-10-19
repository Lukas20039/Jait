//! Black-box process assertions shared by the Bun and native launch commands.
#[allow(dead_code)]
#[path = "../src/client.rs"]
mod client;
#[allow(dead_code)]
#[path = "../src/fixture.rs"]
mod fixture;
use anyhow::Result;
use std::{
    fs,
    net::{SocketAddr, TcpListener, TcpStream},
    path::PathBuf,
};
fn start() -> Result<fixture::Gateway> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let dir = root
        .join(".jait/artifacts/migration-process")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir)?;
    fixture::Gateway::start(&root, &dir, None)
}
fn address(g: &fixture::Gateway) -> SocketAddr {
    g.api.base.strip_prefix("http://").unwrap().parse().unwrap()
}
#[test]
fn process_restart_reports_fresh_readiness_and_releases_previous_listener() -> Result<()> {
    let mut g = start()?;
    let old = address(&g);
    let pid = g.process_id();
    g.restart()?;
    assert_ne!(pid, g.process_id());
    g.api.expect("GET", "/health", None, None, 200)?;
    if old != address(&g) {
        let _listener = TcpListener::bind(old)?;
    }
    let current = address(&g);
    g.stop()?;
    let _listener = TcpListener::bind(current)?;
    Ok(())
}
#[cfg(unix)]
#[test]
fn graceful_shutdown_finishes_with_an_open_idle_connection() -> Result<()> {
    let mut g = start()?;
    let addr = address(&g);
    let _idle = TcpStream::connect(addr)?;
    g.shutdown()?;
    let _listener = TcpListener::bind(addr)?;
    Ok(())
}
