import { createRoot } from 'react-dom/client'
import { MessengerContext } from '@/components/messenger/messenger-provider'
import MessengerPage from '@/components/messenger/messenger-page'
import { MessengerStore } from '@/lib/messenger/store'
import '@/index.css'

const store = new MessengerStore('messenger-e2e')
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<MessengerContext.Provider value={store}><div className="h-dvh bg-background text-foreground"><MessengerPage /></div></MessengerContext.Provider>)
void store.resume().catch(() => {})
