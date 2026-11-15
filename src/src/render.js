import { labelWithTerms } from './terms.js'
import { icon } from './icons.js'
import {
  certaintyLabel,
  certaintyReasons,
  cleanQuote,
  directionLabel,
  groupByKind,
  hasBreakdown,
  isFinding,
  papersFor,
  paperCitation,
  studyBreakdown,
  studyCount,
  uniqueLabels,
} from './data/answer-data.js'
import { limitationText, mappedGapNote, noEvidenceNote } from './data/labels.js'
import { packNotes } from './data/pack-notes.js'
import {
  escapeHTML as e,
  opener,
  linkedAttribute as linked,
  direction,
  certainty,
  evidenceLabel,
  claimText,
  sentenceIds,
} from './ui.js'

function viewSwitch(primary, graph = false) {
  return `<div class="view-switch" role="group" aria-label="Show findings as"><button type="button" data-view="table" aria-pressed="true">${primary}</button>${graph ? '<button type="button" data-view="graph" aria-pressed="false">Graph</button>' : ''}<button type="button" data-view="chart" aria-pressed="false">Chart</button></div>`
}

export function renderTakeaways(sentences, pinned = null) {
  const split = sentences.length > 3 ? Math.ceil(sentences.length / 2) : sentences.length
  const rendered = sentences.map((sentence, index) => {
    const count = sentenceIds(sentence).length
    const text = e(sentence.text),
      lead = index % split ? ' ' : ''
    if (!count) return `${lead}<span>${text}</span>`
    return `${lead}<span class="is-linkable" role="button" tabindex="0" data-sentence="${index}" aria-pressed="${pinned === index}" title="Show supporting findings">${text}<span class="sr-only"> Highlights ${count} related results.</span></span>`
  })
  return [rendered.slice(0, split), rendered.slice(split)]
    .map((group) => (group.some(Boolean) ? `<p>${group.join('')}</p>` : ''))
    .join('')
}

export function renderResult(result) {
  if (!isFinding(result))
    return `<button type="button" ${opener(result.id)} class="result-cell gap" ${linked(result.id)}>No evidence found</button>`
  return `<div class="result-cell" ${linked(result.id)}><button type="button" ${opener(result.id)} class="finding-open" aria-label="${evidenceLabel(result)}"></button>
    ${direction(result.direction)}<span class="result-meta">${certainty(result)}<span>${studyCount(result.studies)}</span></span>${hasBreakdown(result) ? `<span class="result-breakdown">${e(studyBreakdown(result))}</span>` : ''}</div>`
}

export function renderMatrix(answer, graph) {
  const results = [...answer.findings, ...answer.gaps]
  const outcomes = uniqueLabels(results, 'outcome', graph?.nodes)
  const groups = groupByKind(uniqueLabels(results, 'subject', graph?.nodes), graph?.nodes)
  return `<div class="matrix" role="table" aria-labelledby="glance-title">
    <div class="matrix-head" role="row"><span role="columnheader"><span class="sr-only">Practice</span></span>${outcomes.map((outcome) => `<span role="columnheader">${labelWithTerms(outcome.label)}</span>`).join('')}</div>
    ${groups
      .map(
        (group) =>
          `<div class="matrix-group" role="rowgroup">${groups.length > 1 && group.label ? `<div class="matrix-group-label" role="row"><span role="rowheader">${e(group.label)}</span></div>` : ''}${group.items
            .map(
              (subject) =>
                `<div class="matrix-row" role="row"><span role="rowheader" class="matrix-practice">${labelWithTerms(subject.label)}</span>${outcomes
                  .map((outcome) => {
                    const result = results.find(
                      (item) => item.subject.id === subject.id && item.outcome.id === outcome.id,
                    )
                    return `<span role="cell" data-outcome="${e(outcome.label)}">${result ? renderResult(result) : ''}</span>`
                  })
                  .join('')}</div>`,
            )
            .join('')}</div>`,
      )
      .join('')}</div>`
}

export function renderCombined(answer) {
  if (!answer.interactions?.length) return ''
  return `<div class="combined"><h3>Combined treatments</h3><p class="section-hint">What happens when treatments are used together or one changes another’s effect.</p><ul>${answer.interactions
    .filter((item) => answer.evidence[item.edge_id])
    .map(
      (item) =>
        `<li ${linked(item.edge_id)}><button type="button" ${opener(item.edge_id)}><span>${claimText(answer.evidence[item.edge_id])}</span>${direction(item.direction)}</button>${packNotes[item.edge_id] ? `<p class="pack-note">${e(packNotes[item.edge_id])}</p>` : ''}</li>`,
    )
    .join('')}</ul></div>`
}

export function renderFindingRow(finding) {
  const ages = finding.time_points?.length
    ? `<span>Ages observed: ${e([...finding.time_points].sort((a, b) => parseFloat(a) - parseFloat(b)).join(', '))}</span>`
    : ''
  const label =
    finding.direction === 'no_effect'
      ? 'No clear evidence of change'
      : directionLabel(finding.direction)
  return `<li class="finding-row" ${linked(finding.id)}><button type="button" class="finding-open" ${opener(finding.id)} aria-label="${e(`View evidence: ${finding.outcome.label}, ${label}, ${certaintyLabel(finding.certainty)} certainty, ${studyCount(finding.studies)}`)}"></button>
    <span class="finding-name">${labelWithTerms(finding.outcome.label)}${finding.lags ? '<span class="tag">Lags</span>' : ''}</span>${direction(finding.direction, label)}${certainty(finding)}<span class="finding-studies">${studyCount(finding.studies)}</span>
    ${hasBreakdown(finding) || ages ? `<span class="finding-extra">${ages}${hasBreakdown(finding) ? `<span>${e(studyBreakdown(finding))}</span>` : ''}</span>` : ''}</li>`
}

export function renderReference(answer) {
  const findings = [
    ...answer.findings.filter((f) => f.lags),
    ...answer.findings.filter((f) => !f.lags),
  ]
  return `<section class="glance marsh" aria-label="Findings">${viewSwitch('Table')}<h2>${e(answer.findings[0]?.subject.label ?? 'Compared with reference')}</h2><p class="section-hint" data-findings-hint>See which attributes differ from natural wetlands at the ages studied.</p><div data-table><ul class="finding-list">${findings.map(renderFindingRow).join('')}</ul>
    ${answer.gaps.length ? `<div class="gap-chips"><span title="${e(noEvidenceNote)}">No evidence found</span><ul>${answer.gaps.map((gap) => `<li ${linked(gap.id)}><button type="button" ${opener(gap.id)}>${e(gap.outcome.label)}</button></li>`).join('')}</ul></div><p class="section-hint gap-hint">No matching reference comparisons were found for these attributes.</p>` : ''}
    ${answer.with_time?.length ? `<h2>${e(answer.with_time[0].subject.label)}</h2><p class="section-hint">Changes observed as marshes age, without an established recovery timeline.</p><p class="trend-note">No clear evidence of change means the studies did not detect a clear change—not that no change occurred.</p><ul class="finding-list">${answer.with_time.map(renderFindingRow).join('')}</ul>` : ''}</div><div data-chart hidden></div></section>`
}

export function renderCoverage(answer) {
  const findings = answer.findings,
    all = [...findings, ...answer.gaps]
  const total = (key, id) =>
    findings.filter((f) => f[key].id === id).reduce((sum, f) => sum + f.studies, 0)
  const rows = uniqueLabels(all, 'subject').sort(
    (a, b) => total('subject', b.id) - total('subject', a.id),
  )
  const columns = uniqueLabels(all, 'outcome').sort(
    (a, b) => total('outcome', b.id) - total('outcome', a.id),
  )
  const lookup = new Map(all.map((f) => [`${f.subject.id}|${f.outcome.id}`, f]))
  const densest = new Set(answer.summary.densest),
    max = Math.max(...findings.map((f) => f.studies)),
    summary = answer.summary
  return `<section class="glance gap-map-section" aria-labelledby="map-title">${viewSwitch('Map')}<h2 id="map-title">Evidence map</h2><p class="section-hint" data-findings-hint>See where evidence is concentrated and where this map has gaps.</p><div data-table><div class="coverage">
    <p><strong>${summary.filled}</strong> of ${summary.cells} combinations studied · <strong>${summary.thin}</strong> by a single study · <strong>${summary.empty}</strong> with no mapped evidence</p>
    <span class="map-legend" aria-hidden="true"><i class="d-thin"></i>1 study<i class="d-some"></i>2–3<i class="d-dense"></i>4+<i class="d-gap"></i><span title="${e(mappedGapNote)}">No mapped evidence</span><i class="d-densest"></i>${densest.size} most studied</span></div>
    <div class="gap-map-scroll"><table class="gap-map"><thead><tr><td></td>${columns.map((c) => `<th scope="col"><span title="${e(c.label)}">${labelWithTerms(c.label)}</span></th>`).join('')}</tr></thead><tbody>${rows
      .map(
        (row) =>
          `<tr><th scope="row">${labelWithTerms(row.label)}</th>${columns
            .map((c) => {
              const f = lookup.get(`${row.id}|${c.id}`)
              if (!f || !isFinding(f))
                return `<td class="map-gap"${f ? ` ${linked(f.id)}` : ''} title="${e(`${row.label} × ${c.label}: ${mappedGapNote}`)}"><span class="sr-only">No mapped evidence</span></td>`
              return `<td><button type="button" ${opener(f.id)} class="map-cell d-${f.density}${densest.has(f.id) ? ' densest' : ''}" ${linked(f.id)} style="--fill:${0.25 + (0.75 * f.studies) / max}" aria-label="${e(`${f.subject.label}, ${f.outcome.label}: ${studyCount(f.studies)}, ${directionLabel(f.direction)}, ${certaintyLabel(f.certainty)} certainty`)}">${f.studies}</button></td>`
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody></table></div></div><div data-chart hidden></div></section>`
}

export function renderDetails(answer, graph) {
  const limits = `<section class="limitations" aria-labelledby="limitations-title"><h2 id="limitations-title">What this answer can’t tell you</h2><p class="section-hint">Limits to consider before applying these findings.</p><ul>${answer.limitations.map((limit) => `<li>${e(limitationText(limit, answer.summary))}</li>`).join('')}</ul></section>`
  const view = answer.summary?.cells
    ? renderCoverage(answer)
    : answer.short_answer || answer.with_time
      ? renderReference(answer)
      : `<section class="glance" aria-labelledby="glance-title">${viewSwitch('Table', !!graph)}<div class="section-heading"><h2 id="glance-title">Findings by practice and outcome</h2><p class="section-hint" data-findings-hint>Compare effects on survival and growth, and the evidence behind them.</p></div><div data-table>${renderMatrix(answer, graph)}</div>${graph ? '<div data-graph hidden></div>' : ''}<div data-chart hidden></div>${renderCombined(answer)}</section>`
  return limits + view
}

export function renderSources(edgeIds, evidence, titled = false, authors = {}) {
  const papers = papersFor(edgeIds, evidence),
    quotes = papers.reduce((sum, paper) => sum + paper.claims.length, 0)
  return `<section class="drawer-section"><h3>Sources</h3><p class="section-hint">Read the source sentences and open the original papers.</p>${titled ? '' : `<p class="sources-count">${quotes} ${quotes === 1 ? 'quote' : 'quotes'} from ${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}</p>`}
    <ol class="papers">${papers
      .map(
        (
          paper,
        ) => `<li><p class="paper-title">${paper.doi ? `<a href="https://doi.org/${e(paper.doi)}" target="_blank" rel="noreferrer">${e(paper.title)}<span role="img" aria-label="(opens the paper in a new tab)">${icon('ArrowUpRight', 13)}</span></a>` : e(paper.title)}<span data-paper-citation="${e(paper.id)}" data-year="${e(paper.year ?? '')}"${paperCitation(paper, authors) ? '' : ' hidden'}>${e(paperCitation(paper, authors))}</span></p>
      <ul class="claims">${paper.claims.map((claim) => `<li><blockquote>“${e(cleanQuote(claim.quote ?? ''))}”</blockquote>${titled ? '' : `<span class="claim-line">${claimText(claim)}</span>`}</li>`).join('')}</ul></li>`,
      )
      .join('')}</ol></section>`
}

export function renderDrawer(opened, evidence, authors = {}) {
  const title =
    opened.kind === 'claim'
      ? claimText(evidence[opened.id])
      : `${e(opened.item.subject.label)}<span>${e(opened.item.outcome.label)}</span>`
  let content
  if (opened.kind === 'claim')
    content = `<div class="drawer-summary">${direction(opened.direction)}</div>${renderSources([opened.id], evidence, true, authors)}`
  else if (opened.kind === 'gap')
    content = `<div class="drawer-summary"><span class="drawer-gap">No evidence found</span><p>${e(noEvidenceNote)}</p></div><section class="drawer-section"><h3>What was searched for</h3><p class="section-hint">The evidence checked for this practice and outcome.</p><p>${e(opened.item.searched_for)}</p></section>`
  else {
    const finding = opened.item
    content = `<div class="drawer-summary">${direction(finding.direction)}<span class="result-meta">${certainty(finding)}<span>${studyCount(finding.studies)}</span></span>${hasBreakdown(finding) ? `<span class="result-breakdown">${e(studyBreakdown(finding))}</span>` : ''}</div>
      <section class="drawer-section"><h3>Why ${e(certaintyLabel(finding.certainty).toLowerCase())} certainty</h3><p class="section-hint">What strengthens or weakens the evidence behind this finding.</p><ul class="drawer-reasons">${certaintyReasons(
        finding.certainty_rationale,
      )
        .map((reason) => `<li>${e(reason)}</li>`)
        .join('')}</ul></section>${renderSources(finding.edge_ids, evidence, false, authors)}`
  }
  return `<div class="drawer-head"><h2 id="drawer-title" tabindex="-1"${opened.kind === 'claim' ? ' class="is-claim"' : ''}>${title}</h2><button type="button" class="drawer-close" data-close-drawer aria-label="Close evidence">${icon('X', 20)}</button></div><div class="drawer-body">${content}</div>`
}

export function renderHeadline(answer) {
  if (!answer.short_answer) return ''
  const { time_to_reference: time, time_to_reference_note: note } = answer.short_answer
  return `<div class="headline-fact"><span class="fact-label">How long to match a natural marsh</span><strong>${e(time ?? 'The available evidence cannot establish a recovery timeline.')}</strong><p>${e(time === null ? 'None of the included studies reports how long a created marsh takes to match a natural wetland. The reported wetland ages are observation points, not estimates of time to recovery.' : note)}</p></div>`
}
