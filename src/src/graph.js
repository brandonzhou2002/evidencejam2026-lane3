import { computeLayout, smooth, targetOf, isGap, strokes } from './graph-layout.js'
import { certaintyLabel, certaintyLevels, directionLabel, studyCount } from './data/answer-data.js'
import {
  escapeHTML as e,
  opener,
  linkedAttribute,
  dots,
  certaintyInfo,
  directionIcon,
} from './ui.js'

const layouts = new WeakMap()
export function prepareGraph(graph) {
  if (!layouts.has(graph)) layouts.set(graph, computeLayout(graph))
  return layouts.get(graph)
}
export function graphFinding(item, graph) {
  const layout = prepareGraph(graph)
  const { from, to } = layout.describe(item)
  const subject = { id: item.source, label: from }
  const outcome = { id: targetOf(item), label: to }
  return isGap(item)
    ? { kind: 'gap', item: { ...item, subject, outcome, studies: 0 } }
    : { kind: 'finding', item: { ...item, subject, outcome } }
}

export function renderGraph(graph) {
  const { at, routes, headers, describe, bounds } = prepareGraph(graph)
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const items = [...graph.edges, ...graph.gaps]
  const paths = items
    .map((item) => {
      const gap = isGap(item),
        moderation = item.kind === 'moderation'
      const route = routes.get(item.id),
        path = smooth(route.points, !moderation)
      const linkIds = [`q1:${item.source}:${item.target}`, ...(gap ? [] : item.edge_ids)]
      const classes = `graph-edge${gap ? ' is-gap' : ''}${moderation ? ' is-moderation' : ''}`
      const end = route.points.at(-1)
      return `<g data-graph-edge="${e(item.id)}">
      <path class="${classes}" ${linkedAttribute(linkIds)} data-edge-path="${e(item.id)}" d="${path}" style="stroke-width:${gap ? 1.4 : strokes[item.certainty]}"${gap ? '' : ' marker-end="url(#graph-arrow)"'}></path>
      <path class="graph-flow" data-flow="${e(item.id)}" d="${path}" style="stroke-width:${(gap ? 1.4 : strokes[item.certainty]) + 1}" hidden></path>
      <path class="graph-hit" data-open="${e(item.id)}" d="${path}"></path>
      ${moderation ? `<circle class="moderation-endpoint" ${linkedAttribute(linkIds)} cx="${end.x}" cy="${end.y}" r="2.5" data-endpoint="${e(item.id)}"></circle>` : ''}
    </g>`
    })
    .join('')
  const nodes = graph.nodes
    .map((node) => {
      const box = at(node.id)
      return `<div class="graph-node kind-${e(node.kind)}" data-node="${e(node.id)}" style="left:${box.x - box.width / 2 - bounds.x}px;top:${box.y - box.height / 2 - bounds.y}px;width:${box.width}px;height:${box.height}px">${
        node.members
          ? `<span class="graph-node-note">Applied together</span><ul>${node.members.map((id) => `<li>${e(labels.get(id))}</li>`).join('')}</ul>`
          : e(node.label)
      }</div>`
    })
    .join('')
  const badges = items
    .map((item) => {
      const gap = isGap(item),
        { from, to } = describe(item),
        { label } = routes.get(item.id)
      const description = gap
        ? `${from} to ${to}: no evidence found`
        : `${from} to ${to}: ${directionLabel(item.direction)}, ${certaintyLabel(item.certainty)} certainty, ${studyCount(item.studies)}`
      const linkIds = [`q1:${item.source}:${item.target}`, ...(gap ? [] : item.edge_ids)]
      return `<span class="graph-label${gap ? ' is-gap' : ''}" data-graph-label="${e(item.id)}" ${linkedAttribute(linkIds)} style="left:${label.x - bounds.x}px;top:${label.y - bounds.y}px">
      <button type="button" class="graph-evidence-button" ${opener(item.id)} title="${e(description)}">${gap ? '<span aria-hidden="true">No evidence</span>' : `${directionIcon(item.direction, 12)}${dots(item.certainty, 'graph-dots')}`}<span class="sr-only">${e(description)}</span></button>
      ${gap ? '' : certaintyInfo(item, `${from} to ${to}`)}
    </span>`
    })
    .join('')
  return `<section class="evidence-graph" aria-label="How practices act on seedlings, directly and through the conditions they change">
    <div class="graph-scroll"><div class="graph-frame" style="width:${bounds.width}px;height:${bounds.height}px">
      <svg class="graph-connections" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" aria-hidden="true">
        <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#6f8f7e"></path></marker><marker id="graph-arrow-active" viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#a4edc8"></path></marker></defs>
        ${paths}
      </svg>
      ${headers.map((h) => `<span class="graph-header" style="left:${h.x - 100 - bounds.x}px;top:${h.y - bounds.y}px;width:200px">${e(h.label)}</span>`).join('')}
      ${nodes}${badges}
    </div></div>
    <div class="graph-legend">${['increase', 'decrease', 'mixed', 'no_effect', 'unclear'].map((d) => `<span>${directionIcon(d, 13)}${e(directionLabel(d))}</span>`).join('')}
      <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" class="legend-line is-moderation"></line></svg>Changes the size of another effect</span>
      <span><svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" class="legend-line is-gap"></line></svg>Looked for, no evidence found</span>
    </div>
    <div class="graph-legend" role="group" aria-label="Certainty scale"><span>Certainty:</span>${certaintyLevels.map((grade) => `<span>${dots(grade, 'graph-dots')}${e(certaintyLabel(grade))}</span>`).join('')}<span>Thicker lines indicate higher certainty.</span></div>
    <p class="graph-note">Each arrow has separate evidence, often from different studies. A path is not one tested effect.</p>
  </section>`
}

export function updateGraph(
  container,
  graph,
  linked,
  openedId,
  hoveredNode = null,
  pointedEdge = null,
) {
  const items = [...graph.edges, ...graph.gaps]
  const linkedEdges = new Set(
    items
      .filter(
        (item) =>
          linked &&
          [`q1:${item.source}:${item.target}`, ...(item.edge_ids ?? [])].some((id) =>
            linked.has(id),
          ),
      )
      .map((item) => item.id),
  )
  const contextEdges = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.kind === 'moderation' &&
          (linkedEdges.has(edge.id) || edge.id === openedId || edge.id === pointedEdge),
      )
      .map((edge) => edge.target_edge),
  )
  const connected = hoveredNode
    ? new Set(
        items
          .filter((item) => item.source === hoveredNode || item.target === hoveredNode)
          .flatMap((item) => [item.source, targetOf(item)]),
      )
    : null
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const element of container.querySelectorAll('[data-node]'))
    element.classList.toggle('is-faded', !!connected && !connected.has(element.dataset.node))
  for (const element of container.querySelectorAll('[data-edge-path], [data-graph-label]')) {
    const id = element.dataset.edgePath ?? element.dataset.graphLabel,
      item = byId.get(id)
    const selected = id === openedId || id === pointedEdge
    element.classList.toggle('is-context', contextEdges.has(id))
    element.classList.toggle('is-selected', selected)
    element.classList.toggle(
      'is-faded',
      !!hoveredNode && item.source !== hoveredNode && item.target !== hoveredNode,
    )
    if (element.hasAttribute('marker-end'))
      element.setAttribute(
        'marker-end',
        `url(#graph-arrow${linkedEdges.has(id) || selected || contextEdges.has(id) ? '-active' : ''})`,
      )
  }
  for (const flow of container.querySelectorAll('[data-flow]')) {
    flow.toggleAttribute(
      'hidden',
      flow.dataset.flow !== openedId && flow.dataset.flow !== pointedEdge,
    )
    flow.classList.toggle('is-preview', flow.dataset.flow !== openedId)
  }
}
