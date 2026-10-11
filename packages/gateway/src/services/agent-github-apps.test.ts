import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import type { JaitDB, SqliteDatabase } from "../db/connection.js";
import { UserSecretService } from "./user-secrets.js";
import { AgentGithubAppService, buildAppJwt } from "./agent-github-apps.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}

function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}

describe("AgentGithubAppService", () => {
  let db: JaitDB;
  let sqlite: SqliteDatabase;
  let secrets: UserSecretService;
  let github: FakeGithub;
  let service: AgentGithubAppService;

  function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  });

  afterEach(() => {
    sqlite.close();
  });

  async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }

  it("builds a manifest registration scoped to one agent", async () => {
    const setup = await service.beginSetup(USER_A, AGENT, { appName: "Nova", organization: "acme" });
    expect(setup.postUrl).toContain("/organizations/acme/settings/apps/new?state=");
    expect(setup.redirectUrl).toBe("https://jait.test/api/github/apps/callback");
    expect(setup.manifest["default_permissions"]).toMatchObject({ contents: "write", pull_requests: "write" });
    expect(setup.manifest["redirect_url"]).toBe("https://jait.test/api/github/apps/callback");
    expect(service.readState(setup.state)).toEqual({ userId: USER_A, agentId: AGENT });
  });

  it("keeps the configured public URL when a caller spoofs the request host", async () => {
    const setup = await service.beginSetup(USER_A, AGENT, {
      appName: "Nova",
      baseUrl: "http://127.0.0.1:8000/",
    });

    expect(setup.redirectUrl).toBe("https://jait.test/api/github/apps/callback");
    expect(setup.manifest["redirect_url"]).toBe("https://jait.test/api/github/apps/callback");
    expect(setup.manifest["callback_urls"]).toEqual(["https://jait.test/api/github/apps/callback"]);
    expect(setup.manifest["setup_url"]).toBe("https://jait.test/api/github/apps/callback");
    expect(setup.manifest["hook_attributes"]).toMatchObject({ url: "https://jait.test/api/github/apps/webhook" });
    expect(JSON.stringify(setup.manifest)).not.toContain("127.0.0.1");
  });

  it("falls back to the request base only when no public URL is configured", async () => {
    const previous = process.env["JAIT_PUBLIC_URL"];
    delete process.env["JAIT_PUBLIC_URL"];
    try {
      const local = makeService({ publicBaseUrl: "" });
      const setup = await local.beginSetup(USER_A, AGENT, {
        appName: "Nova",
        baseUrl: "http://127.0.0.1:8000/",
      });

      expect(setup.redirectUrl).toBe("http://127.0.0.1:8000/api/github/apps/callback");
      expect(setup.manifest["hook_attributes"]).toMatchObject({
        url: "http://127.0.0.1:8000/api/github/apps/webhook",
      });
    } finally {
      if (previous === undefined) delete process.env["JAIT_PUBLIC_URL"];
      else process.env["JAIT_PUBLIC_URL"] = previous;
    }
  });

  it("rejects a tampered manifest state token", async () => {
    const setup = await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    const [body] = setup.state.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: USER_B, agentId: AGENT })).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(service.readState(`${forged}.${setup.state.split(".")[1]}`)).toBeNull();
    expect(service.readState(`${body}.deadbeef`)).toBeNull();
    expect(service.readState("garbage")).toBeNull();
  });

  it("stores the private key encrypted and never returns it", async () => {
    await service.completeSetup(USER_A, AGENT, "temp-code");
    const connection = service.get(USER_A, AGENT)!;
    expect(connection.appId).toBe("12345");
    expect(connection.appSlug).toBe("jait-nova");
    expect(connection.botLogin).toBe("jait-nova[bot]");
    expect(connection.hasPrivateKey).toBe(true);
    expect(connection.status).toBe("awaiting_installation");
    expect(JSON.stringify(connection)).not.toContain("PRIVATE KEY");
    const stored = secrets.list(USER_A, "github-app");
    expect(stored).toHaveLength(2);
    expect(stored.every((record) => record.key.startsWith(`agent:${AGENT}`))).toBe(true);
    expect(secrets.getValue(USER_A, "github-app", `agent:${AGENT}`)).toContain("PRIVATE KEY");
  });

  it("attaches an installation and records the bot identity", async () => {
    await connect();
    const connection = service.get(USER_A, AGENT)!;
    expect(connection.status).toBe("connected");
    expect(connection.installationId).toBe("777");
    expect(connection.accountLogin).toBe("acme");
    expect(connection.botLogin).toBe("jait-nova[bot]");
  });

  it("refuses an installation that belongs to a different App", async () => {
    await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    await service.completeSetup(USER_A, AGENT, "temp-code");
    github.installationAppId = 99999;
    await expect(service.attachInstallation(USER_A, AGENT, "777")).rejects.toThrow(/different GitHub App/);
  });

  it("keeps agents isolated from each other and from other users", async () => {
    await connect(USER_A, AGENT);
    await service.beginSetup(USER_B, OTHER_AGENT, { appName: "Ada" });
    await service.completeSetup(USER_B, OTHER_AGENT, "temp-code");

    expect(service.get(USER_A, OTHER_AGENT)).toBeNull();
    expect(service.get(USER_B, AGENT)).toBeNull();
    expect(service.list(USER_A)).toHaveLength(1);
    expect(service.list(USER_A)[0]!.agentId).toBe(AGENT);

    // USER_B must not be able to mint USER_A's agent identity.
    await expect(service.mintInstallationToken(USER_B, AGENT)).rejects.toThrow(/no GitHub App connection/);
  });

  it("caches installation tokens and refreshes them after expiry", async () => {
    await connect();
    let now = Date.now();
    // Fresh instance (empty token cache) but the same database row.
    const clocked = makeService({ now: () => now });
    const first = await clocked.mintInstallationToken(USER_A, AGENT);
    const second = await clocked.mintInstallationToken(USER_A, AGENT);
    expect(second.token).toBe(first.token);
    expect(github.installationTokenRequests).toBe(1);

    now += 3_600_000;
    const third = await clocked.mintInstallationToken(USER_A, AGENT);
    expect(third.token).not.toBe(first.token);
    expect(github.installationTokenRequests).toBe(2);
  });

  it("signs App JWTs with the stored app id", async () => {
    const jwt = buildAppJwt("12345", privateKey, Date.now());
    const [, payload] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(payload!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    expect(decoded.iss).toBe("12345");
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(600);
  });

  it("tests a connection end to end without leaking the token", async () => {
    await connect();
    const result = await service.testConnection(USER_A, AGENT);
    expect(result.ok).toBe(true);
    expect(result.botLogin).toBe("jait-nova[bot]");
    expect(result.repositoryCount).toBe(2);
    expect(result.sampleRepositories).toEqual(["acme/jait", "acme/site"]);
    expect(result.tokenPrefix).toBe("ghs_…");
    expect(JSON.stringify(result)).not.toContain("ghs_token_");
  });

  it("marks the connection revoked when GitHub rejects the credentials", async () => {
    await connect();
    github.appDeleted = true;
    await expect(service.verify(USER_A, AGENT)).rejects.toThrow(/rejected the stored credentials|Not Found/);
    expect(service.get(USER_A, AGENT)!.status).toBe("revoked");
  });

  it("resolves the per-agent environment and never falls back to a personal token", async () => {
    const beforeConnect = await service.resolveAgentGithubEnv(USER_A, AGENT);
    expect(beforeConnect).toBeNull();

    // A personal forge token exists on the user's account.
    secrets.save({ userId: USER_A, type: "forge-token", key: "github.com", label: "personal PAT", value: "ghp_personal_token" });

    await connect();
    const env = await service.resolveAgentGithubEnv(USER_A, AGENT)!;
    expect(env!["GH_TOKEN"]).toMatch(/^ghs_token_/);
    expect(env!["GITHUB_TOKEN"]).toBe(env!["GH_TOKEN"]);
    expect(env!["GITHUB_APP_BOT_LOGIN"]).toBe("jait-nova[bot]");
    expect(env!["JAIT_GITHUB_IDENTITY"]).toBe("agent-app");
    expect(JSON.stringify(env)).not.toContain("ghp_personal_token");

    // An agent without a connection resolves to no identity at all.
    expect(await service.resolveAgentGithubEnv(USER_A, OTHER_AGENT)).toBeNull();
  });

  it("disconnects an agent and wipes its stored key", async () => {
    await connect();
    expect(service.disconnect(USER_A, AGENT).disconnected).toBe(true);
    expect(service.get(USER_A, AGENT)).toBeNull();
    expect(secrets.list(USER_A, "github-app")).toHaveLength(0);
    await expect(service.mintInstallationToken(USER_A, AGENT)).rejects.toThrow(/no GitHub App connection/);
  });

  it("rejects incomplete registrations instead of borrowing another identity", async () => {
    await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    await expect(service.mintInstallationToken(USER_A, AGENT)).rejects.toThrow(/registration is incomplete/);
    await expect(service.verify(USER_A, AGENT)).rejects.toThrow(/registration is incomplete/);
  });

  it("accepts a manually registered App as a fallback", async () => {
    const connection = await service.saveManualApp(USER_A, AGENT, { appId: "555", privateKey, appSlug: "manual-bot" });
    expect(connection.appId).toBe("555");
    expect(connection.botLogin).toBe("manual-bot[bot]");
    expect(connection.status).toBe("awaiting_installation");
    await expect(service.saveManualApp(USER_A, AGENT, { appId: "not-a-number", privateKey })).rejects.toThrow(/numeric/);
    await expect(service.saveManualApp(USER_A, AGENT, { appId: "556", privateKey: "nope" })).rejects.toThrow(/PEM/);
  });
});
