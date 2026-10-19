# Reference source runtime reviews

The inventory started with 1 verified source (command-timeout.ts) and 360 pending
sources, independently of 2,792 mapped test declarations. The current registry contains 58
source reviews across runtime modules, re-export barrels and erased type modules. Source counts are equal-weight inventory progress, not implementation
effort, measured branch percentages or whole-gateway equivalence.

`../source-reviews.json` is the per-source behavior and decision table. Each entry
names every associated vector and one source mutation. `../vectors/sourcereview.json`
contains 101 authored input/expected-output scenarios. Rust runs the production
TypeScript through the existing bounded subprocess transport; the bridge supplies
calls and boundary fixtures, with no expected results or pass/fail decisions.

The runtime group covers surface UI policy, assessment leases, ownership replies,
state directory selection, crypto installation, inline email images, preview JWTs,
request origins, Git node selection, shell prompts, LLM request identity, cron
validation, device transitions, both UUID helpers, voice/editor tools, list
previews, swarm rounds, control access, and trust/hook HTTP routes. Fastify route
tests use real registration and injection. Service, WebSocket and audio interfaces
are substituted only at the policy/tool boundary being tested. No provider, TTS,
SSH or external notification request is made.

Barrel reviews assert exact runtime export names and identity with independently
imported defining modules. They additionally reject non-export statements. They
credit the barrel only: dependent implementations and their initialization remain
separate reviews. Type-only reviews require exactly empty emitted ESM and no
runtime exports. Static type/schema compatibility remains a separate migration
gate. No source was waived, excluded from the inventory, or marked implemented
in Rust by this batch.

Run from the repository root:

```sh
node tests/contract/run.mjs test --test source_review -- --nocapture
node --test tests/contract/tooling/source-review.test.mjs
```

The Rust target requires each unchanged case to pass, then copies each module and
redirects its import inside `.jait/artifacts/source-review/`. It requires a real
equality assertion failure after mutation and a pass after restoring the copy.
Production files are never temporarily reverted. Compiler failures, subprocess
failures, missing assertions and fixture setup failures do not count as mutations
caught. A type-only control adds an actual runtime export; a barrel control renames
a binding. Runtime controls change security ownership/locking, limits, routing,
ordering or return behavior. Source, driver, vector, interpreter and Cargo hashes
must remain unchanged while the result is collected.

The target prints its unique project-local `report.json` path. Apply that report
only after inspecting its verdicts:

```sh
node tests/contract/tooling/source-review.mjs .jait/artifacts/source-review/<run>/report.json
node tests/contract/tooling/source-review.mjs .jait/artifacts/source-review/<run>/report.json --apply
node tests/contract/run.mjs coverage --require-declarations
```

The first command validates without writing. Promotion checks every required
current SHA-256, the inventory's existing FNV source fingerprint, exact scenario
membership, all passing results, and one assertion-failing/restored mutation per
source. It updates only reviewed source entries. Tests reject stale source or
interpreter evidence, incomplete/failed/wrong-backend reports, borrowed mutation
cases, fixture failures and failed restoration.

Limits: these are reference runtime reviews on Linux. They do not establish native
Rust runtime completion, all supported platforms, measured source branch coverage,
complete interface coverage, historic database compatibility or replacement safety.
Unreviewed source entries remain pending and the overall parity gate remains closed.

The second runtime batch adds worktree metadata mounting, terminal output slices,
usage freshness/backoff/capacity, Linux sandbox owner identity, diagram and link
validation, and mobile alarm context/delivery. The empty/reversed terminal slice
reproduction returned `ab` instead of the expected empty string before the root
fix, and passes unchanged afterward. The production files stay intact during
mutation controls, including this fix. Source-copy imports preserve both quote
styles, parent paths and package resolution; restored barrel identity checks
ensure the copy still exercises the original dependent modules.

The next batch adds node registry state transitions under an injected clock, project
transfer process arguments using local ssh/scp stand-ins, and notification detail
normalization and request construction with a mocked completion boundary. The 11
new scenarios cover gateway-node exemptions, client replacement, literal path
quoting, validation and process failure order, exact truncation boundaries and
provider failure fallback. Their source mutation controls bypass the gateway
exemption, disable SSH BatchMode, and change the notification size limit. No
remote process or model request is made. Transfer timeout/maxBuffer exhaustion,
notification timeout firing and live model quality remain separate checks.

The following batch adds the production container metadata parser and Docker
inventory cache/batching policy, maintenance-tool service/notification handling,
and Linux Ollama setup metadata. Docker and maintenance use explicit injected
boundaries; Ollama setup uses isolated project-local files and real stat/access
permission outcomes. Tests neither contact a daemon/provider nor execute an ACL
command or maintenance check. The source controls move the cache expiry by one
millisecond, invert the single-repository result message decision, and reverse
the local-versus-remote setup branch. Default Docker process/socket selection,
multi-location credential search and non-Linux setup remain separate checks.
