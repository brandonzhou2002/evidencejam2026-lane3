import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, X } from '@phosphor-icons/react'
import { certaintyLabel, certaintyLevels, certaintyReasons, cleanQuote, directionLabel, groupByKind, hasBreakdown, isFinding, layoutFor, loadAnswer, loadedAnswer, noEvidenceNote, papersFor, sentenceIds, studyBreakdown, studyCount, uniqueLabels } from '../data/answer-data'
import { packNotes } from '../data/pack-notes'
import { limitationText, mappedGapNote } from '../data/labels'
import type { Answer, Bundle, Evidence, Finding, Gap, Graph, Question, Result, SummarySentence } from '../data/answer-data'
import { DrawerContext, linkClass, openedId, useOpener } from './evidence-context'
import DirectionIcon from './DirectionIcon'
import type { Drawer, Linked, Opened } from './evidence-context'
import FieldWork from './FieldWork'
import CertaintyInfo from './CertaintyInfo'
import GraphPanel from './GraphPanel'
import { loadEvidenceGraph } from './load-evidence-graph'
import './AnswerView.css'


function glide(read: () => number, write: (value: number) => void, to: number, duration: number) {
  const from = read()
  const start = performance.now()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
  }
  const tick = (now: number) => {
    const progress = duration ? Math.min((now - start) / duration, 1) : 1
    const eased = 1 - (1 - progress) ** 3
    write(from + (to - from) * eased)
    if (progress < 1) frame = requestAnimationFrame(tick)
    else stop()
  }
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  frame = requestAnimationFrame(tick)
  return stop
}

function Direction({ value, label }: { value: string; label?: string }) {
  return <span className="direction"><DirectionIcon value={value} size={16} />{label ?? directionLabel(value)}</span>
}

function Certainty({ finding }: { finding: Finding }) {
  const value = finding.certainty
  const level = certaintyLevels.indexOf(value) + 1
  return <span className="certainty">
    <span className="certainty-dots" aria-hidden="true">{certaintyLevels.map((_, index) => <i key={index} className={index < level ? 'on' : ''} />)}</span>
    {certaintyLabel(value)} certainty
    <CertaintyInfo finding={finding} label={`${finding.subject.label} → ${finding.outcome.label}`} />
  </span>
}

function wordCount(sentences: SummarySentence[]) {
  return sentences.reduce((sum, sentence) => sum + sentence.text.split(' ').length, 0)
}

function Takeaways({ sentences, pinned, onPin, onPreview, revealed }: { sentences: SummarySentence[]; pinned: number | null; onPin: (index: number | null) => void; onPreview: (index: number | null) => void; revealed: number }) {
  const streaming = revealed < wordCount(sentences)
  const split = sentences.length > 3 ? Math.ceil(sentences.length / 2) : sentences.length
  const renderSentence = (sentence: SummarySentence, index: number) => {
    const count = sentenceIds(sentence).length
    const words = sentence.text.split(' ')
    const shown = streaming ? Math.min(words.length, revealed - wordCount(sentences.slice(0, index))) : words.length
    if (shown <= 0) return null
    const lead = index % split ? ' ' : ''
    if (streaming || !count) {
      return <span key={index}>{lead}<span className={count ? 'is-linkable' : undefined}>{words.slice(0, shown).join(' ')}</span>{shown < words.length && <span className="stream-caret" aria-hidden="true" />}</span>
    }
    const toggle = () => onPin(pinned === index ? null : index)
    return <span key={index}>{lead}<span className="is-linkable" role="button" tabIndex={0} aria-pressed={pinned === index} title="Show supporting findings"
      onClick={toggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() } }}
      onMouseEnter={() => onPreview(index)} onMouseLeave={() => onPreview(null)} onFocus={() => onPreview(index)} onBlur={() => onPreview(null)}>
      {sentence.text}<span className="sr-only"> Highlights {count} related results.</span>
    </span></span>
  }
  const paragraphs = [sentences.slice(0, split), sentences.slice(split)].filter((group) => group.length)
  return <div className="takeaways" aria-busy={streaming}>{paragraphs.map((group, p) => {
    const offset = p ? split : 0
    if (streaming && revealed <= wordCount(sentences.slice(0, offset))) return null
    return <p key={p}>{group.map((sentence, i) => renderSentence(sentence, offset + i))}</p>
  })}</div>
}

type ViewProps = { answer: Answer; graph?: Graph; linked: Linked }

function EffectMatrix({ answer, graph, linked }: ViewProps) {
  const [view, setView] = useState<'table' | 'graph'>('table')
  const results = [...answer.findings, ...answer.gaps]
  const outcomes = uniqueLabels(results, 'outcome', graph?.nodes)
  const groups = groupByKind(uniqueLabels(results, 'subject', graph?.nodes), graph?.nodes)
  const cell = (subject: string, outcome: string) => results.find((result) => result.subject.id === subject && result.outcome.id === outcome)
  return <section className="glance" aria-labelledby="glance-title">
    <h2 id="glance-title" className="sr-only">Findings by practice and outcome</h2>
    {graph && <div className="view-switch" role="group" aria-label="Show findings as">
      <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
      <button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Graph</button>
    </div>}
    {graph && view === 'graph' ? <GraphPanel graph={graph} linked={linked} onBack={() => setView('table')} /> : <div className="matrix" role="table" aria-labelledby="glance-title">
      <div className="matrix-head" role="row">
        <span role="columnheader"><span className="sr-only">Practice</span></span>
        {outcomes.map((outcome) => <span role="columnheader" key={outcome.id}>{outcome.label}</span>)}
      </div>
      {groups.map((group) => <div className="matrix-group" role="rowgroup" key={group.kind ?? 'other'}>
        {groups.length > 1 && group.label && <div className="matrix-group-label" role="row"><span role="rowheader">{group.label}</span></div>}
        {group.items.map((subject) => <div className="matrix-row" role="row" key={subject.id}>
          <span role="rowheader" className="matrix-practice">{subject.label}</span>
          {outcomes.map((outcome) => {
            const result = cell(subject.id, outcome.id)
            return <span role="cell" key={outcome.id} data-outcome={outcome.label}>{result && <ResultCell result={result} linked={linked} />}</span>
          })}
        </div>)}
      </div>)}
    </div>}
    {!!answer.interactions?.length && <div className="combined">
      <h3>Combined treatments</h3>
      <ul>{answer.interactions.map((item) => answer.evidence[item.edge_id] && <CombinedRow key={item.edge_id} answer={answer} edgeId={item.edge_id} direction={item.direction} linked={linked} />)}</ul>
    </div>}
  </section>
}

function ClaimText({ subject, object, predicate }: { subject: string; object: string; predicate?: string }) {
  return <>{subject} <ArrowRight size={13} aria-label={predicate === 'moderates' ? 'changes' : 'affects'} /> {object}</>
}

function CombinedRow({ answer, edgeId, direction, linked }: { answer: Answer; edgeId: string; direction: string; linked: Linked }) {
  const claim = answer.evidence[edgeId]
  const opener = useOpener({ kind: 'claim', id: edgeId, direction })
  return <li className={linkClass(edgeId, linked).trim() || undefined}>
    <button {...opener}><span><ClaimText {...claim} /></span><Direction value={direction} /></button>
    {packNotes[edgeId] && <p className="pack-note">{packNotes[edgeId]}</p>}
  </li>
}

function ResultCell({ result, linked }: { result: Result; linked: Linked }) {
  const opener = useOpener(isFinding(result) ? { kind: 'finding', item: result } : { kind: 'gap', item: result })
  if (!isFinding(result)) return <button {...opener} className={`result-cell gap${linkClass(result.id, linked)}`}>No evidence found</button>
  return <div className={`result-cell${linkClass(result.id, linked)}`}>
    <button {...opener} type="button" className="finding-open" aria-label={`View evidence: ${result.subject.label}, ${result.outcome.label}, ${directionLabel(result.direction)}, ${certaintyLabel(result.certainty)} certainty, ${studyCount(result.studies)}`} />
    <Direction value={result.direction} />
    <span className="result-meta"><Certainty finding={result} /><span>{studyCount(result.studies)}</span></span>
    {hasBreakdown(result) && <span className="result-breakdown">{studyBreakdown(result)}</span>}
  </div>
}

function FindingRow({ finding, name, linked, tag, extra }: { finding: Finding; name: string; linked: Linked; tag?: string; extra?: ReactNode }) {
  const opener = useOpener({ kind: 'finding', item: finding })
  const effectLabel = finding.direction === 'no_effect' ? 'No clear evidence of change' : directionLabel(finding.direction)
  return <li className={`finding-row${linkClass(finding.id, linked)}`}>
    <button {...opener} type="button" className="finding-open" aria-label={`View evidence: ${name}, ${effectLabel}, ${certaintyLabel(finding.certainty)} certainty, ${studyCount(finding.studies)}`} />
    <span className="finding-name">{name}{tag && <span className="tag">{tag}</span>}</span>
    <Direction value={finding.direction} label={effectLabel} />
    <Certainty finding={finding} />
    <span className="finding-studies">{studyCount(finding.studies)}</span>
    {(hasBreakdown(finding) || extra) && <span className="finding-extra">{extra}{hasBreakdown(finding) && <span>{studyBreakdown(finding)}</span>}</span>}
  </li>
}

function GapChip({ gap, linked }: { gap: Gap; linked: Linked }) {
  const opener = useOpener({ kind: 'gap', item: gap })
  return <li className={linkClass(gap.id, linked).trim() || undefined}><button {...opener}>{gap.outcome.label}</button></li>
}

function ages(finding: Finding) {
  if (!finding.time_points?.length) return undefined
  return <span>Ages observed: {[...finding.time_points].sort((a, b) => parseFloat(a) - parseFloat(b)).join(', ')}</span>
}

function ReferenceComparison({ answer, linked }: ViewProps) {
  const lagging = answer.findings.filter((finding) => finding.lags)
  const rest = answer.findings.filter((finding) => !finding.lags)
  const comparison = answer.findings[0]?.subject.label ?? 'Compared with reference'
  return <section className="glance marsh" aria-label="Findings">
    <h2>{comparison}</h2>
    <ul className="finding-list">
      {[...lagging, ...rest].map((finding) => <FindingRow key={finding.id} finding={finding} name={finding.outcome.label} linked={linked} tag={finding.lags ? 'Lags' : undefined} extra={ages(finding)} />)}
    </ul>
    <GapChips gaps={answer.gaps} linked={linked} />
    {!!answer.with_time?.length && <>
      <h2>{answer.with_time[0].subject.label}</h2>
      <p className="trend-note">No clear evidence of change means the studies did not detect a clear change—not that no change occurred.</p>
      <ul className="finding-list">
        {answer.with_time.map((finding) => <FindingRow key={finding.id} finding={finding} name={finding.outcome.label} linked={linked} extra={ages(finding)} />)}
      </ul>
    </>}
  </section>
}

function GapChips({ gaps, linked }: { gaps: Gap[]; linked: Linked }) {
  if (!gaps.length) return null
  return <div className="gap-chips">
    <span title={noEvidenceNote} className={linked && !gaps.some((gap) => linked.has(gap.id)) ? 'is-dimmed' : undefined}>No evidence found</span>
    <ul>{gaps.map((gap) => <GapChip key={gap.id} gap={gap} linked={linked} />)}</ul>
  </div>
}

function CoverageMap({ answer, linked }: ViewProps) {
  const findings = answer.findings
  const total = (key: 'subject' | 'outcome', id: string) => findings.filter((finding) => finding[key].id === id).reduce((sum, finding) => sum + finding.studies, 0)
  const all = useMemo(() => [...findings, ...answer.gaps], [findings, answer.gaps])
  const rows = uniqueLabels(all, 'subject').sort((a, b) => total('subject', b.id) - total('subject', a.id))
  const columns = uniqueLabels(all, 'outcome').sort((a, b) => total('outcome', b.id) - total('outcome', a.id))
  const lookup = useMemo(() => new Map(all.map((result) => [`${result.subject.id}|${result.outcome.id}`, result])), [all])
  const densest = new Set(answer.summary?.densest ?? [])
  const max = Math.max(...findings.map((finding) => finding.studies))
  return <section className="glance gap-map-section" aria-labelledby="map-title">
    <div className="coverage">
      <h2 id="map-title" className="sr-only">Evidence map: interventions by outcomes</h2>
      {answer.summary && <p><strong>{answer.summary.filled}</strong> of {answer.summary.cells} combinations studied · <strong>{answer.summary.thin}</strong> by a single study · <strong>{answer.summary.empty}</strong> with no mapped evidence</p>}
      <span className="map-legend" aria-hidden="true"><i className="d-thin" />1 study<i className="d-some" />2–3<i className="d-dense" />4+<i className="d-gap" /><span title={mappedGapNote}>No mapped evidence</span>{densest.size > 0 && <><i className="d-densest" />{densest.size} most studied</>}</span>
    </div>
    <div className="gap-map-scroll">
      <table className="gap-map">
        <thead><tr><td />{columns.map((column) => <th key={column.id} scope="col"><span title={column.label}>{column.label}</span></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <th scope="row">{row.label}</th>
          {columns.map((column) => {
            const finding = lookup.get(`${row.id}|${column.id}`)
            if (!finding || !isFinding(finding)) return <td key={column.id} className={`map-gap${finding ? linkClass(finding.id, linked) : ''}`} title={`${row.label} × ${column.label}: ${mappedGapNote}`}><span className="sr-only">No mapped evidence</span></td>
            return <td key={column.id}><MapCell finding={finding} densest={densest.has(finding.id)} fill={0.25 + 0.75 * (finding.studies / max)} linked={linked} /></td>
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}

function MapCell({ finding, densest, fill, linked }: { finding: Finding; densest: boolean; fill: number; linked: Linked }) {
  const opener = useOpener({ kind: 'finding', item: finding })
  return <button {...opener} className={`map-cell d-${finding.density}${densest ? ' densest' : ''}${linkClass(finding.id, linked)}`} style={{ '--fill': fill } as CSSProperties}
    aria-label={`${finding.subject.label}, ${finding.outcome.label}: ${studyCount(finding.studies)}, ${directionLabel(finding.direction)}, ${certaintyLabel(finding.certainty)} certainty`}>{finding.studies}</button>
}

function EvidenceDrawer({ opened, open, evidence, onClose, onExited }: { opened: Opened; open: boolean; evidence: Record<string, Evidence>; onClose: () => void; onExited: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    heading.current?.focus({ preventScroll: true })
    body.current?.scrollTo(0, 0)
  }, [opened, open])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  useEffect(() => {
    if (open) return
    const wait = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360
    const timer = window.setTimeout(onExited, wait)
    return () => window.clearTimeout(timer)
  }, [open, onExited])
  const claim = opened.kind === 'claim' ? evidence[opened.id] : null
  const title = opened.kind === 'claim'
    ? <ClaimText {...claim!} />
    : <>{opened.item.subject.label}<span>{opened.item.outcome.label}</span></>
  return <aside id="evidence-drawer" className={`evidence-drawer${open ? ' is-open' : ''}`} role="dialog" aria-labelledby="drawer-title" aria-hidden={!open}>
    <div className="drawer-head">
      <h2 id="drawer-title" ref={heading} tabIndex={-1} className={opened.kind === 'claim' ? 'is-claim' : undefined}>{title}</h2>
      <button className="drawer-close" aria-label="Close evidence" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </div>
    <div className="drawer-body" ref={body} key={openedId(opened)}>
      {opened.kind === 'finding' && <>
        <div className="drawer-summary">
          <Direction value={opened.item.direction} />
          <span className="result-meta"><Certainty finding={opened.item} /><span>{studyCount(opened.item.studies)}</span></span>
          {hasBreakdown(opened.item) && <span className="result-breakdown">{studyBreakdown(opened.item)}</span>}
        </div>
        <section className="drawer-section">
          <h3>Why {certaintyLabel(opened.item.certainty).toLowerCase()} certainty</h3>
          <ul className="drawer-reasons">{certaintyReasons(opened.item.certainty_rationale).map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </section>
        <Sources edgeIds={opened.item.edge_ids} evidence={evidence} />
      </>}
      {opened.kind === 'gap' && <>
        <div className="drawer-summary"><span className="drawer-gap">No evidence found</span><p>{noEvidenceNote}</p></div>
        <section className="drawer-section"><h3>What was searched for</h3><p>{opened.item.searched_for}</p></section>
      </>}
      {opened.kind === 'claim' && <>
        <div className="drawer-summary"><Direction value={opened.direction} /></div>
        <Sources edgeIds={[opened.id]} evidence={evidence} titled />
      </>}
    </div>
  </aside>
}

function Sources({ edgeIds, evidence, titled = false }: { edgeIds: string[]; evidence: Record<string, Evidence>; titled?: boolean }) {
  const papers = papersFor(edgeIds, evidence)
  const quotes = papers.reduce((sum, paper) => sum + paper.claims.length, 0)
  return <section className="drawer-section">
    <h3>Sources</h3>
    {!titled && <p className="sources-count">{quotes} {quotes === 1 ? 'quote' : 'quotes'} from {papers.length} {papers.length === 1 ? 'paper' : 'papers'}</p>}
    <ol className="papers">{papers.map((paper) => <li key={paper.id}>
      <p className="paper-title">
        {paper.doi ? <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer">{paper.title}<ArrowUpRight size={13} aria-label="(opens the paper in a new tab)" /></a> : paper.title}
        {paper.year && <span>{paper.year}</span>}
      </p>
      <ul className="claims">{paper.claims.map((claim) => <li key={claim.edge_id}>
        <blockquote>“{cleanQuote(claim.quote ?? '')}”</blockquote>
        {!titled && <span className="claim-line"><ClaimText {...claim} /></span>}
      </li>)}</ul>
    </li>)}</ol>
  </section>
}

export default function AnswerView({ question, instant = false, onReady, onDisplayed }: { question: Question; instant?: boolean; onReady?: () => void; onDisplayed?: () => void }) {
  const [bundle, setBundle] = useState<Bundle | null>(() => loadedAnswer(question.id))
  const [failed, setFailed] = useState(false)
  const [settled, setSettled] = useState(instant)
  const [duration] = useState(() => 3 + Math.random() * 4)
  const [pinned, setPinned] = useState<number | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(() => instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Infinity : 0)
  const heading = useRef<HTMLHeadingElement>(null)
  const article = useRef<HTMLElement>(null)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [shown, setShown] = useState<Opened | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const trigger = useRef<HTMLElement | SVGElement | null>(null)
  const openId = opened && openedId(opened)
  const drawer = useMemo<Drawer>(() => ({
    openId,
    toggle: (next, element) => {
      trigger.current = element
      if (openId === openedId(next)) {
        setOpened(null)
        setDrawerOpen(false)
        return
      }
      setOpened(next)
      setShown(next)
      setDrawerOpen(true)
    },
  }), [openId])
  const closeDrawer = useCallback(() => {
    setOpened(null)
    setDrawerOpen(false)
    const opens = trigger.current?.dataset.opens ?? ''
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-opens="${CSS.escape(opens)}"]`)?.focus({ preventScroll: true }))
  }, [])
  useEffect(() => {
    let cancelled = false
    // Start downloading the Q1 graph while its answer is loading, before the tab is selected.
    // A failed preload is handled by GraphPanel if the user opens the graph.
    if (question.id === 'q1-tree-planting') void loadEvidenceGraph().catch(() => {})
    loadAnswer(question.id).then((result) => { if (!cancelled) { setBundle(result); setFailed(false) } }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [question.id])
  useEffect(() => {
    if (instant) return
    const timer = window.setTimeout(() => setSettled(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : duration * 1000)
    return () => window.clearTimeout(timer)
  }, [duration, instant])
  useEffect(() => { heading.current?.focus() }, [bundle, settled])
  const ready = !!bundle && settled
  useEffect(() => { if (ready) onReady?.() }, [ready, onReady])
  const displayed = ready && revealed >= wordCount(bundle.summary.sentences)
  useEffect(() => { if (displayed) onDisplayed?.() }, [displayed, onDisplayed])
  useEffect(() => {
    if (!bundle || !settled || instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const total = wordCount(bundle.summary.sentences)
    const perWord = Math.min(40, 2600 / total)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const shown = Math.min(total, Math.floor((now - start) / perWord) + 1)
      setRevealed(shown)
      if (shown < total) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [bundle, settled, instant])
  useEffect(() => {
    if (pinned === null) return
    const targets = [...(article.current?.querySelectorAll<HTMLElement>('.is-linked') ?? [])]
    if (!targets.length) return
    const rects = targets.map((target) => target.getBoundingClientRect())
    const top = Math.min(...rects.map((rect) => rect.top))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    const margin = 32
    const offset = bottom - top + margin * 2 <= window.innerHeight ? (top + bottom - window.innerHeight) / 2 : top - margin
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1000
    const stops = [glide(() => window.scrollY, (top) => window.scrollTo(0, top), window.scrollY + offset, duration)]
    const strip = targets[0].closest('.gap-map-scroll')
    if (strip) stops.push(glide(() => strip.scrollLeft, (left) => { strip.scrollLeft = left }, strip.scrollLeft + rects[0].left - strip.getBoundingClientRect().left - 120, duration))
    return () => stops.forEach((stop) => stop())
  }, [pinned])

  if (failed) return <p className="answer-view answer-loading" role="alert">This answer could not be loaded.</p>
  if (!bundle || !settled) return <FieldWork duration={duration} />
  const { answer, summary, graph } = bundle
  const evidence = graph ? { ...answer.evidence, ...graph.evidence } : answer.evidence
  const active = preview ?? pinned
  const linked: Linked = active === null ? null : new Set(sentenceIds(summary.sentences[active]))
  const View = { coverage: CoverageMap, reference: ReferenceComparison, matrix: EffectMatrix }[layoutFor(answer)]
  const streamed = revealed >= wordCount(summary.sentences)

  return <article ref={article} className="answer-view">
    <h1 ref={heading} tabIndex={-1} className="answer-question">{question.question}</h1>
    {answer.short_answer && <div className="headline-fact">
      <span className="fact-label">How long to match a natural marsh</span>
      <strong>{answer.short_answer.time_to_reference ?? 'The available evidence cannot establish a recovery timeline.'}</strong>
      <p>{answer.short_answer.time_to_reference === null
        ? 'None of the included studies reports how long a created marsh takes to match a natural wetland. The reported wetland ages are observation points, not estimates of time to recovery.'
        : answer.short_answer.time_to_reference_note}</p>
    </div>}
    <Takeaways sentences={summary.sentences} pinned={pinned} onPin={setPinned} onPreview={setPreview} revealed={revealed} />
    {streamed && <div className="answer-details">
      <section className="limitations" aria-labelledby="limitations-title">
        <h2 id="limitations-title">What this answer can’t tell you</h2>
        <ul>{answer.limitations.map((limit) => <li key={limit}>{limitationText(limit, answer.summary)}</li>)}</ul>
      </section>
      <DrawerContext.Provider value={drawer}><View answer={answer} graph={graph} linked={linked} /></DrawerContext.Provider>
    </div>}
    {shown && <EvidenceDrawer opened={shown} open={drawerOpen} evidence={evidence} onClose={closeDrawer} onExited={() => setShown(null)} />}
  </article>
}
