import { certainty, escapeHTML as e, linkedAttribute, opener } from './ui.js'
import { directionLabel, studyCount, uniqueLabels } from './data/answer-data.js'

const order = [
  'below_reference',
  'comparable',
  'above_reference',
  'increase',
  'decrease',
  'mixed',
  'no_effect',
  'unclear',
]
const chartLabel = (direction, age = false) =>
  age && direction === 'no_effect' ? 'No clear evidence of change' : directionLabel(direction)

export function chartGroups(answer, filters = {}) {
  const matches = (finding) =>
    (!filters.subject || finding.subject.id === filters.subject) &&
    (!filters.outcome || finding.outcome.id === filters.outcome)
  if (answer.summary) {
    let findings = answer.findings.filter(matches)
    if (!filters.subject && !filters.outcome && filters.limit !== 'all') {
      const byId = new Map(findings.map((f) => [f.id, f]))
      findings = answer.summary.densest.map((id) => byId.get(id)).filter(Boolean)
    } else {
      findings = [...findings].sort(
        (a, b) =>
          b.studies - a.studies || b.claims - a.claims || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      if (filters.limit !== 'all') findings = findings.slice(0, answer.summary.densest.length)
    }
    return [
      {
        title: 'Studies per pairing',
        coverage: true,
        findings,
        max: Math.max(...answer.findings.map((f) => f.studies)),
      },
    ]
  }
  if (answer.with_time)
    return [
      {
        title: 'Compared with natural wetlands',
        findings: answer.findings.filter(matches),
        max: Math.max(...answer.findings.map((f) => f.studies)),
      },
      {
        title: 'Changes with marsh age',
        age: true,
        findings: answer.with_time.filter(matches),
        max: Math.max(...answer.with_time.map((f) => f.studies)),
      },
    ]
  return [
    {
      title: 'Study results by finding',
      findings: answer.findings.filter(matches),
      max: Math.max(...answer.findings.map((f) => f.studies)),
    },
  ]
}

function renderGroup(group, showSubject) {
  if (!group.findings.length)
    return `<section class="study-chart-group"><h3>${e(group.title)}</h3><p class="chart-empty">No mapped findings for this selection. This does not show that a practice has no effect.</p></section>`
  const directions = [
    ...new Set(
      group.findings.flatMap((f) =>
        Object.keys(f.study_directions).filter((d) => f.study_directions[d] > 0),
      ),
    ),
  ].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const legend = group.coverage
    ? ''
    : `<div class="chart-legend">${directions.map((d) => `<span><i class="bar-${e(d)}" aria-hidden="true"></i>${e(chartLabel(d, group.age))}</span>`).join('')}</div>`
  return `<section class="study-chart-group"><h3>${e(group.title)}</h3>${group.age ? '<p class="section-hint">Age-related findings are separate from reference comparisons and do not establish a recovery time.</p>' : ''}${legend}
    <div class="chart-axis"><span>Number of studies</span><span>0–${group.max}</span></div>
    <div class="chart-rows">${group.findings
      .map((finding) => {
        const entries = Object.entries(finding.study_directions)
          .filter(([, count]) => count > 0)
          .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
        if (
          entries.some(([, count]) => !Number.isInteger(count) || count < 0) ||
          entries.reduce((sum, [, count]) => sum + count, 0) !== finding.studies
        )
          throw new Error(`Study counts do not match: ${finding.id}`)
        const breakdown = entries
          .map(([d, count]) => `${count} ${chartLabel(d, group.age).toLowerCase()}`)
          .join(' · ')
        const segments = group.coverage
          ? `<span class="bar-coverage" data-chart-count="${finding.studies}" style="flex-grow:${finding.studies}">${finding.studies}</span>`
          : entries
              .map(
                ([d, count]) =>
                  `<span class="bar-${e(d)}" data-chart-direction="${e(d)}" data-chart-count="${count}" style="flex-grow:${count}" aria-hidden="true">${count}</span>`,
              )
              .join('')
        return `<div class="chart-row" data-chart-finding="${e(finding.id)}" data-chart-studies="${finding.studies}" ${linkedAttribute(finding.id)}>
        <div class="chart-row-name">${showSubject ? `<span>${e(finding.subject.label)}</span>` : ''}<span>${e(finding.outcome.label)}</span></div>
        <div class="chart-row-bar"><button type="button" class="study-bar" ${opener(finding.id)} aria-label="${e(`${finding.subject.label}, ${finding.outcome.label}: ${studyCount(finding.studies)}. ${group.coverage ? 'Study coverage' : breakdown}. Open supporting evidence.`)}"><span class="study-bar-fill" style="width:${(finding.studies / group.max) * 100}%">${segments}</span></button>${group.coverage ? '' : `<span class="chart-breakdown">${e(breakdown)}</span>`}</div>
        <span class="chart-total" aria-label="${studyCount(finding.studies)}">${finding.studies}</span><div class="chart-grade">${group.coverage ? `<span class="chart-effect">${e(directionLabel(finding.direction))}</span>` : ''}${certainty(finding)}</div>
      </div>`
      })
      .join('')}</div></section>`
}

export function renderChartResults(answer, filters = {}) {
  const groups = chartGroups(answer, filters)
  const gaps = answer.gaps.filter(
    (gap) =>
      (!filters.subject || gap.subject.id === filters.subject) &&
      (!filters.outcome || gap.outcome.id === filters.outcome),
  )
  return (
    groups.map((group) => renderGroup(group, !answer.with_time)).join('') +
    (gaps.length
      ? `<div class="chart-gaps"><span>No mapped evidence${answer.with_time ? ' for reference comparisons' : ''}: ${gaps.length} ${gaps.length === 1 ? 'pairing' : 'pairings'}.</span>${!answer.summary ? `<ul>${gaps.map((gap) => `<li ${linkedAttribute(gap.id)}><button type="button" ${opener(gap.id)}>${e(answer.with_time ? gap.outcome.label : `${gap.subject.label} → ${gap.outcome.label}`)}</button></li>`).join('')}</ul>` : '<span>This does not mean the practices are ineffective.</span>'}</div>`
      : '')
  )
}

export function renderStudyCharts(answer) {
  const all = [...answer.findings, ...(answer.with_time ?? []), ...answer.gaps]
  const select = (name, label, items) =>
    `<label>${label}<select name="${name}"><option value="">All ${label.toLowerCase()}s</option>${items.map((item) => `<option value="${e(item.id)}">${e(item.label)}</option>`).join('')}</select></label>`
  return `<div class="study-charts"><div class="chart-controls" data-chart-controls>${answer.with_time ? '' : select('subject', 'Practice', uniqueLabels(all, 'subject'))}${select('outcome', 'Outcome', uniqueLabels(all, 'outcome'))}${answer.summary ? '<label>Show<select name="limit"><option value="top">Top 10 in this selection</option><option value="all">All mapped findings</option></select></label>' : ''}</div>
    <p class="section-hint">Bars show study counts, not effect size. A paper may appear in more than one row. Select a bar to read its evidence.</p>
    <div data-chart-results>${renderChartResults(answer)}</div></div>`
}
