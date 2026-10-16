import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getApiUrl } from '@/lib/gateway-url'
import { bindMessengerNotifications } from '@/lib/messenger/notification-actions'
import { MessengerStore } from '@/lib/messenger/store'
import { bindMessengerAssistant } from '@/lib/messenger/assistant-transport'

export const MessengerContext = createContext<MessengerStore | null>(null)

export function MessengerProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const owner = user ? getApiUrl() + '|' + user.id : null
  const store = useMemo(() => owner ? new MessengerStore(owner) : null, [owner])
  useEffect(() => {
    if (!store) return
    const unbind = bindMessengerNotifications(store)
    void store.resume().catch(() => {})
    return () => { unbind(); store.dispose() }
  }, [store])
  useEffect(() => {
    if (!store || !token) return
    let stop: (() => void) | undefined
    const sync = () => {
      const snapshot = store.getSnapshot()
      const enabled = snapshot.assistantAccess && snapshot.status === 'ready'
      if (enabled && !stop) stop = bindMessengerAssistant(store, token)
      if (!enabled && stop) { stop(); stop = undefined }
    }
    const unsubscribe = store.subscribe(sync)
    sync()
    return () => { unsubscribe(); stop?.() }
  }, [store, token])
  return <MessengerContext.Provider value={store}>{children}</MessengerContext.Provider>
}

export function useMessenger() {
  const store = useContext(MessengerContext)
  if (!store) throw new Error('Sign in to Jait to use Messenger.')
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { store, snapshot }
}
