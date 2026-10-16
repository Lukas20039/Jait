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
bun run test:contract:fmt
bun run test:contract:lint
bun run test:contract:coverage --evidence-dir .jait/artifacts/contracts
```

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

## Declaration parity review

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
invalidate fresh evidence. The three vector files are placeholders until workers
complete them and receive assertion review.

Three independent Jait-provider DeepSeek v4.1 Flash batches are specified in
`.jait/artifacts/gateway-rust-readiness/parallel-flash/dispatch-plan.json`.
Their launch failed with `agent_halted`; no threads were created. Resume autonomous
agents through Jait before dispatching these prepared batches. Coverage credit
requires passing Rust reports and exact original-assertion review for every batch.
Security evidence: `.jait/artifacts/contracts/aab942fc-a2f0-4585-b887-94e82eb299aa/report.json`.
Managed gateway evidence: `.jait/artifacts/contracts/49f7d931-76a4-4f56-a2ab-3698da8c2817/report.json`.
