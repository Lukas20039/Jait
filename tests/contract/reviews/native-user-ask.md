# Native user.ask tool adapter

The native adapter calls the real UserQuestionService. It does not forward to
TypeScript or simulate a result. Its declarative metadata is embedded JSON
compared against createUserAskTool's actual constructor output, including the
parameter schema, descriptions, consent defaults, tier, risk, source and name.

Inputs follow the tool schema. Question id/header/text and option labels use
ECMAScript trim. Empty option labels are removed, empty descriptions are omitted,
recommended and multiSelect default false, and freeform input defaults true.
Empty question arrays, blank required fields and duplicate trimmed ids fail
before creating a pending request. Duplicate diagnostics preserve the order of
first duplicate occurrence rather than sorting.

The request takes session and owner identity solely from authenticated tool
context; extra input identity fields are ignored. requestedBy is user.ask. The
actual pending service supplies title defaults, nullable owners, event metadata
and a no-expiry request. Owner-authorized submission resumes execute with the
complete answers; cancellation returns the reference's unsuccessful result.
An unanswered request remains pending. Registry/consent dispatch and production
client transports remain separate migration work.

gateway_rust_user_ask compares the TypeScript constructor and real service with
the native adapter using isolated in-memory registries, fixed wall time and
validated normalized UUIDv7 request identities. Exact results, pending requests,
callback events and owner-filtered lists are compared. The vectors cover empty
and whitespace-only required fields, repeated ids, optional choices, removed
blank choices, Unicode trim, explicit defaults, cancellation, unanswered requests,
wrong-user submit, duplicate submit and input-supplied identity fields.

Two reversible mutations replace authenticated ownership or sort duplicate ids.
Each fails the same differential assertion; restored sources pass all eight
tests (including four subprocess transport tests) and strict contract Clippy.
Evidence is in .jait/artifacts/gateway-rust/user-ask-mutations.json and the
corresponding mutant/restored logs. The full source-bound gate is required before
crediting the component. This is focused schema-valid JSON compatibility, not
validation of arbitrary untyped JavaScript inputs or complete production dispatch.
