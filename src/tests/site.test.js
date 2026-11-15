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
import {
  cleanQuote,
  loadAnswer,
  loadGraph,
  loadFindingEvidence,
  loadPaperAuthors,
  paperCitation,
  certaintyReasons,
} from '../src/data/answer-data.js'

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const names = ['q1_tree_planting', 'q2_created_marshes', 'q3_grassland_gaps']
const answers = names.map((name) => read(`answers/${name}.json`))
const graph = read('answers/q1_tree_planting_graph.json')
const summaries = answers.map((answer) => read(`src/src/data/summaries/${answer.id}.json`))

test('certainty explanations retain pack wording and add a separate distribution note', () => {
  const expected = {
    'q1:fertilization_at_planting:growth': 'Studies: 5 increase · 1 mixed · 1 no effect',
    'q1:vegetation_control:growth': 'Studies: 4 increase · 1 decrease · 1 mixed',
  }
  for (const [id, breakdown] of Object.entries(expected)) {
    const finding = answers[0].findings.find((item) => item.id === id)
    const html = renderDrawer({ kind: 'finding', item: finding }, answers[0].evidence)
    assert.ok(html.includes(breakdown), id)
    assert.ok(html.includes('<p class="pack-note">'), id)
    assert.ok(html.includes('This is not unanimous agreement.'), id)
    assert.ok(html.includes('Why high certainty'), id)
    assert.ok(html.includes(`Raised: ${finding.studies} studies agree`), id)
  }
  for (const answer of answers) {
    for (const finding of [...answer.findings, ...(answer.with_time ?? [])]) {
      const reasons = certaintyReasons(finding.certainty_rationale)
      const agreement = finding.certainty_rationale.match(/\+1 (\d+) studies agree/)
      if (agreement) assert.ok(reasons.includes(`Raised: ${agreement[1]} studies agree`))
    }
  }
})

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

test('Q2 source notes flag both no-effect coding conflicts without changing quotations or findings', () => {
  const answer = answers[1]
  const finding = answer.with_time.find((item) => item.outcome.id === 'community_composition')
  const conflicts = ['camo:edge_1107dc4d1096', 'camo:edge_e9f249d67651']
  for (const id of conflicts) {
    assert.equal(answer.evidence[id].direction, 'no_effect')
    const html = renderSources([id], answer.evidence)
    assert.ok(html.includes(escapeHTML(cleanQuote(answer.evidence[id].quote))))
    assert.ok(html.includes('The coding and quotation do not align.'))
    assert.ok(html.includes('does not establish a recovery timeline'))
  }
  const html = renderSources(finding.edge_ids, answer.evidence)
  assert.equal([...html.matchAll(/class="pack-note"/g)].length, 2)
  assert.deepEqual(finding.study_directions, { no_effect: 2, unclear: 1 })
})

test('Q3 flags plant outcomes in all six animal cells and the combined burning treatments', () => {
  const answer = answers[2]
  const cells = answer.findings.filter((finding) => finding.outcome.id === 'animal_abundance')
  assert.equal(cells.length, 6)
  for (const finding of cells) {
    const html = renderDrawer({ kind: 'finding', item: finding }, answer.evidence)
    assert.ok(html.includes('This cell is mapped under animal abundance'), finding.id)
    assert.ok(html.includes('class="pack-note"'), finding.id)
    assert.ok(html.includes(`${finding.studies} ${finding.studies === 1 ? 'study' : 'studies'}`))
  }
  const burning = answer.findings.find((finding) => finding.id === 'q3:burning:invasive_abundance')
  assert.equal(burning.edge_ids.length, 4)
  for (const id of burning.edge_ids) assert.match(answer.evidence[id].subject, /glyphosate/i)
  const html = renderDrawer({ kind: 'finding', item: burning }, answer.evidence)
  assert.ok(html.includes('do not isolate the effect of burning alone'))
  assert.ok(renderDetails(answer).includes('all six populated'))
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
    if (name === 'q1-graph-nodes.json') return { ok: true, json: async () => graph.nodes }
    if (name === 'q3_grassland_gaps_overview.json')
      return {
        ok: true,
        json: async () => ({ ...answers[2], evidence: {}, deferred_evidence: true }),
      }
    if (name.startsWith('q3--')) {
      const finding = answers[2].findings.find((f) => f.id.replaceAll(':', '--') + '.json' === name)
      return {
        ok: true,
        json: async () =>
          Object.fromEntries(finding.edge_ids.map((id) => [id, answers[2].evidence[id]])),
      }
    }
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
    assert.equal(result.graph, undefined)
    assert.deepEqual(result.nodes, graph.nodes)
    assert.equal(
      renderDetails(result.answer, { nodes: result.nodes }),
      renderDetails(result.answer, graph),
    )
    assert.equal(calls.filter((url) => url.endsWith('q1_tree_planting_graph.json')).length, 0)
    const deferredGraph = loadGraph()
    assert.strictEqual(loadGraph(), deferredGraph)
    assert.deepEqual((await deferredGraph).graph, graph)
    const overview = await loadAnswer('q3-grassland-gaps')
    assert.deepEqual(overview.answer.evidence, {})
    assert.equal(calls.filter((url) => url.includes('/sources/')).length, 0)
    const finding = answers[2].findings[0]
    fail = true
    await assert.rejects(loadFindingEvidence(finding.id), /503/)
    fail = false
    const sources = loadFindingEvidence(finding.id)
    assert.strictEqual(loadFindingEvidence(finding.id), sources)
    assert.deepEqual(
      await sources,
      Object.fromEntries(finding.edge_ids.map((id) => [id, answers[2].evidence[id]])),
    )
    const count = calls.length
    await loadFindingEvidence(finding.id)
    await loadGraph()
    assert.equal(calls.length, count)
    assert.ok(calls.every((url) => url.startsWith('file:')))
  } finally {
    globalThis.fetch = original
    delete globalThis.location
  }
})

test('author metadata is cached and citations are formatted from paper IDs', async () => {
  const original = globalThis.fetch
  const paper = Object.values(answers[0].evidence)[0]
  const metadata = { [paper.document_id]: { first: 'van der Meer, Jane', count: 3 } }
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    return { ok: true, json: async () => metadata }
  }
  try {
    const pending = loadPaperAuthors()
    assert.strictEqual(loadPaperAuthors(), pending)
    assert.deepEqual(await pending, metadata)
    await loadPaperAuthors()
    assert.equal(requests, 1)
    assert.equal(
      paperCitation({ id: paper.document_id, year: 2020 }, metadata),
      'van der Meer et al. · 2020',
    )
    assert.equal(paperCitation({ id: 'missing', year: 2020 }, metadata), '2020')
    assert.equal(paperCitation({ id: 'missing' }, metadata), '')
    const edge = Object.keys(answers[0].evidence)[0]
    assert.ok(
      renderSources([edge], answers[0].evidence, false, metadata).includes('van der Meer et al.'),
    )
  } finally {
    globalThis.fetch = original
  }
})

test('a fresh source-only checkout builds without node_modules or downloads', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'understory-clean-'))
  try {
    for (const dir of ['answers', 'graph', 'src/src', 'src/vendor', 'src/scripts']) {
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
    assert.deepEqual(
      JSON.parse(readFileSync(join(temporary, 'site/src/data/q1-graph-nodes.json'))),
      graph.nodes,
    )
    const overview = JSON.parse(
      readFileSync(join(temporary, 'site/answers/q3_grassland_gaps_overview.json')),
    )
    assert.deepEqual(overview, { ...answers[2], evidence: {}, deferred_evidence: true })
    for (const finding of answers[2].findings) {
      const filename = finding.id.replaceAll(':', '--') + '.json'
      assert.deepEqual(
        JSON.parse(readFileSync(join(temporary, 'site/answers/sources', filename))),
        Object.fromEntries(finding.edge_ids.map((id) => [id, answers[2].evidence[id]])),
      )
    }
    const authorIndex = JSON.parse(
      readFileSync(join(temporary, 'site/src/data/paper-authors.json')),
    )
    const citedDocuments = new Set(
      [...answers, graph].flatMap((answer) =>
        Object.values(answer.evidence).map((claim) => claim.document_id),
      ),
    )
    assert.deepEqual(Object.keys(authorIndex).sort(), [...citedDocuments].sort())
    for (const author of Object.values(authorIndex)) {
      assert.ok(author.first)
      assert.ok(author.count >= 1)
    }
    assert.ok(!existsSync(join(temporary, 'node_modules')))
    const html = readFileSync(join(temporary, 'site/index.html'), 'utf8')
    assert.ok(html.includes('<noscript>'))
    assert.match(html, /src="\.\/src\/app\.js\?v=[a-f0-9]{12}"/)
    assert.match(html, /href="\.\/src\/styles\.css\?v=[a-f0-9]{12}"/)
    assert.match(
      readFileSync(join(temporary, 'site/src/answer-view.js'), 'utf8'),
      /import\('\.\/charts\.js\?v=[a-f0-9]{12}'\)/,
    )
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
