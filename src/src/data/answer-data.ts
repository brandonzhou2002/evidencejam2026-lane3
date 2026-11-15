import type { questions } from '../questions'
export type Question = typeof questions[number]
export type Label = { id: string; label: string }
export type Finding = {
  id: string; subject: Label; outcome: Label; direction: string; certainty: string;
  studies: number; claims: number; study_directions: Record<string, number>;
  certainty_rationale: string; edge_ids: string[]; document_ids: string[];
  time_points?: string[]; density?: 'thin' | 'some' | 'dense'; lags?: boolean;
}
export type Gap = { id: string; subject: Label; outcome: Label; status: 'no_evidence'; studies: number; searched_for: string }
export type Result = Finding | Gap
export type Evidence = {
  quote?: string; title?: string; year?: number; doi?: string; document_id: string;
  subject: string; predicate?: string; object: string; direction?: string;
}
export type Answer = {
  id: string; question: string; how_built: string; findings: Finding[]; gaps: Gap[];
  limitations: string[]; evidence: Record<string, Evidence>; with_time?: Finding[];
  interactions?: { edge_id: string; direction: string }[];
  short_answer?: { time_to_reference: string | null; time_to_reference_note: string; lagging_attributes: string[] };
  summary?: { cells: number; filled: number; thin: number; empty: number; densest: string[]; grassland_claims: number; claims_pooled: number; claims_not_pooled: Record<string, number> };
}
export type SummarySentence = { text: string; finding_ids: string[]; gap_ids: string[]; interaction_ids?: string[] }
export function sentenceIds(sentence: SummarySentence) {
  return [...sentence.finding_ids, ...sentence.gap_ids, ...(sentence.interaction_ids ?? [])]
}
export type GraphNode = { id: string; label: string; kind: string; members?: string[] }
export type GraphEdge = Omit<Finding, 'id' | 'subject' | 'outcome'> & { id: string; kind: 'effect' | 'moderation'; source: string; target: string | null; target_edge?: string }
export type GraphGap = { id: string; source: string; target: string; status: 'no_evidence'; searched_for: string }
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[]; gaps: GraphGap[]; evidence: Record<string, Evidence> }
type Summary = { text: string; sentences: SummarySentence[] }
export type Bundle = { answer: Answer; summary: Summary; graph?: Graph }

type Module = { default: unknown }
function toBundle([answer, summary, graph]: Module[]): Bundle {
  return { answer: answer.default as Answer, summary: summary.default as Summary, graph: graph?.default as Graph | undefined }
}
const loaders: Record<Question['id'], () => Promise<Module[]>> = {
  'q1-tree-planting': () => Promise.all([import('../../../answers/q1_tree_planting.json'), import('./summaries/q1-tree-planting.json'), import('../../../answers/q1_tree_planting_graph.json')]),
  'q2-created-marshes': () => Promise.all([import('../../../answers/q2_created_marshes.json'), import('./summaries/q2-created-marshes.json')]),
  'q3-grassland-gaps': () => Promise.all([import('../../../answers/q3_grassland_gaps.json'), import('./summaries/q3-grassland-gaps.json')]),
}
const cache = new Map<string, Promise<Bundle>>()
const loaded = new Map<string, Bundle>()
export function loadedAnswer(id: Question['id']) {
  return loaded.get(id) ?? null
}
export function loadAnswer(id: Question['id']): Promise<Bundle> {
  let pending = cache.get(id)
  if (!pending) {
    pending = loaders[id]().then((modules) => {
      const bundle = toBundle(modules)
      loaded.set(id, bundle)
      return bundle
    })
    cache.set(id, pending)
    pending.catch(() => cache.delete(id))
  }
  return pending
}

export { certaintyLabel, directionLabel, directionLabels, noEvidenceNote, studyCount } from './labels'
export function isFinding(result: Result): result is Finding { return 'direction' in result }
export const certaintyLevels = ['very_low', 'low', 'moderate', 'high']

const breakdownOrder = ['increase', 'decrease', 'mixed', 'no_effect', 'below_reference', 'comparable', 'above_reference', 'unclear']
const breakdownLabels: Record<string, string> = { no_effect: 'no effect', unclear: 'unclear', below_reference: 'below', above_reference: 'above' }
export function studyBreakdown(finding: Finding) {
  return 'Studies: ' + Object.entries(finding.study_directions).sort(([a], [b]) => breakdownOrder.indexOf(a) - breakdownOrder.indexOf(b))
    .filter(([, count]) => count > 0).map(([direction, count]) => `${count} ${breakdownLabels[direction] ?? direction}`).join(' · ')
}
export function hasBreakdown(finding: Finding) {
  return Object.values(finding.study_directions).filter((count) => count > 0).length > 1
}

const designs: Record<string, string> = {
  high: 'randomized against an untreated control',
  moderate: 'controlled or quasi-experimental',
  low: 'observational',
  'very low': 'modelling or case studies',
}
function explainStep(step: string) {
  const start = step.match(/^start (very low|low|moderate|high)/)
  if (start) return `Strongest design: ${designs[start[1]]}`
  const agree = step.match(/^\+1 (\d+) studies agree/)
  if (agree) return `Raised: ${agree[1]} studies agree`
  if (step.startsWith('+1 mechanistic')) return 'Raised: both a mechanism and a measured effect are reported'
  if (step.startsWith('-1 single study')) return 'Lowered: only one study'
  if (step.startsWith('-1 studies disagree')) return 'Lowered: studies disagree'
  if (step.startsWith('-1 most claims report no comparator')) return 'Lowered: most results have no comparison group'
  return step
}
export function certaintyReasons(rationale: string) {
  return rationale.split('->')[0].split(';').map((step) => step.trim()).filter(Boolean).map(explainStep)
}
export type Paper = { id: string; title: string; year?: number; doi?: string; claims: (Evidence & { edge_id: string })[] }
export function papersFor(edgeIds: string[], evidence: Record<string, Evidence>): Paper[] {
  const papers = new Map<string, Paper>()
  for (const edge_id of edgeIds) {
    const claim = evidence[edge_id]
    if (!claim) continue
    const paper = papers.get(claim.document_id) ?? { id: claim.document_id, title: cleanQuote(claim.title ?? claim.document_id), year: claim.year, doi: claim.doi, claims: [] }
    paper.claims.push({ ...claim, edge_id })
    papers.set(claim.document_id, paper)
  }
  return [...papers.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
}
export function cleanQuote(quote: string) {
  return quote.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<\/?[a-z][a-z0-9]*>/gi, '').replaceAll('*', '').replace(/\s+/g, ' ').trim()
}
export type Layout = 'coverage' | 'reference' | 'matrix'
export function layoutFor(answer: Answer): Layout {
  if (answer.summary?.cells) return 'coverage'
  if (answer.short_answer || answer.with_time) return 'reference'
  return 'matrix'
}

export function uniqueLabels(results: Result[], key: 'subject' | 'outcome', nodes: GraphNode[] = []): Label[] {
  const order = new Map(nodes.map((node, index) => [node.id, index]))
  const items = new Map<string, Label>()
  for (const result of results) items.set(result[key].id, result[key])
  return [...items.values()].sort((a, b) => (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size))
}

export type Group = { kind: string | null; label: string; items: Label[] }
export function groupByKind(labels: Label[], nodes: GraphNode[] = []): Group[] {
  const kinds = new Map(nodes.map((node) => [node.id, node.kind]))
  const groups = new Map<string | null, Label[]>()
  for (const label of labels) {
    const kind = kinds.get(label.id) ?? null
    groups.set(kind, [...(groups.get(kind) ?? []), label])
  }
  return [...groups].map(([kind, items]) => ({ kind, label: kind ? kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll('_', ' ') : '', items }))
}
