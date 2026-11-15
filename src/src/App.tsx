import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Leaf, Plus, SidebarSimple, X } from '@phosphor-icons/react'
import { normalizeQuestion, questions } from './questions'
import { addEntry, newEntry, type HistoryEntry } from './history'
import TerrainBackground from './components/TerrainBackground'
import AnswerView from './components/AnswerView'
import type { Question } from './data/answer-data'
import './App.css'

type Modal = 'about' | 'unavailable' | null
type Shown = { entry: HistoryEntry; question: Question; instant: boolean }
function App() {
  const [question, setQuestion] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const active = questions.find((item) => normalizeQuestion(item.question) === normalizeQuestion(question))
  const [panelOpen, setPanelOpen] = useState(false)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const submitted = shown?.question ?? null
  const loading = !!shown && !shown.instant && readyKey !== shown.entry.key
  const showPanel = !!submitted && !loading && !!history.length && panelOpen

  useEffect(() => {
    if (modal && !dialog.current?.open) {
      dialog.current?.showModal()
      dialog.current?.querySelector<HTMLElement>('#dialog-title')?.focus()
    }
    if (!modal && dialog.current?.open) dialog.current.close()
  }, [modal])

  function pickQuestion(item: Question) {
    setQuestion(item.question)
    setModal(null)
    requestAnimationFrame(() => {
      const field = input.current
      if (!field) return
      field.focus()
      field.setSelectionRange(field.value.length, field.value.length)
    })
  }

  function submitQuestion() {
    if (!question.trim()) return
    if (!active) return setModal('unavailable')
    setShown({ entry: newEntry(active), question: active, instant: false })
    setPanelOpen(false)
    window.scrollTo(0, 0)
  }

  function openEntry(entry: HistoryEntry) {
    if (shown?.entry.key === entry.key) return
    setShown({ entry, question: questions.find((item) => item.id === entry.id)!, instant: true })
    window.scrollTo(0, 0)
  }

  function returnToQuestion(clear = false) {
    setShown(null)
    if (clear) setQuestion('')
    requestAnimationFrame(() => input.current?.focus())
  }

  return (
    <div className={`app-shell${submitted ? ' showing-answer' : ''}${showPanel ? ' has-history' : ''}`}>
      <TerrainBackground paused={modal !== null} />
      {showPanel && <aside className="history-panel" id="history-panel">
        <div className="history-top">
          <button className="history-new" onClick={() => returnToQuestion(true)}><Plus size={16} aria-hidden="true" /> New question</button>
          <button className="panel-toggle" aria-label="Hide previous questions" aria-expanded="true" aria-controls="history-panel" onClick={() => setPanelOpen(false)}><SidebarSimple size={19} aria-hidden="true" /></button>
        </div>
        <nav aria-label="Previous questions">
          <ul>{history.map((entry) => <li key={entry.key}>
            <button aria-current={shown?.entry.key === entry.key ? 'page' : undefined} title={questions.find((item) => item.id === entry.id)!.question} onClick={() => openEntry(entry)}>{entry.label}</button>
          </li>)}</ul>
        </nav>
      </aside>}
      <header className="site-header">
        {submitted && !loading && !!history.length && !panelOpen && <button className="panel-toggle" aria-label="Show previous questions" aria-expanded="false" onClick={() => setPanelOpen(true)}><SidebarSimple size={19} aria-hidden="true" /></button>}
        {!loading && <button className="about-button" onClick={() => setModal('about')}>
          About the evidence <ArrowUpRight size={15} aria-hidden="true" />
        </button>}
      </header>

      <main id="main-content" className={submitted ? 'answer-main' : undefined}>
        {shown ? <AnswerView key={shown.entry.key} question={shown.question} instant={shown.instant} onReady={() => setReadyKey(shown.entry.key)} onDisplayed={() => setHistory((entries) => addEntry(entries, shown.entry))} /> : <div className="launch-content">
          <h1>What does the <span>evidence say?</span></h1>
          <form className="question-form" onSubmit={(event) => { event.preventDefault(); submitQuestion() }}>
            <label className="sr-only" htmlFor="question">Your restoration question</label>
            <textarea
              ref={input}
              id="question"
              value={question}
              placeholder="Ask about ecological restoration…"
              maxLength={2000}
              spellCheck
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submitQuestion()
                }
              }}
            />
            <div className="composer-toolbar">
              <button className="submit-button" type="submit" disabled={!question.trim()} aria-label="Submit question">
                <ArrowUp size={23} weight="bold" aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>}
      </main>
      <footer className="site-footer"><span>Evidence Jam <span className="footer-year">2026</span> · By Random Team</span></footer>
      <dialog ref={dialog} className="info-dialog" aria-labelledby="dialog-title" onCancel={() => setModal(null)} onClose={() => setModal(null)} onClick={(event) => { if (event.target === event.currentTarget) setModal(null) }}>
        <div className="dialog-content">
          <button className="close-button" aria-label="Close dialog" onClick={() => setModal(null)}><X size={21} aria-hidden="true" /></button>
          {modal === 'about' ? <>
            <Leaf className="dialog-icon" size={32} weight="duotone" aria-hidden="true" />
            <h2 id="dialog-title" tabIndex={-1}>Grounded in research.</h2>
            <p>See what research can tell us about restoring ecosystems across Canada. The studies bring together different places, approaches, and results, helping us understand what works, where findings differ, and which questions remain unanswered.</p>
          </> : <>
            <h2 id="dialog-title" tabIndex={-1}>Not available yet.</h2>
            <p>This question isn’t supported yet. Please check back later, or choose one below.</p>
            <div className="dialog-questions">
              {questions.map((item) => <button key={item.id} onClick={() => pickQuestion(item)}><span>{item.title}</span><ArrowUpRight size={18} aria-hidden="true" /></button>)}
            </div>
            <button className="edit-button" onClick={() => { setModal(null); requestAnimationFrame(() => input.current?.focus()) }}>Edit my question</button>
          </>}
        </div>
      </dialog>
    </div>
  )
}
export default App
