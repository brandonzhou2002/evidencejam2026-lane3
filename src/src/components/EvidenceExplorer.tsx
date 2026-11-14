import { useState } from 'react'
import graph from '../../../answers/q1_tree_planting_graph.json'
import q1 from '../../../answers/q1_tree_planting.json'
import q2 from '../../../answers/q2_created_marshes.json'
import q3 from '../../../answers/q3_grassland_gaps.json'
import pdfs from '../data/pdfs.json'
import './EvidenceExplorer.css'

type Claim = { quote: string; title: string; year: number | null; doi: string | null; document_id: string }
type Edge = typeof graph.edges[number]
type Finding = { id: string; subject: {label: string}; outcome: {label: string}; direction: string; certainty: string; certainty_rationale: string; studies: number; claims: number; edge_ids: string[] }
type Answer = { id: string; question: string; how_built: string; findings: Finding[]; gaps: {id: string; subject: {label: string}; outcome: {label: string}}[]; evidence: Record<string, Claim>; limitations: string[] }
const claims = graph.evidence as Record<string, Claim>
const pretty = (s: string) => s.replaceAll('_', ' ')
const colors: Record<string, string> = { increase: '#a4edc8', decrease: '#f2b4a4', mixed: '#e9cc86', no_effect: '#bac6da', unclear: '#bdaddd' }
const nodeLabel = (id: string) => graph.nodes.find(n => n.id === id)?.label ?? id
const positions = Object.fromEntries(graph.nodes.map((n) => {
  const group = n.kind === 'condition' ? 1 : n.kind === 'outcome' ? 2 : 0
  const peers = graph.nodes.filter(p => (p.kind === 'condition' ? 1 : p.kind === 'outcome' ? 2 : 0) === group)
  return [n.id, { x: [155, 520, 875][group], y: 100 + peers.findIndex(p => p.id === n.id) * (group === 0 ? 105 : group === 1 ? 230 : 460) }]
}))
function midpoint(edge: Edge) {
  const a = positions[edge.source], b = positions[edge.target ?? edge.source]
  const i = graph.edges.findIndex(e => e.id === edge.id)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (i % 5 - 2) * 19 / 2 }
}

export default function EvidenceExplorer({ questionId, page, navigate }: { questionId: string; page: string; navigate: (path: string) => void }) {
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [paper, setPaper] = useState('')
  const answer: Answer = questionId === q2.id ? q2 : questionId === q3.id ? q3 : q1
  const isGraph = page === 'graph' && answer.id === q1.id
  const selectedEdges = selection?.kind === 'node' ? graph.edges.filter(e => e.source === selection.id || e.target === selection.id) : graph.edges.filter(e => e.id === selection?.id)
  const evidenceIds = [...new Set(selectedEdges.flatMap(e => e.edge_ids))]
  const documents = [...new Set(evidenceIds.map(id => claims[id].document_id))]
  const activePaper = documents.includes(paper) ? paper : documents[0]
  const visibleClaims = evidenceIds.filter(id => claims[id].document_id === activePaper)
  const pdf = (pdfs as Record<string, string>)[activePaper]
  function select(kind: 'node' | 'edge', id: string) { setSelection({ kind, id }); setPaper('') }
  return <div className="explorer">
    <nav className="explorer-nav" aria-label="Page navigation"><button onClick={() => navigate('')}>← Ask a question</button><span>RANDOM / EVIDENCE ATLAS</span><span>0{isGraph ? '3' : '2'} / EXPLORE</span></nav>
    <main className="explorer-main">
      <p className="eyebrow">{isGraph ? 'Follow the evidence' : 'Your evidence brief'}</p>
      <h1>{isGraph ? 'How does it connect?' : answer.id === q1.id ? 'A closer look at tree planting.' : answer.id === q2.id ? 'Recovery has no single timeline.' : 'Where evidence exists. And where it doesn’t.'}</h1>
      <p className="explorer-question">{answer.question}</p>
      {!isGraph ? <>
        <section className="brief"><h2>What the evidence tells us</h2><p>{answer.id === q1.id ? 'Effects vary by planting trait, site treatment and outcome. Explore each finding’s direction and certainty below; mixed results and evidence gaps are part of the answer.' : answer.id === q2.id ? q2.short_answer.time_to_reference_note : `${q3.findings.length} intervention–outcome combinations have evidence; ${q3.gaps.length} are gaps in this corpus. An empty cell does not mean an intervention is ineffective.`}</p></section>
        <div className="table-scroll"><table><caption>Findings from the supplied answer pack</caption><thead><tr><th>Factor</th><th>Outcome</th><th>Direction</th><th>Certainty</th><th>Studies</th><th>Sources</th></tr></thead><tbody>{answer.findings.map(f => <tr key={f.id}><td>{f.subject.label}</td><td>{f.outcome.label}</td><td>{pretty(f.direction)}</td><td><details><summary>{pretty(f.certainty)}</summary>{f.certainty_rationale}</details></td><td>{f.studies}</td><td><details><summary>{f.claims} claims</summary>{f.edge_ids.map(id => { const c = (answer.evidence as Record<string, Claim>)[id]; return <blockquote key={id}>{c.quote}<cite>{c.title} ({c.year})</cite></blockquote> })}</details></td></tr>)}</tbody></table></div>
        <details className="brief"><summary>Evidence gaps ({answer.gaps.length})</summary><p>No evidence in this corpus is not evidence of no effect.</p>{answer.gaps.map(g => <p key={g.id}>{g.subject.label} → {g.outcome.label}: no evidence</p>)}</details>
        <div className="next-page">{answer.id === q1.id ? <button className="primary" onClick={() => navigate(`${answer.id}/graph`)}>Read more · Explore the graph ↗</button> : <p>The supplied node-link graph covers tree planting (Q1). <button onClick={() => navigate(`${q1.id}/graph`)}>Explore Q1 graph →</button></p>}</div>
      </> : <>
        <div className="graph-toolbar"><button onClick={() => navigate(`${answer.id}/answer`)}>← Findings</button><p>12 nodes · 29 relationships · select a node or relationship</p><button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.7, z - .2))}>−</button><button onClick={() => setZoom(1)}>Reset</button><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2, z + .2))}>+</button></div>
        <p className="graph-caution">Connected paths combine separate bodies of evidence, often from different papers. They are not a single tested effect or a measure of pathway strength.</p>
        <div className={`graph-workspace ${selection ? 'with-panel' : ''}`}>
          <section className="graph-card" aria-label="Tree planting evidence graph">
            <div className="graph-scroll"><svg style={{ width: `${zoom * 100}%`, height: 'auto', minWidth: 650 }} viewBox="0 0 1030 860" aria-label="Select nodes or numbered relationships. Directions and certainty are listed below.">
              <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
              <text x="40" y="35" className="column-label">STOCK & TREATMENTS</text><text x="410" y="35" className="column-label">CONDITIONS</text><text x="775" y="35" className="column-label">OUTCOMES</text>
              {graph.edges.map((e, i) => {
                const a = positions[e.source], b = e.kind === 'moderation' ? midpoint(graph.edges.find(t => t.id === e.target_edge)!) : positions[e.target!]
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (i % 5 - 2) * 19 }
                const selected = selectedEdges.includes(e)
                return <g key={e.id} className="graph-edge" role="button" tabIndex={0} aria-label={`${nodeLabel(e.source)} to ${e.target ? nodeLabel(e.target) : e.target_edge}: ${pretty(e.direction)}, ${pretty(e.certainty)} certainty`} onClick={() => select('edge', e.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select('edge', e.id) } }}>
                  <path d={`M ${a.x + 110} ${a.y} Q ${mid.x} ${mid.y} ${b.x - (e.kind === 'moderation' ? 0 : 110)} ${b.y}`} fill="none" stroke={colors[e.direction] ?? '#bac6da'} strokeWidth={selected ? 3 : 1.3} opacity={selection && !selected ? .2 : .65} strokeDasharray={e.kind === 'moderation' ? '6 4' : undefined} markerEnd="url(#arrow)" />
                  <circle cx={mid.x} cy={(a.y + b.y) / 4 + mid.y / 2} r="12" fill={selected ? '#a4edc8' : '#253a31'} /><text x={mid.x} y={(a.y + b.y) / 4 + mid.y / 2 + 4} textAnchor="middle" fill={selected ? '#10251b' : '#eef2ef'} fontSize="11">{i + 1}</text>
                </g>
              })}
              {graph.gaps.map(g => { const a = positions[g.source], b = positions[g.target]; return <g key={g.id}><path d={`M ${a.x} ${a.y + 35} Q 600 820 ${b.x} ${b.y + 35}`} fill="none" stroke="#a6b6ae" strokeDasharray="3 8" /><text x="570" y="805" fill="#c9d4ce">Nursery fertilization → survival: no evidence</text></g> })}
              {graph.nodes.map(n => { const p = positions[n.id]; const words = n.label.split(' '); const lines: string[] = ['']; words.forEach(w => { if ((lines.at(-1)!.length + w.length) > 25) lines.push(w); else lines[lines.length - 1] += `${lines.at(-1) ? ' ' : ''}${w}` }); return <g key={n.id} role="button" tabIndex={0} aria-label={`View evidence for ${n.label}`} className="graph-node" onClick={() => select('node', n.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select('node', n.id) } }}><rect x={p.x - 110} y={p.y - 35} width="220" height="74" rx="12" fill={selection?.id === n.id ? '#315442' : '#15271f'} stroke={n.kind === 'outcome' ? '#a4edc8' : '#688b77'} /><text x={p.x} y={p.y - (lines.length - 1) * 8} textAnchor="middle" fill="#edf5ef" fontSize="13">{lines.map((line, i) => <tspan key={i} x={p.x} dy={i ? 17 : 0}>{line}</tspan>)}</text></g> })}
            </svg></div>
            <div className="relationship-list"><h2>Relationships</h2><p>Numbers match the graph. Each row shows direction and certainty without hovering. Dashed arrows modify another relationship.</p>{graph.edges.map((e, i) => <button key={e.id} aria-pressed={selection?.id === e.id} onClick={() => select('edge', e.id)}><span className="edge-number">{i + 1}</span><span>{nodeLabel(e.source)} {e.kind === 'moderation' ? 'modifies → ' : '→ '}{e.target ? nodeLabel(e.target) : e.target_edge?.split('->').map(nodeLabel).join(' → ')}</span><span style={{ color: colors[e.direction] }}>{pretty(e.direction)}</span><span>{pretty(e.certainty)} certainty · {e.studies} studies</span></button>)}</div>
          </section>
          {selection && <aside className="evidence-panel" aria-label="Selected evidence"><div className="panel-heading"><p className="eyebrow">Source evidence</p><button aria-label="Close evidence panel" onClick={() => setSelection(null)}>✕</button></div><h2>{selection.kind === 'node' ? nodeLabel(selection.id) : `Relationship ${graph.edges.findIndex(e => e.id === selection.id) + 1}`}</h2><p>{documents.length} papers · {evidenceIds.length} claims</p>{selection.kind === 'node' && graph.nodes.find(n => n.id === selection.id)?.members && <p>Combined treatment: {graph.nodes.find(n => n.id === selection.id)!.members!.map(nodeLabel).join(' + ')}</p>}{selectedEdges.map(e => <details key={e.id}><summary>{nodeLabel(e.source)} → {e.target ? nodeLabel(e.target) : 'another relationship'} · {pretty(e.direction)} · {pretty(e.certainty)}</summary><p>{e.certainty_rationale}</p></details>)}
            <label htmlFor="paper-picker">Select a paper</label><select id="paper-picker" value={activePaper ?? ''} onChange={e => setPaper(e.target.value)}>{documents.map(id => { const c = claims[evidenceIds.find(e => claims[e].document_id === id)!]; return <option key={id} value={id}>{c.year} · {c.title}</option> })}</select>
            {visibleClaims.length > 0 && <><h3>{claims[visibleClaims[0]].title}</h3>{claims[visibleClaims[0]].doi && <a target="_blank" rel="noreferrer" href={`https://doi.org/${claims[visibleClaims[0]].doi}`}>Open paper via DOI ↗</a>}</>}
            {pdf ? <iframe title="Source paper PDF" src={pdf} className="pdf-viewer" /> : <p className="pdf-note">PDF not included in this evidence pack. Source sentences are available below, including offline. The DOI link requires internet access.</p>}
            {visibleClaims.map(id => <blockquote key={id}>{claims[id].quote}<cite>{claims[id].year} · Source sentence</cite></blockquote>)}
          </aside>}
        </div>
      </>}
      <details className="brief"><summary>Methods & limitations</summary><p>{answer.how_built}</p><ul>{(isGraph ? graph.limitations : answer.limitations).map(l => <li key={l}>{l}</li>)}</ul></details>
    </main>
  </div>
}
