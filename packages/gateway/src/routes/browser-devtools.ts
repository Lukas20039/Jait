import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import { signPreviewToken, verifyPreviewToken } from "../security/preview-token.js";
import type { PreviewService } from "../services/preview.js";
import type { SessionService } from "../services/sessions.js";

interface Grant {
  userId: string;
  sessionId: string;
  browserId: string;
  revision: number;
  targetId: string;
  endpoint: string;
  expiresAt: number;
}

/** Serve Chromium's bundled frontend and proxy only its selected page transport. */
export function registerBrowserDevToolsRoutes(app: FastifyInstance, config: AppConfig, deps: {
  previewService: PreviewService;
  sessionService?: SessionService;
}): void {
  const grants = new Map<string, Grant>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
  const active = (grant: Grant) => grant.expiresAt > Date.now()
    && !!deps.sessionService?.getById(grant.sessionId, grant.userId)
    && deps.previewService.isDevToolsConnectionActive(grant.sessionId, grant.browserId, grant.revision);
  const authorized = async (id: string, token: string) => {
    const grant = grants.get(id);
    if (!grant || !active(grant)) return null;
    const userId = await verifyPreviewToken(token, "devtools:" + id, config.jwtSecret);
    return userId === grant.userId && active(grant) ? grant : null;
  };
  const cleanup = setInterval(() => {
    for (const [id, grant] of grants) if (!active(grant)) grants.delete(id);
  }, 60_000);
  cleanup.unref();

  app.post("/api/preview/devtools", {
    schema: { body: {
      type: "object", additionalProperties: false, required: ["sessionId"],
      properties: { sessionId: { type: "string", minLength: 1 } },
    } },
  }, async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { sessionId } = request.body as { sessionId: string };
    if (!deps.sessionService?.getById(sessionId, user.id)) return reply.status(404).send({ error: "Session not found" });
    try {
      const connection = await deps.previewService.getDevToolsConnection(sessionId);
      if (!connection) return reply.status(404).send({ error: "Chrome DevTools is unavailable for this browser." });
      if (!/^[a-zA-Z0-9-]+$/.test(connection.targetId)) throw new Error("Invalid browser target.");
      for (const [id, grant] of grants) if (!active(grant)) grants.delete(id);
      if (grants.size >= 64) return reply.status(429).send({ error: "Close an existing DevTools panel and try again." });
      const id = randomUUID();
      const grant = { ...connection, sessionId, userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 };
      grants.set(id, grant);
      const token = await signPreviewToken(user.id, "devtools:" + id, config.jwtSecret);
      const prefix = `/preview/${token}/devtools/${id}`;
      reply.header("Cache-Control", "no-store");
      return { id, url: prefix + "/devtools_app.html", socketUrl: prefix + "/socket" };
    } catch (cause) {
      return reply.status(409).send({ error: cause instanceof Error ? cause.message : "Could not open Chrome DevTools." });
    }
  });

  app.delete("/api/preview/devtools/:grantId", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const { grantId } = request.params as { grantId: string };
    if (grants.get(grantId)?.userId !== user.id) return reply.status(404).send({ error: "DevTools panel not found" });
    grants.delete(grantId);
    return reply.status(204).send();
  });

  app.get("/preview/:previewToken/devtools/:grantId/*", async (request, reply) => {
    const params = request.params as { previewToken: string; grantId: string; "*": string };
    const grant = await authorized(params.grantId, params.previewToken);
    if (!grant) return reply.status(403).send({ error: "DevTools access expired or browser control changed." });
    const asset = params["*"];
    // Never proxy discovery endpoints, arbitrary URLs or filesystem traversal.
    if (!asset || asset.split("/").some(part => !part || part === "." || part === "..")
      || !/^[a-zA-Z0-9_./-]+\.(?:html|js|css|json|svg|png|jpg|woff2?|ttf|wasm|map)$/.test(asset)) {
      return reply.status(404).send({ error: "DevTools asset not found" });
    }
    try {
      const upstream = await fetch(new URL("/devtools/" + asset, grant.endpoint), {
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (!upstream.ok) return reply.status(upstream.status).send({ error: "DevTools asset not found" });
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of upstream.body ?? []) {
        bytes += chunk.length;
        if (bytes > 12 * 1024 * 1024) return reply.status(502).send({ error: "DevTools asset too large" });
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      if (!active(grant)) return reply.status(403).send({ error: "Browser control changed." });
      reply.header("Cache-Control", "no-store");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("X-Content-Type-Options", "nosniff");
      return reply.type(upstream.headers.get("content-type") ?? "application/octet-stream").send(body);
    } catch {
      return reply.status(502).send({ error: "DevTools frontend unavailable." });
    }
  });

  const upgrade = async (request: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
    const path = (request.url ?? "").split("?")[0] ?? "";
    const match = path.match(/^\/preview\/([^/]+)\/devtools\/([^/]+)\/socket$/);
    if (!match) return;
    try {
      const grant = await authorized(match[2]!, match[1]!);
      if (!grant) { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return; }
      wss.handleUpgrade(request, socket, head, client => {
        const endpoint = new URL(grant.endpoint);
        endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
        endpoint.pathname = "/devtools/page/" + grant.targetId;
        endpoint.search = "";
        const upstream = new WebSocket(endpoint, { handshakeTimeout: 15_000, maxPayload: 32 * 1024 * 1024 });
        const queued: { data: RawData; binary: boolean }[] = [];
        let queuedBytes = 0;
        const valid = () => grants.get(match[2]!) === grant && active(grant);
        const close = () => {
          client.terminate();
          upstream.terminate();
          clearInterval(timer);
        };
        // Control handoff revokes existing transports, including idle ones.
        const timer = setInterval(() => { if (!valid()) close(); }, 250);
        timer.unref();
        client.on("message", (data, binary) => {
          if (!valid()) { close(); return; }
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
          else if (upstream.readyState === WebSocket.CONNECTING) {
            queuedBytes += Array.isArray(data) ? data.reduce((total, item) => total + item.length, 0) : data.byteLength;
            if (queuedBytes > 1024 * 1024) { close(); return; }
            queued.push({ data, binary });
          }
        });
        upstream.on("open", () => {
          if (!valid()) { close(); return; }
          for (const item of queued) upstream.send(item.data, { binary: item.binary });
          queued.length = 0;
        });
        upstream.on("message", (data, binary) => {
          if (!valid()) { close(); return; }
          if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
        });
        client.on("error", close);
        upstream.on("error", close);
        client.on("close", close);
        upstream.on("close", close);
      });
    } catch { socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); }
  };
  app.server.on("upgrade", upgrade);
  app.addHook("onClose", async () => {
    clearInterval(cleanup);
    app.server.off("upgrade", upgrade);
    for (const client of wss.clients) client.terminate();
    wss.close();
    grants.clear();
  });
}
