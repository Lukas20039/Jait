use std::{
    fmt,
    net::{IpAddr, Ipv4Addr, SocketAddr},
};

/// Isolated bootstrap settings. Does not read dotenv, credentials, or live state.
#[derive(Clone, Debug)]
pub struct GatewayConfig {
    pub address: SocketAddr,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ConfigError(&'static str);
impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for ConfigError {}

impl GatewayConfig {
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let host = lookup("JAIT_RUST_HOST").unwrap_or_else(|| "127.0.0.1".into());
        let host: IpAddr = host
            .parse()
            .map_err(|_| ConfigError("JAIT_RUST_HOST must be a literal loopback IP"))?;
        if !host.is_loopback() {
            return Err(ConfigError(
                "JAIT_RUST_HOST must be loopback during migration",
            ));
        }
        let port = lookup("JAIT_RUST_PORT").unwrap_or_else(|| "8220".into());
        if port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
            return Err(ConfigError(
                "JAIT_RUST_PORT must be an integer from 0 to 65535",
            ));
        }
        let port: u16 = port
            .parse()
            .map_err(|_| ConfigError("JAIT_RUST_PORT must be an integer from 0 to 65535"))?;
        Ok(Self {
            address: SocketAddr::new(host, port),
        })
    }
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            address: SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 8220),
        }
    }
}
