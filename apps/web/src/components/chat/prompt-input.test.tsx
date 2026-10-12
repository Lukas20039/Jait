import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PromptInput } from './prompt-input'

const baseProps = {
  value: 'watch the failing test',
  onChange: () => {},
  onSubmit: () => {},
}

describe('PromptInput send button while streaming', () => {
  it('defaults to queue and hides the other actions behind the caret menu', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        onQueue={() => {}}
        onSteer={() => {}}
        onAskInParallel={() => {}}
      />,
    )

    // One primary button for the default action plus a caret for the rest.
    expect(markup).toContain('aria-label="Add to queue (Enter)"')
    expect(markup).toContain('aria-label="More send options"')
    expect(markup).not.toContain('aria-label="Steer the running agent (Enter)"')
    expect(markup).not.toContain('aria-label="Ask in parallel"')
    // Labels come from tooltips, not native title attributes.
    expect(markup).not.toContain('title="Add to queue (Enter)"')
    expect(markup).not.toContain('title="More send options"')
  })

  it('promotes steer to the primary button when the configured default is steer', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        defaultStreamingAction="steer"
        onQueue={() => {}}
        onSteer={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Steer the running agent (Enter)"')
    expect(markup).toContain('aria-label="More send options"')
    expect(markup).not.toContain('aria-label="Add to queue (Enter)"')
  })

  it('keeps the queue-only fallback without a caret when no steer handler is provided', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        onQueue={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Add to queue (Enter)"')
    expect(markup).not.toContain('aria-label="More send options"')
    expect(markup).not.toContain('aria-label="Steer the running agent (Enter)"')
  })

  it('renders the plain submit button when not loading', () => {
    const markup = renderToStaticMarkup(
      <PromptInput {...baseProps} />,
    )

    expect(markup).not.toContain('title="Steer the running agent (Enter)"')
    expect(markup).not.toContain('title="Add to queue"')
  })

  it('never offers steering for the thread target while streaming', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        isLoading
        sendTarget="thread"
        onQueue={() => {}}
        onSteer={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Send message"')
    expect(markup).not.toContain('aria-label="Steer the running agent (Enter)"')
    expect(markup).not.toContain('aria-label="More send options"')
  })
})

describe('PromptInput footer selectors', () => {
  it('hides every selector when the values are passed without change handlers', () => {
    // Mirrors the parallel-chat panel regression: passing `mode`, `provider`,
    // `providerRuntimeMode`, `responseStyle` and `reasoningEffort` as values
    // without their `on*Change` callbacks collapsed the whole footer control
    // row, so the panel showed a composer with no buttons at all.
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        mode="agent"
        provider="jait"
        providerRuntimeMode="full-access"
        responseStyle="concise"
        reasoningEffort="medium"
      />,
    )

    expect(markup).not.toContain('aria-label="Provider ')
    expect(markup).not.toContain('aria-label="Runtime:')
  })

  it('renders the footer selectors once their handlers are wired up', () => {
    const markup = renderToStaticMarkup(
      <PromptInput
        {...baseProps}
        mode="agent"
        onModeChange={() => {}}
        provider="jait"
        providerRuntimeMode="full-access"
        onProviderRuntimeModeChange={() => {}}
        responseStyle="concise"
        onResponseStyleChange={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Runtime:')
    // The provider/model selector needs an auth context, so it stays out of
    // this SSR test — the runtime selector alone proves the row renders.
    expect(markup).not.toContain('aria-label="Provider ')
  })
})
describe('PromptInput edit attachments', () => {
  it('shows existing image and file attachments in the edit composer', () => {
    const markup = renderToStaticMarkup(
      <PromptInput {...baseProps} initialAttachments={[
        { name: 'screen.png', mimeType: 'image/png', data: 'abc123', preview: 'data:image/png;base64,abc123' },
        { name: 'notes.txt', mimeType: 'text/plain', data: 'aGVsbG8=' },
      ]} />,
    )
    // Images hydrate as inline DOM nodes; file attachments retain the separate bar.
    expect(markup).not.toContain('Remove screen.png')
    expect(markup).toContain('Remove notes.txt')
  })
})
