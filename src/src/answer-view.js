import { renderDetails, renderDrawer, renderHeadline, renderTakeaways } from './render.js'
import { escapeHTML as e, glide, reducedMotion, sentenceIds } from './ui.js'
import { icon } from './icons.js'
import { loadPaperAuthors, paperCitation } from './data/answer-data.js'

export class AnswerView {
  constructor(
    container,
    bundle,
    question,
    { graphModule = null, onDisplayed = () => {}, onExplain = () => {} } = {},
  ) {
    this.bundle = bundle
    this.graphModule = graphModule
    this.onExplain = onExplain
    this.events = new AbortController()
    this.pinned = null
    this.preview = null
    this.openedId = null
    this.hoveredNode = null
    this.pointedEdge = null
    this.glides = []
    this.records = new Map()
    const { answer, graph } = bundle
    this.evidence = { ...answer.evidence, ...graph?.evidence }
    for (const item of [...answer.findings, ...(answer.with_time ?? [])])
      this.records.set(item.id, { kind: 'finding', item })
    for (const item of answer.gaps) this.records.set(item.id, { kind: 'gap', item })
    for (const item of answer.interactions ?? [])
      this.records.set(item.edge_id, { kind: 'claim', id: item.edge_id, direction: item.direction })
    if (graph && graphModule)
      for (const item of [...graph.edges, ...graph.gaps])
        this.records.set(item.id, graphModule.graphFinding(item, graph))
    container.innerHTML = `<article class="answer-view"><h1 tabindex="-1" class="answer-question">${e(question.question)}</h1>${renderHeadline(answer)}<div class="summary-section"><p class="section-hint">What the studies tell us overall.</p><div class="takeaways"></div></div><div class="answer-details"></div><aside class="selection-note" role="region" aria-label="Selected summary sentence" hidden><p aria-live="polite"></p><button type="button" data-clear-selection aria-label="Clear selection and return to summary" title="Return to summary">${icon('X', 18)}</button></aside><aside id="evidence-drawer" class="evidence-drawer" role="dialog" aria-label="Evidence" aria-hidden="true" inert></aside></article>`
    this.article = container.querySelector('article')
    this.takeaways = this.article.querySelector('.takeaways')
    this.details = this.article.querySelector('.answer-details')
    this.drawer = this.article.querySelector('#evidence-drawer')
    this.selectionNote = this.article.querySelector('.selection-note')
    this.article.querySelector('h1').focus({ preventScroll: true })
    const options = { signal: this.events.signal }
    this.article.addEventListener('click', (event) => this.click(event), options)
    this.article.addEventListener(
      'keydown',
      (event) => {
        const sentence = event.target.closest('[data-sentence]')
        if (sentence && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          this.pin(Number(sentence.dataset.sentence))
        }
      },
      options,
    )
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
          if (this.openedId) this.closeDrawer()
          else if (this.pinned !== null) this.clearSelection()
        }
      },
      options,
    )
    this.article.addEventListener('mouseover', (event) => this.previewAt(event.target), options)
    this.article.addEventListener(
      'mouseout',
      (event) => this.previewAt(event.relatedTarget),
      options,
    )
    this.article.addEventListener('focusin', (event) => this.previewAt(event.target), options)
    this.article.addEventListener(
      'focusout',
      (event) => this.previewAt(event.relatedTarget),
      options,
    )
    this.takeaways.innerHTML = renderTakeaways(bundle.summary.sentences)
    this.details.innerHTML = renderDetails(answer, graph)
    this.updateHighlights()
    onDisplayed()
  }

  click(event) {
    const target = event.target.closest('button, [data-sentence], .graph-hit')
    if (!target) return
    if (target.hasAttribute('data-certainty')) {
      const record = this.records.get(target.dataset.certainty)
      if (record?.kind === 'finding') this.onExplain(record.item, target)
    } else if (target.hasAttribute('data-clear-selection')) this.clearSelection()
    else if (target.hasAttribute('data-close-drawer')) this.closeDrawer()
    else if (target.hasAttribute('data-view')) this.switchView(target.dataset.view)
    else if (target.hasAttribute('data-open')) this.open(target.dataset.open, target)
    else if (target.hasAttribute('data-sentence')) this.pin(Number(target.dataset.sentence))
  }

  previewAt(target) {
    const within = target instanceof Element && this.article.contains(target)
    const sentence = within ? target.closest('[data-sentence]') : null
    const preview = sentence ? Number(sentence.dataset.sentence) : null
    const hoveredNode = within ? (target.closest('[data-node]')?.dataset.node ?? null) : null
    const pointedEdge = within
      ? (target
          .closest('[data-graph-label], [data-graph-edge]')
          ?.getAttribute(
            target.closest('[data-graph-label]') ? 'data-graph-label' : 'data-graph-edge',
          ) ?? null)
      : null
    if (
      preview === this.preview &&
      hoveredNode === this.hoveredNode &&
      pointedEdge === this.pointedEdge
    )
      return
    this.preview = preview
    this.hoveredNode = hoveredNode
    this.pointedEdge = pointedEdge
    this.updateHighlights()
  }

  pin(index) {
    this.pinned = this.pinned === index ? null : index
    this.selectionNote.hidden = this.pinned === null
    this.selectionNote.querySelector('p').textContent =
      this.pinned === null ? '' : this.bundle.summary.sentences[this.pinned].text
    for (const element of this.takeaways.querySelectorAll('[data-sentence]'))
      element.setAttribute('aria-pressed', String(Number(element.dataset.sentence) === this.pinned))
    this.updateHighlights()
    this.glides.forEach((stop) => stop())
    this.glides = []
    if (this.pinned === null) return
    const targets = [...this.details.querySelectorAll('.is-linked')].filter(
      (element) => element.getClientRects().length,
    )
    if (!targets.length) return
    const rects = targets.map((element) => element.getBoundingClientRect())
    const top = Math.min(...rects.map((rect) => rect.top)),
      bottom = Math.max(...rects.map((rect) => rect.bottom))
    const offset =
      bottom - top + 64 <= window.innerHeight ? (top + bottom - window.innerHeight) / 2 : top - 32
    const duration = reducedMotion() ? 0 : 1000
    this.glides.push(
      glide(
        () => window.scrollY,
        (y) => window.scrollTo(0, y),
        window.scrollY + offset,
        duration,
      ),
    )
    const strip = targets[0].closest('.gap-map-scroll')
    if (strip)
      this.glides.push(
        glide(
          () => strip.scrollLeft,
          (left) => {
            strip.scrollLeft = left
          },
          strip.scrollLeft + rects[0].left - strip.getBoundingClientRect().left - 120,
          duration,
        ),
      )
  }

  clearSelection() {
    const index = this.pinned
    if (index === null) return
    this.glides.forEach((stop) => stop())
    this.glides = []
    this.pinned = this.preview = null
    this.hoveredNode = this.pointedEdge = null
    this.selectionNote.hidden = true
    this.selectionNote.querySelector('p').textContent = ''
    for (const element of this.takeaways.querySelectorAll('[data-sentence]'))
      element.setAttribute('aria-pressed', 'false')
    if (this.openedId) this.closeDrawer()
    const sentence = this.takeaways.querySelector(`[data-sentence="${index}"]`)
    sentence?.focus({ preventScroll: true })
    // Focus returns to the summary without restoring its hover preview.
    this.preview = null
    this.updateHighlights()
    if (sentence) {
      const top = Math.max(
        0,
        window.scrollY + sentence.getBoundingClientRect().top - window.innerHeight * 0.3,
      )
      this.glides.push(
        glide(
          () => window.scrollY,
          (y) => window.scrollTo(0, y),
          top,
          reducedMotion() ? 0 : 700,
        ),
      )
    }
  }

  updateHighlights() {
    const active = this.preview ?? this.pinned
    const linked =
      active === null ? null : new Set(sentenceIds(this.bundle.summary.sentences[active]))
    for (const element of this.article.querySelectorAll('[data-link-ids]')) {
      const matches = linked && JSON.parse(element.dataset.linkIds).some((id) => linked.has(id))
      element.classList.toggle('is-linked', !!matches)
      element.classList.toggle('is-dimmed', !!linked && !matches)
    }
    for (const button of this.article.querySelectorAll('[data-open][aria-expanded]'))
      button.setAttribute('aria-expanded', String(button.dataset.open === this.openedId))
    if (this.bundle.graph && this.graphModule)
      this.graphModule.updateGraph(
        this.details,
        this.bundle.graph,
        linked,
        this.openedId,
        this.hoveredNode,
        this.pointedEdge,
      )
  }

  switchView(view) {
    const graphHost = this.details.querySelector('[data-graph]'),
      table = this.details.querySelector('[data-table]')
    if (!graphHost || !table) return
    if (view === 'graph' && !graphHost.childElementCount) {
      if (!this.graphModule) {
        graphHost.innerHTML =
          '<div class="graph-error" role="alert"><p>The graph could not be displayed. The table and its evidence are still available.</p><button type="button" data-view="table">Back to table</button></div>'
      } else {
        try {
          graphHost.innerHTML = this.graphModule.renderGraph(this.bundle.graph)
        } catch (error) {
          console.error(error)
          graphHost.innerHTML =
            '<div class="graph-error" role="alert"><p>The graph could not be displayed. The table and its evidence are still available.</p><button type="button" data-view="table">Back to table</button></div>'
        }
      }
    }
    table.hidden = view === 'graph'
    graphHost.hidden = view !== 'graph'
    this.details.querySelector('[data-findings-hint]').textContent =
      view === 'graph'
        ? 'Trace direct effects and how practices change growing conditions.'
        : 'Compare effects on survival and growth, and the evidence behind them.'
    this.hoveredNode = this.pointedEdge = null
    for (const button of this.details.querySelectorAll('[data-view]'))
      button.setAttribute('aria-pressed', String(button.dataset.view === view))
    this.updateHighlights()
  }

  open(id, trigger) {
    if (id === this.openedId) {
      this.closeDrawer()
      return
    }
    const opened = this.records.get(id)
    if (!opened) return
    clearTimeout(this.closeTimer)
    this.openedId = id
    this.trigger = trigger
    this.drawer.innerHTML = renderDrawer(opened, this.evidence, this.paperAuthors)
    this.drawer.setAttribute('aria-labelledby', 'drawer-title')
    this.drawer.removeAttribute('aria-label')
    this.drawer.inert = false
    this.drawer.setAttribute('aria-hidden', 'false')
    this.drawer.classList.add('is-open')
    this.drawer.querySelector('h2').focus({ preventScroll: true })
    this.drawer.querySelector('.drawer-body').scrollTop = 0
    this.updateHighlights()
    if (opened.kind !== 'gap' && !this.paperAuthors) {
      loadPaperAuthors()
        .then((authors) => {
          this.paperAuthors = authors
          if (this.events.signal.aborted || this.openedId !== id) return
          for (const label of this.drawer.querySelectorAll('[data-paper-citation]')) {
            label.textContent = paperCitation(
              { id: label.dataset.paperCitation, year: label.dataset.year },
              authors,
            )
            label.hidden = !label.textContent
          }
        })
        .catch(() => {})
    }
  }

  closeDrawer() {
    if (!this.openedId) return
    this.openedId = null
    this.drawer.inert = true
    this.drawer.setAttribute('aria-hidden', 'true')
    this.drawer.removeAttribute('aria-labelledby')
    this.drawer.setAttribute('aria-label', 'Evidence')
    this.drawer.classList.remove('is-open')
    if (this.trigger?.isConnected && this.trigger.getClientRects().length)
      this.trigger.focus({ preventScroll: true })
    else
      this.article
        .querySelector('.view-switch button[aria-pressed="true"]')
        ?.focus({ preventScroll: true })
    this.updateHighlights()
    this.closeTimer = setTimeout(
      () => {
        this.drawer.innerHTML = ''
      },
      reducedMotion() ? 0 : 360,
    )
  }

  destroy() {
    this.events.abort()
    clearTimeout(this.closeTimer)
    this.glides.forEach((stop) => stop())
  }
}
