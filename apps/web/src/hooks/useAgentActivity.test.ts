/**
 * Polling-plan tests for the main-chat activity chip (Sprint v2 ticket 3).
 *
 * The hook's timer is not exercised here — only the rule that decides whether
 * polling continues. That rule is what keeps an idle chat from hitting the
 * gateway forever, so it is tested against models built by the real chip
 * builder rather than hand-written stubs.
 */

import { describe, expect, it } from 'vitest'
import { buildAgentActivityChipModel } from '@/lib/agent-activity-chip'
import type { AgentActivityChipModel } from '@/lib/agent-activity-chip'
import { aggregateAgentLiveState } from '@/lib/agent-live-state'
import {
  AGENT_ACTIVITY_MAX_CONSECUTIVE_FAILURES,
  shouldPollAgentActivity,
} from './useAgentActivity'

const agent = { id: 'agent-1', name: 'Lady Merge-a-Lot' }

function modelFor(runtime: Parameters<typeof buildAgentActivityChipModel>[0]['runtime']): AgentActivityChipModel {
  return buildAgentActivityChipModel({ agent, runtime })
}

function plan(model: AgentActivityChipModel, sourceCount = 1, consecutiveFailures = 0) {
  return shouldPollAgentActivity({ sourceCount, model, consecutiveFailures })
}

describe('shouldPollAgentActivity', () => {
  it('does not poll when the agent has no execution to observe', () => {
    expect(plan(modelFor(null), 0)).toBe(false)
  })

  it('polls while the first read is still in flight', () => {
    expect(plan(modelFor(undefined), 1)).toBe(true)
  })

  it('polls while the agent is live', () => {
    expect(plan(modelFor({ running: true, startedAt: '2026-10-11T10:00:00.000Z' }))).toBe(true)
  })

  it('keeps polling a waiting run, which is live but not executing', () => {
    const model = modelFor({ running: false, startedAt: null, state: 'waiting' })
    expect(model.state).toBe('waiting')
    expect(plan(model)).toBe(true)
  })

  it('stops once the run is terminal', () => {
    // `interrupted` is where a gateway-side `cancelled` run surfaces on the
    // agent axis, and it stays non-alarming per contract §4.
    for (const state of ['completed', 'interrupted', 'blocked'] as const) {
      const model = modelFor({ running: false, startedAt: null, state })
      expect(model.terminal, `${state} must be terminal`).toBe(true)
      expect(plan(model), `${state} must stop polling`).toBe(false)
    }
  })

  it('stops for a settled idle agent', () => {
    const model = modelFor({ running: false, startedAt: null })
    expect(model.state).toBe('idle')
    expect(plan(model)).toBe(false)
  })

  it('retries a failed status read, then gives up and leaves Retry to the user', () => {
    const unavailable = buildAgentActivityChipModel({ agent, runtime: null, statusUnavailable: true })
    expect(unavailable.retryable).toBe(true)
    expect(plan(unavailable, 1, 0)).toBe(true)
    expect(plan(unavailable, 1, AGENT_ACTIVITY_MAX_CONSECUTIVE_FAILURES - 1)).toBe(true)
    expect(plan(unavailable, 1, AGENT_ACTIVITY_MAX_CONSECUTIVE_FAILURES)).toBe(false)
  })

  it('does not let an old failure count stop a healthy live run', () => {
    const running = modelFor({ running: true, startedAt: '2026-10-11T10:00:00.000Z' })
    expect(plan(running, 1, 0)).toBe(true)
  })

  it('matches the aggregated state the chip renders for a merged read', () => {
    // Two executions: one running, one blocked. §5 precedence puts `running`
    // (productive) above `blocked`, and `running` is not terminal, so the chip
    // keeps polling to catch the run settling.
    const state = aggregateAgentLiveState(['running', 'blocked'])
    const model = modelFor({ running: true, startedAt: null, state })
    expect(state).toBe('running')
    expect(model.state).toBe('running')
    expect(model.needsOperator).toBe(false)
    expect(plan(model, 2)).toBe(true)
  })
})
