import { useCallback, useReducer, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { AgentLiveTone } from '@/lib/agent-live-state'
import {
  agentActivityPanelOpen,
  buildAgentActivityChipModel,
  formatAgentActivitySince,
  shouldAnnounceAgentActivity,
  shouldRenderAgentActivityChip,
  type AgentActivityAgentIdentity,
  type AgentActivityRuntime,
  type AgentActivityVisibility,
} from '@/lib/agent-activity-chip'

interface AgentActivityChipProps {
  agent: AgentActivityAgentIdentity
  /** Merged per-execution runtime for this agent; omit while the first read is in flight. */
  runtime?: AgentActivityRuntime | null
  /** True when the runtime read failed, so the chip reports that instead of `idle`. */
  statusUnavailable?: boolean
  /** Source execution thread, linked from the expanded panel. */
  threadId?: string | null
  onRetry?: () => void
  /** `when-active` (default) hides a known-idle agent to keep main chat uncluttered. */
  visibility?: AgentActivityVisibility
  /** Render the panel already expanded (deep links and tests). */
  initialOpen?: boolean
  className?: string
}

const TONE_CLASSES: Record<AgentLiveTone, string> = {
  neutral: 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
  live: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20',
  attention: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
  destructive: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20',
  muted: 'border-border bg-transparent text-muted-foreground hover:bg-muted/40',
}

const DOT_CLASSES: Record<AgentLiveTone, string> = {
  neutral: 'bg-muted-foreground/50',
  // The pulse is the only motion in the chip, and reduced-motion users get a static dot.
  live: 'bg-blue-500 animate-pulse motion-reduce:animate-none',
  attention: 'bg-amber-500',
  destructive: 'bg-red-500',
  success: 'bg-emerald-500',
  muted: 'bg-muted-foreground/40',
}

/**
 * Compact agent-status chip for the main chat surface.
 *
 * Tapping the chip opens a panel with the same truth the Agents page shows; the
 * chip never offers recipient selection, so the retired picker cannot come back
 * through this path. Movement and state semantics live in
 * `@/lib/agent-activity-chip` and are unit-tested there.
 */
export function AgentActivityChip({
  agent,
  runtime,
  statusUnavailable,
  threadId,
  onRetry,
  visibility = 'when-active',
  initialOpen = false,
  className,
}: AgentActivityChipProps) {
  const model = buildAgentActivityChipModel({ agent, runtime, statusUnavailable })
  const [open, dispatch] = useReducer(agentActivityPanelOpen, initialOpen)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const closeAndRestoreFocus = useCallback(() => {
    dispatch({ type: 'close' })
    triggerRef.current?.focus()
  }, [])

  if (!shouldRenderAgentActivityChip(model, visibility)) return null

  const since = formatAgentActivitySince(model.startedAt)
  // `data-agent-availability` is the only field that may speak while a read is in
  // flight or failed. Publishing `data-agent-live-state="idle"` there would be a
  // DOM-level lie (idle is a *derived* state), so the state attributes are omitted
  // until the gateway actually reported something.
  const stateKnown = model.availability === 'available'

  return (
    <div className={cn('inline-flex flex-col items-start', className)} data-agent-activity-chip>
      <button
        ref={triggerRef}
        id={model.triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={model.panelId}
        aria-label={`${model.agentName}: ${model.label}`}
        data-agent-id={model.agentId}
        data-agent-live-state={stateKnown ? model.state : undefined}
        data-agent-availability={model.availability}
        data-tone={model.tone}
        data-terminal={stateKnown ? model.terminal : undefined}
        data-needs-operator={stateKnown ? model.needsOperator : undefined}
        onClick={() => dispatch({ type: 'toggle' })}
        className={cn(
          // `h-8` keeps the chip aligned with the dense message header it sits in;
          // the invisible pseudo-element grows the hit area to 44px for touch.
          'relative inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-2 text-2xs font-medium transition-colors',
          'after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[\'\']',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          TONE_CLASSES[model.tone],
        )}
      >
        <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASSES[model.tone])} />
        <span className="truncate">{model.label}</span>
      </button>

      {shouldAnnounceAgentActivity(model) && (
        <span role="status" aria-live="polite" className="sr-only">
          {model.agentName}: {model.description}
        </span>
      )}

      {open && (
        <div
          id={model.panelId}
          role="region"
          aria-labelledby={model.triggerId}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              closeAndRestoreFocus()
            }
          }}
          // `relative` keeps the panel above the trigger's expanded hit area.
          className="relative mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 text-xs shadow-md"
        >
          <p className="font-medium text-foreground">{model.agentName}</p>
          <p className="mt-0.5 text-muted-foreground">{model.description}</p>

          {since && (
            <p className="mt-1 text-2xs text-muted-foreground">Started {since} ago</p>
          )}

          {model.notice && model.notice !== model.description && (
            <p className="mt-1 text-2xs text-muted-foreground">{model.notice}</p>
          )}

          {(model.retryable && onRetry) || threadId ? (
            <div className="mt-2 flex items-center gap-3">
              {model.retryable && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Retry
                </button>
              )}
              {threadId && (
                <a
                  href={`/threads?threadId=${encodeURIComponent(threadId)}`}
                  className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View thread
                </a>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
