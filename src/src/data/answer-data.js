export {
  certaintyLabel,
  directionLabel,
  directionLabels,
  noEvidenceNote,
  studyCount,
} from './labels.js'
const files = {
  'q1-tree-planting': 'q1_tree_planting',
  'q2-created-marshes': 'q2_created_marshes',
  'q3-grassland-gaps': 'q3_grassland_gaps',
}
const cache = new Map()
let authorsCache
export function loadPaperAuthors() {
  if (!authorsCache) {
    authorsCache = readJSON(new URL('./paper-authors.json', import.meta.url))
    authorsCache.catch(() => {
      authorsCache = undefined
    })
  }
  return authorsCache
}
export function paperCitation(paper, authors = {}) {
  const author = authors[paper.id]
  const name = author?.first?.split(',')[0].trim()
  return [name ? `${name}${author.count > 1 ? ' et al.' : ''}` : '', paper.year ?? '']
    .filter(Boolean)
    .join(' · ')
}
export async function readJSON(url) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Could not load ${new URL(url, location.href).pathname} (${response.status})`)
  return response.json()
}
export function loadAnswer(id) {
  if (!files[id]) return Promise.reject(new Error('Unknown question'))
  if (!cache.has(id)) {
    const pending = Promise.all([
      readJSON(new URL(`../../answers/${files[id]}.json`, import.meta.url)),
      readJSON(new URL(`./summaries/${id}.json`, import.meta.url)),
      id === 'q1-tree-planting'
        ? readJSON(new URL('../../answers/q1_tree_planting_graph.json', import.meta.url))
        : undefined,
    ]).then(([answer, summary, graph]) => ({ answer, summary, graph }))
    cache.set(id, pending)
    pending.catch(() => cache.delete(id))
  }
  return cache.get(id)
}
export function isFinding(result) {
  return 'direction' in result
}
export const certaintyLevels = ['very_low', 'low', 'moderate', 'high']
const breakdownOrder = [
  'increase',
  'decrease',
  'mixed',
  'no_effect',
  'below_reference',
  'comparable',
  'above_reference',
  'unclear',
]
const breakdownLabels = {
  no_effect: 'no effect',
  unclear: 'unclear',
  below_reference: 'below',
  above_reference: 'above',
}
export function studyBreakdown(finding) {
  return (
    'Studies: ' +
    Object.entries(finding.study_directions)
      .sort(([a], [b]) => breakdownOrder.indexOf(a) - breakdownOrder.indexOf(b))
      .filter(([, count]) => count > 0)
      .map(([direction, count]) => `${count} ${breakdownLabels[direction] ?? direction}`)
      .join(' · ')
  )
}
export function hasBreakdown(finding) {
  return Object.values(finding.study_directions).filter((count) => count > 0).length > 1
}
const designs = {
  high: 'randomized against an untreated control',
  moderate: 'controlled or quasi-experimental',
  low: 'observational',
  'very low': 'modelling or case studies',
}
function explainStep(step) {
  const start = step.match(/^start (very low|low|moderate|high)/)
  if (start) return `Strongest design: ${designs[start[1]]}`
  const agree = step.match(/^\+1 (\d+) studies agree/)
  if (agree) return `Raised: ${agree[1]} studies agree`
  if (step.startsWith('+1 mechanistic'))
    return 'Raised: both a mechanism and a measured effect are reported'
  if (step.startsWith('-1 single study')) return 'Lowered: only one study'
  if (step.startsWith('-1 studies disagree')) return 'Lowered: studies disagree'
  if (step.startsWith('-1 most claims report no comparator'))
    return 'Lowered: most results have no comparison group'
  return step
}
export function certaintyReasons(rationale) {
  return rationale
    .split('->')[0]
    .split(';')
    .map((step) => step.trim())
    .filter(Boolean)
    .map(explainStep)
}
export function papersFor(edgeIds, evidence) {
  const papers = new Map()
  for (const edge_id of edgeIds) {
    const claim = evidence[edge_id]
    if (!claim) continue
    const paper = papers.get(claim.document_id) ?? {
      id: claim.document_id,
      title: cleanQuote(claim.title ?? claim.document_id),
      year: claim.year,
      doi: claim.doi,
      claims: [],
    }
    paper.claims.push({ ...claim, edge_id })
    papers.set(claim.document_id, paper)
  }
  return [...papers.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
}
export function cleanQuote(quote) {
  return quote
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?[a-z][a-z0-9]*>/gi, '')
    .replaceAll('*', '')
    .replace(/\s+/g, ' ')
    .trim()
}
export function layoutFor(answer) {
  if (answer.summary?.cells) return 'coverage'
  if (answer.short_answer || answer.with_time) return 'reference'
  return 'matrix'
}
export function uniqueLabels(results, key, nodes = []) {
  const order = new Map(nodes.map((node, index) => [node.id, index]))
  const items = new Map()
  for (const result of results) items.set(result[key].id, result[key])
  return [...items.values()].sort(
    (a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size),
  )
}
export function groupByKind(labels, nodes = []) {
  const kinds = new Map(nodes.map((node) => [node.id, node.kind]))
  const groups = new Map()
  for (const label of labels) {
    const kind = kinds.get(label.id) ?? null
    groups.set(kind, [...(groups.get(kind) ?? []), label])
  }
  return [...groups].map(([kind, items]) => ({
    kind,
    label: kind ? kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll('_', ' ') : '',
    items,
  }))
}
