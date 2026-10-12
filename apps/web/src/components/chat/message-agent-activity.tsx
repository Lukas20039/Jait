/**
 * Main-chat mount for the agent activity chip (Sprint v2 ticket 3).
 *
 * A persona-attributed message in normal chat is exactly where a user asks "is
 * this agent still working?", so the chip belongs next to that message. It reads
 * the same thread collection the Agents page lists — through one shared snapshot
 * (`@/lib/agent-activity-threads`) — so N rendered messages cost one gateway read
 * per TTL instead of N, and no second data path or gateway surface is added.
 *
 * Truthfulness rules carried over from the frozen vocabulary:
 * - nothing renders until an execution for this agent is known, or a read failed;
 * - a failed read reports "status unavailable" and never implies `idle`;
 * - the chip offers no recipient selection, so the retired picker cannot return.
 */

import { useCallback, useEffect, useState } from 'react'
import { AgentActivityChip } from './agent-activity-chip'
import { useAgentActivity } from '@/hooks/useAgentActivity'
import { createAgentActivityThreadLoader } from '@/lib/agent-activity-threads'
import { agentsApi } from '@/lib/agents-api'
import type {
  AgentActivityAgentIdentity,
  AgentActivityVisibility,
} from '@/lib/agent-activity-chip'
import type { AgentActivityThreadLike } from '@/lib/agent-activity-source'

/** Stable empty list: the hook holds `threads` in a ref, so identity churn is noise. */
const NO_THREADS: AgentActivityThreadLike[] = []

/**
 * One snapshot of the thread collection the Agents page lists. Module scope, so
 * every rendered persona message shares a single read per TTL.
 */
const defaultThreadLoader = createAgentActivityThreadLoader({
  load: () => agentsApi.listThreads(),
})

export interface MessageAgentActivityChipProps {
  agent: AgentActivityAgentIdentity
  /** Threads owned by this agent, already loaded by the caller. */
  threads: AgentActivityThreadLike[]
  /** True when the caller's own thread-snapshot read failed. */
  statusUnavailable?: boolean
  /** Extra retry work for the caller, e.g. invalidating its snapshot. */
  onRetry?: () => void
  visibility?: AgentActivityVisibility
  /** Render the panel already expanded (deep links and tests). */
  initialOpen?: boolean
  className?: string
}

/**
 * Controlled chip: the caller supplies the agent's threads, so this renders
 * deterministically with no fetch of its own.
 */
export function MessageAgentActivityChip({
  agent,
  threads,
  statusUnavailable = false,
  onRetry,
  visibility,
  initialOpen,
  className,
}: MessageAgentActivityChipProps) {
  const activity = useAgentActivity(agent, threads)
  const { refresh } = activity
  const unavailable = statusUnavailable || activity.statusUnavailable

  const retry = useCallback(() => {
    refresh()
    onRetry?.()
  }, [refresh, onRetry])

  // No execution to observe and no failed read: stay silent rather than imply idle.
  if (!activity.model && !unavailable) return null

  return (
    <AgentActivityChip
      agent={agent}
      runtime={activity.runtime}
      statusUnavailable={unavailable}
      threadId={activity.threadId}
      onRetry={retry}
      visibility={visibility}
      initialOpen={initialOpen}
      className={className}
    />
  )
}

export interface MessageAgentActivityProps {
  agent: AgentActivityAgentIdentity
  visibility?: AgentActivityVisibility
  /** Render the panel already expanded (deep links and tests). */
  initialOpen?: boolean
  className?: string
}

/**
 * Self-loading variant for main chat: reads the shared thread snapshot, then
 * renders the controlled chip inside a stable mount node. The chip stays silent
 * until that first read settles, so a message never flashes a state that was not
 * observed.
 */
export function MessageAgentActivity({
  agent,
  visibility,
  initialOpen,
  className,
}: MessageAgentActivityProps) {
  const [threads, setThreads] = useState<AgentActivityThreadLike[] | null>(null)
  const [snapshotUnavailable, setSnapshotUnavailable] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    defaultThreadLoader
      .get()
      .then((loaded) => {
        if (!active) return
        setThreads(loaded)
        setSnapshotUnavailable(false)
      })
      .catch(() => {
        if (!active) return
        // Report the failed read instead of rendering nothing, which would look
        // like "this agent has no executions".
        setThreads(NO_THREADS)
        setSnapshotUnavailable(true)
      })

    return () => {
      active = false
    }
  }, [attempt])

  const retrySnapshot = useCallback(() => {
    defaultThreadLoader.invalidate()
    setAttempt((value) => value + 1)
  }, [])

  // The mount node is stable across loading/settled/failed reads so the chip's
  // mount point is observable and React does not remount it when the snapshot
  // settles. The chip itself still stays silent when there is nothing to report.
  return (
    <div data-agent-activity-mount={agent.id}>
      {threads !== null && (
        <MessageAgentActivityChip
          agent={agent}
          threads={threads}
          statusUnavailable={snapshotUnavailable}
          onRetry={retrySnapshot}
          visibility={visibility}
          initialOpen={initialOpen}
          className={className}
        />
      )}
    </div>
  )
}
