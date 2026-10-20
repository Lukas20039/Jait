use crate::{config::GatewayConfig, health::HealthState, routes};
use axum::{Json, Router, extract::State, routing::get};
use std::{
    future::{Future, IntoFuture},
    io,
    net::SocketAddr,
    time::Duration,
};
use tokio::net::TcpListener;

pub struct Gateway {
    listener: TcpListener,
    router: Router,
}
impl Gateway {
    pub async fn bind(config: GatewayConfig, health: HealthState) -> io::Result<Self> {
        if !config.address.ip().is_loopback() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "migration gateway requires loopback",
            ));
        }
        let router = Router::new()
            .route("/health", get(health_response))
            .with_state(health);
        Ok(Self {
            listener: TcpListener::bind(config.address).await?,
            router,
        })
    }
    pub async fn bind_authenticated(
        config: GatewayConfig,
        health: HealthState,
        auth: routes::auth::AuthState,
    ) -> io::Result<Self> {
        let mut gateway = Self::bind(config, health).await?;
        gateway.router = gateway.router.merge(auth.router());
        Ok(gateway)
    }
    /// Explicit opt-in session API; production activation remains separately gated.
    pub fn with_sessions(mut self, sessions: routes::sessions::SessionRoutes) -> Self {
        self.router = self.router.merge(sessions.router());
        self
    }
    /// Opt-in immutable asset hook. Full frontend/static fallback serving is separate.
    pub fn with_static_asset_cache(
        mut self,
        cache: crate::services::static_asset_cache::StaticAssetCache,
    ) -> Self {
        self.router = self.router.layer(axum::middleware::from_fn_with_state(
            cache,
            crate::services::static_asset_cache::serve,
        ));
        self
    }
    /// Explicit opt-in user input routes; production mounting is separately gated.
    pub fn with_user_questions(
        mut self,
        routes: routes::user_questions::UserQuestionRoutes,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Webhooks retain their independent shared-secret authorization boundary.
    pub fn with_hooks(mut self, routes: routes::hooks::HookRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_trust(mut self, routes: routes::trust::TrustRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit opt-in secret input and encrypted-secret storage routes.
    pub fn with_secrets(mut self, routes: routes::secrets::SecretRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_assistant_profiles(
        mut self,
        routes: routes::assistant_profiles::AssistantProfileRoutes,
    ) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_architecture(mut self, routes: routes::architecture::ArchitectureRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn with_calendar(mut self, routes: routes::calendar::CalendarRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Opt-in owner control routes remain available while agents are halted.
    pub fn with_agent_control(mut self, routes: routes::agent_control::AgentControlRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    /// Explicit registry/checker/installer adapters; no automatic tool installs.
    pub fn with_skills(mut self, routes: routes::skills::SkillRoutes) -> Self {
        self.router = self.router.merge(routes.router());
        self
    }
    pub fn local_addr(&self) -> io::Result<SocketAddr> {
        self.listener.local_addr()
    }
    pub async fn serve(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> io::Result<()> {
        let (draining, mut drain_started) = tokio::sync::oneshot::channel();
        let server = axum::serve(self.listener, self.router)
            .with_graceful_shutdown(async move {
                shutdown.await;
                let _ = draining.send(());
            })
            .into_future();
        tokio::pin!(server);
        // Graceful drain has a ceiling so idle keepalives cannot wedge shutdown.
        tokio::select! {
            result = &mut server => result,
            _ = &mut drain_started => {
                tokio::time::timeout(Duration::from_secs(5), &mut server).await
                    .map_err(|_| io::Error::new(io::ErrorKind::TimedOut, "gateway drain exceeded five seconds"))?
            }
        }
    }
}
async fn health_response(State(health): State<HealthState>) -> Json<serde_json::Value> {
    Json(health.response())
}
