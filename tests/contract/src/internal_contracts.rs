//! Assertions over the actual TypeScript implementation, not algorithm copies.
use crate::internal_driver;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::path::Path;

type Check = fn(&Path, &Path, &dyn Fn() -> bool) -> Result<()>;
pub const CASES: &[(&str, Check)] = &[
    ("internal.auth-public-github-callbacks", public_github),
    ("internal.auth-protected-github-routes", protected_github),
    ("internal.auth-exact-public-paths", exact_paths),
    ("internal.auth-legacy-public-paths", legacy_public),
    ("internal.auth-session-roundtrip", session_roundtrip),
    ("internal.auth-wrong-secret", wrong_secret),
    ("internal.auth-purpose-token-rejected", purpose_token),
    ("internal.auth-bearer-shapes", bearer_shapes),
    ("internal.auth-cookie-name", cookie_name),
    ("internal.commands-observed-destructive", observed_commands),
    ("internal.commands-common-destructive", destructive_commands),
    ("internal.commands-ordinary-allowed", ordinary_commands),
];

fn expect(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    calls: Value,
    expected: Value,
) -> Result<()> {
    let actual = internal_driver::call(
        root,
        directory,
        json!({"version":1,"calls":calls}),
        cancelled,
    )?;
    ensure!(
        actual == expected,
        "driver returned {actual}; expected {expected}"
    );
    Ok(())
}
fn paths(
    root: &Path,
    directory: &Path,
    cancelled: &dyn Fn() -> bool,
    inputs: &[&str],
    expected: bool,
) -> Result<()> {
    expect(
        root,
        directory,
        cancelled,
        Value::Array(
            inputs
                .iter()
                .map(|path| json!({"op":"auth.public","path":path}))
                .collect(),
        ),
        Value::Array(inputs.iter().map(|_| json!(expected)).collect()),
    )
}
fn public_github(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &["/api/github/apps/callback", "/api/github/apps/webhook"],
        true,
    )
}
fn protected_github(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/github-apps",
            "/api/agents/abc/github-app",
            "/api/agents/abc/github-app/setup",
            "/api/agents/abc/github-app/manual",
        ],
        false,
    )
}
fn exact_paths(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/github/apps/callback/extra",
            "/api/github/apps/webhook/extra",
            "/preview/api/github/apps/callback",
        ],
        false,
    )
}
fn legacy_public(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    paths(
        r,
        d,
        c,
        &[
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/mobile/discovery",
            "/api/email/oauth/callback",
            "/api/calendar/oauth/callback",
        ],
        true,
    )
}
fn session_roundtrip(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.roundtrip","user":{"id":"user-1","username":"jakob"},"secret":"fixture-secret"}]),
        json!([{"id":"user-1","username":"jakob"}]),
    )
}
fn wrong_secret(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.roundtrip","user":{"id":"user-1","username":"jakob"},"secret":"fixture-secret","verifySecret":"other-secret"}]),
        json!([null]),
    )
}
fn purpose_token(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.claims","claims":{"username":"jakob","purpose":"preview"},"subject":"user-1","secret":"fixture-secret"}]),
        json!([null]),
    )
}
fn bearer_shapes(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([
            {"op":"auth.bearer","header":"Bearer abc"},{"op":"auth.bearer","header":"bearer  abc "},
            {"op":"auth.bearer","header":"Basic abc"},{"op":"auth.bearer"},{"op":"auth.bearer","header":"Bearer   "}
        ]),
        json!(["abc", "abc", null, null, null]),
    )
}
fn cookie_name(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    expect(
        r,
        d,
        c,
        json!([{"op":"auth.cookie"}]),
        json!(["jait_token"]),
    )
}
fn commands(
    r: &Path,
    d: &Path,
    c: &dyn Fn() -> bool,
    inputs: &[&str],
    irreversible: bool,
    reason: bool,
) -> Result<()> {
    let calls: Vec<Value> = inputs
        .iter()
        .map(|command| json!({"op":"command.classify","command":command}))
        .collect();
    let actual = internal_driver::call(r, d, json!({"version":1,"calls":calls}), c)?;
    let values = actual.as_array().expect("transport validates array");
    ensure!(
        values.len() == inputs.len(),
        "classification result count changed"
    );
    for (command, result) in inputs.iter().zip(values) {
        ensure!(
            result["irreversible"] == irreversible,
            "wrong classification for {command}: {result}"
        );
        if reason {
            ensure!(
                result["reason"].as_str().is_some_and(|s| !s.is_empty()),
                "missing classification reason for {command}"
            );
        }
    }
    Ok(())
}
fn observed_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "cd /home/jakob/TizenAnilabStream && git stash && cd watch && npm test 2>&1 > /tmp/out.log; cd .. && git stash pop",
            "git checkout -- watch/data/watch.sqlite && git stash pop",
            "cd /home/jakob/TizenAnilabStream && git rm --cached watch/data/watch.sqlite >/dev/null && echo \"untracked\"",
            "pkill -f \"node server.js\" 2>/dev/null; sleep 1",
            "pkill -f \"PORT=8935\" 2>/dev/null; pkill -f \"server.js\" 2>/dev/null",
        ],
        true,
        true,
    )
}
fn destructive_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "git reset --hard origin/main",
            "rm -rf node_modules",
            "git clean -fd",
            "git push --force origin main",
        ],
        true,
        false,
    )
}
fn ordinary_commands(r: &Path, d: &Path, c: &dyn Fn() -> bool) -> Result<()> {
    commands(
        r,
        d,
        c,
        &[
            "npm test 2>&1 | tail -20",
            "git status --short",
            "git stash list",
            "git diff --stat && git log --oneline -5",
            "cd /home/jakob/TizenAnilabStream && git push origin main",
            "ssh jakob@base \"docker stack deploy -c watch.yml watch\"",
            "git add watch/native.html && git commit -m 'fix'",
            "node --test tests/frontend.test.js",
        ],
        false,
        false,
    )
}
