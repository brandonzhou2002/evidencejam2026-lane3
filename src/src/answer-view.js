import {
  renderDetails,
  renderDrawer,
  renderHeadline,
  renderTakeaways,
  renderSources,
} from './render.js'
import { escapeHTML as e, glide, reducedMotion, sentenceIds } from './ui.js'
import { icon } from './icons.js'
import { loadPaperAuthors, paperCitation, loadFindingEvidence } from './data/answer-data.js'

export class AnswerView {
  constructor(
    container,
    bundle,
    question,
    { onLoadGraph, onDisplayed = () => {}, onExplain = () => {} } = {},
  ) {
    this.bundle = bundle
    this.graphModule = bundle.graphModule ?? null
    this.onLoadGraph = onLoadGraph
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
    if (graph && this.graphModule)
      for (const item of [...graph.edges, ...graph.gaps])
        this.records.set(item.id, this.graphModule.graphFinding(item, graph))
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
      'change',
      (event) => {
        const controls = event.target.closest('[data-chart-controls]')
        if (!controls || !this.chartModule) return
        const filters = Object.fromEntries(
          [...controls.querySelectorAll('select')].map((select) => [select.name, select.value]),
        )
        this.details.querySelector('[data-chart-results]').innerHTML =
          this.chartModule.renderChartResults(answer, filters)
        this.updateHighlights()
      },
      options,
    )
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
    this.details.innerHTML = renderDetails(
      answer,
      graph ?? (bundle.nodes ? { nodes: bundle.nodes } : null),
    )
    this.updateHighlights()
    onDisplayed()
  }

  click(event) {
    const target = event.target.closest('button, [data-sentence], .graph-hit')
    if (!target) return
    if (target.hasAttribute('data-certainty')) {
      const record = this.records.get(target.dataset.certainty)
      if (record?.kind === 'finding') this.onExplain(record.item, target)
    } else if (target.hasAttribute('data-retry-sources')) this.ensureSources(this.openedId)
    else if (target.hasAttribute('data-clear-selection')) this.clearSelection()
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
    for (const chart of new Set(
      targets.map((target) => target.closest('.chart-rows')).filter(Boolean),
    )) {
      const target = targets.find((target) => target.closest('.chart-rows') === chart)
      chart.scrollTop +=
        target.getBoundingClientRect().top -
        chart.getBoundingClientRect().top -
        Math.max(0, (chart.clientHeight - target.clientHeight) / 2)
    }
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

  async switchView(view) {
    const request = (this.viewRequest = (this.viewRequest ?? 0) + 1)
    const graphHost = this.details.querySelector('[data-graph]'),
      table = this.details.querySelector('[data-table]'),
      chartHost = this.details.querySelector('[data-chart]')
    if (!table) return
    if (view === 'chart' && chartHost && !chartHost.dataset.ready) {
      const button = this.details.querySelector('.view-switch [data-view="chart"]')
      button.setAttribute('aria-busy', 'true')
      try {
        this.chartModule ??= await import('./charts.js')
        if (this.events.signal.aborted) return
        chartHost.innerHTML = this.chartModule.renderStudyCharts(this.bundle.answer)
        chartHost.dataset.ready = 'true'
      } catch (error) {
        if (this.events.signal.aborted) return
        console.error(error)
        chartHost.innerHTML =
          '<div class="graph-error" role="alert"><p>The chart could not be displayed. The other views are still available.</p><button type="button" data-view="chart">Try again</button></div>'
      } finally {
        button.removeAttribute('aria-busy')
      }
      if (request !== this.viewRequest) return
    }
    if (view === 'graph' && graphHost && !graphHost.dataset.ready) {
      const button = this.details.querySelector('.view-switch [data-view="graph"]')
      button.setAttribute('aria-busy', 'true')
      try {
        if (!this.graphModule) {
          const { graph, module } = await this.onLoadGraph()
          if (this.events.signal.aborted) return
          this.bundle.graph = graph
          this.bundle.graphModule = this.graphModule = module
          this.evidence = { ...this.evidence, ...graph.evidence }
          for (const item of [...graph.edges, ...graph.gaps])
            this.records.set(item.id, module.graphFinding(item, graph))
        }
        graphHost.innerHTML = this.graphModule.renderGraph(this.bundle.graph)
        graphHost.dataset.ready = 'true'
      } catch (error) {
        if (this.events.signal.aborted) return
        console.error(error)
        graphHost.innerHTML =
          '<div class="graph-error" role="alert"><p>The graph could not be displayed. The other views are still available.</p><button type="button" data-view="graph">Try again</button><button type="button" data-view="table">Back to table</button></div>'
      } finally {
        button.removeAttribute('aria-busy')
      }
      if (request !== this.viewRequest) return
    }
    table.hidden = view !== 'table'
    if (graphHost) graphHost.hidden = view !== 'graph'
    if (chartHost) chartHost.hidden = view !== 'chart'
    const hint = this.details.querySelector('[data-findings-hint]')
    if (hint)
      hint.textContent =
        view === 'chart'
          ? this.bundle.answer.summary
            ? 'Compare research coverage across intervention–outcome pairings.'
            : 'See how many studies report each result, with certainty shown separately.'
          : view === 'graph'
            ? 'Trace direct effects and how practices change growing conditions.'
            : this.bundle.answer.summary
              ? 'See where evidence is concentrated and where this map has gaps.'
              : this.bundle.answer.with_time
                ? 'See which attributes differ from natural wetlands at the ages studied.'
                : 'Compare effects on survival and growth, and the evidence behind them.'
    const title = this.details.querySelector('#map-title')
    if (title) title.textContent = view === 'chart' ? 'Study coverage' : 'Evidence map'
    const referenceTitle = this.details.querySelector('.marsh > h2')
    if (referenceTitle)
      referenceTitle.textContent =
        view === 'chart' ? 'Marsh findings' : this.bundle.answer.findings[0].subject.label
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
    if (opened.kind === 'finding' && this.bundle.answer.deferred_evidence) this.ensureSources(id)
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

  async ensureSources(id) {
    const opened = this.records.get(id)
    if (opened?.kind !== 'finding' || opened.item.edge_ids.every((edge) => this.evidence[edge]))
      return
    const target = this.drawer.querySelector('[data-sources]')
    if (!target) return
    target.innerHTML = '<h3>Sources</h3><p role="status">Loading source excerpts…</p>'
    try {
      const evidence = await loadFindingEvidence(id)
      this.evidence = { ...this.evidence, ...evidence }
      if (this.events.signal.aborted || this.openedId !== id) return
      target.outerHTML = renderSources(
        opened.item.edge_ids,
        this.evidence,
        false,
        this.paperAuthors,
      )
    } catch (error) {
      if (this.events.signal.aborted || this.openedId !== id) return
      target.innerHTML =
        '<h3>Sources</h3><p role="alert">The source excerpts could not be loaded.</p><button type="button" data-retry-sources>Try again</button>'
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
