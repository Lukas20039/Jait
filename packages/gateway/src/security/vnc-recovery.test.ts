import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

describe("VNC process recovery", () => {
  it("restarts after a nonzero x11vnc exit despite errexit", () => {
    const source = readFileSync(new URL("./sandbox-manager.ts", import.meta.url), "utf8");
    const loops = [...source.matchAll(/while true; do(?:(?!\n\s*done)[\s\S])*?\n\s*done/g)].map(match => match[0]).filter(loop => loop.includes("x11vnc -display"));
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      const result = spawnSync("bash", ["-c", `set -eu
calls=0
x11vnc() { calls=$((calls+1)); echo "attempt:$calls"; return 11; }
sleep() { if [ "$calls" -ge 2 ]; then exit 0; fi; }
${loop}`], { encoding: "utf8", timeout: 2000 });
      expect(result.stdout).toContain("attempt:2");
      expect(result.status).toBe(0);
    }
  });
});
