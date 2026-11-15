import { icon } from './icons.js'
import { certaintyLabel, directionLabel, certaintyLevels, studyCount } from './data/answer-data.js'

export const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  )
export const normalizeQuestion = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!]+$/, '')
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const sentenceIds = (sentence) => [
  ...sentence.finding_ids,
  ...sentence.gap_ids,
  ...(sentence.interaction_ids ?? []),
]
export const linkedAttribute = (ids) =>
  `data-link-ids="${escapeHTML(JSON.stringify(Array.isArray(ids) ? ids : [ids]))}"`
export const opener = (id) =>
  `data-open="${escapeHTML(id)}" aria-haspopup="dialog" aria-controls="evidence-drawer" aria-expanded="false"`
export function directionIcon(value, size = 16) {
  return icon(
    {
      increase: 'ArrowUp',
      above_reference: 'ArrowUp',
      decrease: 'ArrowDown',
      below_reference: 'ArrowDown',
      mixed: 'ArrowsDownUp',
      no_effect: 'Minus',
      comparable: 'Equals',
      unclear: 'Question',
    }[value] ?? 'Question',
    size,
  )
}
export const direction = (value, label = directionLabel(value)) =>
  `<span class="direction">${directionIcon(value)}${escapeHTML(label)}</span>`
export function dots(grade, className = 'certainty-dots') {
  return `<span class="${className}" aria-hidden="true">${certaintyLevels.map((_, index) => `<i${index <= certaintyLevels.indexOf(grade) ? ' class="on"' : ''}></i>`).join('')}</span>`
}
export function certaintyInfo(finding, label) {
  return `<button type="button" class="certainty-info" data-certainty="${escapeHTML(finding.id)}" aria-label="${escapeHTML(`Explain ${certaintyLabel(finding.certainty).toLowerCase()} certainty for ${label}`)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="certainty-dialog">${icon('Info', 16)}</button>`
}
export function certainty(finding) {
  return `<span class="certainty">${dots(finding.certainty)}${escapeHTML(certaintyLabel(finding.certainty))} certainty${certaintyInfo(finding, `${finding.subject.label} → ${finding.outcome.label}`)}</span>`
}
export function claimText(claim) {
  return `${escapeHTML(claim.subject)} <span class="claim-arrow" role="img" aria-label="${claim.predicate === 'moderates' ? 'changes' : 'affects'}">${icon('ArrowRight', 13)}</span> ${escapeHTML(claim.object)}`
}
export function evidenceLabel(finding, name) {
  return escapeHTML(
    `View evidence: ${name ?? `${finding.subject.label}, ${finding.outcome.label}`}, ${directionLabel(finding.direction)}, ${certaintyLabel(finding.certainty)} certainty, ${studyCount(finding.studies)}`,
  )
}

// Stop a previous glide before beginning another or returning to the question.
export function glide(read, write, to, duration) {
  const from = read(),
    start = performance.now()
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
  }
  const tick = (now) => {
    const progress = duration ? Math.min((now - start) / duration, 1) : 1
    write(from + (to - from) * (1 - (1 - progress) ** 3))
    if (progress < 1) frame = requestAnimationFrame(tick)
    else stop()
  }
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  frame = requestAnimationFrame(tick)
  return stop
}
