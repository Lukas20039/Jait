import { getAuthToken } from '@/lib/auth-token'
import { getApiUrl } from '@/lib/gateway-url'
import type { UsageSummary } from '@/components/app-shell/usage-modal'

const FRESH_MS = 5 * 60_000
const listeners = new Set<() => void>()
let owner: string | null = null
let summary: UsageSummary | null = null
let pending: Promise<void> | null = null
let nextRefreshAt = 0
let failures = 0

function syncOwner() {
  const token = getAuthToken()
  if (token !== owner) {
    owner = token
    summary = null
    pending = null
    nextRefreshAt = 0
    failures = 0
  }
  return token
}

export function getUsageSummary(): UsageSummary | null {
  syncOwner()
  return summary
}

export function subscribeUsageSummary(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Shared by every mounted header/sidebar; the gateway also shares across devices. */
export function refreshUsageSummary(force = false): Promise<void> {
  const token = syncOwner()
  if (!token) return Promise.resolve()
  if (pending) return pending
  if (!force && Date.now() < nextRefreshAt) return Promise.resolve()
  const request = async (mode: string) => {
    const response = await fetch(`${getApiUrl()}/api/provider-usage/summary?refresh=${mode}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`Usage request failed (${response.status})`)
    const data = await response.json() as UsageSummary
    // A logout/account change during a request must never publish old usage.
    if (getAuthToken() === token && owner === token) {
      summary = data
      listeners.forEach(listener => listener())
    }
  }
  const operation = (async () => {
    if (!summary) {
      try { await request('0') } catch { /* The live request can still succeed. */ }
    }
    if (getAuthToken() !== token || owner !== token) return
    try {
      await request(force ? 'force' : '1')
      if (owner === token) {
        failures = 0
        nextRefreshAt = Date.now() + FRESH_MS
      }
    } catch (error) {
      if (owner === token) {
        failures += 1
        nextRefreshAt = Date.now() + Math.min(30 * 60_000, FRESH_MS * 2 ** Math.min(failures, 3))
      }
      throw error
    }
  })()
  pending = operation
  void operation.finally(() => { if (pending === operation) pending = null }).catch(() => {})
  return operation
}
