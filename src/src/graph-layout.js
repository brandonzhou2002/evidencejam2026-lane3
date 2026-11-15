import { Graph as Layout, layout } from '../vendor/dagre-3.1.3.js'
;('use strict')
const columns = { planting_stock: 0, site_treatment: 0, combination: 0, condition: 1, outcome: 2 }
const columnNames = ['Practices', 'Conditions', 'Outcomes']
const nodeWidth = 176
const padding = 12
const strokes = { very_low: 1, low: 1.5, moderate: 2.1, high: 2.8 }
function isGap(item) {
  return 'status' in item
}
function targetOf(item) {
  return isGap(item) ? item.target : (item.target ?? item.target_edge.split('->')[0])
}
function smooth(points, straightEnd = false) {
  let path = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    if (straightEnd && i === points.length - 2) {
      path += ` L${points[i + 1].x},${points[i + 1].y}`
      continue
    }
    const [p0, p1, p2, p3] = [
      points[i - 1] ?? points[i],
      points[i],
      points[i + 1],
      points[i + 2] ?? points[i + 1],
    ]
    const control =
      straightEnd && i === points.length - 3
        ? { x: p2.x - (p3.x - p2.x) / 3, y: p2.y - (p3.y - p2.y) / 3 }
        : { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    path += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${control.x},${control.y} ${p2.x},${p2.y}`
  }
  return path
}
function computeLayout(graph) {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const g = new Layout({ multigraph: true })
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 40, edgesep: 10 })
  g.setDefaultEdgeLabel(() => ({}))
  g.setNode('start', { width: 0, height: 0 })
  g.setNode('end', { width: 0, height: 0 })
  const drawn = [...graph.edges.filter((edge) => edge.kind === 'effect'), ...graph.gaps]
  const degree = (id) =>
    Math.max(
      drawn.filter((edge) => edge.target === id).length,
      graph.edges.filter((edge) => edge.source === id).length,
    )
  for (const node of graph.nodes) {
    g.setNode(node.id, {
      width: nodeWidth,
      height: node.members ? 86 : Math.max(50, degree(node.id) * 13 + 18),
    })
    if (columns[node.kind] === 0) g.setEdge('start', node.id, { weight: 1000 }, `start-${node.id}`)
    if (columns[node.kind] === 2) g.setEdge(node.id, 'end', { weight: 1000 }, `end-${node.id}`)
  }
  for (const edge of drawn)
    g.setEdge(
      edge.source,
      edge.target,
      { width: isGap(edge) ? 92 : 84, height: 28, labelpos: 'c' },
      edge.id,
    )
  layout(g)
  const at = (id) => g.node(id)
  const route = (id, item) => {
    const edge = g.edge(item.source, item.target, id)
    return { points: edge.points, label: { x: edge.x, y: edge.y } }
  }
  const routes = new Map(drawn.map((item) => [item.id, route(item.id, item)]))
  for (const edge of graph.edges.filter((item) => item.kind === 'moderation')) {
    const target = routes.get(edge.target_edge).label
    const end = { x: target.x - 43, y: target.y }
    routes.set(edge.id, { points: [end, end], label: end })
  }
  const items = [...graph.edges, ...graph.gaps]
  const spread = (side, id) => {
    const box = at(id)
    const attached = items
      .filter((item) => (side === 'in' ? item.target : item.source) === id)
      .map((item) => item.id)
    const near = (key) => {
      const { points } = routes.get(key)
      return side === 'in' ? points[points.length - 2] : points[1]
    }
    attached.sort((a, b) => near(a).y - near(b).y)
    attached.forEach((key, index) => {
      const route = routes.get(key)
      const y = box.y - box.height / 2 + ((index + 1) * box.height) / (attached.length + 1)
      const x = box.x + ((side === 'in' ? -1 : 1) * box.width) / 2
      const lead = { x: x + (side === 'in' ? -18 : 18), y }
      const points =
        side === 'in'
          ? [...route.points.slice(0, -1), lead, { x, y }]
          : [{ x, y }, lead, ...route.points.slice(1)]
      routes.set(key, { ...route, points })
    })
  }
  for (const node of graph.nodes) spread('out', node.id)
  for (const node of graph.nodes) spread('in', node.id)
  const taken = [
    ...graph.nodes.map((node) => at(node.id)),
    ...drawn.map((item) => ({
      ...routes.get(item.id).label,
      width: isGap(item) ? 92 : 84,
      height: 28,
    })),
  ]
  const clear = (point) =>
    taken.every(
      (box) =>
        Math.abs(point.x - box.x) > box.width / 2 + 42 ||
        Math.abs(point.y - box.y) > box.height / 2 + 26,
    )
  for (const edge of graph.edges.filter((item) => item.kind === 'moderation')) {
    const route = routes.get(edge.id)
    const [, lead, end] = route.points
    const dx = end.x - lead.x,
      dy = end.y - lead.y
    const length = Math.hypot(dx, dy) || 1
    const along = (t, shift = 0) => ({
      x: lead.x + dx * t - (dy / length) * shift,
      y: lead.y + dy * t + (dx / length) * shift,
    })
    const candidates = [0, -24, 24, -36, 36, -48, 48]
      .flatMap((shift) =>
        Array.from({ length: 13 }, (_, index) => 0.25 + index * 0.045).map((t) => ({
          point: along(t, shift),
          score: Math.abs(t - 0.6) + Math.abs(shift) / 100,
        })),
      )
      .sort((a, b) => a.score - b.score)
    const label = candidates.find(({ point }) => clear(point))?.point ?? along(0.6, -36)
    routes.set(edge.id, { ...route, label })
  }
  const spans = new Map()
  for (const node of graph.nodes)
    spans.set(columns[node.kind], [...(spans.get(columns[node.kind]) ?? []), at(node.id).x])
  const top = Math.min(...graph.nodes.map((node) => at(node.id).y - at(node.id).height / 2))
  const headers = [...spans].map(([column, xs]) => ({
    id: `header-${column}`,
    label: columnNames[column],
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: top - 40,
  }))
  const boxes = graph.nodes.map((node) => at(node.id))
  const left = Math.min(...boxes.map((box) => box.x - box.width / 2))
  const bounds = {
    x: left - padding,
    y: top - 40 - padding,
    width: Math.max(...boxes.map((box) => box.x + box.width / 2)) - left + padding * 2,
    height: Math.max(...boxes.map((box) => box.y + box.height / 2)) - top + 40 + padding * 2,
  }
  const describe = (item) => {
    const source = labels.get(item.source)
    if (isGap(item)) return { from: source, to: labels.get(item.target) }
    if (item.kind === 'moderation') {
      const [changedSource, changedTarget] = item.target_edge.split('->')
      return {
        from: source,
        to: `Effect of ${labels.get(changedSource).toLowerCase()} on ${labels.get(changedTarget).toLowerCase()}`,
      }
    }
    return { from: source, to: labels.get(item.target) }
  }
  return { at, routes, headers, describe, bounds }
}

export { computeLayout, smooth, targetOf, isGap, strokes }
