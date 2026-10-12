import { useState, type ReactNode } from 'react'
import { BrowserAddressBar, type BrowserAddressBarProps } from './browser-address-bar'
import { BrowserToolsPanel } from './browser-tools-panel'

export function BrowserViewLayout({ addressBar, children }: {
  addressBar?: BrowserAddressBarProps
  children: ReactNode
}) {
  const [toolsOpen, setToolsOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {addressBar && <BrowserAddressBar {...addressBar} toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen(!toolsOpen)} />}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        {toolsOpen && addressBar && !addressBar.disabled && (
          <BrowserToolsPanel sessionId={addressBar.sessionId} authToken={addressBar.authToken} />
        )}
      </div>
    </div>
  )
}
