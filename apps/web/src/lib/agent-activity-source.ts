/**
 * Agent activity sources (Sprint v2 ticket 3).
 *
 * The gateway exposes agent liveness **per execution**, not per persona: the only
 * live reads are `GET /api/sessions/:id/runtime` and `GET /api/threads/:id/runtime`
 * (`apps/web/src/lib/agents-api.ts` → `getAgentRuntime(kind, id)`). There is no
 * persona-scoped runtime endpoint, so the chip must not invent one — it derives
 * its state from the agent's real executions and says nothing when there are none.
 *
 * React-free on purpose: the resolver and the merge rules are unit-tested in the
 * repo's node test environment, and the polling component stays a thin shell.
 */

import { aggregateAgentLiveState, isAgentLiveState } from './agent-live-state'
import type { AgentActivityRuntime } from './agent-activity-chip'

export interface AgentActivityThreadLike {
  id: string
  personaAgentId?: string | null
  status?: string | null
  updatedAt?: string | null
}

export interface AgentActivitySource {
  kind: 'threads'
  id: string
}

/** Request fan-out cap: three live reads per agent is enough to be truthful. */
export const AGENT_ACTIVITY_SOURCE_LIMIT = 3

function updatedAtRank(thread: AgentActivityThreadLike): number {
  const parsed = Date.parse(thread.updatedAt ?? '')
  // Unparseable timestamps sort last instead of winning the tie-break.
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Executions that can answer "what is this agent doing right now": running ones
 * first, then the most recently updated. Bounded, because each source is one
 * polled request.
 */
export function resolveAgentActivitySources(
  agentId: string,
  threads: readonly AgentActivityThreadLike[],
  limit: number = AGENT_ACTIVITY_SOURCE_LIMIT,
): AgentActivitySource[] {
  const owned = threads.filter(
    (thread) => thread.personaAgentId === agentId && typeof thread.id === 'string' && thread.id !== '',
  )
  const ordered = [...owned].sort((a, b) => {
    const aRunning = a.status === 'running' ? 0 : 1
    const bRunning = b.status === 'running' ? 0 : 1
    if (aRunning !== bRunning) return aRunning - bRunning
    return updatedAtRank(b) - updatedAtRank(a)
  })
  return ordered.slice(0, Math.max(0, limit)).map((thread) => ({ kind: 'threads', id: thread.id }))
}

export interface AgentActivityRuntimeMerge {
  runtime: AgentActivityRuntime | null
  /** No source responded at all — the chip must report that, not `idle`. */
  statusUnavailable: boolean
}

/** Earliest parseable timestamp, or `null` when nothing trustworthy is available. */
function earliest(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null
  let bestTime = Number.POSITIVE_INFINITY
  for (const value of values) {
    if (!value) continue
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed) || parsed >= bestTime) continue
    best = value
    bestTime = parsed
  }
  return best
}

/**
 * Merge per-execution reads into one agent-level runtime.
 *
 * - `null` entries are failed reads, so they never become a state claim.
 * - `running` is a direct legacy observation (`{running, startedAt}`), so it is ORed.
 * - `state` is only reported when **every** responding source reported a valid
 *   state. Partial coverage would understate the agent (one source could be
 *   `waiting` while another is unreadable), so the aggregate is dropped and the
 *   chip falls back to the legacy axis plus its "no detailed status yet" notice.
 */
export function mergeAgentActivityRuntimes(
  runtimes: readonly (AgentActivityRuntime | null)[],
): AgentActivityRuntimeMerge {
  if (runtimes.length === 0) return { runtime: null, statusUnavailable: false }

  const responded = runtimes.filter((runtime): runtime is AgentActivityRuntime => runtime != null)
  if (responded.length === 0) return { runtime: null, statusUnavailable: true }

  const running = responded.some((runtime) => runtime.running === true)
  const runningStartedAt = earliest(
    responded.filter((runtime) => runtime.running === true).map((runtime) => runtime.startedAt),
  )
  const startedAt = runningStartedAt ?? earliest(responded.map((runtime) => runtime.startedAt))

  const states = responded.map((runtime) => (isAgentLiveState(runtime.state) ? runtime.state : null))
  const state = states.every((value) => value !== null) ? aggregateAgentLiveState(states) : undefined

  return {
    runtime: state ? { running, startedAt, state } : { running, startedAt },
    statusUnavailable: false,
  }
}
