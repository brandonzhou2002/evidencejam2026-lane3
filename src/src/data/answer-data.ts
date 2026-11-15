import type { questions } from '../questions'
import { nodes as graphNodes } from '../../../answers/q1_tree_planting_graph.json'

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
  subject: string; predicate?: string; object: string;
}
export type Answer = {
  id: string; question: string; how_built: string; findings: Finding[]; gaps: Gap[];
  limitations: string[]; evidence: Record<string, Evidence>; with_time?: Finding[];
  interactions?: { edge_id: string; direction: string }[];
  short_answer?: { time_to_reference: string | null; time_to_reference_note: string; lagging_attributes: string[] };
  summary?: { cells: number; filled: number; thin: number; empty: number; densest: string[] };
}
export type SummarySentence = { text: string; finding_ids: string[]; gap_ids: string[]; interaction_ids?: string[] }
export function sentenceIds(sentence: SummarySentence) {
  return [...sentence.finding_ids, ...sentence.gap_ids, ...(sentence.interaction_ids ?? [])]
}
export type Bundle = { answer: Answer; summary: { text: string; sentences: SummarySentence[] } }

const loaders = {
  'q1-tree-planting': () => Promise.all([import('../../../answers/q1_tree_planting.json'), import('./summaries/q1-tree-planting.json')]),
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
    pending = loaders[id]().then(([answer, summary]) => {
      const bundle = { answer: answer.default as unknown as Answer, summary: summary.default }
      loaded.set(id, bundle)
      return bundle
    })
    cache.set(id, pending)
    pending.catch(() => cache.delete(id))
  }
  return pending
}

export function isFinding(result: Result): result is Finding { return 'direction' in result }
export const directionLabels: Record<string, string> = {
  increase: 'Increase', decrease: 'Decrease', mixed: 'Mixed', no_effect: 'No effect detected', unclear: 'Unclear direction',
  below_reference: 'Below reference', above_reference: 'Above reference', comparable: 'Comparable',
}
export function directionLabel(value: string) { return directionLabels[value] ?? value.replaceAll('_', ' ') }
export function certaintyLabel(value: string) { return value === 'very_low' ? 'Very low' : value.charAt(0).toUpperCase() + value.slice(1) }
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
export function studyCount(count: number) { return `${count} ${count === 1 ? 'study' : 'studies'}` }

export type Layout = 'coverage' | 'reference' | 'matrix'
export function layoutFor(answer: Answer): Layout {
  if (answer.summary?.cells) return 'coverage'
  if (answer.short_answer || answer.with_time) return 'reference'
  return 'matrix'
}

const nodeOrder = new Map(graphNodes.map((node, index) => [node.id, index]))
const nodeKind = new Map(graphNodes.map((node) => [node.id, node.kind]))

export function uniqueLabels(results: Result[], key: 'subject' | 'outcome'): Label[] {
  const items = new Map<string, Label>()
  for (const result of results) items.set(result[key].id, result[key])
  return [...items.values()].sort((a, b) => (nodeOrder.get(a.id) ?? nodeOrder.size) - (nodeOrder.get(b.id) ?? nodeOrder.size))
}

export type Group = { kind: string | null; label: string; items: Label[] }
export function groupByKind(labels: Label[]): Group[] {
  const groups = new Map<string | null, Label[]>()
  for (const label of labels) {
    const kind = nodeKind.get(label.id) ?? null
    groups.set(kind, [...(groups.get(kind) ?? []), label])
  }
  return [...groups].map(([kind, items]) => ({ kind, label: kind ? kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll('_', ' ') : '', items }))
}
