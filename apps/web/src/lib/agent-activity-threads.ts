/**
 * Shared thread snapshot for the main-chat agent activity chip (Sprint v2 ticket 3).
 *
 * The chip needs the same thread collection the Agents page lists so it can resolve
 * an agent's real executions. Fetching that collection once per rendered persona
 * message would multiply gateway traffic for no benefit, so this module keeps one
 * short-lived snapshot with single-flight de-duplication.
 *
 * `load` and `now` are injected so the caching rules are unit-testable without a
 * DOM, a network, or fake timers.
 */

import type { AgentActivityThreadLike } from '@/lib/agent-activity-source'

/** How long a snapshot is reused before another read is issued. */
export const AGENT_ACTIVITY_THREAD_TTL_MS = 10_000

export interface AgentActivityThreadLoaderOptions {
  load: () => Promise<AgentActivityThreadLike[]>
  ttlMs?: number
  now?: () => number
}

export interface AgentActivityThreadLoader {
  /** Resolves with a snapshot; concurrent callers share one in-flight read. */
  get(): Promise<AgentActivityThreadLike[]>
  /** Drops the cached snapshot so the next `get()` reads again. */
  invalidate(): void
}

export function createAgentActivityThreadLoader(
  options: AgentActivityThreadLoaderOptions,
): AgentActivityThreadLoader {
  const { load, ttlMs = AGENT_ACTIVITY_THREAD_TTL_MS, now = Date.now } = options
  let snapshot: AgentActivityThreadLike[] | null = null
  let fetchedAt = 0
  let inFlight: Promise<AgentActivityThreadLike[]> | null = null

  return {
    get() {
      if (snapshot && now() - fetchedAt < ttlMs) return Promise.resolve(snapshot)
      if (inFlight) return inFlight

      const request = load()
        .then((threads) => {
          snapshot = threads
          fetchedAt = now()
          inFlight = null
          return threads
        })
        .catch((error: unknown) => {
          // A failed read is never cached: the next caller must get a real retry
          // rather than a stale empty list that would look like "no executions".
          inFlight = null
          throw error
        })

      inFlight = request
      return request
    },

    invalidate() {
      snapshot = null
      fetchedAt = 0
    },
  }
}
