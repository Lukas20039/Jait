use url::Url;
pub fn is_allowed_request_origin(
    origin: Option<&str>,
    host: Option<&str>,
    cors_origin: &str,
) -> bool {
    let Some(origin) = origin.filter(|v| !v.is_empty()) else {
        return true;
    };
    if [
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "capacitor://localhost",
    ]
    .contains(&origin)
    {
        return true;
    }
    let Ok(url) = Url::parse(origin) else {
        return false;
    };
    if !["http", "https"].contains(&url.scheme()) || url.origin().ascii_serialization() != origin {
        return false;
    }
    let Some(name) = url.host_str() else {
        return false;
    };
    let authority = match url.port() {
        Some(port) => format!("{name}:{port}"),
        None => name.to_string(),
    };
    host == Some(authority.as_str())
        || cors_origin
            .split(',')
            .any(|v| crate::text::js_trim(v) == origin)
}
