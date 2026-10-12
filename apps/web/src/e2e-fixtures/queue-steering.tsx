import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MessageQueue } from '@/components/chat/message-queue'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [action, setAction] = useState('')
  const iconOnly = new URLSearchParams(location.search).has('mobile')
  return <TooltipProvider>
    <main className="mx-auto max-w-xl p-3">
      <MessageQueue
        items={[{ id: 'q-selected', content: 'Investigate the selected issue', queuedAt: 1 }]}
        iconOnly={iconOnly}
        onSteer={id => setAction(`steer:${id}`)}
        onStopAndSteer={id => setAction(`stop-and-steer:${id}`)}
      />
      <output data-testid="action">{action}</output>
    </main>
  </TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
