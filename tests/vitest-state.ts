import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";

// Server fixtures restore persisted services on startup. Never let unit tests
// discover the developer's saved Messenger sessions or other gateway state.
const artifacts = fileURLToPath(new URL("../.jait/artifacts/vitest-state/", import.meta.url));
mkdirSync(artifacts, { recursive: true });
const stateDirectory = mkdtempSync(join(artifacts, "suite-"));
process.env["JAIT_STATE_DIR"] = stateDirectory;
const temporaryDirectory = join(stateDirectory, "tmp");
mkdirSync(temporaryDirectory);
for (const key of ["TMPDIR", "TEMP", "TMP"]) process.env[key] = temporaryDirectory;

// Keep the override after cleanup so late callbacks cannot fall back to ~/.jait.
// Node flushes its compile cache into TMPDIR lazily, so a late write can race the
// recursive unlink and surface ENOTEMPTY on tmp/node-compile-cache. Retry the
// removal instead of failing whichever test file happened to finish last.
afterAll(() =>
  rmSync(stateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }),
);
