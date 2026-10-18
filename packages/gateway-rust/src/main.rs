use jait_gateway::{Gateway, config::GatewayConfig, health::HealthState};
use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            // Config errors contain key names, never supplied values or credentials.
            eprintln!(
                "{}",
                serde_json::json!({"event":"gateway.error", "error":error.to_string()})
            );
            ExitCode::FAILURE
        }
    }
}
async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let config = GatewayConfig::from_lookup(|key| std::env::var(key).ok())?;
    // Install signals before announcing readiness.
    #[cfg(unix)]
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    #[cfg(unix)]
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    let gateway = Gateway::bind(config, HealthState::default()).await?;
    println!(
        "{}",
        serde_json::json!({"event":"gateway.ready", "address":gateway.local_addr()?.to_string(), "runtime":"rust", "migration":true})
    );
    gateway
        .serve(async move {
            #[cfg(unix)]
            tokio::select! { _ = terminate.recv() => {}, _ = interrupt.recv() => {} }
            #[cfg(not(unix))]
            if tokio::signal::ctrl_c().await.is_err() {
                eprintln!("{}", serde_json::json!({"event":"gateway.signal-error"}));
            }
        })
        .await?;
    println!("{}", serde_json::json!({"event":"gateway.stopped"}));
    Ok(())
}
