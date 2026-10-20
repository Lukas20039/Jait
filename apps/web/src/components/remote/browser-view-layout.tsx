import { useState, type ReactNode } from 'react'
import { BrowserAddressBar, type BrowserAddressBarProps } from './browser-address-bar'
import { BrowserToolsPanel } from './browser-tools-panel'

export function BrowserViewLayout({ addressBar, children, compact = false }: {
  compact?: boolean
  addressBar?: BrowserAddressBarProps
  children: ReactNode
}) {
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div data-browser-layout className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {addressBar && <div hidden={compact}><BrowserAddressBar {...addressBar} toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen(!toolsOpen)} /></div>}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        {!compact && toolsOpen && addressBar && !addressBar.disabled && (
          <BrowserToolsPanel sessionId={addressBar.sessionId} authToken={addressBar.authToken} />
        )}
      </div>
    </div>
  )
}
