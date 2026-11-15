let cached: Promise<typeof import('./EvidenceGraph')> | undefined

export function loadEvidenceGraph() {
  if (!cached) {
    cached = import('./EvidenceGraph').catch((error) => {
      cached = undefined
      throw error
    })
  }
  return cached
}
