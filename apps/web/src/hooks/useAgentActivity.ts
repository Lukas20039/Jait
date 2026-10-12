/**
 * Live agent-activity source for the main-chat chip (Sprint v2 ticket 3).
 *
 * This hook is the only place that reads real execution state. It does not
 * invent status: when a read fails it reports `unavailable`, and when an agent
 * has no execution to observe it returns `null` so nothing is rendered.
 *
 * Polling is bounded on purpose. It runs only while there is something live to
 * watch and stops on `idle`/terminal states, so an idle chat does not keep
 * hitting the gateway. A manual retry stays available in the chip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentsApi } from '@/lib/agents-api'
import {
  buildAgentActivityChipModel,
  type AgentActivityAgentIdentity,
  type AgentActivityChipModel,
  type AgentActivityRuntime,
} from '@/lib/agent-activity-chip'
import {
  mergeAgentActivityRuntimes,
  resolveAgentActivitySources,
  type AgentActivityThreadLike,
} from '@/lib/agent-activity-source'

/** Poll cadence while a run is live. Slow enough to stay cheap, fast enough to feel live. */
export const AGENT_ACTIVITY_POLL_MS = 5_000

/**
 * Consecutive failed reads before auto-polling gives up. After this the chip
 * still shows "Status unavailable" with a Retry action, so the user keeps a way
 * back without the page polling a broken gateway forever.
 */
export const AGENT_ACTIVITY_MAX_CONSECUTIVE_FAILURES = 3

/**
 * Whether the chip should keep polling. Pure so the stopping rules are testable
 * without a DOM or a timer.
 */
export function shouldPollAgentActivity(input: {
  sourceCount: number
  model: AgentActivityChipModel
  consecutiveFailures: number
}): boolean {
  const { sourceCount, model, consecutiveFailures } = input
  if (sourceCount === 0) return false
  if (consecutiveFailures >= AGENT_ACTIVITY_MAX_CONSECUTIVE_FAILURES) return false
  // A transient gateway blip is worth one more try; `unavailable` is not settled.
  if (model.availability === 'unavailable') return true
  if (model.availability === 'loading') return true
  return !model.terminal && model.state !== 'idle'
}

export interface AgentActivityResult {
  /** `null` when this agent has no execution to observe — render nothing. */
  model: AgentActivityChipModel | null
  /** Source execution thread, for the chip's "View thread" link. */
  threadId: string | null
  /** Last observed runtime, or `null` before the first successful read. */
  runtime: AgentActivityRuntime | null
  /** True when the last read failed — the chip must not imply a live state. */
  statusUnavailable: boolean
  refresh: () => void
}

/**
 * Read live state for one agent from its execution threads.
 *
 * `threads` is the same collection the Agents page already lists, so this adds
 * no second data path and no new gateway surface.
 */
export function useAgentActivity(
  agent: AgentActivityAgentIdentity | null | undefined,
  threads: AgentActivityThreadLike[],
): AgentActivityResult {
  const agentId = agent?.id ?? null
  const agentName = agent?.name ?? null
  const agentAvatar = agent?.avatar ?? null

  // Threads change identity on every parent render; keeping them in a ref lets
  // the polling effect stay subscribed to the source *ids* instead of the array.
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const sourceKey = useMemo(
    () =>
      agentId
        ? resolveAgentActivitySources(agentId, threads)
            .map((source) => source.id)
            .join('|')
        : '',
    [agentId, threads],
  )

  const [runtime, setRuntime] = useState<AgentActivityRuntime | null>(null)
  const [statusUnavailable, setStatusUnavailable] = useState(false)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!agentId || sourceKey === '') return

    const sourceIds = sourceKey.split('|')
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const tick = async () => {
      const results = await Promise.all(
        sourceIds.map(async (id) => {
          try {
            return (await agentsApi.getAgentRuntime('threads', id)) as AgentActivityRuntime
          } catch {
            return null
          }
        }),
      )
      if (cancelled) return

      const merged = mergeAgentActivityRuntimes(results)
      failures = merged.statusUnavailable ? failures + 1 : 0

      setRuntime(merged.runtime)
      setStatusUnavailable(merged.statusUnavailable)

      const model = buildAgentActivityChipModel({
        agent: { id: agentId, name: agentName ?? agentId, avatar: agentAvatar },
        runtime: merged.runtime,
        statusUnavailable: merged.statusUnavailable,
      })
      if (!shouldPollAgentActivity({ sourceCount: sourceIds.length, model, consecutiveFailures: failures })) {
        return
      }
      timer = setTimeout(() => void tick(), AGENT_ACTIVITY_POLL_MS)
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [agentId, agentName, agentAvatar, sourceKey, nonce])

  const model = useMemo(() => {
    if (!agentId || sourceKey === '') return null
    return buildAgentActivityChipModel({
      agent: { id: agentId, name: agentName ?? agentId, avatar: agentAvatar },
      runtime,
      statusUnavailable,
    })
  }, [agentId, agentName, agentAvatar, sourceKey, runtime, statusUnavailable])

  return {
    model,
    threadId: sourceKey === '' ? null : (sourceKey.split('|')[0] ?? null),
    runtime,
    statusUnavailable,
    refresh,
  }
}
