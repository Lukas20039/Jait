import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AGENT_LIVE_STATES } from '@/lib/agent-live-state'
import type { AgentActivityRuntime } from '@/lib/agent-activity-chip'
import { AgentActivityChip } from '@/components/chat/agent-activity-chip'

const agent = { id: '01a1117a-495f-7dde-a504-7643383195f8', name: 'Lady Merge-a-Lot' }

function render(props: Partial<Parameters<typeof AgentActivityChip>[0]> = {}): string {
  return renderToStaticMarkup(<AgentActivityChip agent={agent} runtime={{ running: false, startedAt: null }} {...props} />)
}

function runtime(over: Partial<AgentActivityRuntime> = {}): AgentActivityRuntime {
  return { running: false, startedAt: null, ...over }
}

describe('AgentActivityChip — trigger wiring', () => {
  it('renders a native button with the aria wiring the panel needs', () => {
    const html = render({ runtime: runtime({ state: 'blocked' }) })

    expect(html).toContain('type="button"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain(`aria-controls="agent-activity-panel-${agent.id}"`)
    expect(html).toContain(`id="agent-activity-trigger-${agent.id}"`)
    expect(html).toContain('data-agent-live-state="blocked"')
    expect(html).toContain('data-tone="destructive"')
    expect(html).toContain('data-needs-operator="true"')
    expect(html).toContain('data-agent-availability="available"')
    expect(html).toContain(`data-agent-id="${agent.id}"`)
    // Closed panel content is not rendered at all.
    expect(html).not.toContain('role="region"')
  })

  it('keeps a 44px touch target without growing the dense message header row', () => {
    const html = render({ runtime: runtime({ state: 'running' }) })

    // Visual height stays h-8 so the chip matches the header it sits in; the hit
    // area is expanded to 44px with an invisible pseudo-element.
    expect(html).toContain('h-8')
    expect(html).toContain('after:absolute')
    expect(html).toContain('after:-inset-y-1.5')
    expect(html).toContain('after:inset-x-0')
    expect(html).toMatch(/after:content-\[(?:''|&#x27;&#x27;)\]/)
  })

  it('caps the expanded panel to the viewport and paints it above the trigger hit area', () => {
    const html = render({ runtime: runtime({ state: 'blocked' }), initialOpen: true })

    expect(html).toContain('role="region"')
    // Narrow screens must not overflow, and the panel must stay clickable where
    // the trigger's expanded hit area overlaps it.
    expect(html).toContain('relative mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 text-xs shadow-md')
  })

  it('keeps the truthfully-unknown states wired but non-alarming', () => {
    const html = render({ statusUnavailable: true })

    expect(html).toContain('Status unavailable')
    expect(html).toContain('data-agent-availability="unavailable"')
    expect(html).toContain('data-tone="muted"')
    expect(html).not.toContain('data-agent-live-state="running"')
    expect(html).not.toContain('role="status"')
  })
})

describe('AgentActivityChip — every frozen state renders distinguishably', () => {
  it('renders one chip per contract §2 state with distinct text', () => {
    const labels = new Set<string>()

    for (const state of AGENT_LIVE_STATES) {
      const html = render({ runtime: runtime({ state }), visibility: 'always' })
      expect(html).toContain(`data-agent-live-state="${state}"`)
      const label = /<span class="truncate">([^<]+)<\/span>/.exec(html)?.[1]
      expect(label, `state ${state} must render a label`).toBeTruthy()
      labels.add(label as string)
    }

    // Seven states, seven distinct chip labels.
    expect(labels.size).toBe(AGENT_LIVE_STATES.length)
  })

  it('shows waiting and blocked differently', () => {
    const waiting = render({ runtime: runtime({ state: 'waiting' }) })
    const blocked = render({ runtime: runtime({ state: 'blocked' }) })

    expect(waiting).toContain('data-tone="attention"')
    expect(blocked).toContain('data-tone="destructive"')
    expect(waiting).toContain('Waiting for you')
    expect(blocked).toContain('Blocked')
  })

  it('escapes the agent name', () => {
    const html = render({
      agent: { id: 'a', name: 'Captain <Standup> & Co' },
      runtime: runtime({ state: 'running' }),
    })

    expect(html).toContain('Captain &lt;Standup&gt; &amp; Co')
    expect(html).not.toContain('<Standup>')
  })
})

describe('AgentActivityChip — announcement and clutter rules', () => {
  it('announces an operator-actionable state in a polite live region', () => {
    const waiting = render({ runtime: runtime({ state: 'waiting' }) })
    expect(waiting).toContain('role="status"')
    expect(waiting).toContain('aria-live="polite"')
  })

  it('does not announce routine states', () => {
    for (const state of ['idle', 'queued', 'running', 'completed', 'interrupted'] as const) {
      expect(render({ runtime: runtime({ state }) }), state).not.toContain('role="status"')
    }
  })

  it('renders nothing for a known-idle agent unless asked to', () => {
    expect(render({ runtime: runtime({ state: 'idle' }) })).toBe('')
    expect(render({ runtime: runtime({ state: 'idle' }), visibility: 'always' })).toContain('Idle')
  })
})

describe('AgentActivityChip — expanded panel', () => {
  it('links the panel to the trigger and explains a degraded status', () => {
    const html = render({
      runtime: runtime({ running: true }),
      initialOpen: true,
    })

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('role="region"')
    expect(html).toContain(`id="agent-activity-panel-${agent.id}"`)
    expect(html).toContain(`aria-labelledby="agent-activity-trigger-${agent.id}"`)
    expect(html).toContain('does not report a detailed agent status')
    // The panel must stay inside a narrow viewport.
    expect(html).toContain('max-w-[calc(100vw-2rem)]')
  })

  it('offers a retry only when the status read failed', () => {
    const failed = render({ statusUnavailable: true, initialOpen: true, onRetry: () => {} })
    const healthy = render({ runtime: runtime({ state: 'running' }), initialOpen: true, onRetry: () => {} })

    expect(failed).toContain('Retry')
    expect(healthy).not.toContain('Retry')
  })

  it('links the source thread and does not reintroduce a recipient picker', () => {
    const html = render({
      runtime: runtime({ state: 'running' }),
      initialOpen: true,
      threadId: '01a12afe-da52-77b9-b83d-4b05382b662d',
    })

    expect(html).toContain('View thread')
    expect(html).toContain('href="/threads?threadId=01a12afe-da52-77b9-b83d-4b05382b662d"')
    // One control (the trigger) plus one navigation link: nothing else is clickable.
    expect((html.match(/<button/g) ?? []).length).toBe(1)
    expect((html.match(/<a /g) ?? []).length).toBe(1)
    expect(html).not.toContain('<select')
    expect(html).not.toContain('role="listbox"')
    expect(html).not.toContain('recipient')
  })

  it('encodes the thread id in the link', () => {
    const html = render({ runtime: runtime({ state: 'running' }), initialOpen: true, threadId: 'a b&c' })

    expect(html).toContain('href="/threads?threadId=a%20b%26c"')
  })

  it('shows how long the run has been going when the gateway reported a start', () => {
    const startedAt = new Date(Date.now() - 5 * 60_000).toISOString()
    const html = render({ runtime: runtime({ state: 'running', startedAt }), initialOpen: true })

    expect(html).toContain('Started 5m ago')
  })
})
