import { describe, expect, it } from 'vitest'
import {
  AGENT_ACTIVITY_SOURCE_LIMIT,
  mergeAgentActivityRuntimes,
  resolveAgentActivitySources,
} from './agent-activity-source'

const thread = (
  id: string,
  personaAgentId: string | null,
  status: string,
  updatedAt: string,
) => ({ id, personaAgentId, status, updatedAt })

describe('resolveAgentActivitySources', () => {
  it('only returns executions owned by the agent (real runtime sources, no invented ids)', () => {
    const sources = resolveAgentActivitySources('agent-1', [
      thread('t-mine', 'agent-1', 'running', '2026-10-11T10:00:00.000Z'),
      thread('t-other', 'agent-2', 'running', '2026-10-11T11:00:00.000Z'),
      thread('t-unowned', null, 'running', '2026-10-11T12:00:00.000Z'),
    ])
    expect(sources).toEqual([{ kind: 'threads', id: 't-mine' }])
  })

  it('prefers live executions over finished ones, then most recently updated', () => {
    const sources = resolveAgentActivitySources('agent-1', [
      thread('t-done-new', 'agent-1', 'completed', '2026-10-11T12:00:00.000Z'),
      thread('t-running-old', 'agent-1', 'running', '2026-10-11T09:00:00.000Z'),
      thread('t-running-new', 'agent-1', 'running', '2026-10-11T11:00:00.000Z'),
    ])
    expect(sources.map((source) => source.id)).toEqual([
      't-running-new',
      't-running-old',
      't-done-new',
    ])
  })

  it(`bounds request fan-out at ${AGENT_ACTIVITY_SOURCE_LIMIT} sources by default`, () => {
    const threads = Array.from({ length: 8 }, (_, index) =>
      thread(`t-${index}`, 'agent-1', 'running', `2026-10-11T0${index}:00:00.000Z`),
    )
    expect(resolveAgentActivitySources('agent-1', threads)).toHaveLength(AGENT_ACTIVITY_SOURCE_LIMIT)
    expect(resolveAgentActivitySources('agent-1', threads, 1)).toEqual([
      { kind: 'threads', id: 't-7' },
    ])
  })

  it('returns nothing when the agent has no execution, so the chip stays silent', () => {
    expect(resolveAgentActivitySources('agent-1', [])).toEqual([])
    expect(resolveAgentActivitySources('agent-1', [thread('t', 'agent-2', 'running', '')])).toEqual(
      [],
    )
  })

  it('tolerates a malformed thread payload without inventing a runtime target', () => {
    const sources = resolveAgentActivitySources('agent-1', [
      { id: '', personaAgentId: 'agent-1', status: 'running', updatedAt: '' },
      thread('t-ok', 'agent-1', 'running', 'not-a-date'),
    ])
    expect(sources).toEqual([{ kind: 'threads', id: 't-ok' }])
  })
})

describe('mergeAgentActivityRuntimes', () => {
  it('stays loading while nothing has been read yet', () => {
    expect(mergeAgentActivityRuntimes([])).toEqual({ runtime: null, statusUnavailable: false })
  })

  it('reports an unreadable status when every source failed instead of claiming idle', () => {
    expect(mergeAgentActivityRuntimes([null, null])).toEqual({
      runtime: null,
      statusUnavailable: true,
    })
  })

  it('keeps a live run visible when a sibling source failed', () => {
    const merged = mergeAgentActivityRuntimes([
      { running: true, startedAt: '2026-10-11T10:00:00.000Z' },
      null,
    ])
    expect(merged.statusUnavailable).toBe(false)
    expect(merged.runtime?.running).toBe(true)
  })

  it('ORs the legacy running axis and keeps the earliest start time', () => {
    const merged = mergeAgentActivityRuntimes([
      { running: false, startedAt: '2026-10-11T08:00:00.000Z' },
      { running: true, startedAt: '2026-10-11T10:00:00.000Z' },
      { running: true, startedAt: '2026-10-11T09:00:00.000Z' },
    ])
    expect(merged.runtime).toEqual({ running: true, startedAt: '2026-10-11T09:00:00.000Z' })
  })

  it('aggregates explicit states by contract §5 precedence', () => {
    const merged = mergeAgentActivityRuntimes([
      { running: true, startedAt: null, state: 'running' },
      { running: false, startedAt: null, state: 'waiting' },
    ])
    expect(merged.runtime?.state).toBe('waiting')
  })

  it('drops the aggregate state when coverage is partial, rather than understating the agent', () => {
    const merged = mergeAgentActivityRuntimes([
      { running: true, startedAt: null, state: 'running' },
      { running: false, startedAt: null },
    ])
    expect(merged.runtime?.state).toBeUndefined()
    expect(merged.runtime?.running).toBe(true)
  })

  it('drops an unvalidated state string from the API', () => {
    const merged = mergeAgentActivityRuntimes([
      { running: false, startedAt: null, state: 'launching' },
      { running: false, startedAt: null, state: 'launching' },
    ])
    expect(merged.runtime?.state).toBeUndefined()
  })
})
