/**
 * Agent activity chip logic (Sprint v2 ticket 3).
 *
 * Split deliberately: this module is React-free so the rules that decide *what*
 * the chip says can be unit-tested in the repo's node test environment, while
 * `components/chat/agent-activity-chip.tsx` only renders the result.
 *
 * Status semantics come from `./agent-live-state` (contract §2/§5) and are not
 * re-implemented here — this module maps a runtime payload onto that vocabulary.
 */

import {
  agentLiveStatePresentation,
  isAgentLiveState,
  type AgentLiveState,
  type AgentLiveTone,
} from './agent-live-state'

/**
 * Merged runtime for one agent, built from its per-execution reads
 * (`GET /api/sessions/:id/runtime` and `GET /api/threads/:id/runtime`); there is no
 * persona-scoped runtime endpoint, so this is the aggregate, not a single payload.
 *
 * `state` is the contract §2 derived value and is absent until ticket 4 lands, so
 * it is typed `unknown` on purpose: this module has to tolerate both the legacy
 * `{running, startedAt}` shape and the new `{running, startedAt, state}` shape
 * without ever trusting an unvalidated string from the API.
 */
export interface AgentActivityRuntime {
  running: boolean
  startedAt: string | null
  state?: unknown
}

export interface AgentActivityAgentIdentity {
  id: string
  name: string
  avatar?: string | null
}

export type AgentActivityAvailability = 'loading' | 'available' | 'unavailable'

export interface AgentActivityChipModel {
  availability: AgentActivityAvailability
  agentId: string
  agentName: string
  state: AgentLiveState
  label: string
  description: string
  tone: AgentLiveTone
  terminal: boolean
  alarming: boolean
  needsOperator: boolean
  /** ISO timestamp of the live execution, when the gateway reported one. */
  startedAt: string | null
  /** Explains a degraded status rather than pretending to know the real state. */
  notice: string | null
  /** The status could not be read at all, so offering a retry is meaningful. */
  retryable: boolean
  triggerId: string
  panelId: string
}

const STATE_NOT_REPORTED_NOTICE =
  'This gateway does not report a detailed agent status yet, so this chip only shows whether a run is currently active.'

const STATUS_UNAVAILABLE_DESCRIPTION =
  "The gateway could not be reached, so this agent's live status is unknown."

/** DOM-safe fragment for aria wiring; the real id stays verbatim in `data-agent-id`. */
function domSafeId(agentId: string): string {
  const safe = agentId.replace(/[^A-Za-z0-9_-]/g, '-')
  return safe.length > 0 ? safe : 'agent'
}

export function buildAgentActivityChipModel(input: {
  agent: AgentActivityAgentIdentity
  runtime?: AgentActivityRuntime | null
  /** True when the runtime request failed; the chip must not claim `idle`. */
  statusUnavailable?: boolean
}): AgentActivityChipModel {
  const { agent, runtime, statusUnavailable } = input
  const base = {
    agentId: agent.id,
    agentName: agent.name,
    triggerId: `agent-activity-trigger-${domSafeId(agent.id)}`,
    panelId: `agent-activity-panel-${domSafeId(agent.id)}`,
  }

  // A failed status read is reported as exactly that. Showing `idle` here would be
  // a silent lie during a gateway outage or a dropped reconnect.
  if (statusUnavailable) {
    return {
      ...base,
      availability: 'unavailable',
      state: 'idle',
      label: 'Status unavailable',
      description: STATUS_UNAVAILABLE_DESCRIPTION,
      tone: 'muted',
      terminal: false,
      alarming: false,
      needsOperator: false,
      startedAt: null,
      notice: STATUS_UNAVAILABLE_DESCRIPTION,
      retryable: true,
    }
  }

  if (!runtime) {
    return {
      ...base,
      availability: 'loading',
      state: 'idle',
      label: 'Checking status',
      description: "Checking this agent's live status.",
      tone: 'neutral',
      terminal: false,
      alarming: false,
      needsOperator: false,
      startedAt: null,
      notice: null,
      retryable: false,
    }
  }

  // `state` is the semantic axis; `running` stays the legacy live-stream axis
  // (ticket 4 AC1d). An unvalidated or unknown value is not trusted, and the
  // legacy axis is used instead of showing a state the gateway never reported.
  const reportedState = isAgentLiveState(runtime.state) ? runtime.state : null
  const state: AgentLiveState = reportedState ?? (runtime.running ? 'running' : 'idle')
  const presentation = agentLiveStatePresentation(state)

  return {
    ...base,
    availability: 'available',
    state,
    label: presentation.label,
    description: presentation.description,
    tone: presentation.tone,
    terminal: presentation.terminal,
    alarming: presentation.alarming,
    needsOperator: presentation.needsOperator,
    startedAt: runtime.startedAt ?? null,
    notice: reportedState ? null : STATE_NOT_REPORTED_NOTICE,
    retryable: false,
  }
}

export type AgentActivityVisibility = 'always' | 'when-active'

/**
 * `when-active` is the main-chat default: an idle agent must not draw a chip on
 * every visit. A finished (`completed`) run stays visible because it is the
 * outcome of a request the user made, and an unreadable status stays visible
 * because silence would hide a real uncertainty.
 */
export function shouldRenderAgentActivityChip(
  model: AgentActivityChipModel,
  visibility: AgentActivityVisibility = 'when-active',
): boolean {
  if (visibility === 'always') return true
  return model.availability !== 'available' || model.state !== 'idle'
}

/**
 * Only operator-actionable states go into the live region. Announcing `idle`,
 * `queued`, `running` or `completed` on every poll would spam assistive
 * technology with status the user did not ask for.
 */
export function shouldAnnounceAgentActivity(model: AgentActivityChipModel): boolean {
  return model.availability === 'available' && model.needsOperator
}

const MINUTE_MS = 60_000

/** Compact duration text; `null` when there is nothing trustworthy to show. */
export function formatAgentActivitySince(
  startedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  const elapsed = now.getTime() - started
  // Clock skew between gateway and browser must not surface as a negative age.
  if (elapsed < 0) return null
  if (elapsed < MINUTE_MS) return 'just now'
  const minutes = Math.floor(elapsed / MINUTE_MS)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export type AgentActivityInteraction =
  | { type: 'toggle' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'keydown'; key: string }

/**
 * Panel open/closed reducer. The trigger is a native `<button>`, so Enter and
 * Space arrive as a click; Escape is the only key the panel handles itself.
 */
export function agentActivityPanelOpen(
  open: boolean,
  action: AgentActivityInteraction,
): boolean {
  switch (action.type) {
    case 'toggle':
      return !open
    case 'open':
      return true
    case 'close':
      return false
    case 'keydown':
      return action.key === 'Escape' ? false : open
  }
}
