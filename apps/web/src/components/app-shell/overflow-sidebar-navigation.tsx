import { MoreHorizontal } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ModeSidebarItem } from './mode-sidebar'

interface OverflowSidebarNavigationProps {
  label: string
  moreLabel: string
  items: ModeSidebarItem[]
  collapsed: boolean
  renderItem: (item: ModeSidebarItem) => ReactNode
  separated?: boolean
}

export function OverflowSidebarNavigation({ label, moreLabel, items, collapsed, renderItem, separated = false }: OverflowSidebarNavigationProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState<{ height: number; rem: number } | null>(null)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const next = { height: content.getBoundingClientRect().height, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }
      setSpace(previous => previous?.height === next.height && previous.rem === next.rem ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  // Keep the flex basis at the full list's height, even when some items move to
  // the menu. Otherwise hiding items would change allocation between the lists.
  const heights = items.map(item => !collapsed && item.description ? 3 : 2.25)
  const fullHeight = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, items.length - 1) * 0.25
  let visibleCount = items.length
  if (space && fullHeight * space.rem > space.height + 0.5) {
    visibleCount = 0
    let used = 2.25 // Reserve the three-dot button.
    for (const height of heights) {
      if ((used + height + 0.25) * space.rem > space.height + 0.5) break
      used += height + 0.25
      visibleCount++
    }
  }
  const hiddenItems = items.slice(visibleCount)
  const hasActiveItem = hiddenItems.some(item => item.active)
  const badge = hiddenItems.reduce((sum, item) => sum + (item.badge || 0), 0)
  const padding = separated ? 0.75 : 1.5

  return (
    <nav
      aria-label={label}
      className={separated ? 'flex flex-col border-b pb-3' : 'flex flex-col py-3'}
      style={{ flexBasis: `calc(${fullHeight + padding}rem + ${separated ? 1 : 0}px)`, minHeight: `calc(${2.25 + padding}rem + ${separated ? 1 : 0}px)` }}
    >
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        {items.slice(0, visibleCount).map(renderItem)}
        {hiddenItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={hasActiveItem ? 'secondary' : 'ghost'} size="sm"
                className={`h-9 w-full shrink-0 rounded-md ${collapsed ? 'justify-center px-0' : 'justify-start gap-3 px-3'}`}
                aria-label={moreLabel}>
                <span className="relative shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                  {badge > 0 && <span className="absolute -right-2 -top-2 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold leading-none tabular-nums text-primary-foreground"><span className="relative top-px">{badge > 99 ? '99+' : badge}</span></span>}
                </span>
                {!collapsed && <span>More</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={10} aria-label={moreLabel}
              className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-60 overflow-y-auto">
              {hiddenItems.map(item => {
                const Icon = item.icon
                return <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={item.onSelect}
                  className={`gap-3 ${item.active ? 'bg-secondary text-secondary-foreground' : ''}`}
                  aria-current={item.active ? 'page' : undefined}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{item.label}</span>
                    {item.description && <span className="block text-2xs text-muted-foreground">{item.description}</span>}
                  </span>
                  {!!item.badge && <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-bold leading-none tabular-nums text-primary-foreground"><span className="relative top-px">{item.badge > 99 ? '99+' : item.badge}</span></span>}
                </DropdownMenuItem>
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}
