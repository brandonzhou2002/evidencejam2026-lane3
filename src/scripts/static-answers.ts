import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { questions } from '../src/questions.ts'
import { certaintyLabel, directionLabel, limitationText, noEvidenceNote, studyCount } from '../src/data/labels.ts'
import { packNotes } from '../src/data/pack-notes.ts'
import { certaintyExplanation, certaintyScaleExplanation, directionExplanation, mixedCertaintyExplanation } from '../src/data/certainty.ts'

type Label = { id: string; label: string }
type Finding = { subject: Label; outcome: Label; direction: string; certainty: string; studies: number; time_points?: string[] }
type Gap = Pick<Finding, 'subject' | 'outcome'>
type Answer = {
  findings: Finding[]; gaps: Gap[]; limitations: string[]; with_time?: Finding[]
  interactions?: { edge_id: string; direction: string }[]; evidence: Record<string, { subject: string; object: string }>
  short_answer?: { time_to_reference_note: string }
  summary?: { grassland_claims: number; claims_pooled: number }
}
type Graph = {
  nodes: { id: string; label: string; members?: string[] }[]
  edges: { kind: string; source: string; target: string | null; target_edge?: string; direction: string; certainty: string; studies: number }[]
  gaps: { source: string; target: string }[]
}

const files: Record<string, string> = { 'q1-tree-planting': 'q1_tree_planting', 'q2-created-marshes': 'q2_created_marshes', 'q3-grassland-gaps': 'q3_grassland_gaps' }
const root = resolve(import.meta.dirname, '..')
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' })[char]};`)
const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`
const grade = (item: { direction: string; certainty: string; studies: number }) =>
  `${escape(directionLabel(item.direction))}, ${escape(certaintyLabel(item.certainty).toLowerCase())} certainty, ${studyCount(item.studies)}`

function finding(item: Finding) {
  const times = item.time_points?.length ? ` (${escape(item.time_points.join('; '))})` : ''
  return `<strong>${escape(item.subject.label)} → ${escape(item.outcome.label)}</strong>: ${grade(item)}${times}`
}

function gaps(items: Gap[]) {
  const bySubject = new Map<string, string[]>()
  for (const gap of items) bySubject.set(gap.subject.label, [...(bySubject.get(gap.subject.label) ?? []), gap.outcome.label])
  return `<h3>No evidence found</h3><p>${escape(noEvidenceNote)}</p>${list([...bySubject].map(([subject, outcomes]) => `<strong>${escape(subject)}</strong>: ${escape(outcomes.join(', '))}`))}`
}

function graphLinks(graph: Graph, answer: Answer) {
  const label = (id: string) => escape(graph.nodes.find((node) => node.id === id)?.label ?? id)
  const pair = (item: Gap) => `${item.subject.id}->${item.outcome.id}`
  const shown = new Set(answer.findings.map(pair))
  const gapPairs = new Set(answer.gaps.map(pair))
  const links = graph.edges.filter((edge) => !shown.has(`${edge.source}->${edge.target}`)).map((edge) => {
    if (edge.kind === 'moderation') {
      const [from, to] = edge.target_edge!.split('->')
      return `<strong>${label(edge.source)}</strong> changes the effect of ${label(from)} on ${label(to)}: ${grade(edge)}`
    }
    return `<strong>${label(edge.source)} → ${label(edge.target!)}</strong>: ${grade(edge)}`
  })
  const missing = graph.gaps.filter((gap) => !shown.has(`${gap.source}->${gap.target}`) && !gapPairs.has(`${gap.source}->${gap.target}`))
    .map((gap) => `<strong>${label(gap.source)} → ${label(gap.target)}</strong>: no evidence found`)
  return `<h3>How the practices connect</h3><p>Besides the findings above, practices act on seedlings through the conditions they change. Each link is its own body of evidence. A path through a condition joins results that mostly come from different studies, so it is not one tested effect.</p>${list([...links, ...missing])}`
}

export function staticAnswers() {
  const sections = questions.map(({ id, title, question }) => {
    const answer = read<Answer>(`../answers/${files[id]}.json`)
    const summary = read<{ text: string }>(`src/data/summaries/${id}.json`)
    const graph = id === 'q1-tree-planting' ? read<Graph>(`../answers/${files[id]}_graph.json`) : null
    return `<section id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${escape(title)}</h2><p><em>${escape(question)}</em></p>`
      + (answer.short_answer ? `<p>${escape(answer.short_answer.time_to_reference_note)}</p>` : '')
      + `<p>${escape(summary.text)}</p>`
      + `<h3>Findings</h3>${list(answer.findings.map(finding))}`
      + (answer.with_time?.length ? `<h3>Changes with marsh age</h3>${list(answer.with_time.map(finding))}` : '')
      + (answer.gaps.length ? gaps(answer.gaps) : '')
      + (answer.interactions?.length ? `<h3>Combined treatments</h3>${list(answer.interactions.map(({ edge_id, direction }) => {
        const claim = answer.evidence[edge_id]
        const note = packNotes[edge_id] ? ` <em>${escape(packNotes[edge_id])}</em>` : ''
        return `${escape(claim.subject)} → ${escape(claim.object)}: ${escape(directionLabel(direction))}.${note}`
      }))}` : '')
      + (graph ? graphLinks(graph, answer) : '')
      + `<h3>Limitations</h3>${list(answer.limitations.map((limit) => escape(limitationText(limit, answer.summary))))}</section>`
  })
  const nav = list(questions.map(({ id, title }) => `<a href="#${id}">${escape(title)}</a>`))
  const certainty = `<details><summary>Effect direction and certainty</summary>${[directionExplanation, certaintyExplanation, mixedCertaintyExplanation, certaintyScaleExplanation].map((text) => `<p>${escape(text)}</p>`).join('')}</details>`
  return `<noscript><div class="static-answers"><h1>What does the evidence say?</h1><nav aria-label="Questions">${nav}</nav>${certainty}${sections.join('')}</div></noscript>`
}
