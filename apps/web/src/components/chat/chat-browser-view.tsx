import { useEffect, useRef, useState } from 'react'
import { Minimize2, RotateCcw, Settings2 } from 'lucide-react'
import { BrowserViewLayout } from '@/components/remote/browser-view-layout'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

interface BrowserState { sessionId: string; browserId?: string; url: string | null; sharedWithAgent: boolean; verified: boolean; currentUrl?: string | null }

// Only gateway live views can be embedded. Page URLs remain ordinary links.
function liveViewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/noVNC/')) return null
  try {
    const url = new URL(value, 'http://gateway')
    return url.origin === 'http://gateway' && /^\/?api\/live-view\/\d+\/websockify$/.test(url.searchParams.get('path') ?? '') ? value : null
  } catch { return null }
}

export function ChatBrowserView({ data, sessionId, authToken, autoOpen }: {
  data?: Record<string, unknown>; sessionId?: string | null; authToken?: string | null; autoOpen: boolean
}) {
  const record = (data?.browserSession ?? (liveViewUrl(data?.url) ? { ...data, previewUrl: data?.url, controller: data?.sharedWithAgent ? 'agent' : 'user' } : undefined)) as Record<string, unknown> | undefined
  const id = sessionId ?? (typeof record?.sessionId === 'string' ? record.sessionId : undefined)
  const browserId = typeof data?.browserId === 'string' ? data.browserId : undefined
  const [expanded, setExpanded] = useState(autoOpen)
  const [controlsContainer, setControlsContainer] = useState<HTMLDivElement | null>(null)
  const optionsRef = useRef<HTMLDetailsElement>(null)
  const [state, setState] = useState<BrowserState | null>(() => id && liveViewUrl(record?.previewUrl) ? {
    sessionId: id, browserId, url: liveViewUrl(record?.previewUrl), sharedWithAgent: record?.controller === 'agent', verified: false,
  } : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(id)}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, signal: controller.signal })
        if (!response.ok) { if (!cancelled) setState(null); return }
        const { session } = await response.json()
        if (!cancelled) setState(session?.status === 'ready' ? {
          sessionId: id, browserId: session.browserId, url: liveViewUrl(session.url), sharedWithAgent: session.sharedWithAgent === true, verified: true, currentUrl: session.metrics?.url ?? session.target,
        } : null)
      } catch { /* Leave the last live view available during a temporary disconnect. */ }
      finally { if (!cancelled) timer = setTimeout(load, 3000) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [id, authToken])

  const setShared = async () => {
    if (!state?.verified || busy) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/share`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, sharedWithAgent: !state.sharedWithAgent }),
      })
      if (!response.ok) throw new Error('Could not change browser control. Try again.')
      const { session } = await response.json()
      setState((previous) => previous ? { ...previous, sharedWithAgent: session.sharedWithAgent === true } : null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change browser control.') }
    finally { setBusy(false) }
  }
  const restartBrowser = async () => {
    if (!id || busy) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch(`${getApiUrl()}/api/preview/restart`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      if (!response.ok) throw new Error('Could not restart the browser. Try again.')
      const { session } = await response.json()
      setState(session?.status === 'ready' ? {
        sessionId: id, browserId: session.browserId, url: liveViewUrl(session.url),
        sharedWithAgent: session.sharedWithAgent === true, verified: true,
      } : null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not restart the browser.') }
    finally { setBusy(false) }
  }
  if (!id) return null
  const controlLabel = state?.sharedWithAgent ? 'Take control' : 'Share with agent'
  const controls = <>
    <button type="button"
      title={`${state?.sharedWithAgent ? 'Agent is controlling' : 'You are controlling'} · ${controlLabel}`}
      disabled={busy || !state?.verified} onClick={() => void setShared()}
      className="h-8 shrink-0 whitespace-nowrap rounded border px-2 hover:bg-muted disabled:opacity-50">
      {controlLabel}
    </button>
    <details ref={optionsRef} className="relative shrink-0" onKeyDown={event => {
      if (event.key === 'Escape' && optionsRef.current) { optionsRef.current.open = false; optionsRef.current.querySelector('summary')?.focus() }
    }}>
      <summary aria-label="Browser view options" title="Browser view options"
        className="flex h-8 cursor-pointer list-none items-center rounded border px-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 top-10 z-50 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
        <div className="text-xs font-medium">Browser view</div>
        <div ref={setControlsContainer} className="space-y-2" />
        <button type="button" disabled={busy} onClick={() => void restartBrowser()}
          className="flex w-full items-center gap-2 rounded border px-2 py-2 text-xs hover:bg-muted disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" />Restart browser
        </button>
      </div>
    </details>
    <button type="button" aria-label="Minimize browser" title="Minimize browser" aria-expanded={expanded}
      onClick={() => { if (optionsRef.current) optionsRef.current.open = false; setExpanded(false) }}
      className="flex h-8 shrink-0 items-center rounded border px-2 hover:bg-muted">
      <Minimize2 className="h-4 w-4" />
    </button>
  </>
  return (
    <section aria-label="Chat browser" data-browser-panel data-browser-minimized={!expanded}
      className={expanded
        ? 'relative z-30 mx-auto mb-1 mt-3 flex h-[min(480px,55vh)] max-h-[65%] w-[calc(100%-1.5rem)] max-w-3xl shrink-0 flex-col rounded-xl border border-border bg-background text-xs shadow-lg [&:fullscreen]:m-0 [&:fullscreen]:h-screen [&:fullscreen]:max-h-none [&:fullscreen]:w-screen [&:fullscreen]:max-w-none'
        : 'absolute left-3 top-3 z-30 h-[90px] w-40 overflow-hidden rounded-lg border border-border bg-background text-xs shadow-lg'}>
      <div className={expanded ? 'min-h-0 flex-1 [&_[data-browser-layout]]:rounded-xl' : 'h-full w-full pointer-events-none'} inert={!expanded ? true : undefined}>
        <BrowserViewLayout compact={!expanded} addressBar={{ sessionId: id, authToken, currentUrl: state?.currentUrl, sharedWithAgent: state?.sharedWithAgent === true, disabled: busy || !state?.verified, controls }}>
          {state?.url ? <NoVncSessionView source={state.url} title="Agent browser" controlsContainer={controlsContainer}
            hideControls={!expanded} viewOnly={state.sharedWithAgent || busy || !state.verified} className="h-full w-full rounded-b-xl border-0 bg-white" />
            : <p className="p-3 text-muted-foreground">No live browser is available for this chat.</p>}
        </BrowserViewLayout>
      </div>
      {expanded && error && <p role="alert" className="absolute bottom-0 inset-x-0 rounded-b-xl bg-background/95 px-3 py-2 text-destructive">{error}</p>}
      {!expanded && <button type="button" aria-label="Expand browser" aria-expanded={false} onClick={() => setExpanded(true)} className="absolute inset-0 z-50 cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />}
    </section>
  )
}
