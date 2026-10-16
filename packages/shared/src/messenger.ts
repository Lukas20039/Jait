import { z } from "zod";

const roomId = z.string().min(3).max(512).startsWith("!");
const limit = z.number().int().min(1).max(50).default(20);
export const messengerCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  z.object({ action: z.literal("rooms"), query: z.string().max(200).default(""), service: z.string().max(100).optional(), limit }).strict(),
  z.object({ action: z.literal("messages"), roomId, limit, earlier: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("search"), query: z.string().trim().min(1).max(200), roomId: roomId.optional(), limit }).strict(),
  z.object({ action: z.literal("send"), roomId, text: z.string().min(1).max(10_000).refine(text => !!text.trim()) }).strict(),
  z.object({ action: z.literal("open"), userId: z.string().max(512).regex(/^@[^:\s]+:[^\s]+$/) }).strict(),
]);
export type MessengerCommand = z.infer<typeof messengerCommandSchema>;
export interface MessengerRequest {
  requestId: string;
  expiresAt: number;
  command: MessengerCommand;
}
export interface MessengerToolResponse {
  ok: boolean;
  message: string;
  data?: unknown;
}

/** Connection setup links never contain credentials. They do not sign in. */
export function messengerConnectionLink(homeserver: string, username?: string): string {
  const url = new URL(homeserver);
  if (url.username || url.password || url.search || url.hash
      || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Use HTTPS for Matrix, or HTTP on loopback. Do not include credentials or URL parameters.");
  }
  const params = new URLSearchParams({ homeserver: url.toString().replace(/\/$/, "") });
  if (username) params.set("username", username);
  return "/messenger?" + params;
}
