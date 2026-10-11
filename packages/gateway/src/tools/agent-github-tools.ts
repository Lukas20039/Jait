/**
 * agent.github — per-agent GitHub App identity (issue #246).
 *
 * Lets a persistent agent inspect its own GitHub App connection, mint a short
 * lived installation token for its own identity, and prove the credentials
 * work. The private key never leaves the gateway; only minted installation
 * tokens (which expire within an hour) are returned.
 */

import type { AgentGithubAppService } from "../services/agent-github-apps.js";
import type { ToolDefinition } from "./contracts.js";

interface GithubInput {
  action: "status" | "instructions" | "test";
  agentId?: string;
}

interface TokenInput {
  agentId?: string;
}

interface ToolDeps {
  service: () => AgentGithubAppService;
  /** Resolve the agent this execution belongs to when the caller omits it. */
  currentAgentId?: (context: { userId?: string; threadId?: string }) => string | undefined;
}

/** Usage hint appended to minted tokens so agents wire them correctly. */
function tokenHint(env: Record<string, string>): string {
  return [
    "Use the token as GH_TOKEN for gh/git commands, e.g.",
    `  GH_TOKEN=${env["GH_TOKEN"]} gh api /installation/repositories`,
    "It expires shortly, so mint a fresh one per task instead of storing it.",
  ].join("\n");
}

export function createAgentGithubTool(deps: ToolDeps): ToolDefinition<GithubInput> {
  return {
    name: "agent.github",
    displayName: "Agent GitHub App",
    page: "agents",
    description:
      "Inspect and test the GitHub App connected to a persistent Jait agent. Each agent authorises as its own App bot identity instead of the user's personal account. Actions: status (list connections or one agent's connection), instructions (how to connect an App and the webhook URL to paste into GitHub), test (mint a token and verify it reaches GitHub). Use agent.github.token to obtain working credentials for a task. The App private key is never returned.",
    tier: "standard",
    category: "agent",
    source: "builtin",
    risk: "medium",
    defaultConsentLevel: "once",
    discovery: {
      aliases: ["github app", "agent github", "bot identity", "installation", "connect github"],
      examples: [
        "Is my developer agent connected to GitHub?",
        "How do I connect a GitHub App to my reviewer agent?",
        "Test the reviewer agent's GitHub connection",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["status", "instructions", "test"] },
        agentId: {
          type: "string",
          description: "Agent profile id. Omit to list every agent connection for the user.",
        },
      },
      required: ["action"],
    },
    async execute(input, context) {
      const userId = context.userId;
      if (!userId) return { ok: false, message: "Authenticated user required to inspect GitHub App connections." };
      const service = deps.service();
      const agentId = input.agentId?.trim()
        || deps.currentAgentId?.({ userId, threadId: context.threadId });
      if (input.agentId && !agentId) return { ok: false, message: "A valid agent id is required." };

      if (input.action === "status") {
        const connections = service.list(userId);
        return {
          ok: true,
          message: agentId
            ? (() => {
              const connection = service.get(userId, agentId);
              return connection
                ? `Agent ${agentId} GitHub App: ${connection.status}.`
                : `Agent ${agentId} has no GitHub App connected.`;
            })()
            : `${connections.filter((connection) => connection.status === "connected").length} of ${connections.length} agents are connected to GitHub Apps.`,
          data: {
            connections,
            webhookUrl: `${service.publicBaseUrl()}/api/github/apps/webhook`,
            webhookSecretAvailable: agentId ? Boolean(service.webhookSecret(userId, agentId)) : undefined,
            currentAgentId: agentId ?? null,
          },
        };
      }

      if (input.action === "instructions") {
        return {
          ok: true,
          message: [
            `Webhook URL for every agent App: ${service.publicBaseUrl()}/api/github/apps/webhook`,
            "Connect an App from the Agents page (Agents → agent → GitHub) using the one-click manifest flow",
            "or register an existing App manually with its App id + private key and installation id.",
            "Required App permissions: Contents, Pull requests, Issues (read/write), Metadata (read).",
          ].join("\n"),
          data: {
            page: "/agents",
            webhookUrl: `${service.publicBaseUrl()}/api/github/apps/webhook`,
            agentId: agentId ?? null,
          },
        };
      }

      if (!agentId) return { ok: false, message: "Specify agentId (or run inside that agent's thread) to test its connection." };
      try {
        const result = await service.testConnection(userId, agentId);
        return {
          ok: true,
          message: result.ok
            ? `Agent ${agentId} authenticates as ${result.botLogin ?? "its App bot"} with access to ${result.repositoryCount ?? 0} repositories.`
            : `Agent ${agentId} GitHub App test failed.`,
          data: result,
        };
      } catch (error) {
        return {
          ok: false,
          message: `Agent GitHub App test failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

export function createAgentGithubTokenTool(deps: ToolDeps): ToolDefinition<TokenInput> {
  return {
    name: "agent.github.token",
    displayName: "Mint agent GitHub token",
    page: "agents",
    description:
      "Mint a short-lived GitHub installation token for a persistent agent's own GitHub App, so this agent's commits, pushes and pull requests are authored by its App bot instead of the user. Returns the token plus its expiry; pass it as GH_TOKEN to git/gh commands. Use this on demand per task and never store it long-term.",
    tier: "standard",
    category: "agent",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "once",
    discovery: {
      aliases: ["github token", "installation token", "commit as agent", "push as bot"],
      examples: ["Get me a token so I can push as the developer agent"],
    },
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent profile id whose App identity to mint. Omit inside that agent's own thread.",
        },
      },
    },
    async execute(input, context) {
      const userId = context.userId;
      if (!userId) return { ok: false, message: "Authenticated user required to mint an agent GitHub token." };
      const agentId = input.agentId?.trim()
        || deps.currentAgentId?.({ userId, threadId: context.threadId });
      if (!agentId) return { ok: false, message: "No agent identity resolved; pass agentId explicitly." };
      const service = deps.service();
      const connection = service.get(userId, agentId);
      if (!connection) return { ok: false, message: `Agent ${agentId} has no GitHub App connected. Connect it on the Agents page first.` };
      if (connection.status !== "connected") {
        return { ok: false, message: `Agent ${agentId} GitHub App is ${connection.status}: ${connection.lastError ?? "not usable yet"}.` };
      }
      try {
        const env = await service.resolveAgentGithubEnv(userId, agentId);
        if (!env) return { ok: false, message: `Agent ${agentId} GitHub App could not mint a token.` };
        return {
          ok: true,
          message: `Minted GitHub App token for agent ${agentId} as ${env["GITHUB_APP_BOT_LOGIN"] || "bot"}, expiring ${env["JAIT_GITHUB_TOKEN_EXPIRES_AT"]}.`,
          data: {
            token: env["GH_TOKEN"],
            tokenType: "installation",
            identity: env["GITHUB_APP_BOT_LOGIN"] || null,
            appSlug: env["GITHUB_APP_SLUG"] || null,
            installationId: env["GITHUB_APP_INSTALLATION_ID"] || null,
            expiresAt: env["JAIT_GITHUB_TOKEN_EXPIRES_AT"],
            env,
            usage: tokenHint(env),
          },
        };
      } catch (error) {
        return {
          ok: false,
          message: `Could not mint agent GitHub token: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

export function createAgentGithubTools(deps: ToolDeps): ToolDefinition[] {
  return [createAgentGithubTool(deps), createAgentGithubTokenTool(deps)] as ToolDefinition[];
}
