import { AnswerView } from './answer-view.js'
import { readJSON, loadAnswer } from './data/answer-data.js'
import {
  directionExplanation,
  certaintyExplanation,
  mixedCertaintyExplanation,
  certaintyScaleExplanation,
} from './data/certainty.js'
import { escapeHTML as e, normalizeQuestion, reducedMotion } from './ui.js'
import { icon } from './icons.js'
import { startTerrain } from './terrain.js'

const shell = document.querySelector('#app'),
  main = document.querySelector('main')
const header = document.querySelector('#site-header'),
  historyPanel = document.querySelector('#history-panel')
const dialog = document.querySelector('#info-dialog'),
  certaintyDialog = document.querySelector('#certainty-dialog')
const launchHTML = main.innerHTML
let questions = [],
  history = [],
  shown = null,
  panelOpen = false,
  loading = false,
  view = null,
  questionText = '',
  sequence = 0
let modalTrigger = null,
  certaintyTrigger = null,
  graphPending = null
const terrain = startTerrain(document.querySelector('#terrain'))
const questionsReady = readJSON(new URL('./data/questions.json', import.meta.url)).then((data) => {
  questions = data
  return data
})
const illustration = fetch(new URL('./assets/field-work.html', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error('Illustration unavailable')
    return response.text()
  })
  .catch(() => '<p class="answer-loading" role="status">Gathering the evidence…</p>')

function fillIcons(root = document) {
  for (const element of root.querySelectorAll('[data-icon]'))
    element.innerHTML = icon(element.dataset.icon, Number(element.dataset.size ?? 24))
}
function graphModule() {
  if (!graphPending) {
    graphPending = import('./graph.js')
    graphPending.catch(() => {
      graphPending = null
    })
  }
  return graphPending
}
function syncChrome() {
  const showPanel = !!shown && !loading && history.length > 0 && panelOpen
  shell.classList.toggle('showing-answer', !!shown)
  shell.classList.toggle('has-history', !!showPanel)
  main.classList.toggle('answer-main', !!shown)
  historyPanel.hidden = !showPanel
  header.innerHTML = `${shown && !loading && history.length && !panelOpen ? `<button type="button" class="panel-toggle" data-action="show-history" aria-label="Show previous questions" aria-expanded="false" aria-controls="history-panel">${icon('SidebarSimple', 19)}</button>` : ''}${loading ? '' : `<button type="button" class="about-button" data-action="about">About the evidence ${icon('ArrowUpRight', 15)}</button>`}`
  if (showPanel)
    historyPanel.innerHTML = `<div class="history-top"><button type="button" class="history-new" data-action="new-question">${icon('Plus', 16)} New question</button><button type="button" class="panel-toggle" data-action="hide-history" aria-label="Hide previous questions" aria-expanded="true" aria-controls="history-panel">${icon('SidebarSimple', 19)}</button></div><nav aria-label="Previous questions"><ul>${history.map((entry) => `<li><button type="button" data-history="${e(entry.key)}"${shown?.key === entry.key ? ' aria-current="page"' : ''} title="${e(questions.find((q) => q.id === entry.id).question)}">${e(entry.label)}</button></li>`).join('')}</ul></nav>`
}
function syncPause() {
  terrain?.setPaused(dialog.open || certaintyDialog.open)
}
function showModal(kind, trigger) {
  modalTrigger = trigger
  document.querySelector('#dialog-content').innerHTML =
    `<button type="button" class="close-button" data-action="close-modal" aria-label="Close dialog">${icon('X', 21)}</button>${
      kind === 'about'
        ? `<div class="dialog-icon">${icon('Leaf', 32)}</div><h2 id="dialog-title" tabindex="-1">Grounded in research.</h2><p>See what research can tell us about restoring ecosystems across Canada. The studies bring together different places, approaches, and results, helping us understand what works, where findings differ, and which questions remain unanswered.</p>`
        : `<h2 id="dialog-title" tabindex="-1">Not available yet.</h2><p>This question isn’t supported yet. Please check back later, or choose one below.</p><div class="dialog-questions">${questions.map((q) => `<button type="button" data-pick="${e(q.id)}"><span>${e(q.title)}</span>${icon('ArrowUpRight', 18)}</button>`).join('')}</div><button type="button" class="edit-button" data-action="edit-question">Edit my question</button>`
    }`
  if (!dialog.open) dialog.showModal()
  document.querySelector('#dialog-title').focus()
  syncPause()
}
function explain(finding, trigger) {
  certaintyTrigger = trigger
  trigger.setAttribute('aria-expanded', 'true')
  document.querySelector('#certainty-explanation').innerHTML =
    `<p>${e(directionExplanation)}</p><p>${e(certaintyExplanation)}</p><p${finding.direction === 'mixed' && finding.certainty === 'high' ? ' class="certainty-mixed-note"' : ''}>${e(mixedCertaintyExplanation)}</p><p class="certainty-scale-note">${e(certaintyScaleExplanation)}</p>`
  certaintyDialog.showModal()
  document.querySelector('#certainty-heading').focus()
  syncPause()
}
function returnToQuestion(clear = false) {
  ++sequence
  view?.destroy()
  view = null
  shown = null
  loading = false
  panelOpen = false
  main.innerHTML = launchHTML
  const input = main.querySelector('textarea')
  input.value = clear ? '' : questionText
  if (clear) questionText = ''
  syncChrome()
  fillIcons(main)
  main.querySelector('.submit-button').disabled = !input.value.trim()
  input.focus()
}
async function openQuestion(question, entry = null) {
  const token = ++sequence
  view?.destroy()
  view = null
  const instant = !!entry
  shown = entry ?? {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: question.id,
    label: question.title,
  }
  const activeEntry = shown
  if (!entry) panelOpen = false
  loading = !instant
  main.innerHTML = ''
  syncChrome()
  window.scrollTo(0, 0)
  const module = question.id === 'q1-tree-planting' ? graphModule() : Promise.resolve(null)
  const bundlePromise = loadAnswer(question.id)
  // Start both local reads together; prepare the graph during the existing transition.
  const graphReady = Promise.all([bundlePromise, module])
    .then(([bundle, graph]) => {
      if (graph) graph.prepareGraph(bundle.graph)
      return graph
    })
    .catch((error) => {
      console.error(error)
      return null
    })
  if (!instant) {
    const drawing = await illustration
    if (token !== sequence) return
    main.innerHTML = drawing
  }
  try {
    const [bundle, graph] = await Promise.all([
      bundlePromise,
      graphReady,
      instant ? null : new Promise((resolve) => setTimeout(resolve, reducedMotion() ? 500 : 3600)),
    ])
    if (token !== sequence) return
    loading = false
    syncChrome()
    view = new AnswerView(main, bundle, question, {
      graphModule: graph,
      onExplain: explain,
      onDisplayed: () => {
        if (token !== sequence || history.some((item) => item.key === activeEntry.key)) return
        const repeats = history.filter((item) => item.id === question.id).length
        history.unshift({
          ...activeEntry,
          label: repeats ? `${question.title} ${repeats + 1}` : question.title,
        })
        syncChrome()
      },
    })
  } catch (error) {
    if (token !== sequence) return
    loading = false
    syncChrome()
    main.innerHTML =
      '<div class="answer-view graph-error" role="alert"><p>This answer could not be loaded.</p><button type="button" data-action="retry">Try again</button><button type="button" data-action="edit-question">Back to question</button></div>'
    console.error(error)
  }
}
async function submit() {
  const value = main.querySelector('textarea')?.value ?? ''
  if (!value.trim()) return
  questionText = value
  try {
    await questionsReady
  } catch {
    showStartupError()
    return
  }
  const question = questions.find((q) => normalizeQuestion(q.question) === normalizeQuestion(value))
  if (!question) showModal('unavailable', main.querySelector('.submit-button'))
  else openQuestion(question)
}
function showStartupError() {
  let message = main.querySelector('[data-startup-error]')
  if (!message) {
    message = document.createElement('p')
    message.dataset.startupError = ''
    message.className = 'answer-loading'
    message.setAttribute('role', 'alert')
    main.querySelector('.launch-content')?.append(message)
  }
  message.textContent = 'The questions could not be loaded. Please reload the page.'
}
document.addEventListener('submit', (event) => {
  if (event.target.id === 'question-form') {
    event.preventDefault()
    submit()
  }
})
document.addEventListener('input', (event) => {
  if (event.target.id === 'question')
    main.querySelector('.submit-button').disabled = !event.target.value.trim()
})
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-discard-upload]')) event.target.value = ''
})
document.addEventListener('keydown', (event) => {
  if (
    event.target.id === 'question' &&
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault()
    submit()
  }
})
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button')
  if (!button) return
  const action = button.dataset.action
  if (action === 'about') showModal('about', button)
  if (action === 'close-modal') dialog.close()
  if (action === 'close-certainty') certaintyDialog.close()
  if (action === 'show-history') {
    panelOpen = true
    syncChrome()
  }
  if (action === 'hide-history') {
    panelOpen = false
    syncChrome()
  }
  if (action === 'new-question') returnToQuestion(true)
  if (action === 'edit-question') {
    dialog.close()
    if (shown) returnToQuestion()
    else main.querySelector('textarea')?.focus()
  }
  if (action === 'retry' && shown) openQuestion(questions.find((q) => q.id === shown.id))
  if (button.dataset.pick) {
    const question = questions.find((q) => q.id === button.dataset.pick)
    questionText = question.question
    dialog.close()
    if (shown) returnToQuestion()
    const input = main.querySelector('textarea')
    input.value = questionText
    main.querySelector('.submit-button').disabled = false
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }
  if (button.dataset.history) {
    const entry = history.find((item) => item.key === button.dataset.history)
    if (entry && entry.key !== shown?.key)
      openQuestion(
        questions.find((q) => q.id === entry.id),
        entry,
      )
  }
})
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})
dialog.addEventListener('close', () => {
  syncPause()
  if (modalTrigger?.isConnected) modalTrigger.focus({ preventScroll: true })
})
certaintyDialog.addEventListener('click', (event) => {
  if (event.target === certaintyDialog) certaintyDialog.close()
})
certaintyDialog.addEventListener('close', () => {
  certaintyTrigger?.setAttribute('aria-expanded', 'false')
  if (certaintyTrigger?.isConnected) certaintyTrigger.focus({ preventScroll: true })
  syncPause()
})
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    terrain?.setPaused(true)
    return
  }
  view?.destroy()
  terrain?.destroy()
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) syncPause()
})
questionsReady.catch(showStartupError)
fillIcons()
