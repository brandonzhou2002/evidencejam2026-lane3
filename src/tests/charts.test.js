import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chartGroups, renderChartResults, renderStudyCharts } from '../src/charts.js'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../../answers/${name}.json`, import.meta.url)))
const q1 = read('q1_tree_planting'),
  q2 = read('q2_created_marshes'),
  q3 = read('q3_grassland_gaps')

test('every Q1 and Q2 stacked segment equals the supplied study-direction counts', () => {
  for (const answer of [q1, q2]) {
    const html = renderChartResults(answer)
    for (const group of chartGroups(answer))
      for (const finding of group.findings) {
        const row = html
          .split(`data-chart-finding="${finding.id}"`)[1]
          .split('data-chart-finding=')[0]
        const segments = Object.fromEntries(
          [...row.matchAll(/data-chart-direction="([^"]+)" data-chart-count="(\d+)"/g)].map((m) => [
            m[1],
            Number(m[2]),
          ]),
        )
        assert.deepEqual(
          segments,
          Object.fromEntries(
            Object.entries(finding.study_directions).filter(([, count]) => count > 0),
          ),
          finding.id,
        )
        assert.equal(
          Object.values(segments).reduce((sum, n) => sum + n, 0),
          finding.studies,
        )
        assert.ok(row.includes(`width:${(finding.studies / group.max) * 100}%`))
        assert.ok(row.includes(`data-open="${finding.id}"`))
        assert.ok(row.includes(`data-certainty="${finding.id}"`))
      }
  }
})

test('Q2 charts keep reference comparisons separate from marsh-age findings', () => {
  const [reference, age] = chartGroups(q2)
  assert.deepEqual(reference.findings, q2.findings)
  assert.deepEqual(age.findings, q2.with_time)
  assert.equal(age.age, true)
  const html = renderChartResults(q2)
  assert.ok(html.includes('do not establish a recovery time'))
  assert.ok(html.includes('No clear evidence of change'))
})

test('Q3 defaults to all findings and retains the supplied top-ten option', () => {
  assert.match(renderStudyCharts(q3), /<option value="all" selected>All mapped findings/)
  const [group] = chartGroups(q3)
  assert.equal(group.findings.length, q3.findings.length)
  const top = chartGroups(q3, { limit: 'top' })[0]
  assert.deepEqual(
    top.findings.map((f) => f.id),
    q3.summary.densest,
  )
  const all = chartGroups(q3, { limit: 'all' })[0]
  assert.equal(all.findings.length, q3.findings.length)
  const html = renderChartResults(q3, { limit: 'all' })
  for (const finding of q3.findings) {
    const row = html.split(`data-chart-finding="${finding.id}"`)[1].split('data-chart-finding=')[0]
    assert.ok(row.includes(`data-chart-count="${finding.studies}"`), finding.id)
    assert.ok(row.includes(`width:${(finding.studies / all.max) * 100}%`), finding.id)
  }
})

test('filters select actual findings and do not turn missing evidence into zero-effect bars', () => {
  for (const answer of [q1, q2, q3]) {
    const chosen = answer.findings[0]
    const filters = { subject: chosen.subject.id, outcome: chosen.outcome.id, limit: 'all' }
    const actual = chartGroups(answer, filters)[0].findings
    assert.deepEqual(
      actual,
      answer.findings.filter(
        (f) => f.subject.id === filters.subject && f.outcome.id === filters.outcome,
      ),
    )
    assert.ok(renderStudyCharts(answer).includes('not effect size'))
  }
  const emptyPractice = q3.gaps.find((g) => !q3.findings.some((f) => f.subject.id === g.subject.id))
    .subject.id
  const html = renderChartResults(q3, { subject: emptyPractice })
  assert.ok(html.includes('No mapped findings'))
  assert.ok(!html.includes('data-chart-count'))
  assert.ok(html.includes('does not mean the practices are ineffective'))
})
