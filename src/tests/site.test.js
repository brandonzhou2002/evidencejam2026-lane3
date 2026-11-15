import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  cpSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  renderDetails,
  renderDrawer,
  renderFindingRow,
  renderResult,
  renderSources,
  renderTakeaways,
  renderHeadline,
} from '../src/render.js'
import { prepareGraph, renderGraph, graphFinding } from '../src/graph.js'
import { version } from '../vendor/dagre-3.1.3.js'
import { escapeHTML, normalizeQuestion, sentenceIds } from '../src/ui.js'
import { cleanQuote, loadAnswer } from '../src/data/answer-data.js'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const names = ['q1_tree_planting', 'q2_created_marshes', 'q3_grassland_gaps']
const answers = names.map((name) => read(`answers/${name}.json`))
const graph = read('answers/q1_tree_planting_graph.json')
const summaries = answers.map((answer) => read(`src/src/data/summaries/${answer.id}.json`))

test('all three answers retain every evidence control and every summary link', () => {
  for (const [index, answer] of answers.entries()) {
    const html = renderDetails(answer, index === 0 ? graph : null)
    const expected =
      answer.findings.length +
      (answer.with_time?.length ?? 0) +
      (index === 2 ? 0 : answer.gaps.length) +
      (answer.interactions?.length ?? 0)
    assert.equal([...html.matchAll(/data-open="/g)].length, expected)
    for (const f of [...answer.findings, ...(answer.with_time ?? [])]) {
      const cell = index === 0 ? renderResult(f) : index === 1 ? renderFindingRow(f) : html
      assert.ok(cell.includes(`data-open="${f.id}"`), f.id)
      assert.ok(cell.includes(`${f.studies} ${f.studies === 1 ? 'study' : 'studies'}`), f.id)
      assert.ok(
        cell.includes(f.certainty.replace('very_low', 'very low')) ||
          cell.toLowerCase().includes(`${f.certainty.replace('_', ' ')} certainty`),
        f.id,
      )
    }
    const valid = new Set(
      [...answer.findings, ...(answer.with_time ?? []), ...answer.gaps]
        .map((item) => item.id)
        .concat((answer.interactions ?? []).map((item) => item.edge_id)),
    )
    const summary = summaries[index]
    assert.equal(summary.text, summary.sentences.map((sentence) => sentence.text).join(' '))
    for (const sentence of summary.sentences)
      for (const id of sentenceIds(sentence)) assert.ok(valid.has(id), id)
    const takeaways = renderTakeaways(summary.sentences)
    assert.equal(
      [...takeaways.matchAll(/data-sentence=/g)].length,
      summary.sentences.filter((s) => sentenceIds(s).length).length,
    )
  }
})

test('sources preserve every quotation, paper association and DOI', () => {
  for (const answer of answers)
    for (const finding of [...answer.findings, ...(answer.with_time ?? [])]) {
      const html = renderDrawer({ kind: 'finding', item: finding }, answer.evidence)
      assert.equal([...html.matchAll(/<blockquote>/g)].length, finding.claims)
      assert.equal([...html.matchAll(/class="paper-title"/g)].length, finding.studies)
      for (const id of finding.edge_ids) {
        const claim = answer.evidence[id]
        assert.ok(html.includes(escapeHTML(cleanQuote(claim.quote))), id)
        if (claim.doi) assert.ok(html.includes(`https://doi.org/${escapeHTML(claim.doi)}`), id)
      }
    }
})

test('Q3 contains 24 × 16 cells, with the supplied densities and gap scope', () => {
  const q3 = answers[2],
    html = renderDetails(q3)
  assert.equal([...html.matchAll(/class="map-gap"/g)].length, 261)
  assert.equal([...html.matchAll(/class="map-cell /g)].length, 123)
  assert.equal([...html.matchAll(/class="map-cell d-thin/g)].length, 72)
  assert.equal([...html.matchAll(/scope="row"/g)].length, 24)
  assert.equal([...html.matchAll(/scope="col"/g)].length, 16)
  assert.ok(html.includes('287 of the 950'))
  assert.ok(summaries[2].text.includes('evidence map below'))
  assert.ok(!/no included stud/i.test(summaries[2].text))
  assert.equal(new Set(q3.findings.flatMap((f) => f.edge_ids)).size, 663)
})

test('Q2 keeps recovery time unknown and age observations separate', () => {
  const q2 = answers[1]
  assert.equal(q2.short_answer.time_to_reference, null)
  assert.ok(renderHeadline(q2).includes('cannot establish a recovery timeline'))
  assert.ok(renderHeadline(q2).includes('not estimates of time to recovery'))
  const html = renderDetails(q2)
  assert.ok(html.includes('No clear evidence of change'))
  assert.ok(html.includes('not that no change occurred'))
  for (const f of q2.with_time) assert.ok(html.includes(`data-open="${f.id}"`))
})

test('Dagre is pinned locally and every graph node, edge and gap is rendered', () => {
  assert.equal(version, '3.1.3')
  const html = renderGraph(graph),
    layout = prepareGraph(graph)
  assert.strictEqual(prepareGraph(graph), layout)
  assert.equal([...html.matchAll(/data-node=/g)].length, 12)
  assert.equal([...html.matchAll(/data-edge-path=/g)].length, 30)
  assert.equal([...html.matchAll(/class="graph-evidence-button"/g)].length, 30)
  for (const item of [...graph.edges, ...graph.gaps]) {
    const route = layout.routes.get(item.id)
    assert.ok(
      route.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      item.id,
    )
    assert.ok(Number.isFinite(route.label.x) && Number.isFinite(route.label.y), item.id)
    assert.ok(html.includes(`data-open="${escapeHTML(item.id)}"`), item.id)
  }
  for (const grade of ['Very low', 'Low', 'Moderate', 'High']) assert.ok(html.includes(grade))
})

test('the moderation edge terminates at its target relationship, with its source evidence', () => {
  const moderation = graph.edges.find((edge) => edge.kind === 'moderation')
  assert.equal(moderation.target, null)
  const layout = prepareGraph(graph),
    end = layout.routes.get(moderation.id).points.at(-1),
    badge = layout.routes.get(moderation.target_edge).label
  assert.equal(end.y, badge.y)
  assert.equal(badge.x - end.x, 43)
  assert.equal(moderation.direction, 'increase')
  const opened = graphFinding(moderation, graph)
  assert.equal(opened.item.outcome.label, 'Effect of site preparation on seedling growth & size')
  assert.ok(
    renderDrawer(opened, graph.evidence).includes('enhanced when seedlings were fertilized'),
  )
  const ids = new Set(sentenceIds(summaries[0].sentences.at(-1)))
  const highlighted = graph.edges.filter((edge) => edge.edge_ids.some((id) => ids.has(id)))
  assert.deepEqual(highlighted.map((edge) => edge.kind).sort(), ['effect', 'moderation'])
  assert.equal(
    new Set(highlighted.flatMap((edge) => edge.edge_ids).filter((id) => ids.has(id))).size,
    4,
  )
  assert.equal(graph.set_aside[0].edge_id, 'camo:edge_dd253d9b4352')
})

test('Q1 table and graph agree on all shared findings', () => {
  for (const f of answers[0].findings) {
    const edge = graph.edges.find(
      (edge) => edge.source === f.subject.id && edge.target === f.outcome.id,
    )
    for (const key of [
      'direction',
      'certainty',
      'studies',
      'claims',
      'edge_ids',
      'study_directions',
    ])
      assert.deepEqual(edge[key], f[key], `${f.id}: ${key}`)
  }
})

test('text is escaped and exact question matching retains its existing normalization', () => {
  assert.equal(normalizeQuestion('  A  question?! '), 'a question')
  assert.notEqual(normalizeQuestion('plant trees'), normalizeQuestion('tree planting'))
  const hostile = {
    ...answers[0].findings[0],
    subject: { id: 'test', label: '"><script>alert(1)</script>' },
  }
  const html = renderResult(hostile)
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!renderSources([], {}).includes('undefined'))
})

test('answer reads are cached and failures can be retried without any external request', async () => {
  const original = globalThis.fetch
  const calls = []
  let fail = true
  globalThis.location = new URL('http://localhost/site/')
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (fail) return { ok: false, status: 503 }
    const name = new URL(url).pathname.split('/').at(-1)
    const path = name.includes('-') ? `src/src/data/summaries/${name}` : `answers/${name}`
    return { ok: true, json: async () => read(path) }
  }
  try {
    await assert.rejects(loadAnswer('q1-tree-planting'), /503/)
    fail = false
    const pending = loadAnswer('q1-tree-planting')
    assert.strictEqual(loadAnswer('q1-tree-planting'), pending)
    const result = await pending
    assert.equal(result.answer.id, 'q1-tree-planting')
    assert.equal(result.graph.nodes.length, 12)
    assert.ok(calls.every((url) => url.startsWith('file:')))
  } finally {
    globalThis.fetch = original
    delete globalThis.location
  }
})

test('a fresh source-only checkout builds without node_modules or downloads', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'understory-clean-'))
  try {
    for (const dir of ['answers', 'src/src', 'src/vendor', 'src/scripts']) {
      mkdirSync(join(temporary, dir), { recursive: true })
      cpSync(join(root, dir), join(temporary, dir), {
        recursive: true,
        filter: (path) => !path.includes('__pycache__'),
      })
    }
    cpSync(join(root, 'src/index.html'), join(temporary, 'src/index.html'))
    cpSync(join(root, 'build.sh'), join(temporary, 'build.sh'))
    const run = spawnSync('sh', ['./build.sh', 'site'], { cwd: temporary, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.ok(existsSync(join(temporary, 'site/vendor/dagre-3.1.3.js')))
    assert.ok(!existsSync(join(temporary, 'node_modules')))
    const html = readFileSync(join(temporary, 'site/index.html'), 'utf8')
    assert.ok(html.includes('<noscript>'))
    assert.ok(html.includes('src="./src/app.js"'))
    assert.ok(html.includes('href="./src/styles.css"'))
    assert.ok(!/react|vite|cdn\./i.test(html))
    for (const name of [...names, 'q1_tree_planting_graph'])
      assert.deepEqual(
        JSON.parse(readFileSync(join(temporary, `site/answers/${name}.json`))),
        read(`answers/${name}.json`),
      )
    for (const file of readdirSync(join(temporary, 'site/src')))
      if (file.endsWith('.js')) {
        const result = spawnSync(process.execPath, ['--check', join(temporary, 'site/src', file)], {
          encoding: 'utf8',
        })
        assert.equal(result.status, 0, result.stderr)
      }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
