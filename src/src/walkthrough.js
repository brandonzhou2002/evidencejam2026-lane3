import { icon } from './icons.js'
import { reducedMotion } from './ui.js'

let seen = false
let tour = null

export function showWalkthrough(force = false, opener = null) {
  if ((seen && !force) || tour) return
  const article = document.querySelector('.answer-view')
  if (!article) return
  const hasGraph = !!article.querySelector('[data-view="graph"]')
  const hasMap = !!article.querySelector('.gap-map')
  const selectView = (name) => article.querySelector(`[data-view="${name}"]`)?.click()
  const steps = [
    {
      title: 'Start with a sentence',
      text: 'Select a summary sentence to jump to its supporting findings. Try it now, or choose Next.',
      target: '[data-sentence]',
      advance: '[data-sentence]',
    },
    {
      title: 'Keep your place',
      text: 'This box keeps your selected sentence in view. Close it with × to clear the highlights and return to the summary.',
      target: '.selection-note:not([hidden])',
      advance: '[data-clear-selection]',
      preserveFindingScroll: true,
      prepare: () => {
        if (article.querySelector('.selection-note')?.hidden)
          article.querySelector('[data-sentence]')?.click()
      },
    },
    {
      title: 'Switch views',
      text: hasGraph
        ? 'Switch between Table, Graph, and Chart here. Each offers a different way to explore the evidence.'
        : `Switch between ${hasMap ? 'Map' : 'Table'} and Chart here to compare findings and study counts.`,
      target: '.view-switch',
      advance: hasGraph ? '[data-view="graph"]' : '[data-view="chart"]',
      prepare: () => article.querySelector('[data-clear-selection]')?.click(),
    },
    ...(hasGraph
      ? [
          {
            title: 'Follow a connection',
            text: 'Select a line or its direction badge to open its evidence. Hover over a node to highlight its connections. Each line has its own evidence; a path is not one tested effect.',
            target: '[data-graph]:not([hidden]) [data-graph-label]',
            fallback: '[data-graph]:not([hidden])',
            prepare: () => selectView('graph'),
          },
        ]
      : []),
    {
      title: 'Explore study counts',
      text: 'Use these filters to narrow the chart. Select a bar to read its evidence. Bar length shows the number of studies, not effect size.',
      target: '[data-chart-controls]',
      fallback: '.view-switch',
      prepare: () => {
        article.querySelector('[data-close-drawer]')?.click()
        selectView('chart')
      },
    },
    {
      title: 'Open the evidence',
      text: hasMap
        ? 'Select a filled cell to open its evidence drawer. Empty cells show gaps in the mapped evidence, not proof of no effect.'
        : 'Select a finding to open its evidence drawer. Read the results and original quotes, then follow the paper link to its source.',
      target: hasMap ? '.map-cell' : '.result-cell:not(.gap), .finding-row',
      fallback: '.view-switch',
      advance: '.finding-open, .map-cell',
      prepare: () => {
        article.querySelector('[data-close-drawer]')?.click()
        selectView('table')
      },
    },
    {
      title: 'Read the original paper',
      text: 'Select the linked paper title to open the original paper in a new tab. The quotes below it show the source sentences behind this finding. Some publishers may require access to the full text.',
      target: '#evidence-drawer .paper-title a',
      fallback: '#evidence-drawer .drawer-head',
      prepare: () => {
        if (!article.querySelector('#evidence-drawer.is-open'))
          article.querySelector('.finding-open, .map-cell')?.click()
      },
    },
    {
      title: 'Get a quick explanation',
      text: 'Select ⓘ beside a certainty rating to understand the grades, or ? beside a technical term for a short definition. You can replay this guide from How this works.',
      target: '.certainty-info, .term-info',
      fallback: '.view-switch',
      prepare: () => article.querySelector('[data-close-drawer]')?.click(),
    },
  ]
  let step = 0,
    target = null,
    frame = 0
  const events = new AbortController()
  const note = document.createElement('aside')
  note.className = 'walkthrough'
  note.setAttribute('role', 'region')
  note.setAttribute('aria-label', 'How to use this answer')
  document.body.append(note)
  tour = note

  function position() {
    frame = 0
    const current = steps[step]
    const next =
      article.querySelector(current.target) ??
      article.querySelector(current.fallback ?? '.takeaways')
    if (target !== next) {
      target?.classList.remove('walkthrough-target')
      target = next
      target?.classList.add('walkthrough-target')
      // Scroll when the highlighted control changes, including after async
      // graph/chart mounts replace the temporary fallback target.
      if (target && !target.matches('.selection-note'))
        target.scrollIntoView?.({
          block: 'center',
          behavior: reducedMotion() ? 'instant' : 'smooth',
        })
    }
    const rect = target?.getBoundingClientRect()
    const padding = 24
    const gap = target?.matches('.view-switch') ? 20 : padding
    const width = note.offsetWidth
    note.style.maxHeight = ''
    const height = note.offsetHeight
    let top = (rect?.bottom ?? 64) + gap
    let left = rect?.left ?? padding
    // Put the guide beside the fixed selection box rather than over its close button.
    if (target?.matches('.selection-note')) {
      left = rect.left - width - padding
      top = rect.top
      if (left < padding) {
        left = rect.left
        top = rect.top - height - padding
      }
    } else if (target?.matches('.view-switch')) {
      // Keep the whole tab control visible: prefer beside it, else clearly below.
      left = rect.right + gap
      top = rect.top
      if (left + width > window.innerWidth - padding) {
        left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding))
        top = rect.bottom + gap
      }
    } else if (top + height > window.innerHeight - padding) {
      top = (rect?.top ?? 64) - height - gap
    }
    left = Math.max(padding, Math.min(left, window.innerWidth - width - padding))
    top = Math.max(padding, Math.min(top, window.innerHeight - height - padding))
    // If the card still covers the highlighted control, push it fully below.
    if (rect && top < rect.bottom + gap && top + height > rect.top) {
      const below = rect.bottom + gap
      if (below + height <= window.innerHeight - padding) top = below
      else if (rect.right + gap + width <= window.innerWidth - padding) {
        left = rect.right + gap
        top = Math.max(padding, Math.min(rect.top, window.innerHeight - height - padding))
      }
    }
    note.style.left = `${left}px`
    note.style.top = `${top}px`
    const drawerAnimations = target?.closest('.evidence-drawer')?.getAnimations?.() ?? []
    if (
      drawerAnimations.some(
        (animation) =>
          animation.playState === 'running' &&
          animation.effect?.getTiming().iterations !== Infinity,
      )
    )
      schedulePosition()
  }
  function schedulePosition() {
    if (!frame) frame = requestAnimationFrame(position)
  }
  function finish(completed = false) {
    seen = true
    events.abort()
    observer.disconnect()
    cancelAnimationFrame(frame)
    target?.classList.remove('walkthrough-target')
    const restoreFocus = note.contains(document.activeElement)
    note.remove()
    tour = null
    if (completed) {
      article.dispatchEvent(new Event('walkthrough-complete'))
    } else if (restoreFocus) {
      const destination = opener?.isConnected
        ? opener
        : target?.isConnected
          ? target
          : article.querySelector('[data-sentence]')
      destination?.focus({ preventScroll: true })
    }
  }
  function render() {
    steps[step].prepare?.()
    if (!steps[step].preserveFindingScroll) article.dispatchEvent(new Event('walkthrough-navigate'))
    note.innerHTML = `<button type="button" class="certainty-dialog-close" data-tour="close" aria-label="Close guide">${icon('X', 18)}</button><p class="walkthrough-progress">${step + 1} of ${steps.length}</p><h2 tabindex="-1">${steps[step].title}</h2><p class="walkthrough-description">${steps[step].text}</p><div class="walkthrough-actions"><button type="button" data-tour="${step ? 'back' : 'close'}">${step ? 'Back' : 'Skip'}</button><button type="button" class="walkthrough-next" data-tour="next">${step === steps.length - 1 ? 'Done' : 'Next'}${icon('ArrowRight', 16)}</button></div>`
    // Force a fresh target + scroll even if prepare only toggled a view.
    target?.classList.remove('walkthrough-target')
    target = null
    position()
    // Reposition after scroll/layout settle so the card does not cover the tabs.
    requestAnimationFrame(() => {
      position()
      note.querySelector('h2')?.focus({ preventScroll: true })
    })
  }
  note.addEventListener(
    'click',
    (event) => {
      const action = event.target.closest('[data-tour]')?.dataset.tour
      if (action === 'close') finish()
      else if (action === 'next' && step === steps.length - 1) finish(true)
      else if (action === 'back' || action === 'next') {
        step += action === 'next' ? 1 : -1
        render()
      }
    },
    { signal: events.signal },
  )
  document.addEventListener(
    'click',
    (event) => {
      if (note.contains(event.target)) return
      const advance = steps[step].advance
      if (advance && event.target.closest(advance)) {
        step++
        render()
      }
    },
    { signal: events.signal },
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.stopImmediatePropagation()
        finish()
      }
    },
    { capture: true, signal: events.signal },
  )
  window.addEventListener('resize', schedulePosition, { signal: events.signal })
  document.addEventListener('scroll', schedulePosition, {
    capture: true,
    passive: true,
    signal: events.signal,
  })
  article.addEventListener('animationend', schedulePosition, { signal: events.signal })
  article.addEventListener('transitionend', schedulePosition, { signal: events.signal })
  const observer = new MutationObserver(() => {
    if (!article.isConnected) finish()
    else schedulePosition()
  })
  observer.observe(article, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  })
  observer.observe(article.parentNode, { childList: true })
  render()
}
