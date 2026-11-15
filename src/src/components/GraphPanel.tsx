import { Component, Suspense, lazy, useState } from 'react'
import type { ReactNode } from 'react'
import type { Graph } from '../data/answer-data'
import type { Linked } from './evidence-context'
import { loadEvidenceGraph } from './load-evidence-graph'

type BoundaryProps = { children: ReactNode; onRetry: () => void; onBack: () => void }

class GraphBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error('The graph could not be loaded.') }
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="graph-error" role="alert">
      <p>The graph could not be displayed. The table and its evidence are still available.</p>
      <div className="graph-error-actions"><button type="button" onClick={this.props.onRetry}>Try again</button><button type="button" onClick={this.props.onBack}>Back to table</button></div>
      <details><summary>Error details</summary><p>{this.state.error.message}</p></details>
    </div>
  }
}


export default function GraphPanel({ graph, linked, onBack }: { graph: Graph; linked: Linked; onBack: () => void }) {
  const [attempt, setAttempt] = useState(() => ({ key: 0, View: lazy(loadEvidenceGraph) }))
  const GraphView = attempt.View
  // A fresh lazy component is necessary: React remembers a rejected lazy import.
  const retry = () => setAttempt((previous) => ({ key: previous.key + 1, View: lazy(loadEvidenceGraph) }))
  return <GraphBoundary key={attempt.key} onRetry={retry} onBack={onBack}>
    <Suspense fallback={null}>
      <GraphView graph={graph} linked={linked} />
    </Suspense>
  </GraphBoundary>
}
