import { normalizeToolName } from './tool-call-body'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Find one browser for the whole transcript, including virtualized/collapsed rows. */
export function findConversationBrowser(messages: readonly { toolCalls?: unknown }[], sessionId?: string | null): { data?: Record<string, unknown> } | null {
  let used = false
  let latestData: Record<string, unknown> | undefined
  for (const message of messages) {
    if (!Array.isArray(message.toolCalls)) continue
    for (const value of message.toolCalls) {
      const call = record(value)
      if (!call || typeof call.tool !== 'string') continue
      const data = record(record(call.result)?.data)
      const browserSession = record(data?.browserSession)
      // Tool results from another chat must never select that chat's browser.
      if (sessionId && typeof browserSession?.sessionId === 'string' && browserSession.sessionId !== sessionId) continue
      const tool = normalizeToolName(call.tool.replace(/^(?:functions[._])?mcp[._]+jait(?:_core)?[._]+/, '').replace(/_/g, '.'))
      if (!browserSession && !tool.startsWith('browser.') && !['preview.open', 'preview.status', 'preview.restart', 'preview.inspect'].includes(tool)
        && !(tool === 'surfaces.start' && record(call.args)?.type === 'browser')) continue
      // Later actions often have no session metadata. Keep the last useful hint;
      // the authenticated session endpoint is the source of current state.
      used = true
      if (browserSession || data?.sessionId) latestData = data
    }
  }
  return used ? { data: latestData } : null
}
