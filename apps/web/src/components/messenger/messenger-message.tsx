import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MessageReadStatus } from '@/components/chat/message-read-status'
import { MAX_ATTACHMENT_BYTES, type MessengerMessage } from '@/lib/messenger/model'
import { EmojiPickerDialog, QUICK_REACTIONS } from './messenger-emoji-picker'
import { useMessenger } from './messenger-provider'

export function MessengerAttachment({ attachment }: { attachment: NonNullable<MessengerMessage['attachment']> }) {
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
  return <div ref={container} className="mt-1 max-w-full">
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

const LONG_PRESS_MS = 420

/** WhatsApp Web shows these on hover; phones open the same bar on long press. */
function ReactionBar({ open, onPick, onSearch, disabled, align }: {
  open: boolean
  onPick: (emoji: string) => void
  onSearch: () => void
  disabled: boolean
  align: 'left' | 'right'
}) {
  return <div
    data-reaction-bar
    data-open={open ? 'true' : 'false'}
    className={(align === 'right' ? 'right-0 ' : 'left-0 ') +
      'absolute -top-4 z-20 flex items-center gap-0.5 rounded-full border bg-popover px-1 py-0.5 shadow-sm transition-opacity duration-150 ' +
      (open
        ? 'opacity-100'
        : 'pointer-events-none opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100')}
  >
    {QUICK_REACTIONS.map(emoji => <button
      key={emoji} type="button" disabled={disabled} aria-label={'React with ' + emoji}
      onClick={() => onPick(emoji)}
      className="grid h-7 w-7 place-items-center rounded-full text-base leading-none transition hover:scale-110 hover:bg-muted disabled:opacity-40"
    >{emoji}</button>)}
    <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
    <button
      type="button" disabled={disabled} aria-label="React to message" title="Search emoji"
      onClick={onSearch}
      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-40"
    ><Search className="h-3.5 w-3.5" /></button>
  </div>
}

export function MessengerBubble({ message, roomId, disabled, variant = 'chat' }: { message: MessengerMessage; messageId?: string; roomId: string; disabled: boolean; variant?: 'chat' | 'channel' }) {
  const channel = variant === 'channel'
  const { store } = useMessenger()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pressed, setPressed] = useState(false)
  const longPress = useRef<number | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const root = useRef<HTMLElement>(null)
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() }
    catch { setError('Could not update this message. Please try again.') }
    finally { setBusy(false); setPressed(false) }
  }
  const unavailable = disabled || busy || message.pending || message.failed || message.unableToDecrypt
  const react = (emoji: string) => { if (store.react) void run(() => store.react!(roomId, message.id, emoji)) }

  const clearLongPress = () => {
    if (longPress.current !== null) { window.clearTimeout(longPress.current); longPress.current = null }
    touchStart.current = null
  }
  useEffect(() => clearLongPress, [])
  useEffect(() => {
    if (!pressed) return
    const dismiss = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return
      setPressed(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPressed(false) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [pressed])

  return <article
    ref={root}
    data-message-id={message.id}
    aria-label={(message.own ? 'Your message' : 'Message from ' + message.sender)}
    className={'group/message flex min-w-0 [-webkit-touch-callout:none] ' + (!channel && message.own ? 'justify-end' : 'justify-start')}
    onPointerDown={event => {
      if (event.pointerType === 'mouse') return
      touchStart.current = { x: event.clientX, y: event.clientY }
      clearLongPress()
      longPress.current = window.setTimeout(() => setPressed(true), LONG_PRESS_MS)
    }}
    onPointerMove={event => {
      const start = touchStart.current
      if (!start) return
      if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) clearLongPress()
    }}
    onPointerUp={clearLongPress}
    onPointerCancel={() => { clearLongPress(); setPressed(false) }}
    onContextMenu={event => { if (pressed) event.preventDefault() }}
  >
    <div className={'relative min-w-0 ' + (channel ? 'max-w-[92%] sm:max-w-[86%]' : 'max-w-[88%] sm:max-w-[74%]')}>
      <div
        data-messenger-bubble
        data-message-style={variant}
        className={'min-w-0 px-2.5 py-1.5 transition-colors ' +
          (channel
            ? 'rounded-lg border ' + (message.own ? 'border-primary/15 bg-primary/10' : 'border-transparent hover:bg-muted/40')
            : 'rounded-xl border shadow-sm ' + (message.own ? 'rounded-tr-sm border-primary/20 bg-primary/10' : 'rounded-tl-sm border-border bg-muted'))}
      >
        {(!message.own || channel) && <p className="mb-0.5 truncate text-[11px] font-semibold leading-4 text-primary">{message.sender}</p>}
        {editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (text.trim()) void run(async () => { await store.edit!(roomId, message.id, text); setEditing(false) }) }}>
          <textarea autoFocus aria-label="Edit message" className="min-h-24 w-full min-w-40 resize-y rounded-md border bg-background p-2 text-sm" maxLength={10000} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !busy) setEditing(false) }} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy || !text.trim()}>Save</Button><Button size="sm" variant="ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
        </form> : <p className={'whitespace-pre-wrap break-words text-sm leading-[1.35] [overflow-wrap:anywhere] ' + (message.unableToDecrypt ? 'italic text-muted-foreground' : '')}>{message.body}</p>}
        {message.attachment && <MessengerAttachment key={message.attachment.url} attachment={message.attachment} />}
        <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-[10px] leading-4 text-muted-foreground">
          {!!message.reactions?.length && <span className="mr-auto flex flex-wrap items-center gap-1">{message.reactions.map(reaction => <button key={reaction.key} type="button" disabled={unavailable || !store.react} aria-pressed={reaction.own} title={reaction.senders.join(', ')} onClick={() => react(reaction.key)} className={'flex items-center gap-0.5 rounded-full border px-1 py-0 text-[11px] leading-4 text-foreground ' + (reaction.own ? 'border-primary/60 bg-primary/20' : 'border-border bg-background/70')}>{reaction.key} {reaction.count}</button>)}</span>}
          {message.edited && <span>Edited</span>}
          {message.pending && <span>Sending…</span>}{message.failed && <span className="text-destructive">Not sent</span>}
          <time title={new Date(message.timestamp).toLocaleString()} dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          {message.own && !message.pending && !message.failed && <MessageReadStatus inline readers={message.readBy ?? []} />}
          <DropdownMenu><DropdownMenuTrigger asChild>
            <button type="button" disabled={unavailable} aria-label="Message options" className="-mr-1 mt-px rounded p-0.5 text-muted-foreground/70 transition hover:bg-background/60 hover:text-muted-foreground disabled:opacity-40"><ChevronDown className="h-3.5 w-3.5" /></button>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void run(() => navigator.clipboard.writeText(message.body))}>Copy text</DropdownMenuItem>
              {store.react && <DropdownMenuItem onSelect={() => setPickerOpen(true)}><Smile className="mr-2 h-4 w-4" />React…</DropdownMenuItem>}
              {store.edit && message.own && !message.attachment && <DropdownMenuItem onSelect={() => { setText(message.body); setEditing(true) }}>Edit message</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      {store.react && <ReactionBar
        open={pressed} disabled={disabled || busy} align={message.own ? 'right' : 'left'}
        onPick={react} onSearch={() => { setPressed(false); setPickerOpen(true) }}
      />}
      <EmojiPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={react} />
    </div>
  </article>
}
