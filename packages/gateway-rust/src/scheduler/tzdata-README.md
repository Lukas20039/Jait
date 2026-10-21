The scheduler bundles IANA tzdata 2024a to preserve the existing Bun 1.3.10 /
ICU 75.1 scheduling contract during migration. ICU 75 documents that exact
data version: https://icu.unicode.org/download/75

Source: https://data.iana.org/time-zones/releases/tzdata2024a.tar.gz
Archive SHA-256:
`0d0434459acbd2059a7a8da1f3304a84a86591f6ed69c6248fffa502b6edffe3`

`scheduler-tzdata-2024a.bin` concatenates 352 distinct TZif records for 597
names/aliases. `tzdata_2024a.rs` indexes their offsets and sizes. The source
license is retained in `tzdata-LICENSE`. Jiff parses the embedded records;
the production scheduler does not consult host timezone files, start a process,
or call a JavaScript/TypeScript bridge.

Regenerate with `tooling/generate-scheduler-tzdata.py` after preparing the
public release using `zic -b fat` as described in that script. All working
downloads/compiler outputs belong under the project-local
`.jait/artifacts/gateway-rust/scheduler/tzdb-2024a/`. Keep the original data,
archive hash, generated index and blob together in review.

Changing data versions changes observable scheduling behavior, including accepted
names and future daylight-saving rules. Review it as a behavior change and run
the complete differential suite. That suite probes the union of the reference's
canonical names and a newer bundled database, retaining rejection comparisons
for names the reference does not support. It also covers aliases, case handling,
offset forms, invalid Unicode, transition boundaries and extreme Date values.
