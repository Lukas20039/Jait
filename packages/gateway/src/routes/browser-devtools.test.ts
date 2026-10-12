import Fastify from "fastify";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import { registerBrowserDevToolsRoutes } from "./browser-devtools.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture() {
  const upstream = Fastify();
  const assets = vi.fn();
  upstream.get("/devtools/*", (req, reply) => { assets(req.url); return reply.type("text/html").send("<html>DevTools</html>"); });
  const endpoint = await upstream.listen({ port: 0, host: "127.0.0.1" });
  cleanup.push(() => upstream.close());
  const wss = new WebSocketServer({ noServer: true });
  upstream.server.on("upgrade", (request, socket, head) => {
    expect(request.url).toBe("/devtools/page/page-1");
    wss.handleUpgrade(request, socket, head, ws => {
      ws.on("message", data => ws.send(data));
    });
  });
  cleanup.push(async () => { for (const ws of wss.clients) ws.terminate(); wss.close(); });
  let active = true;
  const previewService = {
    getDevToolsConnection: vi.fn(async () => {
      if (!active) throw new Error("Take control first");
      return { endpoint, targetId: "page-1", browserId: "browser-1", revision: 1 };
    }),
    isDevToolsConnectionActive: vi.fn(() => active),
  };
  const sessionService = { getById: vi.fn((id, userId) => id === "session-1" && userId === "user-1" ? { id } : null) };
  const config = { ...loadConfig(), jwtSecret: "devtools-test-secret" };
  const app = Fastify({ routerOptions: { maxParamLength: 2048 } });
  registerBrowserDevToolsRoutes(app, config, { previewService: previewService as any, sessionService: sessionService as any });
  cleanup.push(() => app.close());
  const headers = { authorization: "Bearer " + await signAuthToken({ id: "user-1", username: "owner" }, config.jwtSecret) };
  const otherHeaders = { authorization: "Bearer " + await signAuthToken({ id: "user-2", username: "other" }, config.jwtSecret) };
  const issue = () => app.inject({ method: "POST", url: "/api/preview/devtools", payload: { sessionId: "session-1" }, headers });
  return { app, headers, otherHeaders, previewService, issue, assets, revoke: () => { active = false; } };
}

describe("Chrome DevTools routes", () => {
  it("enforces authentication, ownership and browser takeover", async () => {
    const f = await fixture();
    const request = { method: "POST" as const, url: "/api/preview/devtools", payload: { sessionId: "session-1" } };
    expect((await f.app.inject(request)).statusCode).toBe(401);
    expect((await f.app.inject({ ...request, headers: f.otherHeaders })).statusCode).toBe(404);
    expect(f.previewService.getDevToolsConnection).not.toHaveBeenCalled();
    f.revoke();
    expect((await f.issue()).statusCode).toBe(409);
  });

  it("serves bundled assets with a resource grant and rejects escape paths", async () => {
    const f = await fixture();
    const grant = (await f.issue()).json();
    expect(grant.url).toMatch(/devtools_app.html$/);
    expect((await f.app.inject(grant.url)).body).toContain("DevTools");
    const prefix = grant.url.replace("/devtools_app.html", "");
    for (const path of ["/json/list", "/../json/list", "/%2e%2e/secret.js", "/https://example.com/x.js"]) {
      expect([403, 404]).toContain((await f.app.inject(prefix + path)).statusCode);
    }
    expect(f.assets).toHaveBeenCalledTimes(1);
    expect((await f.app.inject(grant.url.replace(/preview\/[^/]+/, "preview/invalid"))).statusCode).toBe(403);
    f.revoke();
    expect((await f.app.inject(grant.url)).statusCode).toBe(403);
  });

  it("only lets the owner release a grant", async () => {
    const f = await fixture();
    const grant = (await f.issue()).json();
    const url = "/api/preview/devtools/" + grant.id;
    expect((await f.app.inject({ method: "DELETE", url, headers: f.otherHeaders })).statusCode).toBe(404);
    expect((await f.app.inject({ method: "DELETE", url, headers: f.headers })).statusCode).toBe(204);
    expect((await f.app.inject(grant.url)).statusCode).toBe(403);
  });

  it("proxies the selected page socket and closes it on handoff", async () => {
    const f = await fixture();
    const base = await f.app.listen({ port: 0, host: "127.0.0.1" });
    const grant = (await f.issue()).json();
    const client = new WebSocket(base.replace("http:", "ws:") + grant.socketUrl);
    cleanup.push(async () => { client.terminate(); });
    await once(client, "open");
    const message = once(client, "message");
    client.send(JSON.stringify({ id: 1, method: "DOM.getDocument" }));
    expect(String((await message)[0])).toContain("DOM.getDocument");
    const closed = once(client, "close");
    f.revoke();
    await closed;
    const rejected = new WebSocket(base.replace("http:", "ws:") + grant.socketUrl);
    rejected.on("error", () => {});
    const denied = await once(rejected, "unexpected-response");
    expect(denied[1].statusCode).toBe(403);
    denied[1].resume();
    rejected.terminate();
  });
});
