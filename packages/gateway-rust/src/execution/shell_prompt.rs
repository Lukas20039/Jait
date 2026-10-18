//! Dependency-free shell-prompt recognition shared by terminal consumers.
use regex::Regex;
use std::sync::LazyLock;
static POWERSHELL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i-u)(^|[\\/])(pwsh|powershell)(\.exe)?$").unwrap());
static PS_PROMPT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^PS [^\n\r\x{2028}\x{2029}]+?>").unwrap());
static USER_PROMPT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^@\n]+@[^:]+:[^\n\r\x{2028}\x{2029}]*[$#]$").unwrap());
static PATH_PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:~|/|\.{1,2}(?:/|$)|[A-Za-z]:[\\/])[^\n\r\x{2028}\x{2029}]*[$#%]$").unwrap()
});
static HOST_PROMPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z][A-Za-z0-9_.-]*[\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]*[%$#]$").unwrap()
});
pub fn is_powershell_shell(shell: &str) -> bool {
    POWERSHELL.is_match(shell)
}
pub fn is_shell_prompt_line(line: &str, shell: &str) -> bool {
    let line = crate::text::js_trim(line);
    if line.is_empty() {
        return false;
    }
    if is_powershell_shell(shell) {
        return PS_PROMPT.is_match(line);
    }
    USER_PROMPT.is_match(line) || PATH_PROMPT.is_match(line) || HOST_PROMPT.is_match(line)
}
