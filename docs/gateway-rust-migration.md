# Gateway migration to Rust

Status: Rust test-suite reconstruction first; no gateway implementation has been migrated.

## Scope and completion

Replace all Jait-owned TypeScript/JavaScript gateway runtime orchestration with a native Rust gateway. TypeScript web/mobile/API clients remain supported through compatible versioned HTTP, WebSocket, SSE and tool schemas. External engines, browsers and agent executables remain separately declared dependencies; retaining a Jait TypeScript worker/bridge does not satisfy completion. Run the Rust gateway with Node/Bun absent to prove that boundary.

The Rust acceptance suite in `tests/contract` currently passes 93/93 managed HTTP/restart scenarios and 50/50 TypeScript internal-reference scenarios. The reviewed inventory credits 74 declarations (38 added in the latest security batch), with 3,020 declaration/source requirements pending in the existing inventory. Formatting, Clippy and all 16 Rust unit/runner checks pass. The inventory audit remains blocked by concurrent Messenger source changes and a removed regression test; that removed requirement has been retained pending review rather than counted as completed. Three DeepSeek Flash reconstruction batches are prepared, but Jait rejected their launch because autonomous agents are globally halted. A Rust migration is complete only when every inventoried component has passing unit/protocol/integration/acceptance evidence, full client parity, supported-platform results, measured memory gains and a verified backup/rollback path. Disabled or skipped required integrations remain unresolved.

## Rust-first prerequisite and parallel test lanes

The complete gateway test suite must be reconstructed in Rust and pass against the existing TypeScript gateway **before R09 or any subsequent gateway implementation port begins**. Expanding or fixing TypeScript tests is not the migration deliverable. Existing TypeScript tests are the behavioral specification and baseline; expose uncertain or failing behaviors as gaps instead of silently changing their assertions.

`tests/contract/coverage.json` inventories every discovered gateway test declaration with its source location, name, describe hierarchy, modifiers, proposed test lane and replacement boundary. Every declaration starts pending, including skipped/parameterized declarations. It also inventories non-test gateway source files and their direct static test imports so previously untested areas require explicit review. Static imports do not prove coverage; declarations inside `each`/loops require runtime expansion review. AST capture cannot establish assertion equivalence or branch coverage.

Run `bun run test:contract:coverage` (or `cargo run --locked --manifest-path tests/contract/Cargo.toml --bin coverage`) for the Rust-only inventory drift audit. It fails on new, changed or removed gateway files and invalid parity claims. `-- --require-parity` additionally fails while any test declaration or source coverage requirement is pending. The initial seed scenarios are intentionally not credited as full replacements. Reports are saved under `.jait/artifacts/gateway-rust-readiness/coverage-audit.json`.

CI uses `bun run test:contract:coverage --evidence-dir .jait/artifacts/contracts` after generating both profiles. This mode requires reports bound to the current gateway/shared/contract sources and selects the newest report per profile; it does not fall back to historical successes. A run fails if its sources change during execution.

A verified mapping needs a `parity_review` explaining equivalent assertions and one or more `rust_cases` entries containing `id`, project-relative Rust `source`, and project-relative passing TypeScript-backend `report` under `.jait/artifacts/`. No skipped case counts as passing. Evidence and review must cover each parameterized variant and source branch; this audit checks the recorded evidence, not the correctness of the review. To recapture after reviewing gateway changes, run `bun tests/contract/tooling/capture-coverage.mjs`. This inventory-only helper uses the installed TypeScript compiler AST, preserves mappings for byte-identical files, and resets changed files to pending; it executes no tests. Inventory capture uses TypeScript as a read-only aid; running the Rust audit itself requires no TypeScript/Node/Bun. Source fingerprints fail closed if the inventory needs recapturing; do not refresh fingerprints without reviewing changed assertions and preserving existing mappings.

Test work may proceed in parallel after harness interfaces are agreed:

| Lane | Scope | Shared dependency |
| --- | --- | --- |
| HTTP/tools/config | All routes, schemas, CLI/config and tool response contracts | Isolated backend fixture and typed client helpers |
| Security/execution | Authentication, isolation, consent, scope, redaction and process/path boundaries | Disposable users/nodes and deterministic execution fixtures |
| Providers/streams/coordination | Provider protocols, SSE/WebSockets, sessions, agents, teams and threads | Local model/MCP/ACP peers and event recorder |
| Storage/scheduler | Schema/migrations, persistence, memory, jobs, backup/recovery and controlled time | Sanitized database corpus and fixture clock |
| Native integrations | PTY/browser/node, email/calendar/channels, voice, plugins and screen transports | Local protocol/process peers and supported-platform runners |

Each worker owns separate Rust scenario/fixture modules and maps exact existing assertions plus missing behaviors; shared harness changes require coordination. These lanes are parallel test reconstruction, not parallel gateway ports. R00–R08 are incomplete until these lanes and the strict inventory gate pass. A separate branch/contract inventory, mutation checks and supported-platform evidence remain required in addition to declaration mapping.

## Execution rules

- Add every route/tool/schema/event/config/CLI/database contract to an executable inventory before porting it. Include non-TypeScript bridges, root entrypoints, assets and package/runtime dependencies.
- R09–R31 are blocked until the complete Rust suite has passed against TypeScript and the Rust-first parity gate above is satisfied. Work in order of dependencies below. Split a component into focused per-contract implementation items before starting it; all cases must stay mapped to the parent acceptance gate.
- Preserve the existing gateway until each component has matching black-box results. Use disposable databases, local protocol servers and scoped filesystem/process fixtures. Never compare side-effectful requests by replaying them against production.
- Every domain needs happy paths, invalid/boundary input, auth/user/project/node isolation, errors/timeouts/cancellation, persistence/restart and real native integration where applicable.
- Port isolated unit tests into Rust as well as extending backend-independent contracts. Run deterministic fixture-driven tests without cloud models or real outbound messages. Exercise the real engine/transport in additional integration profiles.
- Treat pre-existing failures explicitly: reproduce, classify and fix or document them before using that area as migration evidence. Do not widen assertions to preserve defects silently.
- Use coverage reports to locate missing branches; require no coverage regression and strict checks on authorization/consent/scope invariants. Mutation/fault-injection cases must prove important assertions fail when behavior breaks.
- Keep requirements and backend differences versioned. Obtain deployment authorization only after the reviewed canary/rollback result exists; creating these todos does not launch workers, publish or deploy.

## Ordered backlog

### R00: Establish reproducible component baseline

Depends on: none. Priority: high.

Source areas: `packages/gateway/src`, `packages/shared/src`, `packages/api-client/src`, `tests/contract`.

Acceptance: Run all current gateway/shared/client unit and integration tests, typechecks and Rust contracts; classify every failure and conditional skip with reproducible evidence. Add measured branch coverage and a nondecreasing CI gate. Keep baseline failures visible rather than changing assertions to obtain green.

### R01: Inventory every externally observable contract

Depends on: R00. Priority: high.

Source areas: `packages/gateway/src/routes`, `packages/gateway/src/tools`, `packages/gateway/src/ws.ts`, `packages/shared/src`.

Acceptance: Produce a versioned manifest of routes, tools, JSON schemas, WebSocket/SSE events, database tables, config keys, CLI commands and supported platforms. Map every source file to a migration owner and required tests; fail inventory checks when a new interface is unmapped.

### R02: Harden the Rust acceptance harness

Depends on: R00, R01. Priority: high.

Source areas: `tests/contract`, `.github/workflows/contract.yml`.

Acceptance: Integrate the seed suite with stable reports, isolated fixtures, no skipped required cases, no hidden retries, dependency locks and CI. Add backend command adapters so the same restart/crash contracts run against TypeScript and Rust. Preserve redacted failure evidence and verify cleanup on timeout/cancellation.

### R03: Build deterministic protocol and failure fixtures

Depends on: R01, R02. Priority: high.

Source areas: `tests/contract`.

Acceptance: Add local fixture servers/processes for model streams, ACP/MCP, HTTP/SSH/TLS, mail/calendar/channels, scanner output and native process execution. Exercise malformed, oversized, slow, disconnected and partially failed responses without real accounts or live target scans; define semantic normalization only for volatile IDs/timestamps.

### R04: Complete HTTP auth and data acceptance tests

Depends on: R01, R03. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/routes`.

Acceptance: Extend Rust contracts across every HTTP route: exact success/error statuses and schemas, invalid input, cookies/JWT expiry, owner invitations, user/project/node isolation, pagination, Unicode, persisted state and denied-write invariants. Cover all CRUD domains, not only the seed session endpoints.

### R05: Test active streaming and WebSocket lifecycle

Depends on: R03, R04. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/routes/chat.ts`, `packages/gateway/src/ws.ts`.

Acceptance: Add real socket tests for authenticated WebSocket handshake/event isolation, incremental UTF-8 SSE, tool events, event ordering, Last-Event-ID replay/deduplication, backpressure, disconnect/reconnect, steering, cancellation and restart during an active turn. Demonstrate that injected dropped/reordered events fail the tests.

### R06: Test consent and execution boundaries

Depends on: R03, R04. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/security`, `packages/gateway/src/tools`.

Acceptance: Prove no effects occur before approval or after denial/cancellation; cover user/node/tool permissions, secret redaction, filesystem/symlink traversal, SSRF and redirect/DNS boundaries, argument injection, execution ownership, deadlines and child-process cleanup in isolated fixtures.

### R07: Build database compatibility and recovery corpus

Depends on: R01, R02. Priority: high.

Source areas: `tests/contract`, `packages/gateway/src/db`.

Acceptance: Create sanitized fixtures from supported schema versions and all persisted domains. Test upgrade integrity, foreign keys, concurrent writes, transactions, abrupt shutdown, backups and restoration. Specify which mixed-version rollback is supported; irreversible migrations must block cutover until a restoration path is verified.

### R08: Measure platform and resource baselines

Depends on: R00, R03. Priority: high.

Source areas: `tests/contract`, `packages/gateway`.

Acceptance: Record repeatable TypeScript startup, idle/steady/peak RSS, throughput, latency, file descriptors and child-process counts under identical workloads. Define Linux/macOS/Windows and CPU-architecture support, plus real PTY/browser/scanner fixture availability; unexecuted platform checks remain explicit gaps.

### R09: Create the Rust gateway runtime foundation

Depends on: R00–R08, every parallel test lane, and the strict Rust-first parity gate. Priority: high.

Source areas: `packages/gateway-rust`, `packages/gateway/src/config.ts`, `packages/gateway/src/index.ts`.

Acceptance: Create a Rust workspace with documented HTTP/async/SQLite/TLS library choices, typed errors, configuration precedence, state/artifact paths, structured redacted logs, cancellation and graceful shutdown. Wire CI formatting/lint/tests and native builds. Keep wire contracts and existing on-disk state compatible.

### R10: Port SQLite storage and migrations

Depends on: R07, R09. Priority: high.

Source areas: `packages/gateway/src/db`, `packages/gateway-rust`.

Acceptance: Implement every schema, index, repository, migration, transaction, identifier and timestamp invariant in Rust. Run the compatibility corpus against both backends and compare durable effects. Preserve secrets and audit/history records; demonstrate backup/restore and crash recovery.

### R11: Port identity secrets and trust policy

Depends on: R06, R09, R10. Priority: high.

Source areas: `packages/gateway/src/security`, `packages/gateway/src/services/users.ts`, `packages/gateway/src/services/user-secrets.ts`, `packages/gateway/src/services/provider-accounts.ts`.

Acceptance: Implement login/registration/invitations, password compatibility, JWT/cookie handling, settings, secret storage/input, provider-account isolation, origin controls, pairing, trust and approval policies. Pass expired/malformed credentials and cross-user/project/node denial contracts without copying or exposing live secrets.

### R12: Port HTTP WebSocket and SSE transport

Depends on: R04, R05, R09, R11. Priority: high.

Source areas: `packages/gateway/src/server.ts`, `packages/gateway/src/ws.ts`, `packages/gateway/src/routes`, `packages/gateway/src/services/static-asset-cache.ts`.

Acceptance: Implement routing, validation, exact error envelopes, CORS/cookies, uploads/static assets, preview origins, WebSocket control plane and SSE framing. Preserve authorization at every route and upgrade boundary. Pass transport/order/reconnect/backpressure contracts with the unchanged clients.

### R13: Port sessions history search and memory

Depends on: R04, R07, R10, R11, R12. Priority: high.

Source areas: `packages/gateway/src/services/sessions.ts`, `packages/gateway/src/services/session-state.ts`, `packages/gateway/src/services/session-search.ts`, `packages/gateway/src/services/session-sql.ts`, `packages/gateway/src/memory`, `packages/gateway/src/routes/reminders.ts`.

Acceptance: Port session CRUD/fork/archive/soft-delete, UI state, messages/checkpoints/context, traces, SQL/search, memory scoring/provenance, reminders and exports. Pass ownership, Unicode, pagination, retention and restart contracts with the existing SQLite corpus.

### R14: Port model providers ACP and MCP adapters

Depends on: R03, R05, R06, R09, R11, R12. Priority: high.

Source areas: `packages/gateway/src/providers`, `packages/gateway/src/services/jait-llm.ts`, `packages/gateway/src/services/jait-models.ts`, `packages/gateway/src/services/provider-usage.ts`.

Acceptance: Port provider discovery/authentication, model and quota/usage handling, external CLI/ACP processes, Codex event mapping, MCP provisioning/bridging and remote routing. Preserve cancellation, attachments, credential isolation and error propagation using deterministic local protocol peers; inventory replacements for all JS SDK dependencies.

### R15: Port the native agent execution loop

Depends on: R05, R06, R13, R14. Priority: high.

Source areas: `packages/gateway/src/tools/agent-loop.ts`, `packages/gateway/src/tools/agent-acp-runner.ts`, `packages/gateway/src/services/execution-guard.ts`.

Acceptance: Implement agent turns, provider streams, tool-call validation/execution, checkpoints, compaction, retries/repetition recovery, steering/queued input, attachments, usage and cancellation in Rust. Demonstrate fail-then-pass assertions for lost/duplicated events and recovery after interruption; no gateway TypeScript worker fallback.

### R16: Port tool registry discovery and user interactions

Depends on: R01, R06, R11, R12, R15. Priority: high.

Source areas: `packages/gateway/src/tools/registry.ts`, `packages/gateway/src/tools/index.ts`, `packages/gateway/src/tools/core`, `packages/gateway/src/tools/catalog-tools.ts`, `packages/gateway/src/services/user-questions.ts`.

Acceptance: Port typed tool contracts, registration/naming/search/catalog, validation, approvals, decision evaluation, structured todos/questions, link/diagram output and MCP exposure. Inventory every remaining tool handler and bind it to a domain migration; missing handlers must fail parity checks.

### R17: Port terminal PTY SSH and OS execution

Depends on: R03, R06, R09, R11, R16. Priority: high.

Source areas: `packages/gateway/src/surfaces/terminal.ts`, `packages/gateway/src/surfaces/remote-terminal.ts`, `packages/gateway/src/tools/terminal-tools.ts`, `packages/gateway/src/tools/ssh-tools.ts`, `packages/gateway/src/os-control`.

Acceptance: Replace Bun/node-pty with Rust/native process and PTY ownership. Preserve shell integration, terminal output/replay, stdin/resize, bounded foreground/background behavior, exactly-once completion, SSH host verification, OS elevation and sandbox controls. Test real process groups, timeout/cancel/orphans and Linux/Windows PTY semantics.

### R18: Port filesystem projects git and worktrees

Depends on: R06, R10, R16, R17. Priority: high.

Source areas: `packages/gateway/src/surfaces/filesystem.ts`, `packages/gateway/src/services/project*.ts`, `packages/gateway/src/services/git*.ts`, `packages/gateway/src/routes/git.ts`, `packages/gateway/src/routes/repositories.ts`.

Acceptance: Port local/remote filesystem operations, watchers, project/repository state, git/forge/PR/proposal flows, worktrees and preview lifecycle. Preserve ignore rules, path/symlink boundaries, atomic writes, cancellation and user/node routing. Validate against disposable repositories and process fixtures.

### R19: Port nodes networking and remote control

Depends on: R06, R11, R12, R16, R17. Priority: high.

Source areas: `packages/gateway/src/lib/network-scan.ts`, `packages/gateway/src/services/node*.ts`, `packages/gateway/src/services/device-registry.ts`, `packages/gateway/src/services/primary-link.ts`, `packages/gateway/src/tools/remote-executor.ts`, `packages/gateway/src/services/computer-control.ts`.

Acceptance: Port node identity/pairing/permissions, primary links, discovery, remote tools/files/terminals, computer control, mobile registration/push and screen-sharing signaling. Preserve execution vantage, revocation and reconnect semantics. Use local virtual nodes and packet/control fixtures; do not scan live networks for tests.

### R20: Port security scopes scanners evidence and verification

Depends on: R03, R06, R07, R16, R17, R19. Priority: high.

Source areas: `packages/gateway/src/security/assessment.ts`, `packages/gateway/src/security/workbench.ts`, `packages/gateway/src/lib/security`, `packages/gateway/src/tools/security*.ts`, `packages/gateway/src/routes/security*.ts`.

Acceptance: Port scope/exclusions/expiry, execution leases and bounded TCP/TLS/HTTP/SSH profiles, Nmap/Nuclei/Trivy adapters, telemetry imports, evidence/findings/redaction/export, remediation plans and same-vantage verification. Test scope escapes, malformed/partial output, cancellation, engine versions, issue-present/fix/issue-absent and inconclusive results.

### R21: Port threads teams plans and coordination

Depends on: R06, R10, R13, R15, R16, R18. Priority: high.

Source areas: `packages/gateway/src/services/threads.ts`, `packages/gateway/src/services/thread*.ts`, `packages/gateway/src/services/team-chat.ts`, `packages/gateway/src/services/agent-control.ts`, `packages/gateway/src/services/plans.ts`.

Acceptance: Port persistent agents/profiles/team rooms, handoffs, thread execution/state/history/review/checkpoints, goals/plans, attention and user interventions. Preserve ownership, exactly-once delivery, cancellation/resume and truthful completion evidence. Test concurrent agents with fixture workers, not paid/live provider accounts.

### R22: Port scheduler hooks monitoring and maintenance

Depends on: R06, R10, R15, R16, R20, R21. Priority: high.

Source areas: `packages/gateway/src/scheduler`, `packages/gateway/src/services/database-retention.ts`, `packages/gateway/src/services/disk-*.ts`, `packages/gateway/src/services/background-command*.ts`.

Acceptance: Port jobs/cron/hooks, durable monitoring schedules, background continuations, notifications, database retention, disk watchdog/janitor and maintenance. Test restart/missed-trigger/concurrent-trigger behavior, scope expiry and no duplicate side effects with a controlled clock and isolated storage.

### R23: Port skills plugins extensions and installation

Depends on: R06, R09, R16, R18. Priority: normal.

Source areas: `packages/gateway/src/skills`, `packages/gateway/src/plugins`, `packages/gateway/src/clawhub`, `packages/gateway/src/tools/skill-tools.ts`.

Acceptance: Port skill/plugin discovery, manifests, configuration, installation/update/removal, prompt resources and extension registration. Replace gateway-owned TypeScript plugin execution paths or define an explicit external-plugin protocol. Test archive/path traversal, hashes, failures/rollback and permission preservation.

### R24: Port browser preview code graph and visual tools

Depends on: R03, R06, R12, R16, R17, R18. Priority: high.

Source areas: `packages/gateway/src/surfaces/browser.ts`, `packages/gateway/src/surfaces/playwright-node-bridge.cjs`, `packages/gateway/src/services/preview*.ts`, `packages/gateway/src/services/code-graph`, `packages/gateway/src/evaluation`.

Acceptance: Replace gateway-owned JS browser bridges with Rust/native or documented external protocol adapters. Port browser/devtools/artifacts, previews, code-graph/evaluation runners and architecture/diagram/store helpers. Test real isolated Chromium, sandbox ownership, cancellation, artifact paths and teardown; account for every browser helper/tool.

### R25: Port email calendar and messenger services

Depends on: R03, R06, R10, R11, R16. Priority: normal.

Source areas: `packages/gateway/src/services/email`, `packages/gateway/src/services/calendar`, `packages/gateway/src/services/messenger-bridge.ts`, `packages/gateway/src/tools/email-tools.ts`, `packages/gateway/src/tools/calendar-tools.ts`, `packages/gateway/src/tools/messenger-tools.ts`.

Acceptance: Replace IMAP/SMTP/mail-parser and calendar/OAuth SDK dependencies with Rust/protocol adapters. Preserve accounts, attachments, remote-image policy, MIME/Unicode, pagination, provider errors and credential isolation. Use local protocol fixtures; sending tests must never deliver real messages.

### R26: Port channel and external automation adapters

Depends on: R03, R06, R11, R14, R16, R21. Priority: normal.

Source areas: `packages/gateway/src/channels`, `packages/gateway/src/tools/channel-tools.ts`, `packages/gateway/src/tools/homeassistant-tools.ts`, `packages/gateway/src/services/notifications.ts`.

Acceptance: Port Teams/Telegram/WhatsApp channel lifecycle and assistant routing, notifications and Home Assistant/tool integrations. Resolve JS-only SDK feasibility explicitly, preserve pairing/session state and approval boundaries, and test reconnect/deduplication/rate limits/errors with simulated peers; no gateway TypeScript sidecar.

### R27: Port voice audio and live-view transport

Depends on: R03, R06, R12, R16, R19. Priority: normal.

Source areas: `packages/gateway/src/voice`, `packages/gateway/src/voice-assistant`, `packages/gateway/src/routes/voice.ts`, `packages/gateway/src/services/live-view-manager.ts`, `packages/gateway/src/routes/screen-share.ts`.

Acceptance: Port STT/TTS adapters, assistant voice WebSockets, binary audio flow, live-view/screen-share routing and cancellation. Test sample formats, chunk boundaries, backpressure, permissions, reconnect and session teardown with deterministic audio/control fixtures.

### R28: Package and operate the native Rust gateway

Depends on: R09, R10, R11, R12, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27. Priority: high.

Source areas: `packages/gateway/bin`, `packages/gateway/scripts`, `packages/gateway-rust`, `.github/workflows`, `apps/desktop`.

Acceptance: Produce native supported-platform binaries with embedded web/shell assets, CLI/config/state compatibility, service lifecycle, installers, upgrades, canary/rollback and release checks. Document any external engines/agents. Prove the gateway starts and serves clients on a host without Node/Bun; optional npm distribution wrappers must not become runtime dependencies.

### R29: Run full differential and client compatibility gates

Depends on: R04, R05, R06, R07, R08, R28. Priority: high.

Source areas: `tests/contract`, `tests/e2e`, `packages/api-client`, `apps/web`, `apps/desktop`, `apps/mobile`.

Acceptance: Run the same complete manifest-driven scenarios against fresh TypeScript and Rust backends, compare errors/events/persisted effects, run all client workflows against Rust and inject crashes/failures. Run real native/browser/scanner integrations and the supported OS matrix; missing tools or skips are gaps, not passes. Resolve every mismatch or approved contract change.

### R30: Validate resource improvement and cutover recovery

Depends on: R08, R29. Priority: high.

Source areas: `tests/contract`, `packages/gateway-rust`, `docs/gateway-rust-migration.md`.

Acceptance: Benchmark both implementations under identical idle/stream/tool/concurrency workloads and require measured memory improvement with agreed latency/startup/resource limits. Run long-lived reconnect/cancel/restart tests, backup/upgrade/restore and a reversible canary cutover before broad activation. Record actual results and rollout blockers.

### R31: Remove the TypeScript gateway and enforce completion

Depends on: R29, R30. Priority: high.

Source areas: `packages/gateway`, `packages/gateway-rust`, `package.json`, `.github/workflows`, `docs`.

Acceptance: After all component gates pass, remove replaced TS gateway code/runtime dependencies, old launch/build paths and gateway-owned JS bridges. Keep TypeScript web/mobile/API clients interoperable through generated/versioned wire schemas. CI must fail on unmapped contracts, required skips or gateway Node/Bun runtime use; archive rollback artifacts and update operational docs.

## Test evidence and current baseline

Source revision: `8f513256f60c73770deb054c9d28960f9412ed71` plus the existing uncommitted Rust acceptance suite. Machine-readable inventory, command logs, results and the durable-todo index belong under `.jait/artifacts/gateway-rust-readiness/`.

At planning time, gateway/shared/API-client typechecks passed. Component and integration outcomes are recorded in `baseline-summary.json` and the companion baseline report, including failures and conditional skips. The baseline is evidence for the existing TypeScript gateway, not proof of an unimplemented Rust gateway.
