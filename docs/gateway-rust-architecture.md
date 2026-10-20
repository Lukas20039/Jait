# Rust gateway foundation

Decision date: 2026-10-18. Scope: the isolated native implementation in
`packages/gateway-rust`. The installed TypeScript gateway remains the production
runtime. This document establishes the construction plan; it does not assert
feature parity or measured performance improvement.

## Architecture decision

Build a modular monolith: one native process, one Cargo workspace, initially one
library/binary crate with domain modules. Keep HTTP adapters thin and domain
services independent of Axum. Share database workers, outbound clients, budgets
and lifecycle infrastructure across domains.

Considered alternatives:

| Approach | Benefit | Cost / decision |
| --- | --- | --- |
| One crate with explicit domain modules | Fast refactoring, simple local deployment, no IPC or cross-crate API churn | Selected; enforce ownership in reviews and extract crates when a real reuse boundary appears |
| Separate crate per domain immediately | Strong compile-time dependency boundaries | Too many public interfaces before domain ports settle; defer |
| Separate services/processes | Independent scaling and crash isolation | IPC, deployment and authorization complexity for a local workbench; reserve child processes for engines/providers that already need them |

The dependency direction is `routes/transport -> services/domain -> db/security/contracts`.
Runtime composes these pieces. Contracts contain serializable data and no storage,
transport or executable behavior. Policy is enforced at effects, including node
destinations and scheduled execution. Domain code must not import HTTP handlers.
Use small concrete structs and enums; add traits at genuine replaceable I/O seams,
not for every service. Avoid a dependency injection framework or a global mutable
service registry.

## Chosen technology baseline

Existing versions remain pinned in Cargo.lock. Add selected future dependencies
with their first working adapter, review features/licenses, and commit the updated
lockfile. A decision in this table is not a claim that its integration exists.

| Layer | Choice | Reason and adoption status |
| --- | --- | --- |
| Language/build | Stable Rust, edition 2024, minimum 1.98; Cargo workspace | Existing toolchain contract. Native binary; Node/Bun are development/reference-test tools only |
| Async I/O | Tokio 1.x | Existing runtime; one shared runtime for sockets, timers and tasks |
| HTTP/server | Axum 0.8 on Hyper; Tower / tower-http middleware | Axum is present. Adopt middleware per contract; HTTP/WS/SSE share the same server |
| Data/wire formats | Serde + serde_json | Present; preserve exact naming, missing/null distinctions and error shapes. Typed DTOs at new boundaries |
| Storage | rusqlite 0.40 with bundled SQLite + backup | Present; reuse SQL/migrations, WAL, foreign keys and existing files. Keep SQL explicit; no ORM/second SQLite stack |
| Outbound HTTP/TLS | reqwest with rustls, native certificate roots | Selected for adapters; harness already uses reqwest. Reuse pooled clients per policy, disable implicit proxies/redirects for scoped requests, validate resolved destinations. No ambient trust or proxy inheritance without explicit policy |
| Lifecycle | Tokio primitives now; tokio-util CancellationToken / TaskTracker for domain tasks | Native server already drains with a five-second ceiling. Introduce shared cancellation/tracking as background domains land; cancellation cannot abort running blocking work |
| Logging/diagnostics | tracing + tracing-subscriber JSON | Selected; current lifecycle JSON remains. Add spans through an allowlisted field API; never log bodies, keys, tokens or raw evidence |
| Errors | Domain enums; thiserror for implementations, boxed errors only at process/adapter edges | Selected; retain existing HTTP envelopes and avoid forwarding internal error strings to clients |
| Identity/crypto | jsonwebtoken HS256, scrypt, sha2, getrandom, subtle | Present for compatibility. No hand-written cryptographic algorithms; preserve fixed password parameters and strict token policy |
| CLI/config | clap derive when native commands land; typed config with explicit precedence | Bootstrap config is present. Preserve existing CLI/environment/config behavior during the CLI port; no silently new precedence |
| Tests/performance | cargo test + existing Rust-owned differential harness; Criterion for CPU microbenchmarks when justified | Reference suites already exist. End-to-end latency/RSS/startup need process-level matched workloads, not microbenchmarks alone |
| Security engines/integrations | Typed native adapters around existing executable/protocol engines | Preserve Nmap/Nuclei/Trivy profiles and provenance. Select transport-specific libraries with those adapters; do not bundle every SDK into the base binary |

Primary references: [Axum](https://docs.rs/axum/latest/axum/),
[Tokio blocking work](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html),
[rusqlite](https://docs.rs/rusqlite/latest/rusqlite/),
[reqwest](https://docs.rs/reqwest/latest/reqwest/),
[cancellation](https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html),
[structured diagnostics](https://docs.rs/tracing-subscriber/latest/tracing_subscriber/fmt/index.html).

## Directory ownership

All of these module directories exist and are declared in the library. Reserved
modules contain documentation only, with no success-returning stubs or registered
routes. Creating the skeleton earns no migrated-component credit.

```text
packages/gateway-rust/
  Cargo.toml / Cargo.lock   workspace, features, locked dependencies, build profiles
  build.rs                 existing package-version compatibility
  run.mjs / tooling/       development and verification entrypoints
  src/
    main.rs                process entry, bootstrap, signals
    lib.rs                 composition exports and module declarations
    config.rs              typed bootstrap configuration
    runtime/               server lifecycle and shared bounded blocking work
    contracts/             request/response DTOs and event/protocol envelopes
    routes/                HTTP adapters and wire-compatible errors
    transport/             SSE, WebSocket, outbound connection policies
    db/                    SQLite, schema, migrations, transactions, identifiers
    security/              identity, ownership, consent, path/SSRF/scope enforcement
    services/              persisted application services (users, then sessions etc.)
    providers/             model protocols, capabilities and streamed events
    execution/             tool dispatch, processes, PTY, filesystem and OS effects
    coordination/          turns, agents, teams, threads and task ownership
    nodes/                 trust, routing, remote execution and vantage
    scheduler/             durable jobs, timers and recovery
    memory/                scoped recall, search, provenance and retention
    assessments/           scoped engines, evidence, findings and verification
    integrations/          mail/calendar/channels, browser, voice and plugins
    surfaces/              assets, preview and surface lifecycle
    observability/         redacted diagnostics and resource instrumentation
    health.rs              existing health contract
    state_directory.rs     existing state-path compatibility
  native-coverage.json      verified component ledger, separate from scaffold
```

Keep the existing services/routes/db/security paths stable while migration
contracts reference them. Group large domains into submodules as they are ported;
do not create a file for every historical TypeScript helper in advance. Shared TS
schemas remain the behavioral reference; add Rust DTO mappings with contract
checks, then automate schema/client generation after the format is established.

## Performance rules

1. Start serving after required local initialization. Network discovery, optional
   integrations, model probes and cache warming must not delay readiness.
2. Never execute SQLite, scrypt, compression or large filesystem reads on async
   workers. Database work uses a serialized worker per write connection; CPU work
   uses a separate admission limit. Do not derive passwords while holding a
   database connection/transaction in the final design.
3. Admit blocking work before spawning it. The shared `runtime::blocking::BlockingLane`
   rejects excess work and keeps the permit inside the blocking closure even when
   the waiting caller disappears. It is available infrastructure, not yet wired
   into existing auth handlers. Wire-level overload behavior requires its own
   compatibility decision and tests.
4. Use bounded queues and event histories. Start with one writer, at most two
   password jobs, and 128 queued database commands as provisional tuning limits.
   Set byte limits as well as item limits for streams. Tune with representative
   workloads; new limits must not silently alter existing contracts.
5. Stream provider responses and assets. Do not buffer full model responses or
   clone full session histories for every subscriber. Slow consumers must not
   grow memory without bound.
6. Share reqwest clients and connection pools, cache prepared SQL statements, batch
   related writes transactionally, and paginate reads. Do not hold a lock or SQL
   transaction across an unrelated network await.
7. Preserve crash/error handling: release builds use thin LTO, one codegen unit,
   stripped debug info and unwinding. Compare measured results before claiming
   these profile choices improve performance. Avoid unsafe code, allocator
   replacements and custom executors without profiling evidence.
8. Assessment limits remain target/method/profile specific. Throughput settings
   never weaken scope, cancellation, redaction or consent enforcement.

The existing auth HTTP adapter serializes SQL and password operations together.
Splitting them is planned infrastructure work with invitation/first-owner race
tests; this document and the new helper do not claim that refactor is complete.

## Initial performance gates

These are engineering targets, not benchmark results. Measure release binaries
on the same host, CPU policy, data snapshot and workload as the TypeScript
baseline. Record build/source hashes, thread counts, database size, sample count,
RSS, p50/p95/p99, throughput, file descriptors and child processes. Report missing
platforms and workloads explicitly.

| Workload | Initial target |
| --- | --- |
| Minimal native bootstrap, no optional integrations | Warm launch to successful health under 250 ms; idle RSS under 40 MiB |
| Health/read-only lightweight HTTP, 32 concurrent clients | p95 under 10 ms on loopback, with zero errors |
| Full matched application workload | Native steady RSS at most 60% of TypeScript; p95 at most 105% and p99 at most 110% of baseline |
| Full matched startup | Native readiness at most 50% of TypeScript baseline |
| Slow clients / overload / cancellation | Queue and byte budgets hold; no accumulating orphan processes or tasks |
| Graceful process shutdown | Existing five-second drain ceiling; background tasks and descendants verified per domain |

Do not compare the tiny health-only Rust process with a fully initialized
TypeScript gateway as proof of application-level improvement. Provider/network
wait time must be reported separately from gateway CPU time.

## Construction sequence

Foundation progress has four equal milestones: architecture review, stack and
budgets, scaffold on disk, successful validation. This is separate from
the 364-component implementation inventory and cutover gates.

1. **Foundation:** this decision, module structure, shared work admission, release
   profile, native formatting/Clippy/unit tests and existing focused contracts.
2. **Shared infrastructure:** wire bounded database access, separate password work,
   request context, typed errors, cancellation, redacted tracing, pooled outbound
   clients and transport policy. Touch runtime/db/security/observability/transport
   once here; verify races, overload and shutdown before domain reuse.
3. **Application core:** finish auth routes, owned sessions/history and SSE, then
   provider execution and consent. Work by complete domain slice with shared
   infrastructure, not by counting tiny utility ports.
4. **Other domains:** coordination/nodes, scheduling/memory, assessments/execution,
   integrations and surfaces, in dependency order from the migration plan.
5. **Replacement:** complete differential/client/platform/resource/recovery and
   rollback gates before packaging, activation and TypeScript removal.

No database schema migration, production configuration change or live-state
access is introduced by the foundation scaffold. Supported-platform execution,
actual full-workload performance, JS-only integration feasibility and historical
database recovery remain validation risks. Revisit library choices only when
measurements or adapter requirements demonstrate a concrete problem.

See [the migration gates](gateway-rust-migration.md) and
[the native runtime instructions](../packages/gateway-rust/README.md).
