export const noEvidenceNote = 'No matching evidence among the included studies. This is not proof that the practice has no effect.'
export const mappedGapNote = 'No matching evidence in this map. Evidence may exist outside the mapped categories or included studies; an empty cell does not show that the practice has no effect.'
export function mappingScopeNote(summary: { grassland_claims: number; claims_pooled: number }) {
  const excluded = summary.grassland_claims - summary.claims_pooled
  return `This map includes ${summary.claims_pooled} of ${summary.grassland_claims} grassland claims. The remaining ${excluded} fall outside the predefined intervention or outcome categories. Empty cells show gaps in the mapped evidence, not necessarily in the scientific literature as a whole.`
}
export function limitationText(text: string, coverage?: { grassland_claims: number; claims_pooled: number }) {
  if (!coverage) return text
  if (text.includes('claims fall outside the groups')) {
    return `${coverage.grassland_claims - coverage.claims_pooled} of the ${coverage.grassland_claims} grassland claims are not shown because they did not fit the map’s predefined intervention or outcome categories.`
  }
  if (text.startsWith('An empty cell means')) {
    return 'An empty cell means no matching evidence was found in the claims mapped here; it does not mean the practice is ineffective or that no relevant research exists elsewhere.'
  }
  return text
}
export const directionLabels: Record<string, string> = {
  increase: 'Increase', decrease: 'Decrease', mixed: 'Mixed', no_effect: 'No effect detected', unclear: 'Unclear direction',
  below_reference: 'Below reference', above_reference: 'Above reference', comparable: 'Comparable',
}
export function directionLabel(value: string) { return directionLabels[value] ?? value.replaceAll('_', ' ') }
export function certaintyLabel(value: string) { return value === 'very_low' ? 'Very low' : value.charAt(0).toUpperCase() + value.slice(1) }
export function studyCount(count: number) { return `${count} ${count === 1 ? 'study' : 'studies'}` }
