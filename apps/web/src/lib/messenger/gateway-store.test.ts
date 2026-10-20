import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MessengerMessage, MessengerSnapshot } from './model'

vi.mock('@/lib/gateway-url', () => ({ getApiUrl: () => 'http://gateway.test:8000' }))
vi.mock('@/lib/auth-token', () => ({ getAuthToken: () => 'token' }))
vi.mock('@/lib/system-notifications', () => ({ triggerSystemNotification: vi.fn(async () => {}) }))

const { GatewayMessengerStore } = await import('./gateway-store')

const ROOM_ID = '!room:test'

function message(overrides: Partial<MessengerMessage> = {}): MessengerMessage {
  return {
    id: '$old',
    sender: '@them:test',
    body: 'earlier',
    timestamp: 1_000,
    own: false,
    encrypted: false,
    unableToDecrypt: false,
    pending: false,
    failed: false,
    ...overrides,
  }
}

function snapshot(messages: MessengerMessage[]): MessengerSnapshot {
  return {
    status: 'connected',
    error: null,
    session: { homeserver: 'https://matrix.test', userId: '@me:test', deviceId: 'DEVICE', accessToken: 'secret', cryptoStore: 'memory' },
    rooms: [{ id: ROOM_ID, name: 'Room', service: 'Matrix', network: 'Matrix', unread: 0, membership: 'join', encrypted: false, timestamp: 1_000, preview: 'earlier' }],
    messages,
    selectedRoomId: ROOM_ID,
    notifications: false,
    assistantAccess: false,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Send = { url: string; body: Record<string, unknown> | undefined }

/** Serves the gateway API from an in-memory timeline so sends land in the next poll. */
function installGateway(initial: MessengerMessage[]) {
  const timeline = [...initial]
  const sends: Send[] = []
  let held: Array<(response: Response) => void> = []
  let holdSends = false
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
    sends.push({ url: String(input), body })
    if (body?.action === 'send') {
      if (holdSends) return new Promise<Response>(resolve => held.push(resolve))
      timeline.push(message({ id: '$sent', body: String(body.text), timestamp: 2_000, own: true, sender: '@me:test' }))
      return json({ ok: true, eventId: '$sent' })
    }
    return json({ snapshot: snapshot(timeline) })
  }))
  return {
    sends,
    hold(next = true) { holdSends = next },
    release(response: Response) { held.shift()?.(response); held = held.slice(1) },
  }
}

async function openStore(initial: MessengerMessage[]) {
  const gateway = installGateway(initial)
  const store = new GatewayMessengerStore('owner')
  await store.resume()
  store.selectRoom(ROOM_ID)
  await vi.waitFor(() => expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(initial.map(entry => entry.id)))
  return { gateway, store }
}

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllGlobals() })

it('shows an outgoing message as pending before the gateway answers', async () => {
  const { gateway, store } = await openStore([message()])
  expect(store.getSnapshot().messages).toHaveLength(1)

  gateway.hold()
  const sending = store.send(ROOM_ID, 'hello there')

  const optimistic = store.getSnapshot().messages.at(-1)!
  expect(optimistic).toMatchObject({ body: 'hello there', own: true, pending: true, failed: false })
  expect(optimistic.id.startsWith('~local:')).toBe(true)
  expect(store.getSnapshot().messages).toHaveLength(2)

  gateway.release(json({ ok: true, eventId: '$sent' }))
  await sending

  const confirmed = store.getSnapshot().messages
  expect(confirmed.map(entry => entry.id)).toEqual(['$old', '$sent'])
  expect(confirmed.at(-1)).toMatchObject({ pending: false, body: 'hello there' })
})

it('reconciles the local echo with the polled event instead of duplicating it', async () => {
  const { gateway, store } = await openStore([message()])

  await store.send(ROOM_ID, 'hello there')
  await vi.waitFor(() => expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(['$old', '$sent']))
  expect(store.getSnapshot().messages.filter(entry => entry.body === 'hello there')).toHaveLength(1)
  expect(gateway.sends.some(send => send.body?.action === 'send')).toBe(true)
})

it('drops the local echo and reports the failure when sending fails', async () => {
  const { gateway, store } = await openStore([message()])

  gateway.hold()
  const sending = store.send(ROOM_ID, 'doomed')
  expect(store.getSnapshot().messages).toHaveLength(2)

  gateway.release(json({ error: 'nope' }, 500))
  await expect(sending).rejects.toThrow()
  expect(store.getSnapshot().messages.map(entry => entry.id)).toEqual(['$old'])
})

it('never uses a local echo id when marking the room read', async () => {
  const { gateway, store } = await openStore([message()])

  gateway.hold()
  const sending = store.send(ROOM_ID, 'hello')
  await store.markRead(ROOM_ID)
  gateway.release(json({ ok: true, eventId: '$sent' }))
  await sending

  const reads = gateway.sends.filter(send => send.body?.action === 'read')
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every(read => !String(read.body?.eventId ?? '').startsWith('~local:'))).toBe(true)
})
