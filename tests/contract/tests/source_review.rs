//! Source-level reference acceptance. Production files are never mutated.
#[path = "../src/fixture_internal_contracts.rs"]
mod fixture_internal_contracts;
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn artifacts() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/source-review")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn registry() -> Value {
    serde_json::from_slice(&fs::read(root().join("tests/contract/source-reviews.json")).unwrap())
        .unwrap()
}
fn digest(path: &Path) -> String {
    hex::encode(Sha256::digest(fs::read(path).unwrap()))
}

#[test]
fn reviewed_sources_pass_and_reject_mutations() {
    let directory = artifacts();
    let registry = registry();
    let sources = registry["sources"].as_array().unwrap();
    let cases: Vec<_> = fixture_internal_contracts::cases(&root())
        .unwrap()
        .into_iter()
        .filter(|case| case.id().starts_with("internal.sourcereview."))
        .collect();
    let registered: BTreeSet<_> = sources
        .iter()
        .flat_map(|s| s["case_ids"].as_array().unwrap())
        .map(|id| id.as_str().unwrap())
        .collect();
    assert_eq!(
        registered,
        cases.iter().map(|c| c.id()).collect(),
        "reviewed vector inventory drift"
    );
    assert_eq!(
        registered,
        REQUIRED_CASES.iter().copied().collect(),
        "Rust registration drift"
    );
    let unique_paths: BTreeSet<_> = sources
        .iter()
        .map(|s| s["path"].as_str().unwrap())
        .collect();
    assert_eq!(unique_paths.len(), sources.len(), "duplicate source review");
    let vectors: Vec<Value> = serde_json::from_slice(
        &fs::read(root().join("tests/contract/vectors/sourcereview.json")).unwrap(),
    )
    .unwrap();
    for source in sources {
        for id in source["case_ids"].as_array().unwrap() {
            let vector = vectors.iter().find(|v| v["id"] == *id).unwrap();
            assert!(
                vector["calls"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|c| c["module"] == source["module"]),
                "source review borrowed another module's cases"
            );
        }
    }
    let mut hashes = serde_json::Map::new();
    for path in unique_paths.iter().copied().chain([
        "tests/contract/source-reviews.json",
        "tests/contract/drivers/sourcereview.ts",
        "tests/contract/vectors/sourcereview.json",
        "tests/contract/tests/source_review.rs",
        "tests/contract/src/internal_driver.rs",
        "tests/contract/src/fixture_internal_contracts.rs",
        "tests/contract/drivers/internals.ts",
        "tests/contract/Cargo.toml",
        "tests/contract/Cargo.lock",
    ]) {
        hashes.insert(path.to_owned(), json!(digest(&root().join(path))));
    }
    let mut verdicts = Vec::new();
    for case in &cases {
        fixture_internal_contracts::check(&root(), &directory, &|| false, case).unwrap_or_else(
            |error| panic!("{}: {error:#}; evidence {}", case.id(), directory.display()),
        );
        verdicts.push(json!({"id":case.id(),"status":"passed"}));
    }
    let mut mutations = Vec::new();
    for source in sources {
        let module = source["module"].as_str().unwrap();
        let path = source["path"].as_str().unwrap();
        let specifier = format!("../../../{path}");
        let work = directory.join(format!("mutation-{module}"));
        let drivers = work.join("tests/contract/drivers");
        fs::create_dir_all(&drivers).unwrap();
        let original = fs::read_to_string(root().join(path)).unwrap();
        let copy = work.join("subject.ts");
        // Only preview-token has a runtime package import. Resolve it at its original boundary.
        let parent = root().join(path).parent().unwrap().to_path_buf();
        // Keep relative import/require targets at their production boundary when copying
        // a subject; both quote styles and parent-directory imports occur in modules.
        let mut original = original;
        for syntax in ["from ", "import(", "require("] {
            for quote in ["\"", "'"] {
                for relative in ["../../", "../", "./"] {
                    original = original.replace(
                        &format!("{syntax}{quote}{relative}"),
                        &format!(
                            "{syntax}{quote}{}/",
                            parent.join(relative).canonicalize().unwrap().display()
                        ),
                    );
                }
            }
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            root().join("packages/gateway/node_modules"),
            work.join("node_modules"),
        )
        .unwrap();
        let sandboxed = original.replace(
            "from \"jose\"",
            &format!(
                "from {:?}",
                root()
                    .join("packages/gateway/node_modules/jose")
                    .to_str()
                    .unwrap()
            ),
        );
        fs::write(&copy, &sandboxed).unwrap();
        let mut adapter =
            fs::read_to_string(root().join("tests/contract/drivers/sourcereview.ts")).unwrap();
        for reviewed in sources {
            let relative = format!("../../../{}", reviewed["path"].as_str().unwrap());
            let actual = if reviewed["module"] == module {
                copy.clone()
            } else {
                root().join(reviewed["path"].as_str().unwrap())
            };
            adapter = adapter.replace(&relative, actual.to_str().unwrap());
        }
        adapter = adapter.replace(
            "../../../packages/gateway/node_modules/jose",
            root()
                .join("packages/gateway/node_modules/jose")
                .to_str()
                .unwrap(),
        );
        adapter = adapter.replace(
            "../../../packages/gateway/node_modules/fastify",
            root()
                .join("packages/gateway/node_modules/fastify")
                .to_str()
                .unwrap(),
        );
        adapter = adapter.replace(
            "new URL('../../../', import.meta.url)",
            &format!(
                "new URL({:?})",
                reqwest::Url::from_directory_path(root()).unwrap().as_str()
            ),
        );
        // Artifact copies cannot rely on the original driver's dependency resolution.
        adapter = adapter.replace(
            "import('typescript')",
            &format!(
                "import({:?})",
                root()
                    .join("node_modules/typescript/lib/typescript.js")
                    .to_str()
                    .unwrap()
            ),
        );
        assert!(!adapter.contains(&specifier));
        fs::write(drivers.join("sourcereview.ts"), adapter).unwrap();
        fs::write(
            drivers.join("internals.ts"),
            r#"
import { dispatch } from './sourcereview.ts';
const request = await Bun.stdin.json();
const results = [];
for (const call of request.calls) results.push(await dispatch(call));
process.stdout.write(JSON.stringify({version:1,results}));
"#,
        )
        .unwrap();
        let mutation = &source["mutation"];
        let id = mutation["case_id"].as_str().unwrap();
        let case = cases.iter().find(|c| c.id() == id).unwrap();
        let from = mutation["find"].as_str().unwrap();
        let to = mutation["replace"].as_str().unwrap();
        assert!(
            sandboxed.contains(from),
            "mutation anchor missing: {module}"
        );
        fixture_internal_contracts::check(&work, &work, &|| false, case)
            .unwrap_or_else(|e| panic!("{module} sandbox baseline: {e:#}"));
        fs::write(&copy, sandboxed.replacen(from, to, 1)).unwrap();
        let error = fixture_internal_contracts::check(&work, &work, &|| false, case)
            .expect_err("source mutation must fail");
        assert!(
            error.to_string().contains("equality assertion failed"),
            "{module} mutation failed setup instead of behavior: {error:#}"
        );
        fs::write(&copy, &sandboxed).unwrap();
        fixture_internal_contracts::check(&work, &work, &|| false, case)
            .unwrap_or_else(|e| panic!("{module} restored: {e:#}"));
        mutations.push(json!({"path":path,"case":id,"before":"passed","mutated":"assertion-failed","restored":"passed","error":error.to_string()}));
    }
    for (path, hash) in &hashes {
        assert_eq!(
            hash,
            &digest(&root().join(path)),
            "source changed during review: {path}"
        );
    }
    let report = json!({"schema_version":1,"backend_label":"typescript","success":true,"profile":"source-runtime-review",
        "cases":verdicts,"mutations":mutations,"source_sha256":hashes,"limits":[
            "Reference behavior only; no native Rust implementation parity claim.",
            "Erased modules have no runtime behavior; static type/schema contract parity remains separate.",
            "Linux runtime fixtures; supported-platform migration evidence remains separate."]});
    fs::write(
        directory.join("report.json"),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    println!(
        "Source review report: {}",
        directory.join("report.json").display()
    );
}

// Explicit reviewed IDs; deleting a vector or its review fails this registration.
const REQUIRED_CASES: &[&str] = &[
    "internal.sourcereview.subscription-cookie-normalization",
    "internal.sourcereview.subscription-cookie-denials",
    "internal.sourcereview.subscription-settings-parser",
    "internal.sourcereview.subscription-settings-invalid-meters",
    "internal.sourcereview.subscription-go-request-and-schema",
    "internal.sourcereview.subscription-go-http-errors",
    "internal.sourcereview.subscription-settings-fetch-and-cancel",
    "internal.sourcereview.subscription-settings-http-denials",
    "internal.sourcereview.subscription-settings-stream-failures",
    "internal.sourcereview.messenger-bridge-owner-routing",
    "internal.sourcereview.messenger-bridge-gateway-precedence",
    "internal.sourcereview.messenger-bridge-validation-order",
    "internal.sourcereview.messenger-bridge-tab-selection",
    "internal.sourcereview.messenger-bridge-completion-validation",
    "internal.sourcereview.messenger-bridge-output-bounds",
    "internal.sourcereview.messenger-bridge-session-cleanup",
    "internal.sourcereview.messenger-bridge-pending-cap",
    "internal.sourcereview.agent-control-halt-audit",
    "internal.sourcereview.agent-control-read-resume",
    "internal.sourcereview.agent-control-auth-and-validation",
    "internal.sourcereview.agent-control-partial-audit-failure",
    "internal.sourcereview.plugin-route-config-merge",
    "internal.sourcereview.plugin-route-lifecycle",
    "internal.sourcereview.plugin-route-missing-and-auth",
    "internal.sourcereview.plugin-route-failure-mapping",
    "internal.sourcereview.screen-share-device-registration",
    "internal.sourcereview.screen-share-validation",
    "internal.sourcereview.screen-share-lifecycle-events",
    "internal.sourcereview.screen-share-state-and-capture",
    "internal.sourcereview.screen-share-service-failure",
    "internal.sourcereview.maintenance-route-list-coercion",
    "internal.sourcereview.maintenance-route-auth-and-input",
    "internal.sourcereview.maintenance-route-success-effects",
    "internal.sourcereview.maintenance-route-failure-effects",
    "internal.sourcereview.maintenance-route-runtime-error",
    "internal.sourcereview.os-resolver-selection",
    "internal.sourcereview.os-resolver-connection-list",
    "internal.sourcereview.os-resolver-errors",
    "internal.sourcereview.surface-stop-outcomes",
    "internal.sourcereview.surface-list-output",
    "internal.sourcereview.surface-generic-start",
    "internal.sourcereview.surface-browser-routing",
    "internal.sourcereview.surface-browser-fallbacks",
    "internal.sourcereview.surface-start-failures",
    "internal.sourcereview.smoke-process-exit-detection",
    "internal.sourcereview.smoke-process-synchronous-exit",
    "internal.sourcereview.smoke-process-real-child",
    "internal.sourcereview.compile-cache-path-precedence",
    "internal.sourcereview.bundle-web-missing-index",
    "internal.sourcereview.bundle-web-replace-and-copy",
    "internal.sourcereview.bundle-messenger-build-arguments",
    "internal.sourcereview.bundle-messenger-build-failures",
    "internal.sourcereview.install-runtime-missing-layout",
    "internal.sourcereview.install-runtime-provision-boundary",
    "internal.sourcereview.foundation-runtime-barrel",
    "internal.sourcereview.plugin-sdk-metadata-and-wrapper",
    "internal.sourcereview.plugin-sdk-setup-and-dispose",
    "internal.sourcereview.plugin-sdk-callback-failure",
    "internal.sourcereview.agent-wrapper-exact-forwarding",
    "internal.sourcereview.agent-wrapper-rejection",
    "internal.sourcereview.decision-criteria-and-forwarding",
    "internal.sourcereview.decision-empty-criteria",
    "internal.sourcereview.decision-invalid-ids",
    "internal.sourcereview.decision-service-failure",
    "internal.sourcereview.cron-add-request-policy",
    "internal.sourcereview.cron-update-remove-scope",
    "internal.sourcereview.cron-list-shapes",
    "internal.sourcereview.cron-list-limit",
    "internal.sourcereview.cron-dependency-rejection",
    "internal.sourcereview.session-sql-schema-branch",
    "internal.sourcereview.session-sql-query-forwarding",
    "internal.sourcereview.session-sql-invalid-input",
    "internal.sourcereview.ollama-setup-local-metadata",
    "internal.sourcereview.ollama-setup-remote-urls",
    "internal.sourcereview.network-inventory-cache-expiry",
    "internal.sourcereview.network-container-metadata",
    "internal.sourcereview.network-inventory-batch-cap",
    "internal.sourcereview.network-inventory-json-failure",
    "internal.sourcereview.maintenance-single-repository",
    "internal.sourcereview.maintenance-all-repositories",
    "internal.sourcereview.maintenance-error-fallback",
    "internal.sourcereview.maintenance-without-notifications",
    "internal.sourcereview.node-client-disconnect-isolation",
    "internal.sourcereview.node-capabilities-and-protocol",
    "internal.sourcereview.node-rebind-and-sort",
    "internal.sourcereview.project-transfer-literal-arguments",
    "internal.sourcereview.project-transfer-validation",
    "internal.sourcereview.project-transfer-failure-order",
    "internal.sourcereview.notification-normalization-boundaries",
    "internal.sourcereview.notification-generation-request",
    "internal.sourcereview.notification-generation-truncation",
    "internal.sourcereview.notification-generation-empty",
    "internal.sourcereview.notification-generation-failure",
    "internal.sourcereview.surface-policy",
    "internal.sourcereview.ownership-policy",
    "internal.sourcereview.assessment-exclusive-and-stale-release",
    "internal.sourcereview.state-path-policy",
    "internal.sourcereview.crypto-preserve",
    "internal.sourcereview.crypto-install",
    "internal.sourcereview.inline-cid-replacement",
    "internal.sourcereview.inline-image-types-and-base64",
    "internal.sourcereview.inline-image-size-limits",
    "internal.sourcereview.preview-sign-and-scope",
    "internal.sourcereview.preview-invalid-claims",
    "internal.sourcereview.preview-malformed",
    "internal.sourcereview.request-origin-policy",
    "internal.sourcereview.git-node-routing",
    "internal.sourcereview.shell-executable-recognition",
    "internal.sourcereview.shell-prompt-lines",
    "internal.sourcereview.llm-header-routing",
    "internal.sourcereview.llm-header-generated-identity",
    "internal.sourcereview.cron-syntax-boundaries",
    "internal.sourcereview.uuid-zero-timestamp",
    "internal.sourcereview.uuid-max-timestamp",
    "internal.sourcereview.uuid-timestamp-bytes",
    "internal.sourcereview.uuid-webcrypto-fallback",
    "internal.sourcereview.dbuuid-zero-timestamp",
    "internal.sourcereview.dbuuid-max-timestamp",
    "internal.sourcereview.dbuuid-timestamp-bytes",
    "internal.sourcereview.device-registry-transitions",
    "internal.sourcereview.erased-apitypes",
    "internal.sourcereview.erased-channeltypes",
    "internal.sourcereview.erased-memorytypes",
    "internal.sourcereview.erased-ostypes",
    "internal.sourcereview.erased-providertypes",
    "internal.sourcereview.erased-schedulertypes",
    "internal.sourcereview.erased-securitytypes",
    "internal.sourcereview.erased-calendartypes",
    "internal.sourcereview.erased-emailtypes",
    "internal.sourcereview.erased-sessiontypes",
    "internal.sourcereview.erased-surfacetypes",
    "internal.sourcereview.erased-tooltypes",
    "internal.sourcereview.voice-input-and-errors",
    "internal.sourcereview.editor-context-and-channel",
    "internal.sourcereview.list-preview-text",
    "internal.sourcereview.list-preview-limits",
    "internal.sourcereview.list-preview-composition",
    "internal.sourcereview.swarm-round-lifecycle",
    "internal.sourcereview.control-execution-session",
    "internal.sourcereview.control-session-ownership",
    "internal.sourcereview.control-surface-ownership",
    "internal.sourcereview.control-consent-ownership",
    "internal.sourcereview.trust-route-forwarding",
    "internal.sourcereview.hook-route-auth-and-delivery",
    "internal.sourcereview.barrel-emailbarrel",
    "internal.sourcereview.barrel-calendarbarrel",
    "internal.sourcereview.barrel-dbbarrel",
    "internal.sourcereview.barrel-providerbarrel",
    "internal.sourcereview.barrel-osbarrel",
    "internal.sourcereview.barrel-surfacebarrel",
    "internal.sourcereview.barrel-securitybarrel",
    "internal.sourcereview.barrel-corebarrel",
    "internal.sourcereview.terminal-output-command-boundaries",
    "internal.sourcereview.terminal-output-cursor-normalization",
    "internal.sourcereview.diagram-exact-source-limit",
    "internal.sourcereview.diagram-input-and-title-policy",
    "internal.sourcereview.mobile-alarm-auth-and-time",
    "internal.sourcereview.mobile-alarm-delivery",
    "internal.sourcereview.worktree-registration-mount",
    "internal.sourcereview.sandbox-owner-runtime-identity",
    "internal.sourcereview.link-search-encoding",
    "internal.sourcereview.link-invalid-boundaries",
    "internal.sourcereview.usage-cache-force-and-inflight",
    "internal.sourcereview.usage-cache-backoff-cap-and-reset",
    "internal.sourcereview.usage-cache-capacity-and-expiry",
    "internal.sourcereview.codex-mcp-default-and-preservation",
    "internal.sourcereview.codex-mcp-invalid-shapes",
    "internal.sourcereview.codex-mcp-constants",
    "internal.sourcereview.matrix-runtime-barrel",
    "internal.sourcereview.messenger-tool-policy",
    "internal.sourcereview.messenger-connect-limits",
    "internal.sourcereview.messenger-command-forwarding",
    "internal.sourcereview.messenger-command-denials",
    "internal.sourcereview.skill-discovery-injection",
    "internal.sourcereview.model-result-projection",
    "internal.sourcereview.model-result-bounds",
    "internal.sourcereview.usage-parsers-and-rejections",
    "internal.sourcereview.usage-accumulation-policies",
    "internal.sourcereview.usage-metrics-labels",
];
