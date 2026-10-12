import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw, Wrench } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

export interface BrowserAddressBarProps {
  sessionId: string
  authToken?: string | null
  currentUrl?: string | null
  sharedWithAgent: boolean
  disabled?: boolean
}

export function BrowserAddressBar({ sessionId, authToken, currentUrl, sharedWithAgent, disabled = false, toolsOpen, onToggleTools }: BrowserAddressBarProps & {
  toolsOpen: boolean
  onToggleTools: () => void
}) {
  const [value, setValue] = useState(currentUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editing = useRef(false)
  const latestUrl = useRef(currentUrl ?? '')

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await apiFetch(`${getApiUrl()}/api/preview/session/${encodeURIComponent(sessionId)}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          signal: controller.signal,
        })
        if (response.ok) {
          const { session } = await response.json()
          const url = session?.metrics?.url
          if (!cancelled && typeof url === 'string') {
            latestUrl.current = url
            if (!editing.current) setValue(url)
          }
        }
      } catch { /* Keep the last URL during a temporary disconnect. */ }
      finally { if (!cancelled) timer = setTimeout(load, 3000) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [sessionId, authToken])

  useEffect(() => {
    latestUrl.current = currentUrl ?? ''
    if (!editing.current) setValue(currentUrl ?? '')
  }, [currentUrl])

  const navigate = async (reload = false) => {
    if (busy || disabled || sharedWithAgent || (!reload && !value.trim())) return
    setBusy(true)
    setError('')
    try {
      const target = reload ? latestUrl.current : value.trim()
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(target) ? target : `https://${target}`)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Enter an HTTP or HTTPS URL.')
      const response = await apiFetch(`${getApiUrl()}/api/preview/${reload ? 'reload' : 'navigate'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify(reload ? { sessionId } : { sessionId, url: url.href }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Could not navigate.')
      latestUrl.current = data.session?.metrics?.url ?? url.href
      setValue(latestUrl.current)
      editing.current = false
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not navigate.')
    } finally { setBusy(false) }
  }

  return (
    <div className="shrink-0 border-b bg-muted/20 px-3 py-1.5">
      <form className="flex items-center gap-1.5" onSubmit={event => { event.preventDefault(); void navigate() }}>
        <input
          aria-label="Browser URL"
          aria-busy={busy}
          title={sharedWithAgent ? 'Take control to navigate' : 'Enter a URL and press Enter'}
          type="text"
          value={value}
          readOnly={sharedWithAgent}
          disabled={disabled || busy}
          spellCheck={false}
          autoComplete="off"
          placeholder="Enter a URL"
          className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-sm disabled:opacity-50"
          onFocus={() => { editing.current = !sharedWithAgent }}
          onBlur={() => { editing.current = false }}
          onChange={event => { setValue(event.target.value); setError('') }}
          onKeyDown={event => {
            if (event.key === 'Escape') { setValue(latestUrl.current); setError(''); event.currentTarget.blur() }
          }}
        />
        <button type="submit" aria-label="Go to URL" title={sharedWithAgent ? 'Take control to navigate' : 'Go to URL'}
          disabled={disabled || busy || sharedWithAgent || !value.trim()} className="h-8 rounded border px-2 hover:bg-muted disabled:opacity-50">
          <ArrowRight className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Refresh page" title={sharedWithAgent ? 'Take control to refresh' : 'Refresh page'}
          disabled={disabled || busy || sharedWithAgent} onClick={() => void navigate(true)}
          className="h-8 rounded border px-2 hover:bg-muted disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" aria-label="Browser tools" title="Browser tools" aria-expanded={toolsOpen}
          disabled={disabled} onClick={onToggleTools} className="flex h-8 items-center gap-1 rounded border px-2 hover:bg-muted disabled:opacity-50">
          <Wrench className="h-4 w-4" /><span className="hidden sm:inline">Tools</span>
        </button>
      </form>
      {error && <p role="alert" className="pt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
