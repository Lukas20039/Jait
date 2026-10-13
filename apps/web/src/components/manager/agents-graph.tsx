import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { PersonaAgentDraft } from '@/lib/persona-agents'
import type { AgentThread } from '@/lib/agents-api'
import { AgentRow } from './agent-row'
import { AgentWaveBackground, type AgentWavePoint } from './agent-wave-background'

interface GraphNode { id: string; x?: number; y?: number; fx?: number; fy?: number }
const MIN_ZOOM = 0.05
const MAX_ZOOM = 2
const CARD_GAP = 10
// Cards are drawn with `translate(x, y) translate(-50%, -28px)`, so a node anchor sits 28px below the
// top edge of the card it belongs to. Measuring and writing positions must agree on that offset, or
// every solve would shift the cards down by the difference and never settle.
const CARD_ANCHOR_Y = 28
export function AgentsGraph({ agents, threads, selectedId, onSave, onOpen, onChooseTask, onRefresh, onResume, resumeBusy }: {
  agents: PersonaAgentDraft[]
  threads: AgentThread[]
  selectedId: string | null
  onSave: (id: string, provider: string, model: string | null) => Promise<void>
  onOpen: (id: string) => void
  onChooseTask: (id: string) => void
  onRefresh: () => void
  onResume: (threadId: string) => Promise<void>
  resumeBusy?: boolean
}) {
  const wavePoints = useRef<AgentWavePoint[]>([])
  const wakeWave = useRef<(() => void) | null>(null)
  const drag = useRef<{ node: GraphNode; startX: number; startY: number; moved: boolean; target: HTMLElement } | null>(null)
  const suppressClick = useRef(false)
  const userAdjusted = useRef(false)
  const forceSetupKey = useRef<string | null>(null)
  const fitTimers = useRef<number[]>([])
  const settleWatcher = useRef<number | null>(null)
  const solvedKey = useRef<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const topology = JSON.stringify(agents.map(agent => [agent.id, agent.reportsToId]))
  const graph = useMemo(() => {
    const members = JSON.parse(topology) as [string, string | null][]
    const ids = new Set(members.map(([id]) => id))
    return {
      nodes: members.map(([id], index) => ({ id, x: Math.cos(index * Math.PI * 2 / members.length) * 120, y: Math.sin(index * Math.PI * 2 / members.length) * 120 }) as GraphNode),
      links: members.flatMap(([id, manager]) => manager && ids.has(manager) && manager !== id ? [{ source: manager, target: id }] : []),
    }
  }, [topology])
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const positionNodes = useCallback(() => {
    const instance = graphRef.current
    if (!instance) return
    const points: AgentWavePoint[] = []
    for (const node of graph.nodes) {
      const element = elements.current.get(node.id)
      if (!element) continue
      const { x, y } = instance.graph2ScreenCoords(node.x ?? 0, node.y ?? 0)
      points.push({ id: node.id, x, y })
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -28px)`
    }
    wavePoints.current = points
    wakeWave.current?.()
  }, [graph])
  // Measure the rendered cards: the library only knows about node points, but every agent is drawn as
  // a fixed-size HTML card (roughly 128x132px) whose size never changes with zoom.
  const measureCards = useCallback((bounds: DOMRect) => {
    const measured: { node: GraphNode; box: { x: number; y: number; width: number; height: number } }[] = []
    for (const node of graph.nodes) {
      const element = elements.current.get(node.id)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (!rect.width && !rect.height) continue
      measured.push({ node, box: { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height } })
    }
    return measured
  }, [graph])
  // The library's zoomToFit fits raw node points, but those points are drawn as fixed-size cards. That
  // mismatch is exactly what breaks the grid on a phone: fitting points leaves cards spilling off the
  // panel, and points that settle apart in graph space can still be overlapping cards on screen.
  //
  // So the layout is solved in screen space instead, where the card size is real, and then written back
  // through the current transform:
  //   1. stretch the arrangement along the container's longer axis, so a tall phone gets a column of
  //      cards that uses the whole panel instead of a thin band across the top;
  //   2. push overlapping pairs apart and pull any card that drifted out back inside, interleaved so
  //      the result is both readable and fully on screen.
  // Zoom and pan are deliberately left alone: shrinking the view to fit *after* separating the cards
  // would bring the overlaps straight back, because the cards keep their pixel size while the gaps
  // between them shrink.
  const placeCards = useCallback(() => {
    const instance = graphRef.current
    const bounds = container.current?.getBoundingClientRect()
    if (!instance || !bounds) return
    const { width, height } = bounds
    if (!width || !height) return
    const measured = measureCards(bounds)
    if (measured.length === 0) return
    const padding = Math.min(28, Math.max(12, Math.min(width, height) * 0.04))
    const cardWidth = Math.max(...measured.map(item => item.box.width))
    const cardHeight = Math.max(...measured.map(item => item.box.height))
    const points = measured.map(item => ({ x: item.box.x + item.box.width / 2, y: item.box.y + CARD_ANCHOR_Y }))
    const minX = Math.min(...points.map(point => point.x))
    const maxX = Math.max(...points.map(point => point.x))
    const minY = Math.min(...points.map(point => point.y))
    const maxY = Math.max(...points.map(point => point.y))
    const clampScale = (value: number) => Math.min(4, Math.max(0.35, value))
    const targetWidth = Math.max(1, width - padding * 2 - cardWidth)
    const targetHeight = Math.max(1, height - padding * 2 - cardHeight)
    // Pin the arrangement that is currently on screen. Solving an already-solved layout is close to a
    // no-op: the stretch below is measured from the live cards, so a layout that already fills the area
    // has a scale of 1 in both axes and the separation pass only nudges sub-pixel overlaps.
    const commit = () => {
      measured.forEach((item, index) => {
        const point = instance.screen2GraphCoords(points[index].x, points[index].y)
        item.node.x = item.node.fx = point.x
        item.node.y = item.node.fy = point.y
      })
      positionNodes()
    }
    let scaleX = clampScale(targetWidth / Math.max(1, maxX - minX))
    let scaleY = clampScale(targetHeight / Math.max(1, maxY - minY))
    if (Math.abs(scaleX - 1) < 0.02) scaleX = 1
    if (Math.abs(scaleY - 1) < 0.02) scaleY = 1
    for (const point of points) {
      point.x = (minX + maxX) / 2 + (point.x - (minX + maxX) / 2) * scaleX
      point.y = (minY + maxY) / 2 + (point.y - (minY + maxY) / 2) * scaleY
    }
    // Clamp whole cards, not just their anchor points, into the padded area. Anchors are measured from
    // the card top (CARD_ANCHOR_Y), so the reach below an anchor is the remaining card height.
    const halfWidth = Math.min(cardWidth / 2, Math.max(0, width - padding * 2) / 2)
    const lowX = padding + halfWidth
    const highX = width - padding - halfWidth
    const lowY = padding + CARD_ANCHOR_Y
    const highY = height - padding - Math.min(cardHeight - CARD_ANCHOR_Y, height - padding)
    const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
    for (let pass = 0; pass < 40; pass += 1) {
      let worst = 0
      for (let a = 0; a < points.length; a += 1) {
        for (let b = a + 1; b < points.length; b += 1) {
          const first = points[a]
          const second = points[b]
          const dx = second.x - first.x
          const dy = second.y - first.y
          const overlapX = cardWidth + CARD_GAP - Math.abs(dx)
          const overlapY = cardHeight + CARD_GAP - Math.abs(dy)
          if (overlapX <= 0 || overlapY <= 0) continue
          worst = Math.max(worst, Math.min(overlapX, overlapY))
          // Clearing the smaller overlap is the cheapest separation; one axis is enough to stop it.
          if (overlapX <= overlapY) {
            const push = (overlapX / 2 + 0.5) * (dx === 0 ? (b > a ? 1 : -1) : Math.sign(dx))
            first.x -= push
            second.x += push
          } else {
            const push = (overlapY / 2 + 0.5) * (dy === 0 ? (b > a ? 1 : -1) : Math.sign(dy))
            first.y -= push
            second.y += push
          }
        }
      }
      for (const point of points) {
        point.x = clamp(point.x, lowX, highX)
        point.y = clamp(point.y, lowY, highY)
      }
      if (worst < 0.5) break
    }
    // Separation and the stretch fight each other on a small panel: pushing two cards apart can send one
    // of them out of the frame, and pulling it back in puts the overlap straight back, so the loop above
    // can exit with the cards still touching. That is the state the phone layout was stuck in. When the
    // result is either still overlapping or does not use the panel, lay the cards out on a deterministic
    // grid instead, ordered along the reporting tree so managers stay next to their reports.
    const spreadX = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + cardWidth
    const spreadY = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + cardHeight
    const separated = points.every((point, index) => points.slice(index + 1).every(other =>
      Math.abs(point.x - other.x) >= cardWidth + CARD_GAP - 1 || Math.abs(point.y - other.y) >= cardHeight + CARD_GAP - 1))
    if (!separated || spreadX < width * 0.6 || spreadY < height * 0.6) {
      const indexById = new Map(measured.map((item, index) => [item.node.id, index]))
      const children = new Map<string, string[]>()
      const roots: string[] = []
      for (const agent of agents) {
        const manager = agent.reportsToId
        if (manager && manager !== agent.id && indexById.has(manager)) children.set(manager, [...(children.get(manager) ?? []), agent.id])
        else roots.push(agent.id)
      }
      const order: number[] = []
      const seen = new Set<string>()
      const queue = [...roots]
      while (queue.length) {
        const id = queue.shift() as string
        if (seen.has(id)) continue
        seen.add(id)
        const index = indexById.get(id)
        if (index !== undefined) order.push(index)
        queue.push(...(children.get(id) ?? []))
      }
      measured.forEach((item, index) => { if (!seen.has(item.node.id)) order.push(index) })
      const innerWidth = Math.max(cardWidth, width - padding * 2)
      const innerHeight = Math.max(cardHeight, height - padding * 2)
      const roomFor = (count: number, size: number, room: number) => count * size + (count - 1) * CARD_GAP <= room + 0.5
      // Try every row count and keep the first one whose cards fit with gaps on both axes, preferring the
      // candidate that spreads the furthest. A phone cannot fit three 128px cards across, so this settles
      // on two columns, while a desktop panel takes three per row.
      let best: { rows: number; columns: number; score: number; fits: boolean } | null = null
      for (let rows = 1; rows <= points.length; rows += 1) {
        const columns = Math.ceil(points.length / rows)
        const fits = roomFor(columns, cardWidth, innerWidth) && roomFor(rows, cardHeight, innerHeight)
        const score = Math.min(
          (columns > 1 ? innerWidth : cardWidth) / (width * 0.6),
          (rows > 1 ? innerHeight : cardHeight) / (height * 0.6),
        )
        if (!best || (fits && !best.fits) || (fits === best.fits && score > best.score)) best = { rows, columns, score, fits }
      }
      const { rows, columns } = best as { rows: number; columns: number }
      const stepX = columns > 1 ? (innerWidth - cardWidth) / (columns - 1) : 0
      const stepY = rows > 1 ? (innerHeight - cardHeight) / (rows - 1) : 0
      order.forEach((index, position) => {
        const row = Math.floor(position / columns)
        const column = position % columns
        // Centre the last, partially filled row so the grid stays symmetric.
        const offset = (columns - Math.min(columns, points.length - row * columns)) * stepX / 2
        points[index].x = padding + offset + column * stepX + cardWidth / 2
        points[index].y = padding + row * stepY + CARD_ANCHOR_Y
      })
    }
    // Write the solved screen positions back through the unchanged transform, so the cards render
    // exactly where they were measured and placed, and pin them so a later simulation tick cannot pull
    // them back out of place.
    commit()
  }, [agents, measureCards, positionNodes])
  // While the simulation is still running the cards follow moving points, so only the view is fitted
  // here: it changes zoom and pan, which the force layout does not read back.
  const fitView = useCallback(() => {
    const instance = graphRef.current
    const bounds = container.current?.getBoundingClientRect()
    if (!instance || !bounds) return
    const { width, height } = bounds
    if (!width || !height) return
    const currentZoom = instance.zoom() || 1
    const measured = measureCards(bounds)
    if (measured.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const { box } of measured) {
      minX = Math.min(minX, box.x)
      minY = Math.min(minY, box.y)
      maxX = Math.max(maxX, box.x + box.width)
      maxY = Math.max(maxY, box.y + box.height)
    }
    if (maxX <= minX || maxY <= minY) return
    const padding = Math.min(28, Math.max(12, Math.min(width, height) * 0.04))
    const targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
      currentZoom * Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY))))
    const center = instance.centerAt()
    // The content centre sits at (center.x, center.y) on screen; convert it to graph coordinates with
    // the pre-change zoom, then re-anchor the viewport on it at the new zoom.
    instance.zoom(targetZoom, 0)
    instance.centerAt(
      center.x + ((minX + maxX) / 2 - width / 2) / currentZoom,
      center.y + ((minY + maxY) / 2 - height / 2) / currentZoom,
      0,
    )
    positionNodes()
  }, [measureCards, positionNodes])
  const clearFitTimers = useCallback(() => {
    for (const handle of fitTimers.current) { cancelAnimationFrame(handle); window.clearTimeout(handle) }
    fitTimers.current = []
    if (settleWatcher.current !== null) { cancelAnimationFrame(settleWatcher.current); settleWatcher.current = null }
  }, [])
  // The layout has to be solved on a layout that has stopped moving. Solving on a clock instead meant the
  // solution was pinned to whatever frame the timer happened to land on: early enough and the simulation
  // pulled the cards away again, late enough and the arrangement had already sprawled, and either way the
  // result differed between viewports. So watch the engine's own node coordinates and solve once they
  // stop changing, with a deadline so a layout that never fully cools still becomes readable.
  const watchSettle = useCallback((onSettled: () => void) => {
    const started = performance.now()
    let previous = ''
    let stable = 0
    const tick = () => {
      if (!container.current?.isConnected) return
      if (!graphRef.current) { settleWatcher.current = requestAnimationFrame(tick); return }
      const signature = graph.nodes.map(node => `${Math.round(node.x ?? 0)},${Math.round(node.y ?? 0)}`).join('|')
      if (signature === previous) stable += 1
      else { previous = signature; stable = 0 }
      const elapsed = performance.now() - started
      if ((stable >= 8 && elapsed > 250) || elapsed >= 6000) { settleWatcher.current = null; onSettled(); return }
      settleWatcher.current = requestAnimationFrame(tick)
    }
    settleWatcher.current = requestAnimationFrame(tick)
  }, [graph])
  // Re-fit across a few frames so the result survives the initial simulation run, while still yielding to
  // any user pan/zoom/drag. The view is fitted while the simulation is still moving, because fitting
  // changes zoom and pan only, which the force layout does not read back. The cards are solved once the
  // simulation has settled, and placeCards pins every node as it goes, so nothing can move them afterwards.
  const scheduleFit = useCallback((key: string) => {
    const mark = (value: string) => container.current?.setAttribute('data-graph-layout', value)
    const viewRun = () => {
      if (userAdjusted.current) return
      fitView()
    }
    mark('solving')
    viewRun()
    fitTimers.current.push(
      requestAnimationFrame(viewRun),
      window.setTimeout(viewRun, 120),
      window.setTimeout(viewRun, 400),
      window.setTimeout(viewRun, 800),
    )
    watchSettle(() => {
      if (!userAdjusted.current) placeCards()
      solvedKey.current = key
      mark('solved')
    })
  }, [placeCards, fitView, watchSettle])
  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return
    if (forceSetupKey.current !== topology) {
      forceSetupKey.current = topology
      userAdjusted.current = false
      // A new topology needs a fresh layout, so release any pinned cards from the previous one.
      for (const node of graph.nodes) { node.fx = undefined; node.fy = undefined }
      // Keep cards close while leaving room for their controls and labels.
      instance.d3Force('charge')?.strength(-500).distanceMax(200)
      instance.d3Force('link')?.distance(150)
      instance.d3ReheatSimulation()
    }
    // The agents list is re-fetched on a timer, which hands down a fresh array for the same people. That is
    // not a new layout: re-solving it would re-measure and re-pin identical cards every few seconds, so
    // only solve again when the tree or the panel size actually changed.
    const key = `${topology}|${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`
    clearFitTimers()
    if (solvedKey.current === key) return
    scheduleFit(key)
    return clearFitTimers
  }, [topology, dimensions.width, dimensions.height, scheduleFit, clearFitTimers, graph])
  return <div ref={container} className="relative min-h-0 flex-1 overflow-hidden bg-background" aria-label="Agent reporting graph"
    onWheel={() => { userAdjusted.current = true }}
    onPointerDown={event => { if (event.target === event.currentTarget) userAdjusted.current = true }}>
    <AgentWaveBackground width={dimensions.width} height={dimensions.height} points={wavePoints} wake={wakeWave} />
    {dimensions.width > 0 && dimensions.height > 0 && <ForceGraph2D<GraphNode>
      ref={graphRef} width={dimensions.width} height={dimensions.height} graphData={graph} nodeId="id"
      nodeCanvasObject={() => {}} linkColor={() => '#8090a066'} linkDirectionalArrowLength={5}
      onRenderFramePost={positionNodes} cooldownTicks={120} d3VelocityDecay={0.3}
      minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} backgroundColor="transparent" enableNodeDrag={false}
    />}
    <div className="pointer-events-none absolute inset-0">
      {agents.map(agent => <div key={agent.id} ref={element => { if (element) elements.current.set(agent.id, element); else elements.current.delete(agent.id) }} className="pointer-events-auto absolute left-0 top-0 touch-none"
        onPointerDown={event => {
          if (event.button !== 0) return
          const target = (event.target as HTMLElement).closest<HTMLElement>('button[aria-label^="Open "]')
          const node = graph.nodes.find(item => item.id === agent.id)
          if (!target || !node) return
          drag.current = { node, startX: event.clientX, startY: event.clientY, moved: false, target }
          suppressClick.current = false
          target.setPointerCapture(event.pointerId)
          event.stopPropagation()
        }}
        onPointerMove={event => {
          const moving = drag.current
          const instance = graphRef.current
          const bounds = container.current?.getBoundingClientRect()
          if (!moving || moving.node.id !== agent.id || !instance || !bounds) return
          if (!moving.moved && Math.hypot(event.clientX - moving.startX, event.clientY - moving.startY) < 6) return
          moving.moved = true
          suppressClick.current = true
          userAdjusted.current = true
          const point = instance.screen2GraphCoords(event.clientX - bounds.left, event.clientY - bounds.top)
          moving.node.x = moving.node.fx = point.x
          moving.node.y = moving.node.fy = point.y
          instance.d3ReheatSimulation()
          positionNodes()
          event.stopPropagation()
        }}
        onPointerUp={event => {
          const moving = drag.current
          if (!moving || moving.node.id !== agent.id) return
          if (moving.target.hasPointerCapture(event.pointerId)) moving.target.releasePointerCapture(event.pointerId)
          drag.current = null
        }}
        onPointerCancel={() => { drag.current = null; suppressClick.current = false }}
        onClickCapture={event => {
          if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
        }}>
        <AgentRow onResume={onResume} resumeBusy={resumeBusy} compact selected={selectedId === agent.id} agent={agent} depth={0} threads={threads}
          onSaveProvider={(provider, model) => onSave(agent.id, provider, model)} onOpen={() => onOpen(agent.id)}
          onChooseTask={() => onChooseTask(agent.id)} onRefresh={onRefresh} />
      </div>)}
    </div>
  </div>
}
