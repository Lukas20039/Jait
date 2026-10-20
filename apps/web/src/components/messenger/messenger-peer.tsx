import { useEffect, useState } from 'react'
import type { MessengerPresence } from '@/lib/messenger/model'
import { useMessenger } from './messenger-provider'

/** Initials keep the header stable while the image loads, or when no avatar exists. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return (words[0]!.slice(0, 2) || '?').toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

const DOT: Record<MessengerPresence, string> = {
  online: 'bg-emerald-500',
  unavailable: 'bg-amber-500',
  offline: 'bg-muted-foreground/50',
  unknown: '',
}

/**
 * Peer avatar with a presence dot, fed by `rooms[].peer` in the snapshot.
 * The image is a Matrix `mxc://` URI, so it is loaded as a blob through the
 * store (gateway media route) exactly like an attachment.
 */
export function MessengerPeerAvatar({ name, mxcUrl, presence = 'unknown' }: {
  name: string
  mxcUrl?: string
  presence?: MessengerPresence
}) {
  const { store } = useMessenger()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    setUrl(undefined)
    if (!mxcUrl) return
    let cancelled = false
    let objectUrl: string | undefined
    void store.avatarBlob(mxcUrl).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => {}) // A missing avatar is cosmetic; the initials stay.
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [store, mxcUrl])
  return <span
    data-presence={presence}
    aria-hidden
    className="relative flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-visible rounded-full bg-primary/10 text-xs font-semibold text-primary"
  >
    {url
      ? <img src={url} alt="" className="h-9 w-9 rounded-full object-cover" />
      : <span className="truncate px-1">{initials(name)}</span>}
    {presence !== 'unknown' && <span
      data-presence-dot={presence}
      title={presence === 'online' ? 'Online' : presence === 'unavailable' ? 'Away' : 'Offline'}
      className={'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ' + DOT[presence]}
    />}
  </span>
}
