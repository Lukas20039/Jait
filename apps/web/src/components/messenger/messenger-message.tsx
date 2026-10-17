import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MessageReadStatus } from '@/components/chat/message-read-status'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage } from '@/lib/messenger/model'
import { useMessenger } from './messenger-provider'

function MessengerAttachment({ attachment }: { attachment: NonNullable<MessengerMessage['attachment']> }) {
  const { store } = useMessenger()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const tooLarge = !!attachment.size && attachment.size > MAX_ATTACHMENT_BYTES
  useEffect(() => {
    if (!container.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (tooLarge || !(attempt > 0 || attachment.image && visible)) return
    let cancelled = false
    let objectUrl: string | undefined
    setBusy(true); setError('')
    void store.attachmentBlob(attachment).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => { if (!cancelled) setError('Could not load attachment. Try again.') })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [store, attachment.url, attachment.image, tooLarge, visible, attempt]) // Snapshot objects change every poll; media identity does not.
  return <div ref={container} className="mt-2 max-w-full">
    {url ? attachment.image ? <>
      <button type="button" aria-label={'Open image ' + attachment.name} onClick={() => setExpanded(true)} className="block max-w-full overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-primary">
        <img src={url} alt={attachment.name} className="max-h-80 max-w-full object-contain" />
      </button>
      <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="max-w-4xl"><DialogTitle className="truncate">{attachment.name}</DialogTitle><img src={url} alt={attachment.name} className="max-h-[75vh] w-full object-contain" /><a href={url} download={attachment.name} className="text-sm underline">Download image</a></DialogContent></Dialog>
    </> : <a href={url} download={attachment.name} className="break-all text-sm underline">Download {attachment.name}</a>
      : <div className={attachment.image ? 'flex min-h-28 min-w-32 items-center justify-center rounded-lg bg-background/40 p-3' : ''}>
        {busy ? <span role="status" className="text-xs text-muted-foreground">Loading {attachment.image ? 'image' : 'attachment'}…</span>
          : <Button size="sm" variant="outline" disabled={tooLarge} onClick={() => setAttempt(n => n + 1)}>{tooLarge ? 'Attachment exceeds 20 MB' : error ? 'Retry attachment' : attachment.image ? 'Load image' : 'Load attachment'}</Button>}
      </div>}
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>
}

export function MessengerBubble({ message, roomId, disabled }: { message: MessengerMessage; messageId?: string; roomId: string; disabled: boolean }) {
  const { store } = useMessenger()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() }
    catch { setError('Could not update this message. Please try again.') }
    finally { setBusy(false) }
  }
  const unavailable = disabled || busy || message.pending || message.failed || message.unableToDecrypt
  return <article data-message-id={message.id} aria-label={(message.own ? 'Your message' : 'Message from ' + message.sender)} className={'mb-3 flex min-w-0 ' + (message.own ? 'justify-end' : 'justify-start')}>
    <div data-messenger-bubble className={'min-w-0 max-w-[92%] rounded-2xl border px-3 py-2 shadow-sm sm:max-w-[80%] ' + (message.own ? 'rounded-br-sm border-primary/20 bg-primary/15' : 'rounded-bl-sm border-border bg-muted')}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="truncate text-xs font-medium">{message.own ? 'You' : message.sender}</span>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" disabled={unavailable || !store.react} aria-label="React to message" className="rounded p-1 text-muted-foreground hover:bg-background/60 disabled:opacity-40"><Smile className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-0">{['👍', '❤️', '😂', '😮', '😢', '🙏', '👎', '🔥', '🎉'].map(key => <DropdownMenuItem key={key} aria-label={key} onSelect={() => void run(() => store.react!(roomId, message.id, key))}>{key}</DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><button type="button" disabled={unavailable} aria-label="Message options" className="rounded p-1 text-muted-foreground hover:bg-background/60 disabled:opacity-40"><MoreHorizontal className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</DropdownMenuItem>
              {store.edit && message.own && !message.attachment && <DropdownMenuItem onSelect={() => { setText(message.body); setEditing(true) }}>Edit message</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (text.trim()) void run(async () => { await store.edit!(roomId, message.id, text); setEditing(false) }) }}>
        <textarea autoFocus aria-label="Edit message" className="min-h-24 w-full min-w-40 resize-y rounded-md border bg-background p-2 text-sm" maxLength={10000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) setEditing(false) }} />
        <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy || !text.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
      </form> : <p className={'whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere] ' + (message.unableToDecrypt ? 'italic text-muted-foreground' : '')}>{message.body}</p>}
      {message.attachment && <MessengerAttachment key={message.attachment.url} attachment={message.attachment} />}
      {!!message.reactions?.length && <div className="mt-2 flex flex-wrap gap-1">{message.reactions.map(reaction => <button key={reaction.key} type="button" disabled={unavailable || !store.react} aria-pressed={reaction.own} title={reaction.senders.join(', ')} onClick={() => void run(() => store.react!(roomId, message.id, reaction.key))} className={'rounded-full border px-2 py-0.5 text-xs ' + (reaction.own ? 'border-primary bg-primary/20' : 'border-border bg-background/70')}>{reaction.key} {reaction.count}</button>)}</div>}
      <div className="mt-1 flex items-center justify-end gap-2 text-2xs text-muted-foreground">
        {message.edited && <span>Edited</span>}
        <time title={new Date(message.timestamp).toLocaleString()} dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        {message.pending && <span>Sending…</span>}{message.failed && <span className="text-destructive">Not sent</span>}
      </div>
      {message.own && !message.pending && !message.failed && <MessageReadStatus readers={message.readBy ?? []} />}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  </article>
}
