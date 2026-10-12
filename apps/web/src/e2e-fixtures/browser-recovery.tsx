import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { NoVncSessionView } from '@/components/remote/no-vnc-session-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [viewOnly, setViewOnly] = useState(true)
  const [visible, setVisible] = useState(true)
  return <TooltipProvider><main className="p-4">
    <button onClick={() => setViewOnly(false)}>Take control</button>
    <button onClick={() => setVisible(false)}>Hide browser</button>
    <div className="h-[420px]">{visible && <NoVncSessionView source="/noVNC/vnc_lite.html?path=api/live-view/6080/websockify" viewOnly={viewOnly} />}</div>
  </main></TooltipProvider>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
