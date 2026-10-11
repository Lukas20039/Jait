import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { agentGithubApps } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { UserSecretService } from "./user-secrets.js";

/**
 * Per-agent GitHub App connections (issue #246).
 *
 * Each persistent Jait agent (Agents page profile) gets its own GitHub App so
 * that commits, branches, pull requests, comments and reviews it produces are
 * attributable to that agent and not to the user's personal account.
 *
 * Design rules enforced here:
 *  - The App private key is stored encrypted via UserSecretService under
 *    type `github-app`, key `agent:<agentId>`. The connection row holds
 *    metadata only.
 *  - Every lookup is scoped by (userId, agentId); another user's or another
 *    agent's connection can never be read, verified or minted from.
 *  - Tokens are installation tokens minted on demand and cached only in
 *    memory until shortly before expiry. There is no fallback to the user's
 *    personal forge token: an unconnected agent simply has no GitHub identity.
 */

export const GITHUB_APP_SECRET_TYPE = "github-app";
export const DEFAULT_GITHUB_API_BASE = "https://api.github.com";
/** Refresh installation tokens this long before GitHub expires them. */
export const INSTALLATION_TOKEN_SKEW_MS = 60_000;
export const APP_JWT_LIFETIME_SECONDS = 540;

export type AgentGithubAppStatus = "awaiting_installation" | "connected" | "error" | "revoked";

export interface AgentGithubAppConnection {
  agentId: string;
  appId: string | null;
  appSlug: string | null;
  appName: string | null;
  clientId: string | null;
  installationId: string | null;
  accountLogin: string | null;
  accountType: string | null;
  botLogin: string | null;
  repositorySelection: string | null;
  permissions: Record<string, string> | null;
  status: AgentGithubAppStatus;
  createdAt: string;
  updatedAt: string;
  installedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  /** True when an encrypted private key is present for this agent. */
  hasPrivateKey: boolean;
  /** Present only on freshly created connections, never re-served. */
  manifestState?: string | null;
}

export interface GithubAppFetchResult<T> {
  ok: true;
  status: number;
  data: T;
}

export interface GithubAppFetchFailure {
  ok: false;
  status: number;
  message: string;
  /** True when GitHub answered 401/404 for a stored credential. */
  credentialRejected: boolean;
}

export type GithubAppCall<T> = GithubAppFetchResult<T> | GithubAppFetchFailure;

export interface AgentGithubAppDeps {
  db: JaitDB;
  userSecretService?: UserSecretService;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** GitHub REST base; override for GitHub Enterprise Server. */
  apiBaseUrl?: string;
  /** Public base URL of this Jait gateway, used for the manifest flow. */
  publicBaseUrl?: string;
  /** HMAC secret for manifest state tokens; defaults to config.jwtSecret. */
  stateSecret?: string;
  now?: () => number;
  /** Optional existence check so a connection can only target a real agent. */
  agentExists?: (userId: string, agentId: string) => boolean;
}

interface StoredConnection extends AgentGithubAppConnection {
  manifestState: string | null;
}

interface InstallationTokenCacheEntry {
  token: string;
  expiresAt: number;
  permissions: Record<string, string> | null;
  repositorySelection: string | null;
}

export interface SetupStart {
  agentId: string;
  state: string;
  /** POST target for the manifest form (GitHub or GitHub Enterprise). */
  postUrl: string;
  /** Where GitHub sends the browser back after App creation. */
  redirectUrl: string;
  manifest: Record<string, unknown>;
  /** True when a reusable App (appId + key) is already stored. */
  hasCredentials: boolean;
}

export interface SetupCompletion {
  connection: AgentGithubAppConnection;
  /** URL the user opens to install the App on an account/organization. */
  installUrl: string | null;
}

function secretKey(agentId: string): string {
  return `agent:${agentId}`;
}

function webhookSecretKey(agentId: string): string {
  return `agent:${agentId}:webhook`;
}

function normalizePem(value: string): string {
  return value.includes("BEGIN RSA PRIVATE KEY")
    ? value.replace(/\r\n/g, "\n").trim()
    : value.replace(/\r\n/g, "\n").trim();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build the RS256 App JWT GitHub expects for App-level endpoints.
 * `iat` is backdated so a slightly slow clock cannot produce a rejected JWT.
 */
export function buildAppJwt(appId: string, privateKey: string, nowMs: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const issuedAt = Math.floor(nowMs / 1000) - 60;
  const payload = base64url(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + APP_JWT_LIFETIME_SECONDS,
    iss: appId,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(normalizePem(privateKey));
  return `${header}.${payload}.${base64url(signature)}`;
}

export class AgentGithubAppService {
  private readonly db: JaitDB;
  private readonly secrets?: UserSecretService;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly stateSecret: string;
  private readonly now: () => number;
  private readonly tokenCache = new Map<string, InstallationTokenCacheEntry>();

  constructor(private readonly deps: AgentGithubAppDeps) {
    this.db = deps.db;
    this.secrets = deps.userSecretService;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.apiBaseUrl = (deps.apiBaseUrl ?? DEFAULT_GITHUB_API_BASE).replace(/\/+$/, "");
    this.stateSecret = deps.stateSecret ?? "jait-agent-github-app";
    this.now = deps.now ?? (() => Date.now());
  }

  publicBaseUrl(): string {
    const configured = this.deps.publicBaseUrl ?? process.env["JAIT_PUBLIC_URL"];
    return (configured?.trim() || "http://localhost:8787").replace(/\/+$/, "");
  }

  // ── Storage ────────────────────────────────────────────────────────────

  list(userId: string): AgentGithubAppConnection[] {
    return this.db
      .select({ data: agentGithubApps.data })
      .from(agentGithubApps)
      .where(eq(agentGithubApps.userId, userId))
      .all()
      .map((row) => this.toPublic(userId, JSON.parse(row.data) as StoredConnection));
  }

  get(userId: string, agentId: string): AgentGithubAppConnection | null {
    const stored = this.read(userId, agentId);
    return stored ? this.toPublic(userId, stored) : null;
  }

  /**
   * Resolve the owning (userId, agentId) for a webhook delivery. Webhooks
   * arrive without a user session, so the App id and installation id from the
   * GitHub headers are the only handles available.
   */
  findByAppId(appId: string): { userId: string; agentId: string } | null {
    if (!appId) return null;
    return this.findOwner((stored) => stored.appId === appId);
  }

  /** Resolve the owning agent for an installation id. */
  findByInstallationId(installationId: string): { userId: string; agentId: string } | null {
    if (!installationId) return null;
    return this.findOwner((stored) => stored.installationId === installationId);
  }

  private findOwner(match: (stored: StoredConnection) => boolean): { userId: string; agentId: string } | null {
    const rows = this.db
      .select({ userId: agentGithubApps.userId, agentId: agentGithubApps.agentId, data: agentGithubApps.data })
      .from(agentGithubApps)
      .all();
    for (const row of rows) {
      try {
        if (match(JSON.parse(row.data) as StoredConnection)) return { userId: row.userId, agentId: row.agentId };
      } catch {
        // Ignore unreadable rows; a corrupt row must not break webhook routing.
      }
    }
    return null;
  }

  private read(userId: string, agentId: string): StoredConnection | null {
    const row = this.db
      .select({ data: agentGithubApps.data })
      .from(agentGithubApps)
      .where(and(eq(agentGithubApps.userId, userId), eq(agentGithubApps.agentId, agentId)))
      .get();
    return row ? (JSON.parse(row.data) as StoredConnection) : null;
  }

  private write(userId: string, connection: StoredConnection): void {
    const updatedAt = new Date(this.now()).toISOString();
    const next: StoredConnection = { ...connection, updatedAt };
    const data = JSON.stringify(next);
    const existing = this.db
      .select({ id: agentGithubApps.id })
      .from(agentGithubApps)
      .where(and(eq(agentGithubApps.userId, userId), eq(agentGithubApps.agentId, next.agentId)))
      .get();
    if (existing) {
      this.db.update(agentGithubApps)
        .set({ status: next.status, data, updatedAt })
        .where(and(eq(agentGithubApps.userId, userId), eq(agentGithubApps.agentId, next.agentId)))
        .run();
      return;
    }
    this.db.insert(agentGithubApps)
      .values({ id: uuidv7(), userId, agentId: next.agentId, status: next.status, data, updatedAt })
      .run();
  }

  private blank(agentId: string): StoredConnection {
    const nowIso = new Date(this.now()).toISOString();
    return {
      agentId,
      appId: null,
      appSlug: null,
      appName: null,
      clientId: null,
      installationId: null,
      accountLogin: null,
      accountType: null,
      botLogin: null,
      repositorySelection: null,
      permissions: null,
      status: "awaiting_installation",
      createdAt: nowIso,
      updatedAt: nowIso,
      installedAt: null,
      lastVerifiedAt: null,
      lastError: null,
      hasPrivateKey: false,
      manifestState: null,
    };
  }

  private toPublic(userId: string, stored: StoredConnection): AgentGithubAppConnection {
    const { manifestState: _state, ...rest } = stored;
    return { ...rest, hasPrivateKey: Boolean(this.privateKey(userId, stored.agentId)) };
  }

  private privateKey(userId: string, agentId: string): string | null {
    if (!this.secrets) return null;
    const value = this.secrets.getValue(userId, GITHUB_APP_SECRET_TYPE, secretKey(agentId));
    return value ? normalizePem(value) : null;
  }

  // ── Manifest flow ──────────────────────────────────────────────────────

  /**
   * Prepare a GitHub App manifest registration for one agent. The caller posts
   * the returned manifest to `postUrl` (GitHub renders an "Create GitHub App"
   * confirmation); GitHub then redirects the browser to `redirectUrl`.
   */
  async beginSetup(userId: string, agentId: string, options: {
    appName: string;
    organization?: string | null;
    description?: string;
    homepage?: string;
    /** Overrides the configured public base URL (e.g. the request host). */
    baseUrl?: string;
  }): Promise<SetupStart> {
    const existing = this.read(userId, agentId) ?? this.blank(agentId);
    const base = (options.baseUrl?.trim() || this.publicBaseUrl()).replace(/\/+$/, "");
    const state = this.signState(userId, agentId);
    const name = options.appName.trim().slice(0, 34) || `Jait agent ${agentId.slice(0, 6)}`;
    const manifest: Record<string, unknown> = {
      name,
      url: options.homepage?.trim() || base,
      description: options.description?.trim() || "Jait agent identity: commits, pull requests and reviews authored by this agent.",
      public: false,
      redirect_url: `${base}/api/github/apps/callback`,
      callback_urls: [`${base}/api/github/apps/callback`],
      setup_url: `${base}/api/github/apps/callback`,
      setup_on_update: true,
      request_oauth_on_install: false,
      hook_attributes: { url: `${base}/api/github/apps/webhook`, active: true },
      default_permissions: {
        metadata: "read",
        contents: "write",
        pull_requests: "write",
        issues: "write",
        checks: "read",
        actions: "read",
        workflows: "write",
        statuses: "write",
      },
      default_events: ["pull_request", "pull_request_review", "issues", "issue_comment", "push", "check_run", "workflow_run"],
    };
    this.write(userId, { ...existing, manifestState: state, lastError: null });
    const org = options.organization?.trim();
    const postUrl = org
      ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new?state=${encodeURIComponent(state)}`
      : `https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`;
    return {
      agentId,
      state,
      postUrl,
      redirectUrl: `${base}/api/github/apps/callback`,
      manifest,
      hasCredentials: Boolean(existing.appId && this.privateKey(userId, agentId)),
    };
  }

  /**
   * Exchange the temporary manifest code GitHub returns for real App
   * credentials, then store them encrypted for this agent.
   */
  async completeSetup(userId: string, agentId: string, code: string): Promise<SetupCompletion> {
    const stored = this.read(userId, agentId) ?? this.blank(agentId);
    const response = await this.request<{
      id: number;
      slug: string;
      name: string;
      client_id?: string;
      client_secret?: string;
      pem: string;
      webhook_secret?: string;
      html_url?: string;
    }>(`/app-manifests/${encodeURIComponent(code)}/conversions`, { method: "POST" });
    if (!response.ok) return this.failSetup(userId, stored, response, "GitHub rejected the App manifest code");
    if (!this.secrets) {
      return this.failSetup(userId, stored, { ok: false, status: 500, message: "No secret store configured", credentialRejected: false }, "Secret store unavailable");
    }
    this.secrets.save({
      userId,
      type: GITHUB_APP_SECRET_TYPE,
      key: secretKey(agentId),
      label: `GitHub App key for agent ${agentId}`,
      value: normalizePem(response.data.pem),
    });
    if (response.data.webhook_secret) {
      this.secrets.save({
        userId,
        type: GITHUB_APP_SECRET_TYPE,
        key: webhookSecretKey(agentId),
        label: `GitHub App webhook secret for agent ${agentId}`,
        value: response.data.webhook_secret,
      });
    }
    const slug = response.data.slug;
    const next: StoredConnection = {
      ...stored,
      appId: String(response.data.id),
      appSlug: slug,
      appName: response.data.name,
      clientId: response.data.client_id ?? null,
      botLogin: slug ? `${slug}[bot]` : null,
      status: "awaiting_installation",
      manifestState: null,
      lastError: null,
      hasPrivateKey: true,
    };
    this.write(userId, next);
    const connection = this.get(userId, agentId)!;
    return { connection, installUrl: slug ? `https://github.com/apps/${slug}/installations/new` : null };
  }

  /** Manual fallback: register an App by hand and paste its id + private key. */
  async saveManualApp(userId: string, agentId: string, params: {
    appId: string;
    privateKey: string;
    appSlug?: string | null;
    appName?: string | null;
  }): Promise<AgentGithubAppConnection> {
    if (!this.secrets) throw new Error("Secret store unavailable: cannot store a GitHub App private key.");
    const appId = params.appId.trim();
    if (!/^\d+$/.test(appId)) throw new Error("GitHub App id must be numeric (see the App settings page).");
    const key = normalizePem(params.privateKey);
    if (!key.includes("PRIVATE KEY")) throw new Error("A GitHub App private key in PEM format is required.");
    this.secrets.save({
      userId,
      type: GITHUB_APP_SECRET_TYPE,
      key: secretKey(agentId),
      label: `GitHub App key for agent ${agentId}`,
      value: key,
    });
    const stored = this.read(userId, agentId) ?? this.blank(agentId);
    const slug = params.appSlug?.trim() || null;
    this.write(userId, {
      ...stored,
      appId,
      appSlug: slug,
      appName: params.appName?.trim() || slug,
      botLogin: slug ? `${slug}[bot]` : null,
      status: stored.installationId ? "connected" : "awaiting_installation",
      manifestState: null,
      lastError: null,
      hasPrivateKey: true,
    });
    return this.get(userId, agentId)!;
  }

  private failSetup(
    userId: string,
    stored: StoredConnection,
    failure: GithubAppFetchFailure,
    fallbackMessage: string,
  ): never {
    this.write(userId, { ...stored, status: "error", lastError: failure.message || fallbackMessage, manifestState: null });
    throw new Error(failure.message || fallbackMessage);
  }

  /** Bind an installation (GitHub redirects back with installation_id). */
  async attachInstallation(userId: string, agentId: string, installationId: string): Promise<AgentGithubAppConnection> {
    const stored = this.requireConnection(userId, agentId);
    const response = await this.appGet<{
      id: number;
      app_id?: number;
      app_slug?: string;
      account?: { login?: string; type?: string };
      repository_selection?: string;
      permissions?: Record<string, string>;
    }>(userId, agentId, `/app/installations/${encodeURIComponent(installationId)}`);
    if (!response.ok) {
      this.write(userId, { ...stored, status: response.credentialRejected ? "revoked" : "error", lastError: response.message });
      throw new Error(response.message);
    }
    if (stored.appId && response.data.app_id && String(response.data.app_id) !== stored.appId) {
      throw new Error("That installation belongs to a different GitHub App.");
    }
    const slug = response.data.app_slug ?? stored.appSlug;
    this.write(userId, {
      ...stored,
      installationId: String(response.data.id),
      appSlug: slug,
      botLogin: slug ? `${slug}[bot]` : stored.botLogin,
      accountLogin: response.data.account?.login ?? null,
      accountType: response.data.account?.type ?? null,
      repositorySelection: response.data.repository_selection ?? null,
      permissions: response.data.permissions ?? null,
      status: "connected",
      installedAt: new Date(this.now()).toISOString(),
      lastError: null,
    });
    this.tokenCache.delete(this.cacheKey(userId, agentId));
    return this.get(userId, agentId)!;
  }

  // ── Verification and tokens ────────────────────────────────────────────

  /**
   * Ask GitHub who this App is and confirm the stored credentials and
   * installation still exist. Detects revocation and key/app mismatches.
   */
  async verify(userId: string, agentId: string): Promise<{ connection: AgentGithubAppConnection; app: { id: string; slug: string; name: string; owner: string | null } | null }> {
    const stored = this.requireConnection(userId, agentId);
    const app = await this.appGet<{ id: number; slug: string; name: string; owner?: { login?: string } | null }>(userId, agentId, "/app");
    if (!app.ok) {
      const status: AgentGithubAppStatus = app.credentialRejected ? "revoked" : "error";
      this.write(userId, { ...stored, status, lastError: app.message });
      throw new Error(app.message);
    }
    if (stored.appId && String(app.data.id) !== stored.appId) {
      this.write(userId, { ...stored, status: "error", lastError: `Stored App id ${stored.appId} does not match GitHub App ${app.data.id}` });
      throw new Error("Stored App id does not match the private key on GitHub.");
    }
    let installation: StoredConnection = {
      ...stored,
      appId: String(app.data.id),
      appSlug: app.data.slug,
      appName: app.data.name,
      botLogin: `${app.data.slug}[bot]`,
    };
    if (stored.installationId) {
      const check = await this.appGet<{ id: number; repository_selection?: string; permissions?: Record<string, string>; account?: { login?: string; type?: string } }>(
        userId,
        agentId,
        `/app/installations/${encodeURIComponent(stored.installationId)}`,
      );
      if (!check.ok) {
        this.write(userId, { ...installation, status: "revoked", lastError: check.message });
        throw new Error(`Installation is no longer available: ${check.message}`);
      }
      installation = {
        ...installation,
        accountLogin: check.data.account?.login ?? installation.accountLogin,
        accountType: check.data.account?.type ?? installation.accountType,
        repositorySelection: check.data.repository_selection ?? installation.repositorySelection,
        permissions: check.data.permissions ?? installation.permissions,
        status: "connected",
        installedAt: installation.installedAt ?? new Date(this.now()).toISOString(),
      };
    }
    this.write(userId, { ...installation, lastVerifiedAt: new Date(this.now()).toISOString(), lastError: null });
    const connection = this.get(userId, agentId)!;
    return {
      connection,
      app: { id: String(app.data.id), slug: app.data.slug, name: app.data.name, owner: app.data.owner?.login ?? null },
    };
  }

  /**
   * Mint (or reuse) an installation access token for one agent. Tokens are
   * short-lived; the cache is in memory only and never written to disk.
   */
  async mintInstallationToken(userId: string, agentId: string): Promise<{ token: string; expiresAt: string; permissions: Record<string, string> | null; repositorySelection: string | null }> {
    const stored = this.requireConnection(userId, agentId);
    if (!stored.installationId) {
      throw new Error("GitHub App is not installed for this agent yet. Install the App on the target account first.");
    }
    if (stored.status === "revoked") throw new Error("This agent's GitHub App connection was revoked. Reconnect it.");
    const key = this.cacheKey(userId, agentId);
    const cached = this.tokenCache.get(key);
    if (cached && cached.expiresAt - INSTALLATION_TOKEN_SKEW_MS > this.now()) {
      return {
        token: cached.token,
        expiresAt: new Date(cached.expiresAt).toISOString(),
        permissions: cached.permissions,
        repositorySelection: cached.repositorySelection,
      };
    }
    const response = await this.appPost<{ token: string; expires_at: string; permissions?: Record<string, string>; repository_selection?: string }>(
      userId,
      agentId,
      `/app/installations/${encodeURIComponent(stored.installationId)}/access_tokens`,
    );
    if (!response.ok) {
      this.write(userId, { ...stored, status: response.credentialRejected ? "revoked" : "error", lastError: response.message });
      throw new Error(response.message);
    }
    const expiresAt = Date.parse(response.data.expires_at);
    this.tokenCache.set(key, {
      token: response.data.token,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : this.now() + 30 * 60_000,
      permissions: response.data.permissions ?? null,
      repositorySelection: response.data.repository_selection ?? null,
    });
    this.write(userId, { ...stored, lastError: null, status: "connected" });
    return {
      token: response.data.token,
      expiresAt: new Date(this.tokenCache.get(key)!.expiresAt).toISOString(),
      permissions: response.data.permissions ?? null,
      repositorySelection: response.data.repository_selection ?? null,
    };
  }

  /** Prove the connection end to end without exposing the token. */
  async testConnection(userId: string, agentId: string): Promise<{
    ok: true;
    botLogin: string | null;
    accountLogin: string | null;
    repositoryCount: number;
    sampleRepositories: string[];
    permissions: Record<string, string> | null;
    repositorySelection: string | null;
    tokenExpiresAt: string;
    tokenPrefix: string;
  }> {
    const minted = await this.mintInstallationToken(userId, agentId);
    const repos = await this.tokenGet<{ total_count: number; repositories?: Array<{ full_name: string }> }>(
      minted.token,
      "/installation/repositories?per_page=5",
    );
    const stored = this.read(userId, agentId)!;
    if (!repos.ok) {
      this.write(userId, { ...stored, status: repos.credentialRejected ? "revoked" : "error", lastError: repos.message });
      throw new Error(repos.message);
    }
    return {
      ok: true,
      botLogin: stored.botLogin,
      accountLogin: stored.accountLogin,
      repositoryCount: repos.data.total_count,
      sampleRepositories: (repos.data.repositories ?? []).map((repository) => repository.full_name),
      permissions: minted.permissions,
      repositorySelection: minted.repositorySelection,
      tokenExpiresAt: minted.expiresAt,
      tokenPrefix: `${minted.token.slice(0, 4)}…`,
    };
  }

  /**
   * Environment for one agent's execution: the App identity, never the user's
   * personal token. Returns null when the agent has no usable connection.
   */
  async resolveAgentGithubEnv(userId: string, agentId: string): Promise<Record<string, string> | null> {
    const stored = this.read(userId, agentId);
    if (!stored || stored.status !== "connected" || !stored.installationId || !stored.appId) return null;
    const minted = await this.mintInstallationToken(userId, agentId);
    // Commits must carry the App's bot identity, not the operator's. GitHub
    // links `<app-id>+<slug>[bot]@users.noreply.github.com` to the bot account,
    // so `git commit` made with this env is attributed to the agent's App.
    const botLogin = stored.botLogin || `${stored.appSlug ?? "jait"}[bot]`;
    const botEmail = `${stored.appId}+${stored.appSlug || "jait"}[bot]@users.noreply.github.com`;
    return {
      GH_TOKEN: minted.token,
      GITHUB_TOKEN: minted.token,
      GITHUB_APP_ID: stored.appId,
      GITHUB_APP_SLUG: stored.appSlug ?? "",
      GITHUB_APP_INSTALLATION_ID: stored.installationId,
      GITHUB_APP_BOT_LOGIN: botLogin,
      GIT_AUTHOR_NAME: botLogin,
      GIT_AUTHOR_EMAIL: botEmail,
      GIT_COMMITTER_NAME: botLogin,
      GIT_COMMITTER_EMAIL: botEmail,
      GIT_TERMINAL_PROMPT: "0",
      JAIT_GITHUB_IDENTITY: "agent-app",
      JAIT_GITHUB_TOKEN_EXPIRES_AT: minted.expiresAt,
    };
  }

  /**
   * The webhook secret GitHub generated for this agent's App, if the App was
   * created through the manifest flow. Used to verify webhook deliveries.
   */
  webhookSecret(userId: string, agentId: string): string | null {
    if (!this.secrets) return null;
    return this.secrets.getValue(userId, GITHUB_APP_SECRET_TYPE, webhookSecretKey(agentId)) ?? null;
  }

  /** Agent ids that currently have an installed App for this user. */
  installedAgentIds(userId: string): string[] {
    return this.list(userId)
      .filter((connection) => Boolean(connection.installationId))
      .map((connection) => connection.agentId);
  }

  /** Remove the connection and its stored credentials. */
  disconnect(userId: string, agentId: string): { disconnected: boolean } {
    const secrets = this.secrets
      ? this.secrets.list(userId, GITHUB_APP_SECRET_TYPE).filter((record) => record.key === secretKey(agentId) || record.key === webhookSecretKey(agentId))
      : [];
    for (const record of secrets) this.secrets!.delete(record.id, userId);
    this.tokenCache.delete(this.cacheKey(userId, agentId));
    const result = this.db.delete(agentGithubApps)
      .where(and(eq(agentGithubApps.userId, userId), eq(agentGithubApps.agentId, agentId)))
      .run();
    return { disconnected: result.changes > 0 || secrets.length > 0 };
  }

  // ── Manifest state tokens ──────────────────────────────────────────────

  private signState(userId: string, agentId: string): string {
    const nonce = uuidv7();
    const body = base64url(JSON.stringify({ userId, agentId, nonce }));
    const signature = base64url(createHmac("sha256", this.stateSecret).update(body).digest());
    return `${body}.${signature}`;
  }

  /** Validate a manifest state token and return the agent it belongs to. */
  readState(state: string): { userId: string; agentId: string } | null {
    const [body, signature] = state.split(".");
    if (!body || !signature) return null;
    const expected = base64url(createHmac("sha256", this.stateSecret).update(body).digest());
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { userId?: string; agentId?: string };
      if (!parsed.userId || !parsed.agentId) return null;
      return { userId: parsed.userId, agentId: parsed.agentId };
    } catch {
      return null;
    }
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────

  private cacheKey(userId: string, agentId: string): string {
    return `${userId}::${agentId}`;
  }

  private requireConnection(userId: string, agentId: string): StoredConnection {
    const stored = this.read(userId, agentId);
    if (!stored) throw new Error("This agent has no GitHub App connection yet.");
    if (!stored.appId) throw new Error("This agent's GitHub App registration is incomplete. Finish connecting it first.");
    if (!this.privateKey(userId, agentId)) throw new Error("This agent's GitHub App private key is missing. Reconnect the App.");
    return stored;
  }

  private async appGet<T>(userId: string, agentId: string, path: string): Promise<GithubAppCall<T>> {
    const stored = this.read(userId, agentId);
    const key = this.privateKey(userId, agentId);
    if (!stored?.appId || !key) return { ok: false, status: 400, message: "GitHub App credentials are incomplete for this agent.", credentialRejected: false };
    return this.request<T>(path, { jwt: buildAppJwt(stored.appId, key, this.now()) });
  }

  private async appPost<T>(userId: string, agentId: string, path: string): Promise<GithubAppCall<T>> {
    const stored = this.read(userId, agentId);
    const key = this.privateKey(userId, agentId);
    if (!stored?.appId || !key) return { ok: false, status: 400, message: "GitHub App credentials are incomplete for this agent.", credentialRejected: false };
    return this.request<T>(path, { method: "POST", jwt: buildAppJwt(stored.appId, key, this.now()) });
  }

  private async tokenGet<T>(token: string, path: string): Promise<GithubAppCall<T>> {
    return this.request<T>(path, { token });
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; jwt?: string; token?: string },
  ): Promise<GithubAppCall<T>> {
    const url = path.startsWith("http") ? path : `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "jait-gateway",
      "x-github-api-version": "2022-11-28",
    };
    if (options.jwt) headers["authorization"] = `Bearer ${options.jwt}`;
    else if (options.token) headers["authorization"] = `Bearer ${options.token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: `Could not reach GitHub: ${error instanceof Error ? error.message : "network error"}`,
        credentialRejected: false,
      };
    }
    const text = await response.text().catch(() => "");
    let parsed: unknown = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = null; } }
    if (response.ok) return { ok: true, status: response.status, data: (parsed ?? {}) as T };
    const message = typeof parsed === "object" && parsed !== null && "message" in parsed
      ? String((parsed as { message: unknown }).message)
      : `GitHub returned ${response.status}`;
    return {
      ok: false,
      status: response.status,
      message: response.status === 401 || response.status === 403 || response.status === 404
        ? `${message} (GitHub rejected the stored credentials; the App may have been deleted or uninstalled)`
        : message,
      credentialRejected: response.status === 401 || response.status === 404,
    };
  }
}

const shared = new WeakMap<object, AgentGithubAppService>();

/** One service instance per database handle so the token cache is shared. */
export function getAgentGithubAppService(deps: AgentGithubAppDeps): AgentGithubAppService {
  const existing = shared.get(deps.db as unknown as object);
  if (existing) return existing;
  const created = new AgentGithubAppService(deps);
  shared.set(deps.db as unknown as object, created);
  return created;
}
