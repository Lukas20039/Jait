import { describe, expect, it } from 'vitest'
import {
  AGENT_LIVE_STATES,
  agentLiveStatePresentation,
} from '@/lib/agent-live-state'
import {
  agentActivityPanelOpen,
  buildAgentActivityChipModel,
  formatAgentActivitySince,
  shouldAnnounceAgentActivity,
  shouldRenderAgentActivityChip,
  type AgentActivityRuntime,
} from '@/lib/agent-activity-chip'

const agent = { id: '01a1117a-495f-7dde-a504-7643383195f8', name: 'Lady Merge-a-Lot' }

function runtime(over: Partial<AgentActivityRuntime> = {}): AgentActivityRuntime {
  return { running: false, startedAt: null, ...over }
}

describe('buildAgentActivityChipModel — contract §2 vocabulary', () => {
  it('renders every one of the seven frozen states', () => {
    for (const state of AGENT_LIVE_STATES) {
      const model = buildAgentActivityChipModel({ agent, runtime: runtime({ state }) })
      const presentation = agentLiveStatePresentation(state)
      expect(model.availability).toBe('available')
      expect(model.state).toBe(state)
      expect(model.label).toBe(presentation.label)
      expect(model.description).toBe(presentation.description)
      expect(model.tone).toBe(presentation.tone)
      expect(model.notice).toBeNull()
    }
  })

  it('keeps the operator-actionable states distinct', () => {
    const waiting = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'waiting' }) })
    const blocked = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'blocked' }) })

    expect(waiting.label).not.toBe(blocked.label)
    expect(waiting.tone).toBe('attention')
    expect(blocked.tone).toBe('destructive')
    expect(waiting.needsOperator).toBe(true)
    expect(blocked.needsOperator).toBe(true)
    // Waiting is actionable, not a failure: it must not be announced as one.
    expect(blocked.alarming).toBe(waiting.alarming)
  })

  it('treats a stopped run as non-alarming and terminal', () => {
    const model = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'interrupted' }) })
    expect(model.terminal).toBe(true)
    expect(model.alarming).toBe(false)
    expect(model.tone).toBe('muted')
  })
})

describe('buildAgentActivityChipModel — legacy axis and untrusted input', () => {
  it('falls back to the legacy running axis when no state is reported', () => {
    const running = buildAgentActivityChipModel({ agent, runtime: runtime({ running: true }) })
    const idle = buildAgentActivityChipModel({ agent, runtime: runtime({ running: false }) })

    expect(running.state).toBe('running')
    expect(running.label).toBe('Working')
    expect(running.notice).toMatch(/does not report a detailed agent status/)
    expect(idle.state).toBe('idle')
    expect(idle.notice).toMatch(/does not report a detailed agent status/)
  })

  it('never trusts an unknown state string from the API', () => {
    const model = buildAgentActivityChipModel({
      agent,
      runtime: runtime({ state: 'definitely-not-a-state', running: true }),
    })

    expect(model.state).toBe('running')
    expect(model.label).not.toContain('definitely-not-a-state')
    expect(model.description).not.toContain('definitely-not-a-state')
  })

  it('does not report idle when the status could not be read at all', () => {
    const model = buildAgentActivityChipModel({ agent, statusUnavailable: true })

    expect(model.availability).toBe('unavailable')
    expect(model.state).not.toBe('running')
    expect(model.label).toBe('Status unavailable')
    expect(model.tone).toBe('muted')
    expect(model.alarming).toBe(false)
    expect(model.needsOperator).toBe(false)
    expect(model.retryable).toBe(true)
    expect(model.notice).toMatch(/could not be reached/)
  })

  it('reports a distinct loading state while the first read is in flight', () => {
    const model = buildAgentActivityChipModel({ agent })
    expect(model.availability).toBe('loading')
    expect(model.label).toBe('Checking status')
    expect(model.retryable).toBe(false)
  })
})

describe('buildAgentActivityChipModel — aria wiring', () => {
  it('derives stable, DOM-safe ids per agent and keeps the real id intact', () => {
    const weird = buildAgentActivityChipModel({
      agent: { id: 'agent/with:unsafe chars', name: 'Weird' },
      runtime: runtime({ state: 'running' }),
    })
    const plain = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'running' }) })

    expect(weird.triggerId).toBe('agent-activity-trigger-agent-with-unsafe-chars')
    expect(weird.panelId).toBe('agent-activity-panel-agent-with-unsafe-chars')
    expect(weird.agentId).toBe('agent/with:unsafe chars')
    expect(plain.triggerId).not.toBe(weird.triggerId)
  })
})

describe('visibility and announcement rules', () => {
  it('hides only a known-idle agent by default', () => {
    const idle = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'idle' }) })
    const done = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'completed' }) })
    const blocked = buildAgentActivityChipModel({ agent, runtime: runtime({ state: 'blocked' }) })
    const loading = buildAgentActivityChipModel({ agent })
    const unavailable = buildAgentActivityChipModel({ agent, statusUnavailable: true })

    expect(shouldRenderAgentActivityChip(idle)).toBe(false)
    expect(shouldRenderAgentActivityChip(done)).toBe(true)
    expect(shouldRenderAgentActivityChip(blocked)).toBe(true)
    // Uncertainty must stay visible; silence would hide a real problem.
    expect(shouldRenderAgentActivityChip(loading)).toBe(true)
    expect(shouldRenderAgentActivityChip(unavailable)).toBe(true)
    expect(shouldRenderAgentActivityChip(idle, 'always')).toBe(true)
  })

  it('announces only states that need the operator', () => {
    const announcing = AGENT_LIVE_STATES.filter((state) =>
      shouldAnnounceAgentActivity(buildAgentActivityChipModel({ agent, runtime: runtime({ state }) })),
    )
    expect(announcing).toEqual(['waiting', 'blocked'])
  })

  it('does not announce a status it could not read', () => {
    expect(shouldAnnounceAgentActivity(buildAgentActivityChipModel({ agent, statusUnavailable: true }))).toBe(false)
    expect(shouldAnnounceAgentActivity(buildAgentActivityChipModel({ agent }))).toBe(false)
  })
})

describe('formatAgentActivitySince', () => {
  const now = new Date('2026-10-11T12:00:00.000Z')

  it('formats elapsed time compactly', () => {
    expect(formatAgentActivitySince('2026-10-11T11:59:30.000Z', now)).toBe('just now')
    expect(formatAgentActivitySince('2026-10-11T11:55:00.000Z', now)).toBe('5m')
    expect(formatAgentActivitySince('2026-10-11T10:30:00.000Z', now)).toBe('1h')
    expect(formatAgentActivitySince('2026-10-09T12:00:00.000Z', now)).toBe('2d')
  })

  it('returns null instead of a guess', () => {
    expect(formatAgentActivitySince(null, now)).toBeNull()
    expect(formatAgentActivitySince(undefined, now)).toBeNull()
    expect(formatAgentActivitySince('not-a-date', now)).toBeNull()
    // Clock skew must not surface as a negative age.
    expect(formatAgentActivitySince('2026-10-11T12:05:00.000Z', now)).toBeNull()
  })
})

describe('agentActivityPanelOpen', () => {
  it('toggles, opens, closes and treats Escape as close', () => {
    expect(agentActivityPanelOpen(false, { type: 'toggle' })).toBe(true)
    expect(agentActivityPanelOpen(true, { type: 'toggle' })).toBe(false)
    expect(agentActivityPanelOpen(false, { type: 'open' })).toBe(true)
    expect(agentActivityPanelOpen(true, { type: 'close' })).toBe(false)
    expect(agentActivityPanelOpen(true, { type: 'keydown', key: 'Escape' })).toBe(false)
    expect(agentActivityPanelOpen(true, { type: 'keydown', key: 'Tab' })).toBe(true)
    expect(agentActivityPanelOpen(false, { type: 'keydown', key: 'Escape' })).toBe(false)
  })
})
