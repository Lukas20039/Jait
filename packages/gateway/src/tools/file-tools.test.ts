/**
 * image.view tool — reads a project image and inlines it as base64 for the web
 * UI when it fits the payload budget, otherwise reports the path so the chat can
 * load the bytes through the gateway's image endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { FileSystemSurfaceFactory } from "../surfaces/filesystem.js";
import { createImageViewTool, createFileReadTool, createFileWriteTool } from "./file-tools.js";
import type { ToolContext } from "./contracts.js";

describe("image.view tool", () => {
  let project: string;
  let registry: SurfaceRegistry;

  const toolContext: ToolContext = {
    sessionId: "img-session",
    actionId: "a1",
    projectRoot: "",
    requestedBy: "test",
  };

  beforeEach(async () => {
    project = mkdtempSync(join(tmpdir(), "jait-imageview-"));
    registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());
    toolContext.projectRoot = project;
    await registry.startSurface("filesystem", `fs-${toolContext.sessionId}`, {
      sessionId: toolContext.sessionId,
      projectRoot: project,
    });
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  it("preserves exact CRLF and Unicode bytes and reports UTF-8 size", async () => {
    const content = "Grüße 🌍\r\n\tvalue = 7  \r\n\r\n";
    const write = await createFileWriteTool(registry).execute({ path: "result.txt", content }, toolContext);
    expect(write.ok).toBe(true);
    expect(readFileSync(join(project, "result.txt"))).toEqual(Buffer.from(content));
    expect(write.data).toMatchObject({ size: 30 });
    expect(write.message).toContain("30 bytes");
    const read = await createFileReadTool(registry).execute({ path: "result.txt" }, toolContext);
    expect(read.data).toMatchObject({ content, size: 30 });
  });

  it("returns a single base64 copy for a small PNG image", async () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x01, 0x02, 0x03,
    ]);
    const imgPath = "shot.png";
    writeFileSync(join(project, imgPath), pngBytes);

    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: imgPath }, toolContext);

    expect(result.ok).toBe(true);
    const data = result.data as { base64: string; mimeType: string; size: number; inline: boolean };
    expect(data.mimeType).toBe("image/png");
    expect(data.size).toBe(pngBytes.length);
    expect(data.inline).toBe(true);
    expect(data.base64).toBe(pngBytes.toString("base64"));
    // The bytes used to ship twice (`base64` plus a `dataUri` wrapper), which
    // doubled the payload and pushed mid-sized screenshots past the transport.
    expect(result.data).not.toHaveProperty("dataUri");
  });

  it("stops inlining image bytes above the payload budget", async () => {
    // 9 KB inlines to ~12 KB of base64, past the budget; the chat then loads
    // the file from its path instead of the truncated tool result.
    const bigPng = Buffer.alloc(9_000, 0x7f);
    writeFileSync(join(project, "big.png"), bigPng);

    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: "big.png" }, toolContext);

    expect(result.ok).toBe(true);
    const data = result.data as { base64?: string; inline: boolean; size: number; path: string };
    expect(data.inline).toBe(false);
    expect(data.size).toBe(bigPng.length);
    expect(data.path).toBe("big.png");
    expect(data.base64).toBeUndefined();
    expect(result.message).toContain("too large to inline");
  });

  it("derives the correct mime type for jpeg, webp, and gif", async () => {
    const tool = createImageViewTool(registry);
    const cases: Array<{ file: string; mime: string }> = [
      { file: "a.jpg", mime: "image/jpeg" },
      { file: "b.jpeg", mime: "image/jpeg" },
      { file: "c.webp", mime: "image/webp" },
      { file: "d.gif", mime: "image/gif" },
    ];
    for (const { file, mime } of cases) {
      writeFileSync(join(project, file), Buffer.from([0x01, 0x02, 0x03]));
      const result = await tool.execute({ path: file }, toolContext);
      expect(result.ok).toBe(true);
      expect((result.data as { mimeType: string }).mimeType).toBe(mime);
    }
  });

  it("rejects non-image file extensions", async () => {
    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: "notes.txt" }, toolContext);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Only PNG, JPG, GIF, or WEBP");
  });

  it("fails gracefully for a missing file", async () => {
    const tool = createImageViewTool(registry);
    const result = await tool.execute({ path: "missing.png" }, toolContext);
    expect(result.ok).toBe(false);
  });
});