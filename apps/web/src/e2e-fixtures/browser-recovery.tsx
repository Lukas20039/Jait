import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ChatBrowserView } from '@/components/chat/chat-browser-view'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [viewOnly, setViewOnly] = useState(true)
  const [visible, setVisible] = useState(true)
  if (window.location.search.includes('mode=full')) return <TooltipProvider><div className="h-[420px]"><NoVncSessionView source="/noVNC/vnc.html?path=api/live-view/6080/websockify" /></div></TooltipProvider>
  if (window.location.search.includes('mode=chat')) return <TooltipProvider><ChatBrowserView sessionId="ended-chat" autoOpen /></TooltipProvider>
  return <TooltipProvider><main className="p-4">
    <button onClick={() => setViewOnly(false)}>Take control</button>
    <button onClick={() => setVisible(false)}>Hide browser</button>
    <div className="h-[420px]">{visible && <NoVncSessionView source="/noVNC/vnc_lite.html?path=api/live-view/6080/websockify" viewOnly={viewOnly} />}</div>
  </main></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
