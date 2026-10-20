# Native model fetchers review

Reference: `packages/gateway/src/providers/model-fetchers.ts`. Native implementation:
`providers/model_fetchers.rs`. Candidate for the full source-bound gate; no production activation.

The four native catalogue paths preserve URL normalization, request authentication/omission,
5-second deadlines, provider-specific mapping/filtering/order, OpenRouter's 100-entry ceiling,
OmniRoute's import-time cap parsing and routing alias, and Ollama details. Root ICU collation
matches the reference host's locale. UTF-16 descriptions retain exact split-surrogate clipping
through the existing native UTF-16 serializer. Raw id/name values preserve tested permissive
wire cases without promoting imported data into authority.

Cache behavior covers per-URL/key entries (OpenRouter deliberately has a shared entry), TTL
edges, stale-while-revalidate, first-load coalescing, non-OK retries, stale failures and reset.
A cache owns its collection independently of subscribers. Reset matches the source's existing
race: an old collection can repopulate cache and its finally handler can remove a newer key.
It is not silently changed into generation-based invalidation.

Host verification: `node tests/contract/run.mjs test --test gateway_rust_model_fetchers`
passes 15 component checks plus four subprocess transport checks. Differential scenarios run
the actual TypeScript module with controlled fetch/clock boundaries, not a reimplementation.
They compare serialized models, request endpoints, authentication and timeout arguments,
including held requests, races, empty/error bodies, coalescing and Unicode. An actual owned
HTTP peer compares native and real Bun HTTP outcomes for seven paths, headers, BOM and
malformed UTF-8 decoding. A transport check observes the supplied deadline against a slow
owned peer; request planners independently compare the production 5000 ms constant.

Differential failures corrected an empty Ollama join (description omitted, not empty) and
nullable-ID comparator coercion. Before/after evidence is in
`.jait/artifacts/gateway-rust/model-fetchers-empty-join-{before,after}.log` and
`model-fetchers-sort-{before,after}.log`. Three restored mutations (TTL edge, official OpenAI
filter, UTF-16 ceiling) fail their differential tests; restored source passes all 19 checks.
Evidence: `model-fetchers-mutations/` and `model-public-restored.log` in that artifact directory.

Boundaries: error messages from HTTP/JSON engines are not required to be byte-identical.
Malformed-ID comparator invocation order is engine-defined; native and reference use stable
sorts, with valid string IDs as the declared provider contract. Tested malformed cases are
recorded, not a claim of exhaustive engine equivalence. Lone-surrogate input JSON and numeric
overflow beyond native JSON's finite-number domain are not established. Source body/cache
sizes remain unbounded; no scanner safety or assessment scope is implied by URL reachability.
No live providers/credentials are used. TLS/proxy/redirect wire equivalence outside the shared
reqwest engine and owned fixtures, and activation through the catalogue's typed seam, remain
separate integration/readiness work. This module adds no second credit for the catalogue service.
