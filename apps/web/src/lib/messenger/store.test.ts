import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { MessengerStore } from './store'
import { sessionKey, type MessengerSession } from './model'

const mock = vi.hoisted(() => ({ createClient: vi.fn(), notify: vi.fn(), failCrypto: false }))
vi.mock('@/lib/system-notifications', () => ({ triggerSystemNotification: mock.notify }))
vi.mock('./crypto', () => ({ initializeCrypto: (client: Client) => client.initRustCrypto() }))
vi.mock('matrix-js-sdk', () => ({
  createClient: mock.createClient,
  ClientEvent: { Sync: 'sync', Room: 'Room' },
  SyncState: { Prepared: 'PREPARED', Syncing: 'SYNCING', Error: 'ERROR', Reconnecting: 'RECONNECTING' },
  RoomEvent: { Timeline: 'timeline', Name: 'name', MyMembership: 'membership', Receipt: 'receipt', LocalEchoUpdated: 'echo' },
  MatrixEventEvent: { Decrypted: 'decrypted' },
  Preset: { TrustedPrivateChat: 'trusted_private_chat' },
}))

class Client extends EventEmitter {
  login = vi.fn(async () => ({ user_id: '@alice:matrix.test', device_id: 'A', access_token: 'private-token' }))
  whoami = vi.fn(async () => ({ user_id: '@alice:matrix.test', device_id: 'A' }))
  initRustCrypto = vi.fn(async () => { if (mock.failCrypto) throw new Error('private-token') })
  startClient = vi.fn(async () => { this.emit('sync', 'PREPARED'); this.emit('sync', 'SYNCING') })
  stopClient = vi.fn()
  logout = vi.fn(async () => ({}))
  getRooms = vi.fn(() => [])
  getRoom = vi.fn(() => null)
  sendTextMessage = vi.fn(async () => ({}))
  createRoom = vi.fn(async () => ({ room_id: '!new:matrix.test' }))
  getPushActionsForEvent = vi.fn(() => ({ notify: true }))
  mxcUrlToHttp = vi.fn(() => 'https://matrix.test/_matrix/client/v1/media/download/matrix.test/file')
}

function storage() {
  const values = new Map<string, string>()
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) }, removeItem: (k: string) => { values.delete(k) }, clear: () => values.clear(), key: () => null, get length() { return values.size } } satisfies Storage
}

const session: MessengerSession = { homeserver: 'https://matrix.test', userId: '@alice:matrix.test', deviceId: 'A', accessToken: 'private-token', cryptoStore: 'isolated-keys' }
let clients: Client[]
let stores: MessengerStore[]
const makeStore = () => {
  const data = storage()
  const store = new MessengerStore('gateway|alice', data)
  stores.push(store)
  return { store, data }
}

beforeEach(() => {
  vi.clearAllMocks()
  clients = []
  stores = []
  mock.failCrypto = false
  mock.notify.mockResolvedValue(undefined)
  mock.createClient.mockImplementation(() => { const client = new Client(); clients.push(client); return client })
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _opts, callback) => callback({})) } })
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { visibilityState: 'hidden', hasFocus: () => false })
})
afterEach(() => { stores.forEach(store => store.dispose()); vi.unstubAllGlobals() })

const input = { homeserver: 'https://matrix.test', username: 'alice', password: 'private-password' }

describe('personal Matrix client lifecycle', () => {
  it('initializes crypto before sync, stores no password, and revokes on disconnect', async () => {
    const { store, data } = makeStore()
    await store.connect(input)
    const client = clients.at(-1)!
    expect(client.initRustCrypto.mock.invocationCallOrder[0]).toBeLessThan(client.startClient.mock.invocationCallOrder[0])
    expect(store.getSnapshot().status).toBe('ready')
    expect(data.getItem(sessionKey('gateway|alice'))).not.toContain('private-password')
    expect(JSON.stringify(store.getSnapshot())).not.toContain('private-token')
    await store.disconnect()
    expect(client.stopClient).toHaveBeenCalled()
    expect(client.logout).toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().messages).toEqual([])
  })

  it('fails closed when encryption initialization fails', async () => {
    const { store, data } = makeStore()
    mock.failCrypto = true
    await store.connect(input)
    expect(store.getSnapshot().status).toBe('error')
    expect(clients.at(-1)!.startClient).not.toHaveBeenCalled()
    expect(clients[0].logout).toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().error).not.toContain('private-token')
    await expect(store.send('room', 'hello')).rejects.toThrow()
  })

  it('cancels an in-flight login and revokes the newly issued device', async () => {
    const { store, data } = makeStore()
    let finish: (() => void) | undefined
    const client = new Client()
    client.login.mockImplementation(async () => { await new Promise<void>(resolve => { finish = resolve }); return { user_id: session.userId, device_id: 'A', access_token: 'private-token' } })
    mock.createClient.mockReturnValueOnce(client)
    const connection = store.connect(input)
    await vi.waitFor(() => expect(finish).toBeDefined())
    store.dispose()
    finish!()
    await connection
    expect(client.logout).toHaveBeenCalled()
    expect(client.startClient).not.toHaveBeenCalled()
    expect(data.length).toBe(0)
    expect(store.getSnapshot().status).toBe('disconnected')
  })

  it('blocks reuse of a crypto store already held by another tab', async () => {
    const { store, data } = makeStore()
    data.setItem(sessionKey('gateway|alice'), JSON.stringify(session))
    vi.stubGlobal('navigator', { locks: { request: (_name: string, _opts: unknown, callback: (lock: null) => Promise<void>) => callback(null) } })
    await expect(store.resume()).rejects.toThrow('another tab')
    expect(store.getSnapshot().error).toContain('another tab')
    expect(mock.createClient).not.toHaveBeenCalled()
  })

  it('rejects stored sessions whose token resolves to a different identity', async () => {
    const { store, data } = makeStore()
    data.setItem(sessionKey('gateway|alice'), JSON.stringify(session))
    const client = new Client()
    client.whoami.mockResolvedValue({ user_id: '@bob:matrix.test', device_id: 'B' })
    mock.createClient.mockReturnValueOnce(client)
    await expect(store.resume()).rejects.toThrow('Session identity mismatch')
    expect(client.initRustCrypto).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toBe('error')
  })

  it('never makes credential requests for insecure homeserver addresses', async () => {
    const { store } = makeStore()
    await store.connect({ ...input, homeserver: 'http://192.168.1.1' })
    expect(mock.createClient).not.toHaveBeenCalled()
    expect(store.getSnapshot().error).toContain('Use HTTPS')
  })

  it('blocks token-bearing media requests to event-controlled servers', async () => {
    const { store } = makeStore()
    await store.connect(input)
    clients.at(-1)!.mxcUrlToHttp.mockReturnValue('https://attacker.test/file')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(store.attachmentBlob({ url: 'mxc://attacker.test/file', mime: 'image/png', name: 'QR', image: true })).rejects.toThrow('Invalid attachment URL')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches media with authenticated headers, rejects redirects and caps streamed data', async () => {
    const { store } = makeStore()
    await store.connect(input)
    const fetch = vi.fn(async () => new Response(new Uint8Array(21 * 1024 * 1024)))
    vi.stubGlobal('fetch', fetch)
    await expect(store.attachmentBlob({ url: 'mxc://matrix.test/file', mime: 'image/png', name: 'QR', image: true })).rejects.toThrow('20 MB')
    expect(fetch).toHaveBeenCalledWith('https://matrix.test/_matrix/client/v1/media/download/matrix.test/file', expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer private-token' } }))
  })


  it('creates encrypted direct conversations only for complete Matrix IDs', async () => {
    const { store } = makeStore()
    await store.connect(input)
    const client = clients.at(-1)!
    await expect(store.openDirect('https://attacker.test')).rejects.toThrow('Matrix user ID')
    expect(client.createRoom).not.toHaveBeenCalled()
    await expect(store.openDirect('@whatsappbot:matrix.test')).resolves.toBe('!new:matrix.test')
    expect(client.createRoom).toHaveBeenCalledWith(expect.objectContaining({
      invite: ['@whatsappbot:matrix.test'],
      initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
    }))
  })

  it('does not notify about decrypted backlog and deduplicates live events', async () => {
    const { store } = makeStore()
    await store.connect(input)
    await store.enableNotifications(true)
    const client = clients.at(-1)!
    const room = { name: 'Personal', roomId: '!room:matrix.test', getLiveTimeline: () => ({ getEvents: () => [] }) }
    const event = {
      getId: () => '$message', getRoomId: () => room.roomId, getType: () => 'm.room.message',
      isDecryptionFailure: () => false, getSender: () => '@bob:matrix.test', status: null,
    }
    client.getRoom.mockReturnValue(room as never)
    client.emit('decrypted', event)
    expect(mock.notify).not.toHaveBeenCalled()
    client.emit('timeline', event, room, false, false, { liveEvent: true })
    client.emit('decrypted', event)
    expect(mock.notify).toHaveBeenCalledTimes(1)
    expect(mock.notify.mock.calls[0][0]).toMatchObject({ body: 'New message', link: '/messenger?roomId=!room%3Amatrix.test' })
  })
})
