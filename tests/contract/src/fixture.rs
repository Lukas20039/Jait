use crate::client::Api;
use anyhow::{Context, Result, bail, ensure};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread::sleep,
    time::{Duration, Instant},
};

pub static CANCELLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn check_cancelled() -> Result<()> {
    ensure!(
        !CANCELLED.load(std::sync::atomic::Ordering::SeqCst),
        "contract run cancelled"
    );
    Ok(())
}

pub struct Gateway {
    child: Option<Child>,
    pub api: Api,
    root: PathBuf,
    run_dir: PathBuf,
    secret: String,
    pub managed: bool,
}

impl Gateway {
    pub fn start(root: &Path, run_dir: &Path, external: Option<&str>) -> Result<Self> {
        let mut gateway = Self {
            child: None,
            api: Api::new(external.unwrap_or("http://127.0.0.1"))?,
            root: root.into(),
            run_dir: run_dir.into(),
            secret: uuid::Uuid::new_v4().to_string(),
            managed: external.is_none(),
        };
        if gateway.managed {
            gateway.launch()?;
        } else {
            gateway.api.expect("GET", "/health", None, None, 200)?;
        }
        Ok(gateway)
    }

    fn launch(&mut self) -> Result<()> {
        let state = self.run_dir.join("state");
        fs::create_dir_all(&state)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&state, fs::Permissions::from_mode(0o700))?;
        }
        let ready = self.run_dir.join("ready-port");
        if ready.exists() {
            fs::remove_file(&ready)?;
        }
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.run_dir.join("gateway.log"))?;
        let bun = std::env::var("JAIT_CONTRACT_BUN").unwrap_or_else(|_| "bun".into());
        let bootstrap = "import {main} from './src/index.ts'; import {writeFileSync} from 'node:fs'; await main({evaluation:true,onReady(port){writeFileSync(process.env.JAIT_CONTRACT_READY_FILE,String(port))}});";
        let mut command = Command::new(bun);
        command
            .args(["--eval", bootstrap])
            .current_dir(self.root.join("packages/gateway"))
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default())
            .env("__JAIT_CLI", "1")
            .env("NODE_ENV", "test")
            .env("HOST", "127.0.0.1")
            .env("PORT", "0")
            .env("WS_PORT", "0")
            .env("LOG_LEVEL", "error")
            .env("JWT_SECRET", &self.secret)
            .env("JAIT_STATE_DIR", &state)
            .env("JAIT_DB_PATH", state.join("jait.db"))
            .env("JAIT_CONTRACT_READY_FILE", &ready)
            .env("JAIT_NODE_ONLY", "false")
            .env("JAIT_PRIMARY_GATEWAY", "")
            .env("JAIT_DISK_JANITOR_ENABLED", "0")
            .env("JAIT_WINDOWS_SANDBOX_STORAGE", state.join("sandbox"))
            .env("JAIT_WEB_DIR", self.root.join("apps/web/public"))
            .env("OLLAMA_URL", "http://127.0.0.1:9")
            .env("OPENAI_BASE_URL", "http://127.0.0.1:9")
            .env("OMNIROUTE_BASE_URL", "http://127.0.0.1:9")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));
        // Preserve the real home only for ordinary executable/runtime resolution.
        // All Jait state is explicitly redirected; no provider credentials are inherited.
        for key in ["HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP"] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        self.child = Some(
            command
                .spawn()
                .context("could not start disposable gateway (install Bun)")?,
        );
        let deadline = Instant::now() + Duration::from_secs(60);
        while Instant::now() < deadline {
            check_cancelled()?;
            if let Some(status) = self.child.as_mut().unwrap().try_wait()? {
                bail!("disposable gateway exited {status}; inspect gateway.log");
            }
            if let Ok(text) = fs::read_to_string(&ready)
                && let Ok(port) = text.parse::<u16>()
            {
                ensure!(port > 0, "gateway reported invalid port");
                self.api = Api::new(&format!("http://127.0.0.1:{port}"))?;
                self.api.expect("GET", "/health", None, None, 200)?;
                return Ok(());
            }
            sleep(Duration::from_millis(100));
        }
        bail!("gateway startup exceeded 60 seconds; inspect gateway.log")
    }

    pub fn restart(&mut self) -> Result<()> {
        ensure!(self.managed, "restart requires an owned disposable gateway");
        self.stop()?;
        self.launch()
    }

    pub fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            if child.try_wait()?.is_none() {
                child.kill()?;
            }
            child.wait()?;
        }
        Ok(())
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

/// Create an isolated, project-local artifact directory even when invoked elsewhere.
pub fn run_directory(root: &Path) -> Result<PathBuf> {
    let directory = root
        .join(".jait/artifacts/contracts")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&directory)?;
    // Reserve a report location immediately so startup failures can be recorded.
    File::create(directory.join("report.json"))?;
    Ok(directory)
}
