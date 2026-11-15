import { useMemo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import { Graph as Layout, layout } from '@dagrejs/dagre'
import { certaintyLabel, certaintyLevels, directionLabel, studyCount } from '../data/answer-data'
import type { Graph, GraphEdge, GraphGap } from '../data/answer-data'
import { linkClass, useOpener } from './evidence-context'
import type { Linked, Opened } from './evidence-context'
import DirectionIcon from './DirectionIcon'
import CertaintyInfo from './CertaintyInfo'
import '@xyflow/react/dist/base.css'
import './EvidenceGraph.css'

type Point = { x: number; y: number }
type NodeData = { label: string; kind: string; members?: string[]; faded: boolean }
type EdgeData = { points: Point[]; label: Point; item: GraphEdge | GraphGap; opened: Opened; title: string; className: string }
type HeaderData = { label: string }

const columns: Record<string, number> = { planting_stock: 0, site_treatment: 0, combination: 0, condition: 1, outcome: 2 }
const columnNames = ['Practices', 'Conditions', 'Outcomes']
const nodeWidth = 176
const padding = 12
const strokes: Record<string, number> = { very_low: 1, low: 1.5, moderate: 2.1, high: 2.8 }

function isGap(item: GraphEdge | GraphGap): item is GraphGap {
  return 'status' in item
}

function targetOf(item: GraphEdge | GraphGap) {
  return isGap(item) ? item.target : item.target ?? item.target_edge!.split('->')[0]
}

function smooth(points: Point[]) {
  let path = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [points[i - 1] ?? points[i], points[i], points[i + 1], points[i + 2] ?? points[i + 1]]
    path += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }
  return path
}

function computeLayout(graph: Graph) {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const g = new Layout({ multigraph: true })
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 40, edgesep: 10 })
  g.setDefaultEdgeLabel(() => ({}))
  g.setNode('start', { width: 0, height: 0 })
  g.setNode('end', { width: 0, height: 0 })
  const drawn = [...graph.edges.filter((edge) => edge.kind === 'effect'), ...graph.gaps]
  const degree = (id: string) => Math.max(drawn.filter((edge) => edge.target === id).length, graph.edges.filter((edge) => edge.source === id).length)
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: node.members ? 86 : Math.max(50, degree(node.id) * 13 + 18) })
    if (columns[node.kind] === 0) g.setEdge('start', node.id, { weight: 1000 }, `start-${node.id}`)
    if (columns[node.kind] === 2) g.setEdge(node.id, 'end', { weight: 1000 }, `end-${node.id}`)
  }
  for (const edge of drawn) g.setEdge(edge.source, edge.target!, { width: isGap(edge) ? 92 : 84, height: 28, labelpos: 'c' }, edge.id)
  layout(g)
  const at = (id: string) => g.node(id)
  const route = (id: string, item: GraphEdge | GraphGap) => {
    const edge = g.edge(item.source, item.target!, id)
    return { points: edge.points, label: { x: edge.x!, y: edge.y! } }
  }
  const routes = new Map(drawn.map((item) => [item.id, route(item.id, item)]))
  for (const edge of graph.edges.filter((item) => item.kind === 'moderation')) {
    const target = routes.get(edge.target_edge!)!.label
    const end = { x: target.x - 34, y: target.y }
    routes.set(edge.id, { points: [end, end], label: end })
  }
  const items = [...graph.edges, ...graph.gaps]
  const spread = (side: 'in' | 'out', id: string) => {
    const box = at(id)
    const attached = items.filter((item) => (side === 'in' ? item.target : item.source) === id).map((item) => item.id)
    const near = (key: string) => { const { points } = routes.get(key)!; return side === 'in' ? points[points.length - 2] : points[1] }
    attached.sort((a, b) => near(a).y - near(b).y)
    attached.forEach((key, index) => {
      const route = routes.get(key)!
      const y = box.y - box.height / 2 + (index + 1) * box.height / (attached.length + 1)
      const x = box.x + (side === 'in' ? -1 : 1) * box.width / 2
      const lead = { x: x + (side === 'in' ? -18 : 18), y }
      const points = side === 'in' ? [...route.points.slice(0, -1), lead, { x, y }] : [{ x, y }, lead, ...route.points.slice(1)]
      routes.set(key, { ...route, points })
    })
  }
  for (const node of graph.nodes) spread('out', node.id)
  for (const node of graph.nodes) spread('in', node.id)
  const taken = [
    ...graph.nodes.map((node) => at(node.id)),
    ...drawn.map((item) => ({ ...routes.get(item.id)!.label, width: isGap(item) ? 92 : 84, height: 28 })),
  ]
  const clear = (point: Point) => taken.every((box) => Math.abs(point.x - box.x) > box.width / 2 + 42 || Math.abs(point.y - box.y) > box.height / 2 + 26)
  for (const edge of graph.edges.filter((item) => item.kind === 'moderation')) {
    const route = routes.get(edge.id)!
    const [, lead, end] = route.points
    const dx = end.x - lead.x, dy = end.y - lead.y
    const length = Math.hypot(dx, dy) || 1
    const along = (t: number, shift = 0) => ({
      x: lead.x + dx * t - (dy / length) * shift,
      y: lead.y + dy * t + (dx / length) * shift,
    })
    const candidates = [0, -24, 24, -36, 36, -48, 48].flatMap((shift) =>
      Array.from({ length: 13 }, (_, index) => 0.25 + index * 0.045).map((t) => ({ point: along(t, shift), score: Math.abs(t - 0.6) + Math.abs(shift) / 100 })))
      .sort((a, b) => a.score - b.score)
    const label = candidates.find(({ point }) => clear(point))?.point ?? along(0.6, -36)
    routes.set(edge.id, { ...route, label })
  }
  const spans = new Map<number, number[]>()
  for (const node of graph.nodes) spans.set(columns[node.kind], [...(spans.get(columns[node.kind]) ?? []), at(node.id).x])
  const top = Math.min(...graph.nodes.map((node) => at(node.id).y - at(node.id).height / 2))
  const headers = [...spans].map(([column, xs]) => ({ id: `header-${column}`, label: columnNames[column], x: (Math.min(...xs) + Math.max(...xs)) / 2, y: top - 40 }))
  const boxes = graph.nodes.map((node) => at(node.id))
  const left = Math.min(...boxes.map((box) => box.x - box.width / 2))
  const bounds = {
    x: left - padding, y: top - 40 - padding,
    width: Math.max(...boxes.map((box) => box.x + box.width / 2)) - left + padding * 2,
    height: Math.max(...boxes.map((box) => box.y + box.height / 2)) - top + 40 + padding * 2,
  }
  const describe = (item: GraphEdge | GraphGap) => {
    const source = labels.get(item.source)!
    if (isGap(item)) return { from: source, to: labels.get(item.target)! }
    if (item.kind === 'moderation') {
      const [changedSource, changedTarget] = item.target_edge!.split('->')
      return { from: source, to: `Effect of ${labels.get(changedSource)!.toLowerCase()} on ${labels.get(changedTarget)!.toLowerCase()}` }
    }
    return { from: source, to: labels.get(item.target!)! }
  }
  return { at, routes, headers, describe, bounds }
}

function GraphNode({ data }: NodeProps<Node<NodeData>>) {
  return <div className={`graph-node kind-${data.kind}${data.faded ? ' is-faded' : ''}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    {data.members ? <>
      <span className="graph-node-note">Applied together</span>
      <ul>{data.members.map((member) => <li key={member}>{member}</li>)}</ul>
    </> : data.label}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>
}

function ColumnHeader({ data }: NodeProps<Node<HeaderData>>) {
  return <span className="graph-header">{data.label}</span>
}

function EvidenceEdge({ data, markerEnd }: EdgeProps<Edge<EdgeData>>) {
  const { item, points, label, opened, title, className } = data!
  const opener = useOpener(opened)
  const gap = isGap(item)
  const moderation = !gap && item.kind === 'moderation'
  const level = gap ? 0 : certaintyLevels.indexOf(item.certainty) + 1
  const description = gap ? `${title}: no evidence found` : `${title}: ${directionLabel(item.direction)}, ${certaintyLabel(item.certainty)} certainty, ${studyCount(item.studies)}`
  const [pointed, setPointed] = useState(false)
  const selected = opener['aria-expanded']
  const path = smooth(points)
  return <>
    <BaseEdge path={path} markerEnd={markerEnd} className={`graph-edge${gap ? ' is-gap' : ''}${moderation ? ' is-moderation' : ''}${selected || pointed ? ' is-selected' : ''}${className}`}
      style={{ strokeWidth: gap ? 1.4 : strokes[item.certainty] }} />
    {(selected || pointed) && <path d={path} className={`graph-flow${selected ? '' : ' is-preview'}`} style={{ strokeWidth: (gap ? 1.4 : strokes[item.certainty]) + 1 }} />}
    <EdgeLabelRenderer>
      <span className={`graph-label nodrag nopan${gap ? ' is-gap' : ''}${className}`}
        onMouseEnter={() => setPointed(true)} onMouseLeave={() => setPointed(false)} onFocus={() => setPointed(true)} onBlur={() => setPointed(false)}
        style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}>
        <button {...opener} type="button" className="graph-evidence-button" title={description}>
          {!gap ? <><DirectionIcon value={item.direction} size={12} /><span className="graph-dots" aria-hidden="true">{certaintyLevels.map((_, index) => <i key={index} className={index < level ? 'on' : ''} />)}</span></> : <span aria-hidden="true">No evidence</span>}
          <span className="sr-only">{description}</span>
        </button>
        {!gap && <CertaintyInfo finding={item} label={title} />}
      </span>
    </EdgeLabelRenderer>
  </>
}

const nodeTypes = { evidence: GraphNode, header: ColumnHeader }
const edgeTypes = { evidence: EvidenceEdge }

function Diagram({ graph, linked }: { graph: Graph; linked: Linked }) {
  const layoutResult = useMemo(() => computeLayout(graph), [graph])
  const { bounds } = layoutResult
  const [hovered, setHovered] = useState<string | null>(null)
  const linkedKey = linked ? [...linked].sort().join('|') : null
  const highlighted = useMemo(() => linkedKey === null ? null : new Set(linkedKey.split('|')), [linkedKey])
  const { nodes, edges } = useMemo(() => buildElements(graph, layoutResult, highlighted, hovered), [graph, layoutResult, highlighted, hovered])

  return <div className="graph-frame" style={{ width: bounds.width, height: bounds.height }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={{ x: -bounds.x, y: -bounds.y, zoom: 1 }}
      nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
      panOnDrag={false} panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
      onNodeMouseEnter={(_, node) => node.type === 'evidence' && setHovered(node.id)} onNodeMouseLeave={() => setHovered(null)}
      proOptions={{ hideAttribution: true }} />
  </div>
}

function buildElements(graph: Graph, { at, routes, headers, describe }: ReturnType<typeof computeLayout>, linked: Linked, hovered: string | null) {
  const items = [...graph.edges, ...graph.gaps]
  const touches = (item: GraphEdge | GraphGap, id: string) => item.source === id || item.target === id
  const connected = hovered ? new Set(items.filter((item) => touches(item, hovered)).flatMap((item) => [item.source, targetOf(item)])) : null
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const nodes: Node[] = [
    ...graph.nodes.map((node) => {
      const box = at(node.id)
      return {
        id: node.id, type: 'evidence', position: { x: box.x - box.width / 2, y: box.y - box.height / 2 }, width: box.width, height: box.height,
        data: { label: node.label, kind: node.kind, members: node.members?.map((member) => labels.get(member)!), faded: !!connected && !connected.has(node.id) },
      }
    }),
    ...headers.map((header) => ({ id: header.id, type: 'header', position: { x: header.x - 100, y: header.y }, width: 200, height: 24, data: { label: header.label }, selectable: false })),
  ]
  const edges: Edge<EdgeData>[] = items.map((item) => {
    const { from, to } = describe(item)
    const subject = { id: item.source, label: from }
    const outcome = { id: targetOf(item), label: to }
    const opened: Opened = isGap(item)
      ? { kind: 'gap', item: { id: item.id, subject, outcome, status: 'no_evidence', studies: 0, searched_for: item.searched_for } }
      : { kind: 'finding', item: { ...item, subject, outcome } }
    const linkIds = [`q1:${item.source}:${item.target}`, ...(isGap(item) ? [] : item.edge_ids)]
    const faded = hovered && !touches(item, hovered) ? ' is-faded' : ''
    return {
      id: item.id, type: 'evidence', source: item.source, target: item.target ?? item.source,
      markerEnd: isGap(item) ? undefined : { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#6f8f7e' },
      data: { ...routes.get(item.id)!, item, opened, title: `${from} to ${to}`, className: `${linkClass(linkIds, linked)}${faded}` },
    }
  })
  return { nodes, edges }
}

export default function EvidenceGraph({ graph, linked }: { graph: Graph; linked: Linked }) {
  return <section className="evidence-graph" aria-label="How practices act on seedlings, directly and through the conditions they change">
    <div className="graph-scroll">
      <ReactFlowProvider><Diagram graph={graph} linked={linked} /></ReactFlowProvider>
    </div>
    <div className="graph-legend">
      {['increase', 'decrease', 'mixed', 'no_effect', 'unclear'].map((direction) => {
        return <span key={direction}><DirectionIcon value={direction} size={13} />{directionLabel(direction)}</span>
      })}
      <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" className="legend-line is-moderation" /></svg>Changes the size of another effect</span>
      <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" className="legend-line is-gap" /></svg>Looked for, no evidence found</span>
    </div>
    <div className="graph-legend" role="group" aria-label="Certainty scale">
      <span>Certainty:</span>
      {certaintyLevels.map((grade, level) => <span key={grade}>
        <span className="graph-dots" aria-hidden="true">{certaintyLevels.map((_, index) => <i key={index} className={index <= level ? 'on' : ''} />)}</span>
        {certaintyLabel(grade)}
      </span>)}
      <span>Thicker lines indicate higher certainty.</span>
    </div>
    <p className="graph-note">Each arrow is its own body of evidence. A path through a condition joins results that mostly come from different studies, so it is not one tested effect.</p>
  </section>
}
