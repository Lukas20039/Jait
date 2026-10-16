import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { emailApi } from '@/lib/email-api'
import { EmailContent } from './email-content'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown) { return typeof value === 'string' ? value : '' }

export function EmailToolView({ data, args }: { data?: Record<string, unknown>; args: Record<string, unknown> }) {
  const root = record(data)
  const nested = record(root.message)
  const message = Object.keys(nested).length ? nested : root
  const [loaded, setLoaded] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const accountId = text(root.accountId) || text(record(root.account).id) || text(args.accountId)
  const id = text(message.id) || text(args.messageId) || text(args.id)
  const hasBody = typeof message.bodyHtml === 'string' || typeof message.bodyText === 'string'
  useEffect(() => {
    let cancelled = false
    setLoaded(null); setError('')
    if (hasBody || !id || !accountId) return
    void emailApi.getMessage(id, accountId).then(result => { if (!cancelled) setLoaded({ ...result }) }).catch(() => { if (!cancelled) setError('Email unavailable. This account may have been disconnected.') })
    return () => { cancelled = true }
  }, [id, accountId, hasBody])
  const shown = hasBody ? message : loaded
  if (!shown) return <div className="rounded-xl border p-4 text-sm text-muted-foreground" role="status">{error || (accountId && id ? 'Loading email…' : 'Email content unavailable.')}</div>
  return (
    <article className="my-2 min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Email preview">
      <header className="space-y-1 border-b p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-4 w-4" />Email</div>
        <h3 className="break-words text-base font-semibold">{text(shown.subject) || '(no subject)'}</h3>
        <p className="break-words text-xs"><span className="text-muted-foreground">From: </span>{text(shown.from)}</p>
        {text(shown.to) && <p className="break-words text-xs"><span className="text-muted-foreground">To: </span>{text(shown.to)}</p>}
        {text(shown.date) && <p className="text-xs text-muted-foreground">{text(shown.date)}</p>}
      </header>
      <div className="p-3"><EmailContent key={accountId + id} accountId={accountId || undefined} bodyHtml={text(shown.bodyHtml)} bodyText={text(shown.bodyText) || text(shown.body)} /></div>
    </article>
  )
}
