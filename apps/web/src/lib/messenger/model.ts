export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export interface MessengerSession {
  homeserver: string
  userId: string
  deviceId: string
  accessToken: string
  cryptoStore: string
}

export interface MessengerReadReceipt {
  userId: string
  name: string
  timestamp: number | null
  /** False means this is a later read watermark, not the exact first-read time. */
  exact: boolean
}

export interface MessengerMessage {
  id: string
  sender: string
  body: string
  timestamp: number
  own: boolean
  encrypted: boolean
  unableToDecrypt: boolean
  pending: boolean
  failed: boolean
  readBy?: MessengerReadReceipt[]
  attachment?: {
    url: string
    name: string
    mime: string
    image: boolean
    size?: number
    file?: Record<string, unknown>
  }
}

export interface MessengerRoom {
  id: string
  name: string
  service: string
  network: string
  unread: number
  markedUnread?: boolean
  membership: string
  encrypted: boolean
  timestamp: number
  preview: string
}

export interface MessengerSnapshot {
  status: 'disconnected' | 'connecting' | 'syncing' | 'ready' | 'reconnecting' | 'error'
  error: string | null
  session: Pick<MessengerSession, 'homeserver' | 'userId' | 'deviceId'> | null
  rooms: MessengerRoom[]
  selectedRoomId: string | null
  messages: MessengerMessage[]
  notifications: boolean
}

export function normalizeHomeserver(input: string): string {
  const url = new URL(input.trim())
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS for your homeserver, or HTTP on localhost.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Enter a homeserver URL without credentials, query parameters, or fragments.')
  }
  return url.href.replace(/\/+$/, '')
}

export function sessionKey(owner: string): string {
  return 'jait.messenger.session.' + encodeURIComponent(owner)
}

export function readSession(storage: Pick<Storage, 'getItem' | 'removeItem'>, owner: string): MessengerSession | null {
  const key = sessionKey(owner)
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null')
    if (!value) return null
    if (['homeserver', 'userId', 'deviceId', 'accessToken', 'cryptoStore'].some(k => typeof value[k] !== 'string' || !value[k])) {
      throw new Error('Invalid session')
    }
    value.homeserver = normalizeHomeserver(value.homeserver)
    return value as MessengerSession
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function messengerError(error: unknown): string {
  const code = (error as { errcode?: string })?.errcode
  if (code === 'M_FORBIDDEN') return 'Sign-in or access was denied. Check your credentials and server permissions.'
  if (code === 'M_UNKNOWN_TOKEN' || code === 'M_MISSING_TOKEN') return 'Your Matrix session expired. Disconnect and sign in again.'
  if (code === 'M_LIMIT_EXCEEDED') return 'Your homeserver is rate limiting requests. Wait a moment and try again.'
  // Server messages and request URLs can contain secrets. Do not surface raw SDK errors.
  return 'Matrix could not complete the request. Check the homeserver address, connection, and account permissions.'
}

export function bridgeLabel(content: Record<string, unknown> | undefined): { service: string; network: string } {
  const protocol = content?.protocol as { id?: unknown; displayname?: unknown } | undefined
  const network = content?.network as { displayname?: unknown } | undefined
  const raw = String(protocol?.id ?? '').toLowerCase()
  const known: Record<string, string> = {
    whatsapp: 'WhatsApp', telegram: 'Telegram', signal: 'Signal',
    'microsoft-teams': 'Teams', msteams: 'Teams', teams: 'Teams',
    discord: 'Discord', slack: 'Slack', googlechat: 'Google Chat',
  }
  return {
    service: known[raw] ?? (typeof protocol?.displayname === 'string' ? protocol.displayname.slice(0, 80) : 'Matrix'),
    network: typeof network?.displayname === 'string' ? network.displayname.slice(0, 120) : '',
  }
}
