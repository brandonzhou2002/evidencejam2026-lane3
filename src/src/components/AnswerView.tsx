import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowsDownUp, Equals, Minus, Question as QuestionIcon } from '@phosphor-icons/react'
import { certaintyLabel, certaintyLevels, certaintyReasons, directionLabel, groupByKind, hasBreakdown, isFinding, layoutFor, loadAnswer, loadedAnswer, sentenceIds, studyBreakdown, studyCount, uniqueLabels } from '../data/answer-data'
import type { Answer, Bundle, Finding, Gap, Question, Result, SummarySentence } from '../data/answer-data'
import FieldWork from './FieldWork'
import './AnswerView.css'

const directionIcons: Record<string, typeof ArrowUp> = {
  increase: ArrowUp, above_reference: ArrowUp, decrease: ArrowDown, below_reference: ArrowDown,
  mixed: ArrowsDownUp, no_effect: Minus, comparable: Equals, unclear: QuestionIcon,
}

type Linked = Set<string> | null

const noEvidenceNote = 'No matching evidence among the included studies. This is not proof that the practice has no effect.'

function linkClass(id: string, linked: Linked) {
  return linked ? (linked.has(id) ? ' is-linked' : ' is-dimmed') : ''
}

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
  const Icon = directionIcons[value] ?? QuestionIcon
  return <span className="direction"><Icon size={16} weight="bold" aria-hidden="true" />{label ?? directionLabel(value)}</span>
}

function Certainty({ finding }: { finding: Finding }) {
  const value = finding.certainty
  const level = certaintyLevels.indexOf(value) + 1
  return <span className="certainty" title={[`${certaintyLabel(value)} certainty: how much to trust this result`, ...certaintyReasons(finding.certainty_rationale).map((reason) => `• ${reason}`)].join('\n')}>
    <span className="certainty-dots" aria-hidden="true">{certaintyLevels.map((_, index) => <i key={index} className={index < level ? 'on' : ''} />)}</span>
    {certaintyLabel(value)} certainty
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
    return <span key={index}>{lead}<span className="is-linkable" role="button" tabIndex={0} aria-pressed={pinned === index}
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

function EffectMatrix({ answer, linked }: { answer: Answer; linked: Linked }) {
  const results = [...answer.findings, ...answer.gaps]
  const outcomes = uniqueLabels(results, 'outcome')
  const groups = groupByKind(uniqueLabels(results, 'subject'))
  const cell = (subject: string, outcome: string) => results.find((result) => result.subject.id === subject && result.outcome.id === outcome)
  return <section className="glance" aria-labelledby="glance-title">
    <h2 id="glance-title" className="sr-only">Findings by practice and outcome</h2>
    <div className="matrix" role="table" aria-labelledby="glance-title">
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
    </div>
    {!!answer.interactions?.length && <div className="combined">
      <h3>Combined treatments</h3>
      <ul>{answer.interactions.map((item) => {
        const claim = answer.evidence[item.edge_id]
        return claim && <li key={item.edge_id} className={linkClass(item.edge_id, linked).trim() || undefined}><span>{claim.subject} <ArrowRight size={13} aria-label={claim.predicate === 'moderates' ? 'changes' : 'affects'} /> {claim.object}</span><Direction value={item.direction} /></li>
      })}</ul>
    </div>}
  </section>
}

function ResultCell({ result, linked }: { result: Result; linked: Linked }) {
  if (!isFinding(result)) return <div className={`result-cell gap${linkClass(result.id, linked)}`} title={noEvidenceNote}>No evidence found</div>
  return <div className={`result-cell${linkClass(result.id, linked)}`}>
    <Direction value={result.direction} />
    <span className="result-meta"><Certainty finding={result} /><span>{studyCount(result.studies)}</span></span>
    {hasBreakdown(result) && <span className="result-breakdown">{studyBreakdown(result)}</span>}
  </div>
}

function FindingRow({ finding, name, linked, tag, extra }: { finding: Finding; name: string; linked: Linked; tag?: string; extra?: ReactNode }) {
  return <li className={`finding-row${linkClass(finding.id, linked)}`}>
    <span className="finding-name">{name}{tag && <span className="tag">{tag}</span>}</span>
    <Direction value={finding.direction} label={finding.direction === 'no_effect' ? 'No change detected' : undefined} />
    <Certainty finding={finding} />
    <span className="finding-studies">{studyCount(finding.studies)}</span>
    {(hasBreakdown(finding) || extra) && <span className="finding-extra">{extra}{hasBreakdown(finding) && <span>{studyBreakdown(finding)}</span>}</span>}
  </li>
}

function ages(finding: Finding) {
  if (!finding.time_points?.length) return undefined
  return <span>Ages observed: {[...finding.time_points].sort((a, b) => parseFloat(a) - parseFloat(b)).join(', ')}</span>
}

function ReferenceComparison({ answer, linked }: { answer: Answer; linked: Linked }) {
  const lagging = answer.findings.filter((finding) => finding.lags)
  const rest = answer.findings.filter((finding) => !finding.lags)
  const comparison = answer.findings[0]?.subject.label ?? 'Compared with reference'
  return <section className="glance marsh" aria-label="Findings">
    {answer.short_answer?.time_to_reference && <div className="headline-fact">
      <span className="fact-label">Time to reach the reference</span>
      <strong>{answer.short_answer.time_to_reference}</strong>
      <p>{answer.short_answer.time_to_reference_note}</p>
    </div>}
    <h2>{comparison}</h2>
    <ul className="finding-list">
      {[...lagging, ...rest].map((finding) => <FindingRow key={finding.id} finding={finding} name={finding.outcome.label} linked={linked} tag={finding.lags ? 'Lags' : undefined} extra={ages(finding)} />)}
    </ul>
    <GapChips gaps={answer.gaps} linked={linked} />
    {!!answer.with_time?.length && <>
      <h2>{answer.with_time[0].subject.label}</h2>
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
    <ul>{gaps.map((gap) => <li key={gap.id} className={linkClass(gap.id, linked).trim() || undefined}>{gap.outcome.label}</li>)}</ul>
  </div>
}

function CoverageMap({ answer, linked }: { answer: Answer; linked: Linked }) {
  const findings = answer.findings
  const total = (key: 'subject' | 'outcome', id: string) => findings.filter((finding) => finding[key].id === id).reduce((sum, finding) => sum + finding.studies, 0)
  const all = useMemo(() => [...findings, ...answer.gaps], [findings, answer.gaps])
  const rows = uniqueLabels(all, 'subject').sort((a, b) => total('subject', b.id) - total('subject', a.id))
  const columns = uniqueLabels(all, 'outcome').sort((a, b) => total('outcome', b.id) - total('outcome', a.id))
  const lookup = useMemo(() => new Map(all.map((result) => [`${result.subject.id}|${result.outcome.id}`, result])), [all])
  const densest = new Set(answer.summary?.densest ?? [])
  const [selected, setSelected] = useState<Finding>()
  const max = Math.max(...findings.map((finding) => finding.studies))
  return <section className="glance gap-map-section" aria-labelledby="map-title">
    <div className="coverage">
      <h2 id="map-title" className="sr-only">Evidence map: interventions by outcomes</h2>
      {answer.summary && <p><strong>{answer.summary.filled}</strong> of {answer.summary.cells} combinations studied · <strong>{answer.summary.thin}</strong> by a single study · <strong>{answer.summary.empty}</strong> with no evidence</p>}
      <span className="map-legend" aria-hidden="true"><i className="d-thin" />1 study<i className="d-some" />2–3<i className="d-dense" />4+<i className="d-gap" /><span title={noEvidenceNote}>No evidence found</span>{densest.size > 0 && <><i className="d-densest" />{densest.size} most studied</>}</span>
    </div>
    <div className="gap-map-layout">
      <div className="gap-map-scroll">
        <table className="gap-map">
          <thead><tr><td />{columns.map((column) => <th key={column.id} scope="col"><span title={column.label}>{column.label}</span></th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <th scope="row">{row.label}</th>
            {columns.map((column) => {
              const finding = lookup.get(`${row.id}|${column.id}`)
              if (!finding || !isFinding(finding)) return <td key={column.id} className={`map-gap${finding ? linkClass(finding.id, linked) : ''}`} title={`${row.label} × ${column.label}: ${noEvidenceNote}`}><span className="sr-only">No evidence found</span></td>
              return <td key={column.id}>
                <button className={`map-cell d-${finding.density}${densest.has(finding.id) ? ' densest' : ''}${selected?.id === finding.id ? ' selected' : ''}${linkClass(finding.id, linked)}`}
                  style={{ '--fill': 0.25 + 0.75 * (finding.studies / max) } as CSSProperties}
                  aria-label={`${row.label}, ${column.label}: ${studyCount(finding.studies)}, ${directionLabel(finding.direction)}, ${certaintyLabel(finding.certainty)} certainty`}
                  aria-pressed={selected?.id === finding.id} onClick={() => setSelected(selected?.id === finding.id ? undefined : finding)}>{finding.studies}</button>
              </td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <aside className="map-detail" aria-live="polite">
        {selected && <>
          <p className="map-detail-pair">{selected.subject.label}<span>{selected.outcome.label}</span></p>
          <Direction value={selected.direction} />
          <span className="result-meta"><Certainty finding={selected} /><span>{studyCount(selected.studies)}</span></span>
          {hasBreakdown(selected) && <span className="result-breakdown">{studyBreakdown(selected)}</span>}
        </>}
      </aside>
    </div>
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
  useEffect(() => {
    let cancelled = false
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
  const { answer, summary } = bundle
  const active = preview ?? pinned
  const linked: Linked = active === null ? null : new Set(sentenceIds(summary.sentences[active]))
  const View = { coverage: CoverageMap, reference: ReferenceComparison, matrix: EffectMatrix }[layoutFor(answer)]
  const streamed = revealed >= wordCount(summary.sentences)

  return <article ref={article} className="answer-view">
    <h1 ref={heading} tabIndex={-1} className="answer-question">{question.question}</h1>
    <Takeaways sentences={summary.sentences} pinned={pinned} onPin={setPinned} onPreview={setPreview} revealed={revealed} />
    {streamed && <div className="answer-details">
      <View answer={answer} linked={linked} />
      <details className="limitations">
        <summary>What this answer can’t tell you</summary>
        <ul>{answer.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
      </details>
    </div>}
  </article>
}
