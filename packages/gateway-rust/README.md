# Native Rust gateway

## Current native checkpoint — 2026-10-20

The source-bound gate verifies **148/364 components (40.66%)** with unchanged
sources and exact live fingerprints. This supersedes historical counts below.
The latest batches add the DNS-pinned public mail-image loader and an opt-in
skills HTTP adapter (12 and 8 focused tests, nine caught/restored mutations).
The preceding batch implements subscription quota fetching: 26 focused differential
checks and 34 native checks cover cookie/status handling, HTML and quota parsing,
stream limits/cleanup, UTF-8, redirects and deadlines. Four timezone subprocesses
cover local dates and daylight-saving transitions. A 100,000-level document now
passes in 0.40 seconds after replacing repeated ancestor scans; a duration bound
retains the regression. All 2,231 entity mappings match the reference decoder.

Evidence: `tests/contract/reviews/native-subscription-usage.md` and
`.jait/artifacts/gateway-rust/checkpoints/148-report.json`. The review records
fail-then-pass discrepancies and explicit format/platform/integration limits.
The full gate passes 171 native library tests and 82 differential targets.
Production remains the TypeScript gateway. **216 components remain**; full
replacement, client/platform, resource and rollback gates remain open.


Parallel native implementation beside `packages/gateway`. The standalone process
currently serves only `GET /health` (and HEAD). It does not yet serve the application.

## Foundation and construction plan

The [architecture decision](../../docs/gateway-rust-architecture.md) fixes the core
stack, module ownership, performance targets and implementation sequence. The
workspace builds one modular native process with Tokio, Axum/Tower, Serde and
rusqlite. The domain directories are declared in `src/lib.rs`; reserved modules
contain documentation, not migrated behavior. Server lifecycle lives under
`runtime/`, and `runtime::blocking::BlockingLane` provides bounded admission for
database/CPU adapters. Auth handlers use a dedicated SQLite worker with a bounded
queue and a separate password-derivation lane.

Release builds use thin LTO and one codegen unit, with unwinding retained. Run
`bun run build:gateway:rust --release` for performance measurements; debug builds
are not the performance baseline. Targets in the architecture decision still
need matched-workload measurements. Directory creation earns no parity credit.

From the repository root (Rust 1.98+, Node for development tooling):

```sh
bun run dev:gateway:rust
# http://127.0.0.1:8220/health
JAIT_RUST_PORT=0 bun run dev:gateway:rust
bun run build:gateway:rust
bun run test:gateway:rust
```

The compiled `.jait/artifacts/gateway-rust-target/debug/jait-gateway` runs without
Node, Bun, or PATH. The reference tests require Bun to execute the real TypeScript
functions. Build output stays under `.jait/artifacts/`; dependencies are locked
and compilation is bounded to two jobs.

## Verified components

The latest passing frozen-source checkpoint covers 141 of the 364 gateway
source components in `tests/contract/coverage.json`: **38.74% focused native component
coverage**. The current report records whether that snapshot still matches live sources. Components have equal weight; this percentage measures neither effort
remaining nor readiness to replace production.

- Health responses: exact schema, provider branches, counts and null/omitted
  fields; uptime alone is normalized. Tokio/Axum own sockets, signals and bounded
  graceful shutdown. Loopback is enforced at configuration and bind boundaries.
- UUIDv7: deterministic timestamp/entropy compatibility and random ID checks.
- State/database paths: explicit precedence, test-mode default-path refusal and
  ECMAScript whitespace semantics.
- SQLite connection/migrations: bundled SQLite, WAL/NORMAL/foreign keys,
  migration tracking and repairs. All 76 current-definition schema prefixes are
  compared with TypeScript; populated workspace/project and repository
  migrations, failed migrations, backups and TypeScript reopen are exercised.
- HTTP authentication primitives: HS256 signature verification, session claims,
  purpose separation, expiry/not-before, public path allowlist, bearer/cookie
  precedence and 401 responses. The crypto provider verifies the original compact
  signing input; JOSE parsing retains the reference's critical-header and
  base64url behavior.
- Ownership: identical 404 responses for missing, unowned and foreign resources.
- User repository: Node-compatible scrypt hashes, owner invitations, user lookup,
  settings and nullable patches, explicit selection, internal binding and owned
  archive cleanup. Rust-created credentials reopen in TypeScript. Internal
  binding needs route authorization before exposure.

- Account HTTP routes: actual Fastify/native HTTP comparisons for registration,
  login/refresh/logout cookies, single-use invitations, settings/tool locks,
  environment status, archived cleanup, session binding and origin/deleted-user
  denials. Explicit database and secret configuration is required.
- Preview grants: one-hour resource-scoped HS256 tokens with session-token
  separation, expiry, claim/header boundaries and empty-key rejection.
- Outbound URL policy: protocol/host allowlists, localhost and IPv4/IPv6 private
  address checks. This preserves the syntactic reference guard; DNS resolution,
  redirects and connection pinning remain transport work.
- Trust state and node credentials: memory/SQLite modes, progression and reverts,
  persistence/reopen, failed trust writes, ownership, SHA256-only credential
  storage and revocation.
- Session/project JSON state: isolated reads, upserts and deletes, malformed
  legacy values and exact project UI-state migration behavior.
- Node capability persistence: deny-by-default registration, explicit grants,
  partial failures, permission audit records and transactional forgetting.
- Thread selection defaults: inherited provider/model/runtime/effort, optional
  stores, shape validation and omitted-value behavior.
- Execution timeouts: finite defaults/caps, input coercion, environment settings,
  fractional rounding and clamp warnings. Terminal execution remains unported.

- Session repository: nullable legacy records, scoped lists/updates, activity and
  viewed acknowledgements, project moves, selection/error metadata, immutable
  forks with live snapshots, and rollback when copying fails.
- Project repository: directory lookup/adoption, ancestor-preserving pages, search,
  cycle/depth validation, inherited roots/instructions, repository links and
  subtree lifecycle effects, including SQLite partial failures.
- Audit storage and JSON ceilings: persisted action lookup and nullable fields,
  exact JSON ordering, progressive depth/width/byte limits, circular/shared
  objects, BigInt/undefined conversion and Unicode boundaries.
- Lifecycle hooks: ordered and identity-deduplicated handlers, live subscription
  changes, nested emission, error propagation and bootstrap file loading.
  File-reading hooks require a blocking worker; scheduled jobs remain unported.

- Repository registration: owner/path deduplication, exact path identity, nullable
  patches, forge URL compatibility and recovery from failed inserts.
- Repository todos and plans: completion/reopen history, provenance and limits,
  durable task JSON, task patches and malformed legacy JSON handling.

- Thread replay construction: bounded messages/checkpoints, original-task
  retention, tool/todo context, UTF-16 boundaries and source errors.
- Immutable asset cache: real HTTP comparisons, exact path/type filtering,
  conditional request fallthrough, LRU/byte ceilings and bounded file reads.
  `Gateway::with_static_asset_cache` mounts it explicitly; full frontend serving
  and its fallback/auth integration remain unported.

- Memory storage and BM25 ranking: scope/provenance/expiry preservation,
  exact tokens, document statistics, and numeric score comparisons.
- Memory engine: scoped source/content replacement, expiry, BM25 relevance cutoff,
  freshness ties, durable pre-compaction fact extraction, and daily/curated Markdown
  logs, including storage/log failures and their persisted effects. Provider
  injection and memory HTTP/tools remain unported. Freshness compatibility currently
  covers ISO timestamps/date-only values; implementation-specific legacy date
  formats remain a limitation.
- Shared control access: owned sessions/threads, explicit surface owners and
  session fallback, pending consent, and distinct owned default execution sessions.
  Device registration retains connection time, capability order and stable ties.
- Worktree metadata: registered common Git directory mounts are read-only; forged
  backlinks, unregistered metadata, colon paths and symlink markers are rejected.
- Terminal helpers: retained output offsets, full bounded command slices, partial
  line recovery, completion-marker trimming and shell-prompt recognition. Remote
  Git-node selection preserves explicit/local/platform precedence. Process/PTY
  execution remains unported.
- LLM headers: per-configuration Go conversation identity and explicit session
  precedence, with UUID layout checks. Provider execution remains unported.
- Persisted tool calls: exact raw JSON retention, progressive byte compaction,
  optional metadata, Unicode byte limits and metadata-only fallback. Focused
  contracts cover finite-number, well-formed Unicode JSON; JavaScript overflow
  numbers and unpaired-surrogate parsing remain compatibility limits.

Storage and security are library boundaries with disposable integration tests.
**Standalone startup still opens no database and reads no credentials.**
The auth adapter can be mounted through `Gateway::bind_authenticated` with explicit
storage and credentials. Session HTTP APIs, providers, tools, scheduler, frontend
serving, WebSocket and SSE remain unported.

The `test:gateway:rust` command checks format, strict native Clippy, native unit
tests and all thirty credited contract targets, then records source hashes before/after execution.
All inventoried gateway and shared sources are fingerprinted to bind indirect
dependencies as well. Reviewed component reference drift fails the check. Reports are saved to
`.jait/artifacts/gateway-rust/native-progress/report.json`; failed or changing-source
runs receive zero verified credit in that report. A source manifest and passing
contracts are focused evidence, not proof that every branch has been covered.

## Reference defect found during migration

Malformed password digest hex could decode to an empty buffer in the TypeScript
repository, authenticating a corrupt stored credential via a zero-byte comparison.
Both implementations now require a complete 64-byte hex digest. Existing valid
hashes retain their format, including uppercase hex compatibility.

The original TypeScript regression produced four failures before the fix and eight
passes afterward; `gateway_rust_users` also failed before that reference correction
and passes afterward. See `packages/gateway/src/services/users-password.test.ts`.
Evidence is under `.jait/artifacts/gateway-rust/password-before.log` and
`password-after.log`. No live accounts or stored credentials were altered.

## Continuation and replacement gates

Next: integrate the owned session/project HTTP APIs with audit and lifecycle
hooks, then complete transport/observability and streaming as domain slices. Bounded database/CPU
work and account HTTP adapters are in place.
Keep every route inventoried and validate its actual TypeScript behavior before
granting component credit.

The [migration plan](../../docs/gateway-rust-migration.md) retains full-suite,
authorization, recovery, platform, memory/resource and rollback gates. Historical
released-schema recovery and supported-platform builds remain unverified. The
current tests establish Linux focused compatibility. Production startup and the
installed gateway have not been switched over.

## Completion target

The requested target is **361/361 verified native components (100%)**.
The source-bound report and its live-source match flag are authoritative.
The earlier 55/361 checkpoint described below is historical; the completion target remains open.
The source-bound report covers formatting, strict Clippy, seven native tests and
345 contract-test executions across thirty targets (including repeated driver checks). Focused cases expand into multiple
requests and value matrices; they do not establish full application parity.

The former auth HTTP timeout was fixture teardown: all responses were consumed,
but Bun retained connections after rejecting a request before reading its body.
The adapter now closes fixture-owned HTTP connections before awaiting Fastify
shutdown. The same failing test passes without increasing its ten-second budget.
The preview empty-key regression also fails before the correction and passes
afterward. Evidence is under `.jait/artifacts/gateway-rust/`.

The latest batch also records fail-then-pass regressions for null legacy session
columns and error truncation at a UTF-16 boundary. Evidence is in
`.jait/artifacts/gateway-rust/sessions-nullable-before.log`,
`sessions-nullable-after.log`, and `sessions-unicode-before.log`; the passing
session suite and full validation log are in the same artifact directory.

The latest continuation retains an intermittent listener-release assertion failure.
Twenty focused repetitions and a subsequent full gate passed; its root cause is
unconfirmed. The assertion is retained with bind diagnostics, and an additional
lifecycle test holds a client open through shutdown. The initial Python socket
experiment used different socket options and does not establish a Rust runtime
fault. Evidence: `.jait/artifacts/gateway-rust/listener-reproduction/`.


The current continuation adds native question/secret request lifecycles,
completion-notification state, notification broadcast/sink dispatch, usage
aggregation and refresh caching, and the user.ask tool adapter. The three new
suites pass 34 tests (including repeated subprocess transport checks). Eight
reversible mutations fail their intended assertions and restored sources pass.
Usage-cache force behavior follows the latest reference: after a 30-second
cooldown, manual refresh bypasses failure backoff. Loader starts preserve run
order while pending I/O overlaps. Reviews are in
`tests/contract/reviews/native-input.md`, `native-feedback.md` and
`native-user-ask.md`; the authoritative passing checkpoint is
`.jait/artifacts/gateway-rust/checkpoints/55-report.json`.


## Latest continuation

The source-bound native gate targets 78/361 components (21.61%). New contracts
cover context token estimation, provider todo normalization, provider snapshots,
Linux OpenCode credential storage, user-question HTTP, hook HTTP and the execution
guard. See reviews native-context.md, native-provider-helpers.md,
native-question-http.md and native-execution-guard.md in tests/contract/reviews.
The canonical report and unchanged-source hashes are stored under
.jait/artifacts/gateway-rust/native-progress. The 181/361 milestone is still open.

Trust-management HTTP now has a bounded native storage worker with a persistent
cache, including retained state after failed writes and external SQLite changes.
Its focused review is native-trust-http.md. The next source-bound gate targets
79/361 components (21.88%); reports remain authoritative for actual verification.

Encrypted user-secret storage (`user-secrets.ts`) and the secret-request/storage
routes (`secrets.ts`) are now native. AES-256-GCM matches node:crypto's key
derivation and base64 layout; cross-implementation decrypt round-trips pass in both
directions. The latest source-bound gate verifies **81/361 components (22.44%)**.
See tests/contract/reviews/native-secrets.md; reports remain authoritative.


Assistant profile storage and HTTP, computer-control leases, the process-wide
assessment execution lock, transient swarm mailboxes and inline raster/CID image
handling now have native implementations. Exact TypeScript comparisons and seven
restored mutations pass. The source-bound gate verifies **87/361 (24.10%)** with
unchanged sources; checkpoint: .jait/artifacts/gateway-rust/checkpoints/87-report.json.
The requested **181/361 (50.14%)** milestone remains open.


## Calendar and runtime safety continuation — 2026-10-19

The frozen-source gate passes at **113/361 (31.30%)**. This batch adds the native
calendar account service and calendar tools, sandbox owner identity/liveness, and
the disk-space watchdog. Reviews in `tests/contract/reviews/native-calendar-service.md`,
`native-calendar-tools.md`, `native-sandbox-owner.md`, and `native-disk-watchdog.md`
document exact boundaries. The four new targets pass 36 test executions, including
repeated subprocess-driver checks; eleven restored mutations fail their intended
assertions. Native OAuth futures now finish form encoding before awaiting I/O,
allowing the calendar tools to use the shared executor. Native Clippy, the four
TypeScript adapters and artifact-path checks pass.

The target is now all **361 components**, with 248 remaining in the reviewed
ledger. `.jait/artifacts/gateway-rust/remaining-native-components.json` enumerates
them without deleting or shrinking source requirements. Production startup,
full client parity, supported-platform, resource and rollback gates remain open.
Use `native-progress/report.json` to distinguish a passing frozen snapshot from
matching live-source evidence; concurrent edits can invalidate freshness.


## Calendar HTTP and provider registry continuation — 2026-10-19

The current source-bound gate passes at **116/361 (32.13%)**, with matching live
source fingerprints. This continuation adds the opt-in calendar HTTP adapter,
provider registration/ownership/lifecycle, and MCP reference/configuration helpers.
The three new targets pass 27 test executions (including repeated subprocess
transport checks); six restored mutations catch owner, snapshot-limit, HTML-escape,
namespace and unregister failures. Reviews: native-calendar-http.md and
native-provider-registry.md under tests/contract/reviews.

The same failing assertions now pass for two reproduced mismatches: invalid event
limits returned two events instead of none, and empty terminal-output ranges
returned the preceding partial line instead of empty output. Evidence is under
.jait/artifacts/gateway-rust/{calendar-limit-before,calendar-http-after,terminal-empty-before,terminal-empty-after}.log.
The terminal reference change was reviewed and its ledger fingerprint refreshed
only after the native comparison passed. The session HTTP candidate remains
uncredited.

The 100% goal remains open, with **245 components remaining**. See
.jait/artifacts/gateway-rust/remaining-native-components.json and
.jait/artifacts/gateway-rust/next-provider-slice.json. Production startup and
cutover readiness remain separate.
