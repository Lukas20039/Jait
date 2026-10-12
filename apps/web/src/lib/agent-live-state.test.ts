import { describe, expect, it } from 'vitest'
import {
  AGENT_LIVE_STATES,
  AGENT_LIVE_STATE_PRECEDENCE,
  agentLiveStatePresentation,
  aggregateAgentLiveState,
  deliveryStatusPresentation,
  isAgentLiveState,
  isDeliveryStatus,
  type AgentLiveState,
} from './agent-live-state'

describe('agent live-state vocabulary', () => {
  it('is exactly the seven frozen values in contract order', () => {
    // Pin the contract (ticket 4 §2): adding/removing/reordering is a contract
    // change, not a UI change, so it must fail here first.
    expect(AGENT_LIVE_STATES).toEqual([
      'idle',
      'queued',
      'running',
      'waiting',
      'blocked',
      'completed',
      'interrupted',
    ])
  })

  it('pins the aggregation order of contract §5', () => {
    expect(AGENT_LIVE_STATE_PRECEDENCE.join(' > ')).toBe(
      'waiting > running > blocked > queued > interrupted > completed > idle',
    )
  })

  it('exposes a presentation for all seven values plus null', () => {
    for (const state of AGENT_LIVE_STATES) {
      const presentation = agentLiveStatePresentation(state)
      expect(presentation.state).toBe(state)
      expect(presentation.label.length).toBeGreaterThan(0)
      expect(presentation.description.length).toBeGreaterThan(0)
    }
    expect(agentLiveStatePresentation(null)).toEqual(agentLiveStatePresentation('idle'))
    expect(agentLiveStatePresentation(undefined)).toEqual(agentLiveStatePresentation('idle'))
  })

  it('never reports an agent as working when the gateway has no execution', () => {
    expect(agentLiveStatePresentation(null).tone).not.toBe('live')
    expect(agentLiveStatePresentation(null).terminal).toBe(true)
  })

  it('treats blocked and waiting as distinct states', () => {
    const waiting = agentLiveStatePresentation('waiting')
    const blocked = agentLiveStatePresentation('blocked')
    expect(waiting.tone).not.toBe(blocked.tone)
    expect(waiting.label).not.toBe(blocked.label)
    // Both need the operator, but each is distinct in tone and label.
    expect(waiting.needsOperator).toBe(true)
    expect(blocked.needsOperator).toBe(true)
    expect(waiting.alarming).toBe(true)
    expect(blocked.alarming).toBe(true)
  })

  it('reserves the destructive tone for failures', () => {
    const destructive = AGENT_LIVE_STATES.filter(
      (state) => agentLiveStatePresentation(state).tone === 'destructive',
    )
    expect(destructive).toEqual(['blocked'])
  })

  it('marks only waiting and blocked as alarming', () => {
    const alarming = AGENT_LIVE_STATES.filter(
      (state) => agentLiveStatePresentation(state).alarming,
    )
    expect(alarming).toEqual(['waiting', 'blocked'])
  })

  it('flags queued, running and waiting as non-terminal, and the rest as terminal', () => {
    const nonTerminal = AGENT_LIVE_STATES.filter(
      (state) => !agentLiveStatePresentation(state).terminal,
    )
    expect(nonTerminal).toEqual(['queued', 'running', 'waiting'])
  })

  it('falls back to idle for an unknown value that crosses the API boundary', () => {
    expect(agentLiveStatePresentation('exploded' as AgentLiveState)).toEqual(
      agentLiveStatePresentation('idle'),
    )
  })

  it('guards untrusted values', () => {
    expect(isAgentLiveState('waiting')).toBe(true)
    expect(isAgentLiveState('paused')).toBe(false)
    expect(isAgentLiveState(null)).toBe(false)
    expect(isAgentLiveState({ state: 'running' })).toBe(false)
  })
})

describe('delivery status presentation (contract §4)', () => {
  it('treats cancelled as a muted, non-alarming terminal state', () => {
    const cancelled = deliveryStatusPresentation('cancelled')
    expect(cancelled).not.toBeNull()
    expect(cancelled?.terminal).toBe(true)
    expect(cancelled?.alarming).toBe(false)
    expect(cancelled?.tone).toBe('muted')
  })

  it('keeps failed and interrupted destructive and distinct from cancelled', () => {
    const cancelled = deliveryStatusPresentation('cancelled')
    const failed = deliveryStatusPresentation('failed')
    const interrupted = deliveryStatusPresentation('interrupted')
    expect(failed?.tone).toBe('destructive')
    expect(failed?.alarming).toBe(true)
    expect(interrupted?.tone).toBe('destructive')
    expect(cancelled?.tone).not.toBe(failed?.tone)
    expect(cancelled?.tone).not.toBe(interrupted?.tone)
  })

  it('renders nothing for a missing status', () => {
    expect(deliveryStatusPresentation(null)).toBeNull()
    expect(deliveryStatusPresentation(undefined)).toBeNull()
  })

  it('guards untrusted values', () => {
    expect(isDeliveryStatus('cancelled')).toBe(true)
    expect(isDeliveryStatus('dropped')).toBe(false)
  })
})

describe('agent-level aggregation (contract §5)', () => {
  it('picks the highest-precedence execution', () => {
    expect(aggregateAgentLiveState(['idle', 'running'])).toBe('running')
    expect(aggregateAgentLiveState(['running', 'waiting'])).toBe('waiting')
    expect(aggregateAgentLiveState(['queued', 'blocked'])).toBe('blocked')
    expect(aggregateAgentLiveState(['completed', 'queued'])).toBe('queued')
    expect(aggregateAgentLiveState(['idle', 'interrupted'])).toBe('interrupted')
    expect(aggregateAgentLiveState(['completed', 'idle'])).toBe('completed')
    expect(aggregateAgentLiveState(AGENT_LIVE_STATES)).toBe('waiting')
  })

  it('is order-independent', () => {
    const forward: AgentLiveState[] = ['queued', 'completed', 'blocked', 'running']
    expect(aggregateAgentLiveState(forward)).toBe(
      aggregateAgentLiveState([...forward].reverse()),
    )
  })

  it('ignores missing and unknown executions', () => {
    expect(aggregateAgentLiveState([])).toBe('idle')
    expect(aggregateAgentLiveState([null, undefined])).toBe('idle')
    expect(aggregateAgentLiveState([null, 'running', undefined])).toBe('running')
    expect(aggregateAgentLiveState(['nonsense' as AgentLiveState, 'idle'])).toBe('idle')
  })
})
