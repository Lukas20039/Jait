import { createContext, useContext, useState, type ReactNode } from 'react'
import { FolderGit2, MessagesSquare } from 'lucide-react'

import { TeamChatsPanel } from './team-chats-panel'
import { Button } from '@/components/ui/button'
import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import type { SidebarAccount } from '@/components/app-shell/mode-sidebar'
import type { ViewMode } from '@/components/chat/view-mode-selector'
import type { AppView, ManagerPage } from '@/lib/app-view'

export type ManagerSidebarSection = 'threads' | 'repositories'

const ManagerSidebarContext = createContext<ManagerSidebarSection>('threads')

export function useManagerSidebarSection() {
  return useContext(ManagerSidebarContext)
}

interface ManagerModeProps {
  currentPage: ManagerPage
  onPageChange: (page: AppView) => void
  isMobile: boolean
  children: ReactNode
  account: SidebarAccount
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function ManagerMode({ currentPage, onPageChange, isMobile, children, account, viewMode, onViewModeChange }: ManagerModeProps) {
  const [section, setSection] = useState<ManagerSidebarSection>('threads')

  const [teamChats, setTeamChats] = useState(() => {
    if (typeof window === 'undefined' || !window.location) return false
    const query = new URLSearchParams(window.location.search)
    return query.has('teamRoom') || query.get('panel') === 'team-chats'
  })
  const setTeamChatsParam = (open: boolean) => {
    const url = new URL(window.location.href)
    if (open) url.searchParams.set('panel', 'team-chats')
    else url.searchParams.delete('panel')
    window.history.replaceState(window.history.state, '', url)
  }
  // The panel floats above the Agents page, so opening it must not replace the
  // page or open a chat: the user picks a chat first.
  const openTeamChats = () => {
    const next = !teamChats
    setTeamChats(next)
    setTeamChatsParam(next)
  }
  const hideTeamChats = () => {
    setTeamChats(false)
    setTeamChatsParam(false)
  }
  const navigate = (page: AppView) => {
    setTeamChats(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('panel'); url.searchParams.delete('teamRoom')
    window.history.replaceState(window.history.state, '', url)
    onPageChange(page)
  }

  const toggleRepositories = () => setSection((current) => current === 'repositories' ? 'threads' : 'repositories')

  return (
    <ManagerSidebarContext.Provider value={section}>
      <main className="flex min-h-0 flex-1">
        {!isMobile && (
          <AppNavigationSidebar
            account={account}
            currentView={currentPage}
            viewMode={viewMode}
            onNavigate={navigate}
            onViewModeChange={onViewModeChange}
            items={currentPage === 'threads' ? [
              { id: 'repositories', label: 'Repositories', description: 'Browse connected repositories', icon: FolderGit2, active: section === 'repositories', onSelect: toggleRepositories },
            ] : [{ id: 'team-chats', label: 'Team Chats', description: 'Browse and create team chats', icon: MessagesSquare, active: teamChats, onSelect: openTeamChats }]}
            onOpenSettings={() => onPageChange('settings')}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {isMobile && currentPage === 'agents' && <nav className="flex shrink-0 gap-2 border-b p-2" aria-label="Agents panels"><Button size="sm" variant={!teamChats ? 'secondary' : 'ghost'} onClick={() => navigate('agents')}>Agents</Button><Button size="sm" variant={teamChats ? 'secondary' : 'ghost'} onClick={openTeamChats}>Team Chats</Button></nav>}
          <div className="relative flex min-h-0 min-w-0 flex-1">
            {!(isMobile && currentPage === 'agents' && teamChats) && <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>}
            {currentPage === 'agents' && teamChats && <TeamChatsPanel isMobile={isMobile} onHide={hideTeamChats} />}
          </div>
        </div>
      </main>
    </ManagerSidebarContext.Provider>
  )
}
