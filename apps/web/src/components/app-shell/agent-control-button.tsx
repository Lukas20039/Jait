import { Loader2, Play, Square } from 'lucide-react'
import { AgentAvatar } from '@/components/manager/agent-avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentControlState } from '@/lib/agent-control-api'
import { PERSONA_AVATARS } from '@/lib/persona-agents'
import { cn } from '@/lib/utils'

export interface AgentControlButtonProps {
  state: AgentControlState
  runningCount: number
  avatars?: string[]
  pending?: boolean
  error?: string | null
  collapsed?: boolean
  onStopAll: () => void
  onResume: () => void
}

/** One owner-wide control shared by the sidebar and compact mobile header. */
export function AgentControlButton({ state, runningCount, avatars = [], pending, error, collapsed, onStopAll, onResume }: AgentControlButtonProps) {
  const action = state.halted ? 'Resume agents' : 'Stop all agents'
  const status = state.halted ? 'Agents halted' : runningCount > 0 ? `${runningCount} running` : 'Agents ready'
  const faces = (avatars.length ? avatars : PERSONA_AVATARS).slice(0, 3)
  return (
    <div className={cn('min-w-0 shrink-0', collapsed && 'w-10')}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            aria-label={action}
            aria-busy={pending || undefined}
            data-agent-control={state.halted ? 'halted' : 'ready'}
            disabled={pending}
            onClick={state.halted ? onResume : onStopAll}
            className={cn('w-full gap-2 rounded-lg px-2', collapsed ? 'h-10 justify-center px-0' : 'h-11 justify-start', state.halted && 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}
          >
            <span className="relative block h-9 w-9 shrink-0" aria-hidden="true">
              {faces.map((avatar, index) => (
                <span key={`${avatar}-${index}`} className="absolute h-6 w-6 rounded-full bg-background ring-1 ring-border" style={{ left: index * 6, top: index === 1 ? 0 : 9 }}>
                  <AgentAvatar avatar={avatar} className="h-6 w-6" />
                </span>
              ))}
              <span className={cn('absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background', state.halted ? 'bg-amber-500 text-white' : 'bg-red-500 text-white')}>
                {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : state.halted ? <Play className="h-2.5 w-2.5 fill-current" /> : <Square className="h-2 w-2 fill-current" />}
              </span>
            </span>
            {!collapsed && <span className="min-w-0 text-left leading-tight"><span className="block truncate text-xs font-medium">{action}</span><span className="block text-2xs font-normal text-muted-foreground">{status}</span></span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-64">
          <p>{action} · {status}</p>
          {state.halted && <p className="mt-1 text-xs">New threads, team deliveries and scheduled runs are held.{state.reason ? ` ${state.reason}` : ''}</p>}
          {error && <p className="mt-1 text-xs">{error}</p>}
        </TooltipContent>
      </Tooltip>
      <span className="sr-only" role="status" aria-live="polite">{status}</span>
      {error && <p role="alert" className={cn('text-xs text-red-600 dark:text-red-400', collapsed ? 'sr-only' : 'px-2 py-1')}>{error}</p>}
    </div>
  )
}
