import { describe, expect, it } from 'vitest'
import { bridgeLabel, messengerError, normalizeHomeserver, readSession, sessionKey } from './model'

describe('Matrix account boundaries', () => {
  it('accepts HTTPS and loopback HTTP and rejects secret-bearing or unsafe URLs', () => {
    expect(normalizeHomeserver(' https://matrix.example.com/ ')).toBe('https://matrix.example.com')
    expect(normalizeHomeserver('http://localhost:8008/')).toBe('http://localhost:8008')
    expect(normalizeHomeserver('http://[::1]:8008')).toBe('http://[::1]:8008')
    for (const url of ['http://192.168.1.1', 'javascript:alert(1)', 'https://me:secret@example.com', 'https://example.com/?token=secret', 'https://example.com/#token']) {
      expect(() => normalizeHomeserver(url)).toThrow()
    }
  })
  it('isolates sessions by gateway and user and drops corrupt stored credentials', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key) } }
    const owner = 'gateway-a|alice'
    values.set(sessionKey(owner), JSON.stringify({ homeserver: 'https://matrix.example.com', userId: '@alice:matrix.example.com', deviceId: 'A', accessToken: 'private-token', cryptoStore: 'a' }))
    expect(readSession(storage, owner)?.deviceId).toBe('A')
    expect(readSession(storage, 'gateway-a|bob')).toBeNull()
    expect(readSession(storage, 'gateway-b|alice')).toBeNull()
    values.set(sessionKey(owner), '{"accessToken":"private-token"}')
    expect(readSession(storage, owner)).toBeNull()
    expect(values.has(sessionKey(owner))).toBe(false)
  })
  it('never surfaces raw homeserver errors or credentials', () => {
    expect(messengerError({ errcode: 'M_FORBIDDEN', message: 'private-token' })).not.toContain('private-token')
    expect(messengerError(new Error('https://server/?token=private-token'))).not.toContain('private-token')
  })
  it('uses explicit bridge metadata rather than guessing service from room names', () => {
    expect(bridgeLabel(undefined)).toEqual({ service: 'Matrix', network: '' })
    expect(bridgeLabel({ protocol: { id: 'whatsapp' }, network: { displayname: 'Personal' } })).toEqual({ service: 'WhatsApp', network: 'Personal' })
    expect(bridgeLabel({ protocol: { id: 'msteams' }, network: { displayname: 'Tenant A' } })).toEqual({ service: 'Teams', network: 'Tenant A' })
  })
})
