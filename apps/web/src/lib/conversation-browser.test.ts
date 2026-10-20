import { describe, expect, it } from 'vitest'
import { findConversationBrowser } from './conversation-browser'

const data = { browserId: 'browser-a', browserSession: { sessionId: 'chat-a', previewUrl: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify' } }
const navigate = { tool: 'mcp__jait__browser_navigate', result: { data } }

describe('conversation browser selection', () => {
  it('selects one live browser across turns and actions without session metadata', () => {
    expect(findConversationBrowser([{ toolCalls: [navigate] }, { toolCalls: [{ tool: 'browser.click' }, { tool: 'browser.snapshot' }] }], 'chat-a')).toEqual({ data })
  })
  it('recognizes a running browser call before its result arrives', () => {
    expect(findConversationBrowser([{ toolCalls: [{ tool: 'functions.mcp__jait_core__browser_navigate' }] }], 'chat-a')).toEqual({ data: undefined })
  })
  it('ignores other sessions, unrelated tools, and malformed history', () => {
    expect(findConversationBrowser([{ toolCalls: [navigate, null, { tool: 'terminal.run' }] }, { toolCalls: {} }], 'chat-b')).toBeNull()
  })
  it('uses the latest browser after a restart', () => {
    const restarted = { ...data, browserId: 'browser-b' }
    expect(findConversationBrowser([{ toolCalls: [navigate, { tool: 'preview.restart', result: { data: restarted } }] }], 'chat-a')).toEqual({ data: restarted })
  })
})
