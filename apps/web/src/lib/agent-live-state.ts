/**
 * Agent activity vocabulary and presentation (Sprint v2 ticket 3).
 *
 * The seven values are frozen by the ticket 4 contract (§2): the gateway derives
 * them with a single `deriveAgentLiveState(input)` and the web must render every
 * one of them, plus `null` for "the gateway has no execution for this agent".
 *
 * This module is deliberately dependency-free and React-free so the vocabulary,
 * the presentation and the aggregation rule (§5) can be unit-tested without a DOM
 * and reused by any surface (chip, panel, agent list).
 *
 * Owner note (Lady Merge-a-Lot): the union is duplicated from the gateway on
 * purpose today — `@jait/shared` does not export `AgentLiveState` yet (§2.4 is the
 * implementation ticket). When that export lands this declaration becomes
 * `export type { AgentLiveState } from '@jait/shared'` and nothing else changes.
 */

/** Contract §2 — frozen vocabulary. Order here is the contract's own listing. */
export const AGENT_LIVE_STATES = [
  'idle',
  'queued',
  'running',
  'waiting',
  'blocked',
  'completed',
  'interrupted',
] as const

export type AgentLiveState = (typeof AGENT_LIVE_STATES)[number]

/** Delivery rows (contract §4) are a separate axis with a separate vocabulary. */
export const DELIVERY_STATUSES = [
  'queued',
  'running',
  'completed',
  'delivered',
  'failed',
  'interrupted',
  'cancelled',
] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/**
 * Visual emphasis. Kept abstract (no CSS values) so the same table serves the
 * chip, the panel and any future surface.
 * - `live`        productive work in progress
 * - `attention`   the operator must act for it to continue (never an error)
 * - `destructive` a failure the operator may need to fix
 * - `success`     finished well
 * - `muted`       finished without alarm (deliberate stop, or cancelled)
 * - `neutral`     nothing is happening
 */
export type AgentLiveTone =
  | 'neutral'
  | 'live'
  | 'attention'
  | 'destructive'
  | 'success'
  | 'muted'

export interface AgentLiveStatePresentation {
  state: AgentLiveState
  /** Chip text. Short by design. */
  label: string
  /** Full sentence for the tooltip and for screen readers. */
  description: string
  tone: AgentLiveTone
  /** The execution cannot advance on its own any more. */
  terminal: boolean
  /** Warrants interrupting the operator (a notification, a live region). */
  alarming: boolean
  /** The operator has to do something for this to make progress. */
  needsOperator: boolean
}

const PRESENTATION: Record<AgentLiveState, AgentLiveStatePresentation> = {
  idle: {
    state: 'idle',
    label: 'Idle',
    description: 'This agent is idle and has no work in flight.',
    tone: 'neutral',
    terminal: true,
    alarming: false,
    needsOperator: false,
  },
  queued: {
    state: 'queued',
    label: 'Queued',
    description: 'This agent has work waiting for a free execution slot.',
    tone: 'neutral',
    terminal: false,
    alarming: false,
    needsOperator: false,
  },
  running: {
    state: 'running',
    label: 'Working',
    description: 'This agent is working on a request right now.',
    tone: 'live',
    terminal: false,
    alarming: false,
    needsOperator: false,
  },
  waiting: {
    state: 'waiting',
    label: 'Waiting for you',
    description: 'This agent is stopped at an approval request and waits for your decision.',
    tone: 'attention',
    terminal: false,
    alarming: true,
    needsOperator: true,
  },
  blocked: {
    state: 'blocked',
    label: 'Blocked',
    description: 'This agent stopped with an error and needs attention.',
    tone: 'destructive',
    terminal: true,
    alarming: true,
    needsOperator: true,
  },
  completed: {
    state: 'completed',
    label: 'Done',
    description: 'This agent finished its last task.',
    tone: 'success',
    terminal: true,
    alarming: false,
    needsOperator: false,
  },
  interrupted: {
    state: 'interrupted',
    label: 'Stopped',
    description: "This agent's last run was stopped.",
    tone: 'muted',
    terminal: true,
    alarming: false,
    needsOperator: false,
  },
}

/**
 * `null`/`undefined` means the gateway reported no execution for this agent; it
 * renders exactly like `idle`, and never as `running`.
 */
export function agentLiveStatePresentation(
  state: AgentLiveState | null | undefined,
): AgentLiveStatePresentation {
  if (!state) return PRESENTATION.idle
  // Defensive: the value crosses an API boundary, so an unknown string must not
  // crash the surface that renders it.
  return PRESENTATION[state] ?? PRESENTATION.idle
}

export function isAgentLiveState(value: unknown): value is AgentLiveState {
  return (
    typeof value === 'string' && (AGENT_LIVE_STATES as readonly string[]).includes(value)
  )
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return (
    typeof value === 'string' && (DELIVERY_STATUSES as readonly string[]).includes(value)
  )
}

export interface DeliveryStatusPresentation {
  status: DeliveryStatus
  label: string
  description: string
  tone: AgentLiveTone
  terminal: boolean
  alarming: boolean
}

/**
 * Contract §4: `cancelled` is a first-class, **non-alarming terminal** state. A
 * cancelled delivery was deliberately dropped (the owning thread was stopped
 * before the delivery started) and must stay visually distinct from `failed`
 * and `interrupted`, which keep the destructive tone.
 */
const DELIVERY_PRESENTATION: Record<DeliveryStatus, DeliveryStatusPresentation> = {
  queued: {
    status: 'queued',
    label: 'Queued',
    description: 'This delivery is queued and has not started yet.',
    tone: 'neutral',
    terminal: false,
    alarming: false,
  },
  running: {
    status: 'running',
    label: 'Delivering',
    description: 'This delivery is being handed to the agent.',
    tone: 'live',
    terminal: false,
    alarming: false,
  },
  delivered: {
    status: 'delivered',
    label: 'Delivered',
    description: 'This delivery reached the agent.',
    tone: 'success',
    terminal: true,
    alarming: false,
  },
  completed: {
    status: 'completed',
    label: 'Done',
    description: 'This delivery completed.',
    tone: 'success',
    terminal: true,
    alarming: false,
  },
  failed: {
    status: 'failed',
    label: 'Failed',
    description: 'This delivery failed. It may need a retry.',
    tone: 'destructive',
    terminal: true,
    alarming: true,
  },
  interrupted: {
    status: 'interrupted',
    label: 'Interrupted',
    description: 'This delivery was cut off before it finished.',
    tone: 'destructive',
    terminal: true,
    alarming: true,
  },
  cancelled: {
    status: 'cancelled',
    label: 'Cancelled',
    description: 'This delivery was cancelled because its thread was stopped first.',
    tone: 'muted',
    terminal: true,
    alarming: false,
  },
}

export function deliveryStatusPresentation(
  status: DeliveryStatus | null | undefined,
): DeliveryStatusPresentation | null {
  if (!status) return null
  return DELIVERY_PRESENTATION[status] ?? null
}

/**
 * Contract §5 — agent-level precedence over an agent's executions. The values are
 * frozen; the ordering is this ticket's UI judgement (and is pinned by tests).
 * `waiting` (blocked on the operator) and `running` (productive) are the headline;
 * `blocked` needs attention; `queued` is scheduled; the remaining three are terminal.
 */
export const AGENT_LIVE_STATE_PRECEDENCE = [
  'waiting',
  'running',
  'blocked',
  'queued',
  'interrupted',
  'completed',
  'idle',
] as const satisfies readonly AgentLiveState[]

/** Highest-precedence state wins. Nothing to aggregate (`null`s only) is `idle`. */
export function aggregateAgentLiveState(
  states: Iterable<AgentLiveState | null | undefined>,
): AgentLiveState {
  let best: AgentLiveState = 'idle'
  let bestRank = AGENT_LIVE_STATE_PRECEDENCE.indexOf(best)
  for (const state of states) {
    if (!state) continue
    const rank = (AGENT_LIVE_STATE_PRECEDENCE as readonly string[]).indexOf(state)
    // Unknown values are ignored rather than trusted.
    if (rank === -1 || rank >= bestRank) continue
    best = state
    bestRank = rank
  }
  return best
}
