import { describe, expect, it } from "vitest";
import * as jose from "jose";
import {
  AUTH_COOKIE_NAME,
  extractBearerToken,
  isPublicApiPath,
  signAuthToken,
  verifyAuthToken,
} from "./http-auth.js";

describe("isPublicApiPath", () => {
  it("opens the GitHub App callback and webhook so GitHub can reach them", () => {
    // GitHub redirects the browser to the callback during manifest setup and
    // posts App webhooks to the webhook route; neither carries a Jait session.
    expect(isPublicApiPath("/api/github/apps/callback")).toBe(true);
    expect(isPublicApiPath("/api/github/apps/webhook")).toBe(true);
  });

  it("keeps the authenticated GitHub App routes behind a session", () => {
    expect(isPublicApiPath("/api/github-apps")).toBe(false);
    expect(isPublicApiPath("/api/agents/abc/github-app")).toBe(false);
    expect(isPublicApiPath("/api/agents/abc/github-app/setup")).toBe(false);
    expect(isPublicApiPath("/api/agents/abc/github-app/manual")).toBe(false);
  });

  it("only opens exact paths, never a prefix", () => {
    expect(isPublicApiPath("/api/github/apps/callback/extra")).toBe(false);
    expect(isPublicApiPath("/api/github/apps/webhook/extra")).toBe(false);
    expect(isPublicApiPath("/preview/api/github/apps/callback")).toBe(false);
  });

  it("keeps the previously public auth and OAuth paths public", () => {
    for (const path of [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/refresh",
      "/api/mobile/discovery",
      "/api/email/oauth/callback",
      "/api/calendar/oauth/callback",
    ]) {
      expect(isPublicApiPath(path)).toBe(true);
    }
  });
});

describe("auth tokens", () => {
  it("round-trips a signed session token", async () => {
    const token = await signAuthToken({ id: "user-1", username: "jakob" }, "secret");
    expect(await verifyAuthToken(token, "secret")).toEqual({ id: "user-1", username: "jakob" });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signAuthToken({ id: "user-1", username: "jakob" }, "secret");
    expect(await verifyAuthToken(token, "other-secret")).toBeNull();
  });

  it("rejects a purpose-scoped token, which is not a session", async () => {
    // Signed with the same secret, but carrying a non-session purpose: the
    // purpose check (not the signature) must reject it.
    const token = await new jose.SignJWT({ username: "jakob", purpose: "preview" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("secret"));
    expect(await verifyAuthToken(token, "secret")).toBeNull();
  });
});

describe("extractBearerToken", () => {
  it("reads a bearer token and ignores other header shapes", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken("bearer  abc ")).toBe("abc");
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("Bearer   ")).toBeNull();
  });

  it("uses the jait_token cookie name", () => {
    expect(AUTH_COOKIE_NAME).toBe("jait_token");
  });
});
