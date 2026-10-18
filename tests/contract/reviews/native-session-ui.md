# Native session and project UI state

`gateway_rust_ui_state` compares production TypeScript services with native SQLite
services on isolated, fully migrated databases. It checks exact JSON values,
serialized stored text, row order, timestamps, filtering, upsert/deletion,
malformed legacy JSON, cross-session key lookup, partial failures, and reopening
native file databases. Project legacy migration checks first-read response versus
subsequent durable state, missing versus empty key filters, truthy unified state,
nullish layout fallback, inherited legacy property data, and cleanup failures.

The two state services were already credited at the 45-component checkpoint.
This batch strengthens their implementation and contracts without new component
credit, and consolidates into the existing `json_state` module. These services intentionally have no owner check;
callers authorize the containing session or project. The HTTP tests exercise
session ownership before state access. The stored JSON corpus uses finite numbers
and well-formed Unicode. Legacy nonfinite numeric JSON and lone-surrogate parsing
are not established by this review.

`gateway_rust_session_http` exercises actual loopback HTTP against Fastify and
Axum with real migrations, users, sessions, projects, state, and audit storage.
The reference busy predicate, node lookup/access, hook/broadcast sinks and title
HTTP peer are explicit fixtures. There are no external requests or paid provider
calls. Responses, stored records and ordered events are compared exactly; only
validated generated UUIDv7 identities are replaced with stable symbolic values.
Title normalization additionally compares all UTF-16 code units for 125 cases.

The HTTP component remains **candidate**, with no native component credit.
Open compatibility work includes the full legacy ECMAScript Date.parse input
space, unregistered optional routes/method fallbacks, framework parser errors,
and provider/platform integration. The typed title/runtime adapters do not
constitute implementations of provider transport, live chat execution or WebSocket
transport. The standalone entry point remains unchanged; session routes require
explicit opt-in via `Gateway::with_sessions`.

The initial HTTP contracts exposed native metadata key reordering: native
`{"chat":{"model":...,"nodeId":...,"provider":...}}` differed from the
TypeScript insertion order. Ordered raw JSON objects now preserve insertion and
ECMAScript numeric-key order while retaining raw UTF-16 values. Existing session
contracts continue to pass. No JSON-text assertion was normalized away.

The inherited-project-state regression fails against the previous native store:
`project.ui` is missing, while the reference migrates the inherited panel data.
The consolidated store passes the same assertion.

Five mutations prove that assertions detect cross-session state reads,
incorrect empty-filter migration, metadata reordering, missing HTTP ownership,
and title overwrite after a concurrent rename. Each mutant failed the relevant
unchanged contract; restored sources passed. Logs and structured mutation results
are under `.jait/artifacts/gateway-rust/`. The first UI-state run also rejected two
invalid duplicate-row fixtures because current migrations enforce unique keys;
those setup fixtures were corrected before the behavior checks passed.

Run `RUST_TEST_THREADS=2 bun run test:gateway:rust` for the source-bound gate.
Production replacement readiness and the 181/361 implementation milestone remain
open.
