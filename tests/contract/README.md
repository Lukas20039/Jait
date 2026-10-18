# Rust gateway acceptance contracts

The assertions run in a Rust executable and talk to the gateway exclusively through
HTTP and SSE in the acceptance profile. A separate internal-reference profile
uses a bounded test-only Bun driver to invoke real TypeScript exports; Rust still
owns its inputs and expected results. The driver contains no gateway implementation.
A small Node launcher locates Cargo and anchors build output to the repository.
The default fixture starts the current TypeScript gateway through Bun; a different
backend can be tested through its URL.

## Run

Requires Rust 1.98+, Node, Bun 1.3.10 and installed workspace dependencies.

```sh
bun install --frozen-lockfile
bun run test:contract
bun run test:contract:internal
bun run test:contract:unit
node tests/contract/run.mjs translated
bun run test:contract:fmt
bun run test:contract:lint
bun run test:contract:coverage --evidence-dir .jait/artifacts/contracts
```

The explicit real-scanner profile runs exactly four installed Nmap, Nuclei and
Trivy checks against disposable loopback/filesystem fixtures:

```sh
node tests/contract/run.mjs translated-report --profile scanners
```

The engines must already be on PATH. Set JAIT_TEST_TRIVY_CACHE to the prepared
fixture database inside this project's .jait directory; symlink escapes are
rejected. The runner installs nothing and retains a failed report if any required
case fails. Chromium's packaged runtime also requires the normal gateway build,
including the bridge assets copied by copy-shell-integration.mjs.

The coverage audit reads each shared Rust source/report once per invocation and
checks its exact bytes again before saving the verdict. Cached evidence cannot
hide a report or source changed during the audit; case IDs and passing statuses
are still checked independently for every declaration.

The managed run starts an isolated loopback gateway on an OS-assigned port, with a
fresh database, random signing secret and no inherited provider credentials.
It uses the existing evaluation startup mode, which disables scheduled work,
sandbox maintenance, channel startup and optional runtime installation. Ordinary
HTTP routes, authentication and SQLite persistence remain real.

Requests have a 10-second deadline, startup has a 60-second deadline, response
bodies are capped at 2 MiB, and redirects are rejected. Cases run once, without
automatic retries. Eight requests run concurrently in the concurrency scenario.
SIGINT/SIGTERM request cancellation; the current HTTP request can take up to its
deadline before cleanup. Owned gateways are killed and reaped on exit, including
startup/setup failures. SIGKILL cannot run cleanup.

Every invocation prints its unique artifact directory:
`.jait/artifacts/contracts/<run-id>/`. It contains `report.json`, `gateway.log`,
and the isolated `state/` database. Cargo output lives under
`.jait/artifacts/rust-contract-target/`. Paths are anchored to the crate/repository,
including when invoked from another working directory.

Exit codes: 0 means every required case passed; 1 means scenario/setup/cleanup
failure; 2 means invalid invocation or a runner/report error. Setup failure marks
required cases blocked and writes a failing report. Credentials and response bodies
are excluded from report diagnostics. CI uploads only reports, not databases/logs.

## Run sandboxes

Each translated tail case runs in its own sandbox under
`.jait/artifacts/gateway-rust-readiness/tailstatic-runs/stream-<uuid>/` holding a
fake `home/`, `tmp/`, `state/`, the assertion stream, `stdout.log` and
`stderr.log`. Sandboxes are scratch, not the record: per-case results are
aggregated into `report.json` and the reviewed fragments committed under
`tests/contract/fragments/`.

- A passing case deletes its sandbox; a failing case keeps it and the failure
  message prints the path to inspect.
- Kept sandboxes expire after 72 hours, swept once per test process, so killed or
  timed-out runs cannot accumulate unbounded.
- `JAIT_TAILSTATIC_KEEP_RUNS=1` retains passing sandboxes when debugging the
  harness itself.

Keeping every sandbox once produced 68,778 directories and 62 GB in this
repository, which also exceeded the kernel inotify watch budget and stalled the
gateway's file I/O. Do not reintroduce unbounded retention here.

## Another backend

Start an empty disposable backend, then run:

```sh
bun run test:contract --base-url http://127.0.0.1:8200 --disposable --label rust
```

This creates a random owner account, invitation-created members and sessions.
Use a fresh test database for each invocation. The runner does not log into or
reuse an existing owner account. The explicit `--disposable` flag acknowledges
these writes; omitting it fails before requests are made.

The current external profile registers 91 HTTP/SSE cases. The managed profile adds
the abrupt-restart case because it owns the process. Reports name the profile
and explicitly list this exclusion, so external success does not imply restart
compatibility. Compare stable case IDs and statuses across reports for the same
contract version; IDs, timestamps, credentials and timings are not golden values.

The Rust binary can also be invoked directly after compilation. The Node launcher
is a convenience, not part of the acceptance assertions. Override `CARGO` or
`JAIT_CONTRACT_BUN` when the executable is outside the usual PATH.

## Required scenarios

Contract version 0.2.0 currently registers 92 managed scenarios (91 HTTP/SSE
scenarios plus abrupt restart), including ten local provider probes and three
concurrent Messenger cases. The table below describes the original 15 seed
scenarios. The executable registrations in `src/main.rs`, `src/scenarios.rs`,
`src/data_contracts.rs`, `src/security_contracts.rs`, `src/control_contracts.rs`
`src/edge_contracts.rs`, `src/provider_contracts.rs` and `src/messenger_contracts.rs` define the complete current set.

The edge batch covers agent-control authentication, halt/refusal/resume and
successful post-resume thread creation, invalid halt requests without state
mutation, per-user halt isolation, repeated incident timestamps, bearer/cookie
refresh, message/cancel ownership, exact error bodies, repository proposal/todo
aliases and completion history, and project repository assignment/refusals.
Thread creation only persists a record; no provider turn is started.

| Stable ID | Observable contract |
| --- | --- |
| auth.anonymous-denied | Protected list/identity routes and session/chat writes reject anonymous clients. |
| auth.invalid-token-denied | Malformed and unsigned tokens do not grant identity or session access. |
| auth.registration-validation | Missing/short credentials fail; existing usernames conflict; uninvited registration is denied after bootstrap. |
| auth.login-identity | Wrong password and missing credentials fail; fresh login retains identity. |
| auth.invitation-owner-and-single-use | Invitations require the owner and cannot be reused. |
| auth.cookie-refresh-and-logout | Login issues an HttpOnly auth cookie; cookie refresh retains identity; logout expires the cookie. |
| sessions.lifecycle | Create, Unicode rename, active listing, archive and soft deletion persist across independent HTTP clients. |
| sessions.state-persistence | Nested Unicode state survives independent requests; patching another key preserves existing values. |
| sessions.cross-user-isolation | Another user cannot list/read/update/archive/delete a session, change its state or read its stream/trajectory; denied writes leave owner data unchanged. |
| sessions.missing-resource | Missing sessions produce 404 for reads, updates, archive, delete, state and stream. |
| stream.idle-snapshot-and-completion | An authenticated new session returns bounded SSE: empty snapshot, then done naming that session. Anonymous access fails. |
| stream.idle-reconnect | Three independent connections receive equivalent completed idle snapshots. |
| sessions.invalid-state-unchanged | An invalid array state update is rejected and leaves prior state intact. |
| sessions.concurrent-create | Eight simultaneous creates return distinct IDs and preserve their individual names. |
| persistence.abrupt-restart | A forced process restart on the same database preserves sessions, nested state, credentials, ownership and idle stream behavior. |

Deletion currently means status `deleted`: unfiltered lists and direct owner reads
retain the tombstone, while active/archived lists exclude it. This suite explicitly
records that existing behavior. Changing it requires a deliberate contract update.

The three SSE assertion tests exercise CRLF/multiline framing and demonstrate
rejection of malformed/truncated data, missing completion, wrong session identity
and reversed event ordering. These run without starting a gateway. Two additional runner tests verify that external
targets require explicit acknowledgement before any network access, and that an
unhealthy backend produces a nonzero exit with required cases marked blocked.

## Translated fixture execution

`node tests/contract/run.mjs translated` runs the translated gateway cases with
four concurrent isolated peers. Pass filters directly, or override concurrency
with `--test-threads=1` when diagnosing shared resources. Each case still gets a
fresh process and disposable state. Most drivers run in Bun test mode so
module mocks actually apply; Rust receives observations and owns every assertion
verdict. Builtin mock registration is checked before the production module runs.
The browser DevTools socket cases use Node 22 with the installed `ws` package;
Bun's built-in replacement lacks the required `unexpected-response` event.
A test-only TypeScript loader preserves the source code and assertions for Node.
Bun peers disable automatic `.env` loading, preserve mock timer time, and evict
module cache entries explicitly when source fixtures request module resets.
The injection adapter restores Node's `writableEnded` lifecycle for Bun's
`light-my-request` responses, including termination after denied preHandlers.

The initial serial run took 1,325 seconds: 2,303 passed, 692 failed, and 59 ignored.
It exposed relocated dependency imports, inactive module mocks, application
logs mixed into the assertion protocol, and unsupported Set containment.
The first complete rerun took 399 seconds with four peers: 2,851 passed, 150
failed, and 59 ignored (current-source regeneration also added four cases and
two semantic helper checks). Later fixes have targeted validation; see the saved
logs for the latest complete count. This is execution evidence, not reviewed
assertion-equivalence credit.
The latest complete run passes every Cargo target: 3,029 passed and zero failed.
The translated target has 3,012 passes and 59 existing ignored cases, taking
357.67 seconds. Managed acceptance passes 93/93 and internal contracts 309/309.
Reproduction evidence, fixture adaptations, the chat memory-order fix and remaining
equivalence-review limits are documented in
`.jait/artifacts/rust-first-execution/final-summary.md`; the full run is
`final-tests.log`. No new ignore annotations were added.

## Translated evidence reports

`bun run test:contract:translated` (or `node tests/contract/run.mjs translated-report`)
runs the complete enabled translated suite and writes a Rust-owned `report.json`
under a unique `.jait/artifacts/contracts/` run directory. It builds the existing
native test target, inventories its registered tests, and requires exactly one
result for each registration. Setup/build failures, missing/duplicate results,
failed processes, cancellation, deadlines, and source drift fail the report.
No filters are accepted for this evidence profile; use `translated` for diagnosis.

Ignored cases have `status: "skipped"`, appear in `not_covered`, and cannot satisfy
a reviewed declaration. The profile is `translated-enabled-typescript-reference`:
success means every enabled test passed against TypeScript. It does not grant
assertion-equivalence credit or Rust gateway runtime parity. Review fragments
remain necessary. Logs are bounded, and owned process groups are cleaned up on
cancellation or timeout. CI runs this profile before the current-evidence audit.

## Remaining migration gates

This is the initial acceptance baseline. A passing report establishes the scenarios
above. Broader migration readiness requires:

- Active provider streams using deterministic local provider fixtures, partial
  chunks, Last-Event-ID replay, event deduplication, cancellation and restart recovery.
- WebSocket authentication, event ordering, reconnect and cross-user isolation.
- Tool execution/consent, filesystem boundaries, scope enforcement, redaction and
  child-process cleanup using local fixtures.
- Historical database upgrade fixtures, data integrity and mixed-version rollback.
- The remaining APIs (jobs, memory, repositories, providers, nodes and assessments).
- Supported-platform runs and measured startup, steady-state/peak memory, latency
  and resource ceilings.

Keep `not_covered` in the report and this checklist aligned when adding contracts.
Add cases to `src/scenarios.rs`, use stable IDs, and increment the contract version
when changing expected behavior. Backend differences should be fixed or explicitly
resolved; do not accept several statuses just to make both implementations pass.

The workflow `.github/workflows/contract.yml` runs formatting, Clippy, assertion
tests, the internal-reference profile and the managed acceptance profile on an ephemeral GitHub-hosted Linux runner.

## Retained deleted contracts

`coverage.json.retained_test_files` keeps deleted test contracts as explicit
requirements backed by a project-local source snapshot and fingerprint. Capture
preserves these entries. The Rust audit rejects snapshot drift, path escapes,
missing reasons, and any original file that has become active again; restoration
requires explicit reconciliation. Retained declarations contribute to the strict
pending count and receive no automatic parity credit. The saved Messenger
ownership declaration retains both original HTTP assertions and is replayed by
the translated suite without restoring a production test file.

## Declaration parity review

`python3 tests/contract/tooling/parity-review-index.py` inventories generated
registrations separately from review credit. It records each declaration's
`translation_variants`, including ignored variants, and parses Rust raw strings
with any generated delimiter length. A generated variant is not proof that all
source variants are present or equivalent. The inventory regression checks run
with `python3 tests/contract/tooling/parity-review-index.test.py`.

Run `bun tests/contract/tooling/apply-fragments.mjs` to merge reviewed declaration
mappings, then run the Rust coverage audit described in
[the migration plan](../../docs/gateway-rust-migration.md). Reapplying identical
reviews is idempotent; duplicate declarations or conflicting existing reviews
fail before writing the inventory.

A passing scenario is not automatically a complete replacement for a TypeScript
declaration. Every assertion, fixture precondition and parameterized variant must
be accounted for. HTTP route tests alone do not replace tool wrapper envelopes,
mocked call arguments, seeded consent queues or legacy job payloads. Reviews that
omit those assertions remain pending in `coverage.json`; corrected earlier
claims are documented in `fragments/parity-review-gaps.json`.

The previous reviewed inventory credited 36 declarations, including twelve exact
internal-reference mappings (two replace earlier HTTP-level auth mappings). This includes nine edge
batch mappings and removes twelve earlier partial mappings. At that checkpoint, the Rust audit reported
3,058 pending declaration/source requirements; the strict
`--require-parity` gate must continue to fail.
Making its status mandatory for merges is a separate branch-protection setting.

## Reference fixtures and evidence freshness

The provider peer binds an ephemeral loopback port and records actual gateway
HTTP requests, including methods, paths and synthetic authentication. Ten cases
cover catalogue protocols, malformed responses, rejected keys and inference
verification. They do not establish active model streaming. The internal profile
has twelve scenarios invoking production auth and command-classification exports;
all 17 variants from the original command tests are asserted in Rust.

Fresh reports include source fingerprints covering gateway, shared and contract
sources. A run cannot succeed if those sources change during execution.
`--evidence-dir` accepts only reports matching the current sources and takes the
newest report per profile, so an older success cannot hide a newer failure.
Without that option the audit checks the historical report paths in the reviewed
manifest. Fingerprints detect source drift; assertion-equivalence review is still
required. The CI workflow generates both profiles before running this audit.

The final continuation run passed 92/92 managed scenarios and 12/12 internal
reference scenarios. Four Messenger cases were added concurrently and are included
in the managed result, without declaration parity credit. The six reviewed
provider mappings are now credited. There are 36 verified declarations and 3,058
pending requirements. Formatting, Clippy, all 15 Rust unit/runner checks and the
source-bound inventory audit passed at that checkpoint; further concurrent
Messenger route/service/history edits are now flagged as source drift. The strict
parity gate still fails as required. No gateway implementation port has begun.

The isolated reviewed reports for this batch are under
`.jait/artifacts/gateway-rust-readiness/continuation-evidence/`.
The temporary Matrix dependency startup failure was resolved by concurrent
Messenger work before the final passing run.

## Parallel Flash preparation checkpoint

The current run passes 93/93 managed gateway cases and 50/50 internal cases.
The security batch now reconstructs all 18 network-scan declarations, five SSRF
declarations and 15 assessment declarations, including all ten unsupported-target
variants, all twelve invalid-scope fixtures, failed completion persistence, and
real local TCP before/after verification. Rust owns all expected outcomes.
The reviewed inventory now credits 74 declarations, leaving 3,020 requirements
in the existing inventory. The audit still rejects concurrent Messenger drift,
including a deleted regression declaration; no credit was obtained by removing it.
Formatting, Clippy and all 16 Rust unit/runner checks pass.

The internal runner dispatches lane adapters lazily and compiles independent
`vectors/fixtures.json`, `vectors/provider.json` and `vectors/storage.json` sources.
Expected values remain in the Rust assertion path. Duplicate scenario ids fail
before running, and vector JSON participates in source fingerprints so edits
invalidate fresh evidence. `vectors/fixtures.json` now carries 14 compiled
vectors (memory scoring, bounded-JSON and UTF-8 limits, command timeout, sub-agent
payload persistence, persisted tool calls and cron/scheduler guards), and
`vectors/provider.json` and `vectors/storage.json` hold the 54 and 177 vectors
from the earlier batches. The remaining lane files (`tools.json`, `toolsb.json`,
`services.json`, `db.json`, `providers.json`, `routes.json`, `storage2.json`) are
placeholders until workers complete them and receive assertion review. Vector
presence is not parity credit: the strict `--require-parity` gate still fails.

Three independent Jait-provider DeepSeek v4.1 Flash batches are specified in
`.jait/artifacts/gateway-rust-readiness/parallel-flash/dispatch-plan.json`.
Their launch failed with `agent_halted`; no threads were created. Resume autonomous
agents through Jait before dispatching these prepared batches. Coverage credit
requires passing Rust reports and exact original-assertion review for every batch.
Security evidence: `.jait/artifacts/contracts/aab942fc-a2f0-4585-b887-94e82eb299aa/report.json`.
Managed gateway evidence: `.jait/artifacts/contracts/49f7d931-76a4-4f56-a2ab-3698da8c2817/report.json`.

## Reference-fixture lane checkpoint

The reference-fixture lane is filled in. `vectors/fixtures.json` holds 14 vectors
covering BM25 tokenization and ranking, bounded-JSON and UTF-8 size limits, circular
serialization, command timeout, sub-agent payload extraction and stripping, persisted
tool-call history, and cron/scheduler create and update guards. A driver fix redirects
`migrateDatabase` diagnostics to stderr so the lane still emits one JSON document.

`node tests/contract/run.mjs internal` now passes 295/295 required scenarios and
`node tests/contract/verify-vectors.mjs` passes 14/14 fixtures, 54/54 provider and
177/177 storage vectors against the TypeScript reference adapter. Formatting, Clippy
and all Rust unit/runner checks pass. This is lane coverage, not parity credit; the
strict `--require-parity` gate still fails as required.
Evidence: `.jait/artifacts/contracts/50ab1811-d1f9-4588-82ed-a531136d69b4/report.json`.

## Command-output filter lane checkpoint

The command-output filter lane is filled in. `vectors/filters.json` holds 29
Rust-owned vectors for `packages/gateway/src/tools/command-output-filters.ts`:
shell preamble normalization, primary-command extraction, opt-out handling,
`git status`/`git log`/`git diff`, grep grouping plus its decline cases, test
summary collapsing, long path-list listings, and dispatcher selection,
minimum-savings threshold and disabled-option behavior. The `lt-path`/`gt-path`
assertion kinds were added to the Rust validator and mirrored in
`verify-vectors.mjs`. This lane replaces the former vitest suite for that module,
so the module is now covered by Rust-owned tests only.

`node tests/contract/run.mjs internal` passes 338/338 required scenarios, and
`node tests/contract/verify-vectors.mjs tests/contract/vectors/filters.json` passes
29/29 vectors against the TypeScript reference adapter. This is lane coverage, not
parity credit; the strict `--require-parity` gate still fails as required.
Evidence: `.jait/artifacts/contracts/9cf1de47-d386-4107-9098-adeca9886120/report.json`.

### Utility boundaries and mutation checks

`vectors/boundaries.json` adds exact utility boundary contracts, executed by Rust through the thin production-call adapter `drivers/boundaries.ts`. Run `node tests/contract/run.mjs test --test boundaries` for the focused baseline and source-mutation checks. The mutation test modifies project-local copies, requires assertion failures rather than fixture errors, and verifies restored behavior. CI includes this target. Full internal evidence includes all boundary vectors automatically.

`reviews/command-timeout.md` maps timeout decisions to individual vector IDs and documents the unreachable minimum-guard alternative. These are reference tests for the TypeScript implementation; they do not measure a Rust gateway runtime. JSON serialization coverage remains pending beyond the explicitly tested cases.

## Continued prerequisite validation

The translated comparator fixes, helper-vector relational assertions, gate handling,
report parser, process cleanup, and remaining limitations are recorded in
`reviews/translated-semantics.md`. Comparison counts now exclude synthetic completion
guards. Platform-only gates compile to Rust `cfg_attr` conditions; capability gates
remain unresolved until their integrations run explicitly.

The owned HTTP/restart fixture accepts `JAIT_CONTRACT_BACKEND_ARGV` as a JSON array
containing an executable and literal arguments. It does not invoke a shell. A custom
backend requires an explicit `--label`; it must bind loopback on an ephemeral port
and write that port to `JAIT_CONTRACT_READY_FILE` once ready. It receives the same
isolated state/database/home/temp paths as the default TypeScript backend. Restart
kills and reaps the owned backend, then repeats the same argv and state. Unix process
groups bound normal descendant cleanup; Windows and deliberately detached children
retain the limitations documented in the continuation evidence. This adapter does
not implement a Rust gateway.

`node tests/contract/run.mjs resource-baseline` measures an owned disposable gateway
on Linux: startup/readiness, five seconds of idle sampling, 50 sequential health
requests, 20 three-request session CRUD operations, and four clients performing 50
health requests each. Reports go to `.jait/artifacts/resource-baselines/<id>/report.json`.
It records RSS, process high-water memory, file descriptors, descendants, throughput
and latency. Workload sampling can miss brief peaks, and summed process high-water
marks are not a simultaneous tree peak. Active model/tool/native-engine workloads
and macOS/Windows/other architecture measurements remain gaps. Repeat measurements
on a quiet host; a report fails freshness if contract/gateway/shared sources change.

`node tests/contract/run.mjs interfaces` checks the versioned interface candidate
inventory without Node/Bun subprocesses in the Rust auditor. `--require-resolved`
fails until all pending interface/owner/test mappings and category gaps are resolved.
See `reviews/interface-inventory.md`; candidate discovery is not behavioral coverage.

## Matcher differential

`node tests/contract/tooling/matcher-differential.mjs` (or
`bun run test:contract:matcher-differential`) checks the contract comparator
against the real TypeScript matcher so the two cannot drift while each still
passes its own self-authored expectations. The hand-authored corpus
`corpus/matcher-differential/cases.json` holds 44 cases, each with an `id`, the
expected `vitest` verdict and a `wire` pair: an `observation` (the value under
test) and a `rule` (the matcher, expected value and options).

The harness runs in two passes. First `tooling/matcher-differential.test.ts`
executes the real `expect(...)` matcher for every case and records what Vitest
actually decided in `.jait/artifacts/matcher-differential/verdicts-vitest.json`. Then the
Rust target `tests/matcher_differential.rs` replays each wire pair through
`tests/support/tail_assertions.rs` and requires three verdicts to agree: the
committed golden, the observed Vitest result and the Rust comparator result.
Either half failing fails the harness, and a divergence is reported with the
case id and both verdicts.

The Rust target skips unless `JAIT_MATCHER_DIFFERENTIAL=1` is set, which the
harness sets automatically, so a plain `cargo test` never fails for a missing
verdict file. Regenerate the verdict file by rerunning the harness whenever the
corpus changes. This is comparator evidence, not a full Rust-runtime parity
claim.

## Independent consent safety checks

`node tests/contract/run.mjs test --test consent_invariants` runs 18
requirements-based lifecycle scenarios through the real TypeScript consent
manager, executor, and trust engine. Rust requires zero effects before approval,
after rejection/shutdown/timeout, during dry-run, or when cancellation occurs
before execution (including approval/cancellation races). Both local registry
and remote delegate dispatch are exercised with inert effect counters.

The same oracle must reject five disposable source mutations that remove the
entry cancellation check, permit execution after late approval, bypass rejection,
start execution before a decision, or ignore dry-run. A copied unmodified source
must pass; compilation errors and timeouts do not count as caught mutations.
The contract workflow runs these checks independently of translated declarations.

This suite exposed cancelled calls executing and gaining trust despite the
original 13 executor tests passing. Before/after and mutation evidence is saved
in `.jait/artifacts/test-strength-consent/`. It checks whether work may begin;
already-running tool cancellation remains the tool implementation's responsibility.
It does not certify prompt cancellation/removal while consent remains unanswered,
all permission policies, or all application security boundaries. No declaration
parity credit is assigned for adding these independent requirements checks.

### Context checkpoint handoffs

`bun run test:contract:unit --test compaction` exercises real agent-loop compaction through the bounded `drivers/compaction.ts` transport. Rust owns the fixtures and assertions for previous-checkpoint continuity across repeated pruning, latest user corrections, full active-turn prefix coverage, recent tool pairs, evidence tails, consistent output caps, cancellation without replacement, and visibly degraded fallback. The explicit CI test list includes this suite.

This currently tests the TypeScript implementation; it is not evidence that a Rust production loop exists. When migrating compaction, retarget this transport to the Rust implementation while preserving the Rust assertions. Mock model responses prove the context supplied and consumed by the loop, not live model summary readability.

## Independent user isolation and recovery checks

`node tests/contract/run.mjs test --test tenant_recovery --test active_stream --test recovery_corpus`
checks behavior beyond declaration translation. The tenant test creates two users
and private sessions, exercises 54 denied requests, and compares complete owned
resources before and after foreign mutation attempts. Three forced process-group
kills/restarts must retain committed structured Unicode state and user isolation.
All server state is disposable and project-local; no provider calls are made.

The active-stream oracle additionally rejects duplicate tool starts, tool results,
and completion events for its deterministic single-tool fixture. The old oracle
accepted these duplicates; the new negative controls are exercised against both
a minimal trace and the actual socket trace. This does not certify arbitrary
multi-tool workflows or every route/database domain. The recovery corpus still
has the historical-fixture and populated-domain limits documented in its review.

## Initial native implementation lane

`bun run test:gateway:rust` runs `tests/gateway_rust.rs` against the real
`packages/gateway-rust` library and production entrypoint. Cargo compiles that
entrypoint as the `gateway-native` test binary. The suite covers isolated config,
loopback enforcement, bind failures, health JSON differential checks using the
existing TypeScript handler, concurrent HTTP/HEAD/query behavior, unsupported
routes, process startup without Node/Bun/PATH, and SIGTERM cleanup on Unix.
Artifacts are under `.jait/artifacts/gateway-rust/`.

This is an initial component suite. The full HTTP/SSE acceptance profile still
requires APIs the native gateway does not implement; it must continue to fail
against this partial backend. No full parity or replacement-readiness credit is
claimed. The existing TypeScript-backed suites remain in place.
