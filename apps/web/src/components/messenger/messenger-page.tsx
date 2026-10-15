import { automaticReadAllowed } from '@/lib/messenger/notification-actions'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Bell, Link2, Loader2, LockKeyhole, LogOut, MessageCircle, Plus, Search, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Conversation } from '@/components/chat/conversation'
import { Message } from '@/components/chat/message'
import { PromptInput, type PromptInputHandle } from '@/components/chat/prompt-input'
import { ChatComposerSurface } from '@/components/chat/chat-composer-surface'
import { AttachmentList } from '@/components/chat/attachment-list'
import { useVoiceRecording } from '@/hooks/useVoiceRecording'
import type { SttProvider } from '@/hooks/useAuth'
import { appendTranscript } from '@/lib/transcript-merge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMessenger } from './messenger-provider'
import { MAX_ATTACHMENT_BYTES, messengerError, type MessengerMessage } from '@/lib/messenger/model'

const BRIDGES = [
  ['WhatsApp', 'whatsappbot'], ['Telegram', 'telegrambot'], ['Signal', 'signalbot'], ['Teams', 'teamsbot'],
] as const

function Attachment({ message }: { message: MessengerMessage }) {
  const { store } = useMessenger()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const objectUrl = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current) }
  }, [])
  if (!message.attachment) return null
  const attachment = message.attachment
  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const blob = await store.attachmentBlob(attachment)
      if (!mounted.current) return
      const url = URL.createObjectURL(blob)
      objectUrl.current = url
      setUrl(url)
    } catch { if (mounted.current) setError('Could not load attachment. It may be unavailable or exceed 20 MB.') }
    finally { if (mounted.current) setBusy(false) }
  }
  return <div className="mt-2 space-y-2">
    {url ? <AttachmentList attachments={[{ name: attachment.name, mimeType: attachment.image ? attachment.mime : 'application/octet-stream', data: '', preview: url }]} />
      : <Button size="sm" variant="outline" disabled={busy || !!attachment.size && attachment.size > MAX_ATTACHMENT_BYTES} onClick={() => void load()}>{busy ? 'Loading…' : (attachment.image ? 'Show image' : 'Load attachment')}</Button>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}

function ConnectionForm() {
  const { store, snapshot } = useMessenger()
  const [homeserver, setHomeserver] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [useToken, setUseToken] = useState(false)
  const busy = snapshot.status === 'connecting' || snapshot.status === 'syncing'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = { homeserver, username, password, accessToken: useToken ? token : undefined }
    setPassword('')
    setToken('')
    await store.connect(input)
  }
  return <div className="m-auto w-full max-w-lg space-y-6 p-5 sm:p-8">
    <div className="space-y-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="h-6 w-6" /></div>
      <h2 className="text-xl font-semibold">All your conversations, together</h2>
      <p className="text-sm text-muted-foreground">Connect a Matrix account to read and reply to your conversations here. Your server’s bridges bring in your other messaging accounts.</p>
    </div>
    <form className="space-y-4" onSubmit={event => void submit(event)}>
      <label className="block space-y-1.5 text-sm">Homeserver URL<Input type="url" placeholder="https://matrix.example.com" value={homeserver} onChange={event => setHomeserver(event.target.value)} required autoComplete="url" disabled={busy} /></label>
      {useToken ? <label className="block space-y-1.5 text-sm">Device access token<Input type="password" value={token} onChange={event => setToken(event.target.value)} required autoComplete="off" disabled={busy} /></label> : <>
        <label className="block space-y-1.5 text-sm">Matrix username<Input value={username} onChange={event => setUsername(event.target.value)} placeholder="@you:example.com" required autoComplete="username" disabled={busy} /></label>
        <label className="block space-y-1.5 text-sm">Matrix password<Input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" disabled={busy} /></label>
      </>}
      <Button type="submit" className="w-full gap-2" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Connecting…' : 'Connect Matrix'}</Button>
      <button type="button" className="text-xs text-muted-foreground underline" disabled={busy} onClick={() => { setUseToken(!useToken); setPassword(''); setToken('') }}>{useToken ? 'Use a password instead' : 'Use a device access token (SSO accounts)'}</button>
    </form>
    {snapshot.error && <p role="alert" className="text-sm text-destructive">{snapshot.error}</p>}
    {(busy || snapshot.error) && <Button variant="outline" size="sm" onClick={() => void store.disconnect().catch(() => {})}>{busy ? 'Cancel connection' : 'Clear saved connection'}</Button>}
    <p className="text-xs text-muted-foreground">Your password is never saved. The session stays in this browser tab; encryption keys stay in this browser. Messages are not sent to AI.</p>
    <details className="rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Need a Matrix server?</summary>
      <p className="mt-3 text-muted-foreground">Use an existing homeserver, or run Jait’s optional Synapse deployment. It runs separately and keeps working when Jait is closed.</p>
      <a className="mt-2 inline-block underline" href="https://github.com/Widev-e-U/Jait/blob/main/docs/messenger.md" target="_blank" rel="noreferrer">Self-hosting and bridge setup</a>
    </details>
  </div>
}

export default function MessengerPage({ token = null, sttProvider = 'whisper' }: { token?: string | null; sttProvider?: SttProvider }) {
  const { store, snapshot } = useMessenger()
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [service, setService] = useState('All')
  const [recipient, setRecipient] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [notice, setNotice] = useState('')
  const composerRef = useRef<PromptInputHandle>(null)
  const mobile = useIsMobile()
  const roomId = snapshot.selectedRoomId
  const room = snapshot.rooms.find(room => room.id === roomId)
  const draft = roomId ? drafts[roomId] ?? '' : ''
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const { voiceRecording, voiceTranscribing, voiceLevels, handleVoiceInput, stopRecordingAndTranscribe } = useVoiceRecording({
    token,
    activeSessionId: 'messenger-dictation',
    sttProvider,
    // Every recording supplies its own room-bound target below.
    setInputValue: () => {},
    onAuthRequired: () => setActionError('Sign in to Jait to use dictation.'),
  })
  const dictate = () => {
    if (!roomId || !ready || busy || voiceRecording || voiceTranscribing) return
    const target = roomId
    const session = snapshot.session
    void handleVoiceInput({ onTranscript: text => {
      if (!mounted.current || store.getSnapshot().session !== session) return
      setDrafts(current => ({ ...current, [target]: appendTranscript(current[target] ?? '', text) }))
    } })
  }
  const ready = snapshot.status === 'ready'
  const connected = !!snapshot.session
  const services = ['All', ...new Set(snapshot.rooms.map(room => room.service))]
  const rooms = snapshot.rooms.filter(room => (service === 'All' || room.service === service) && (room.name + ' ' + room.network).toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    const selectFromUrl = () => {
      const params = new URLSearchParams(window.location.search)
      if (params.get('action') === 'mark-read') return
      const id = params.get('roomId')
      if (id) store.selectRoom(id)
    }
    selectFromUrl()
    window.addEventListener('popstate', selectFromUrl)
    return () => window.removeEventListener('popstate', selectFromUrl)
  }, [store])

  useEffect(() => {
    store.setVisibleRoom(roomId)
    let cancelled = false
    const markRead = () => {
      void automaticReadAllowed().then(allowed => {
        if (!cancelled && allowed && document.visibilityState === 'visible' && document.hasFocus()) return store.markRead(roomId, undefined, true)
      }).catch(() => {})
    }
    markRead()
    window.addEventListener('focus', markRead)
    document.addEventListener('visibilitychange', markRead)
    return () => {
      cancelled = true
      store.setVisibleRoom(null)
      window.removeEventListener('focus', markRead)
      document.removeEventListener('visibilitychange', markRead)
    }
  }, [store, roomId, snapshot.messages.at(-1)?.id, ready])

  useEffect(() => {
    if (!snapshot.session) setDrafts({})
  }, [snapshot.session])
  const act = async (action: () => Promise<unknown>, errorText?: string) => {
    setBusy(true)
    setActionError('')
    setNotice('')
    try { await action() }
    catch (error) { setActionError(errorText ?? messengerError(error)) }
    finally { setBusy(false) }
  }
  const selectRoom = (id: string | null) => {
    store.selectRoom(id)
    setActionError('')
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('roomId', id)
    else url.searchParams.delete('roomId')
    window.history.replaceState(null, '', url.pathname + url.search)
  }
  const send = () => {
    if (!roomId || !draft.trim() || busy || !ready) return
    const target = roomId
    const text = draft
    const composer = composerRef.current
    void act(async () => {
      await store.send(target, text)
      composer?.reset()
      setDrafts(current => ({ ...current, [target]: current[target] === text ? '' : current[target] }))
    }, 'Message was not sent. Your draft has been kept; try again when connected.')
  }

  return <section aria-label="Messenger" className="flex h-full min-h-0 w-full flex-col bg-background">
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 items-center gap-2"><MessageCircle className="h-5 w-5 shrink-0 text-primary" /><h1 className="font-semibold">Messenger</h1><span role="status" className="truncate text-xs text-muted-foreground">{snapshot.status === 'ready' ? 'Connected' : snapshot.status === 'disconnected' ? 'Matrix' : snapshot.status}</span></div>
      {connected && <Button variant="ghost" size="sm" className="gap-2" onClick={() => setConnectionsOpen(!connectionsOpen)} aria-label="Connections" aria-expanded={connectionsOpen}><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Connections</span></Button>}
    </header>
    {connected && snapshot.error && <p role="alert" className="border-b bg-muted px-4 py-2 text-sm">{snapshot.error}</p>}
    {actionError && <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm text-destructive" role="alert">{actionError}<button aria-label="Dismiss error" onClick={() => setActionError('')}><X className="h-4 w-4" /></button></div>}
    {!connected ? <div className="flex min-h-0 flex-1 overflow-y-auto"><ConnectionForm /></div> : <>
      {connectionsOpen && <div className="max-h-[60vh] shrink-0 space-y-4 overflow-y-auto border-b bg-muted/20 p-4" aria-label="Messenger connections">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 text-sm"><p className="break-all font-medium">{snapshot.session?.userId}</p><p className="break-all text-xs text-muted-foreground">{snapshot.session?.homeserver} · Device {snapshot.session?.deviceId}</p></div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => store.enableNotifications(!snapshot.notifications), 'Allow notifications in your browser or device settings first.')}><Bell className="mr-2 h-4 w-4" />{snapshot.notifications ? 'Mute' : 'Notify'}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => store.disconnect(), 'Disconnected locally. If server sign-out failed, revoke the Jait device in your Matrix account.')}><LogOut className="mr-2 h-4 w-4" />Disconnect</Button>
          </div>
        </div>
        <div className="space-y-2"><h2 className="text-sm font-medium">Connect a messaging account</h2><p className="text-xs text-muted-foreground">Install a bridge on your homeserver, then open its setup conversation. Send “help” there to follow the bridge’s login steps. Bot IDs vary by server.</p>
          <div className="flex flex-wrap gap-2">{BRIDGES.map(([name, bot]) => <Button key={name} variant="outline" size="sm" onClick={() => setRecipient('@' + bot + ':' + snapshot.session!.userId.split(':').slice(1).join(':'))}>{name}</Button>)}</div>
          <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void act(async () => { const id = await store.openDirect(recipient.trim()); selectRoom(id); setRecipient(''); setConnectionsOpen(false) }) }}>
            <Input aria-label="Matrix user or bridge bot ID" placeholder="@whatsappbot:your.server" value={recipient} onChange={event => setRecipient(event.target.value)} required />
            <Button type="submit" disabled={!ready || busy || !recipient.trim()}><Link2 className="mr-2 h-4 w-4" />Open</Button>
          </form>
          <p className="text-xs text-muted-foreground">Teams tenant coverage depends on the installed bridge and each organization’s policies.</p>
        </div>
        <details className="text-sm"><summary className="cursor-pointer">Recover encrypted history</summary>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const key = recoveryKey; setRecoveryKey(''); void act(async () => { await store.restoreKeys(key); setNotice('Encryption keys restored.') }, 'Could not restore keys. Check the recovery key and that this account has a server key backup.') }}>
            <Input className="min-w-0 flex-1" aria-label="Matrix recovery key" type="password" value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)} placeholder="Matrix backup recovery key" autoComplete="off" required />
            <Button type="submit" disabled={!ready || busy}>Restore keys</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Use your Matrix message backup key. Device verification and cross-signing setup currently require another client such as Element.</p>
        </details>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <p className="text-xs text-muted-foreground">Notifications work while Jait is open. Calls and native service activity feeds are not supported.</p>
      </div>}
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Conversations" className={(roomId ? 'hidden md:flex ' : 'flex ') + 'w-full shrink-0 flex-col border-r md:w-72 lg:w-80'}>
          <div className="space-y-3 border-b p-3">
            <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Conversations <span className="text-muted-foreground">{snapshot.rooms.length}</span></h2><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="New conversation" onClick={() => setConnectionsOpen(true)}><Plus className="h-4 w-4" /></Button></div>
            <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={event => setSearch(event.target.value)} className="pl-8" /></div>
            <select aria-label="Filter by service" value={service} onChange={event => setService(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">{services.map(service => <option key={service}>{service}</option>)}</select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rooms.map(item => <div key={item.id} role="group" aria-label={'Conversation ' + item.name} className="group/room flex min-w-0 items-center border-b border-border/50"><button onClick={() => selectRoom(item.id)} aria-pressed={item.id === roomId} className={'flex min-w-0 flex-1 gap-3 p-3 text-left hover:bg-muted/60 ' + (item.id === roomId ? 'bg-secondary' : '')}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">{item.name.slice(0, 2).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{item.name}</span>{(item.unread > 0 || item.markedUnread) && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{item.unread || <span aria-label="Unread">•</span>}</span>}</span><span className="block truncate text-2xs text-muted-foreground">{item.service}{item.network ? ' · ' + item.network : ''}{item.membership === 'invite' ? ' · Invitation' : ''}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.preview}</span></span>
            </button><Button variant="ghost" size="sm" className="mr-1 h-8 shrink-0 px-2 text-2xs" disabled={!ready || busy || item.membership !== 'join'} aria-label={`Mark as ${item.unread > 0 || item.markedUnread ? 'read' : 'unread'}`} onClick={() => void act(async () => {
              if (item.unread > 0 || item.markedUnread) await store.markRead(item.id)
              else { await store.markUnread(item.id); if (roomId === item.id) selectRoom(null) }
            })}>{item.unread > 0 || item.markedUnread ? 'Read' : 'Unread'}</Button></div>)}
            {rooms.length === 0 && <div className="space-y-2 p-5 text-sm text-muted-foreground"><p>{snapshot.rooms.length ? 'No matching conversations.' : 'Your conversations will appear here as Matrix syncs.'}</p>{!snapshot.rooms.length && <Button variant="outline" size="sm" onClick={() => setConnectionsOpen(true)}>Connect a bridge</Button>}</div>}
          </div>
        </aside>
        <main onPointerDown={() => { if (roomId && document.hasFocus()) void store.markRead(roomId).catch(() => {}) }} onKeyDown={() => { if (roomId && document.hasFocus()) void store.markRead(roomId).catch(() => {}) }} className={(roomId ? 'flex ' : 'hidden md:flex ') + 'min-h-0 min-w-0 flex-1 flex-col'}>
          {!room ? <div className="m-auto max-w-sm space-y-2 p-6 text-center text-muted-foreground"><MessageCircle className="mx-auto h-10 w-10 text-primary/60" /><h2 className="font-medium text-foreground">Your personal inbox</h2><p className="text-sm">{roomId ? 'Waiting for this conversation to sync. Use Back to choose another.' : 'Choose a conversation to read and reply as yourself.'}</p>{roomId && <Button variant="outline" size="sm" onClick={() => selectRoom(null)}>Back to conversations</Button>}</div> : <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3"><Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => selectRoom(null)} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{room.name}</h2><p className="truncate text-xs text-muted-foreground">{room.service}{room.network ? ' · ' + room.network : ''}</p></div>{room.membership === 'join' && <Button variant="ghost" size="sm" disabled={!ready || busy} aria-label={room.markedUnread ? 'Mark as read' : 'Mark as unread'} onClick={() => void act(async () => {
              if (room.markedUnread) await store.markRead(room.id)
              else { await store.markUnread(room.id); selectRoom(null) }
            })}>{room.markedUnread ? 'Mark as read' : 'Mark as unread'}</Button>}{room.encrypted && <span title="Encrypted Matrix room"><LockKeyhole className="h-4 w-4 text-muted-foreground" aria-label="Encrypted room" /></span>}</div>
            {room.membership === 'invite' ? <div className="m-auto space-y-4 p-6 text-center"><p>You have been invited to this conversation.</p><div className="flex justify-center gap-2"><Button disabled={!ready || busy} onClick={() => void act(() => store.join(room.id))}>Accept invitation</Button><Button variant="outline" disabled={!ready || busy} onClick={() => void act(() => store.leave(room.id))}>Decline</Button></div></div> : <>
              <Conversation
                key={room.id}
                variant="messenger"
                mobile={mobile}
                messageContents={snapshot.messages.map(message => message.body)}
                messageEstimateInputs={snapshot.messages.map(message => ({ content: message.body, role: message.own ? 'user' : 'assistant' }))}
                hasMore={ready && snapshot.messages.length > 0}
                onLoadMore={() => { if (!busy) void act(() => store.loadEarlier()) }}
              >
                {snapshot.messages.map(message => <Message
                  key={message.id}
                  messageId={message.id}
                  role={message.own ? 'user' : 'assistant'}
                  content={message.body}
                  messenger={{
                    sender: message.own ? 'You' : message.sender,
                    timestamp: message.timestamp,
                    pending: message.pending,
                    failed: message.failed,
                    readBy: message.readBy,
                    unableToDecrypt: message.unableToDecrypt,
                    attachment: <Attachment message={message} />,
                  }}
                />)}
              </Conversation>
              <ChatComposerSurface className="shrink-0 px-3 pb-3">
                <div className="mx-auto max-w-4xl">
                  <PromptInput
                    key={room.id}
                    ref={composerRef}
                    variant="messenger"
                    value={draft}
                    onChange={value => setDrafts(current => ({ ...current, [room.id]: value }))}
                    onSubmit={send}
                    clearOnSubmit={false}
                    disabled={!ready || busy}
                    submitLoading={busy}
                    placeholder="Write a message…"
                    onVoiceInput={dictate}
                    onVoiceStop={() => void stopRecordingAndTranscribe()}
                    voiceRecording={voiceRecording}
                    voiceTranscribing={voiceTranscribing}
                    voiceLevels={voiceLevels}
                    onFilesSelected={files => {
                      if (!ready || busy) return
                      void act(async () => {
                        if (files.some(file => file.size > MAX_ATTACHMENT_BYTES)) throw new Error('Attachment exceeds 20 MB.')
                        for (const file of files) await store.sendAttachment(room.id, file)
                      }, 'Could not send attachment. Check the connection and the 20 MB size limit.')
                    }}
                  />
                </div>
              </ChatComposerSurface>
            </>}
          </>}
        </main>
      </div>
    </>}
  </section>
}
