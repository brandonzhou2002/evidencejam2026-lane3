import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowUp } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { ArrowUpRight } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { Leaf } from '@phosphor-icons/react/dist/csr/Leaf'
import { Plant } from '@phosphor-icons/react/dist/csr/Plant'
import { TreeEvergreen } from '@phosphor-icons/react/dist/csr/TreeEvergreen'
import { Waves } from '@phosphor-icons/react/dist/csr/Waves'
import { X } from '@phosphor-icons/react/dist/csr/X'
import { normalizeQuestion, questions } from './questions'
import TerrainBackground from './components/TerrainBackground'
import './App.css'
const EvidenceExplorer = lazy(() => import('./components/EvidenceExplorer'))

type Modal = 'about' | 'unavailable' | null
const topicIcons = [TreeEvergreen, Waves, Plant]

function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1))
  const navigate = (path: string) => { window.location.hash = path; window.scrollTo(0, 0) }
  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [question, setQuestion] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const active = questions.find((item) => normalizeQuestion(item.question) === normalizeQuestion(question))

  useEffect(() => {
    if (modal && !dialog.current?.open) {
      dialog.current?.showModal()
      dialog.current?.querySelector<HTMLElement>('#dialog-title')?.focus()
    }
    if (!modal && dialog.current?.open) dialog.current.close()
  }, [modal])

  function chooseQuestion(value: string) {
    setQuestion(value)
    setModal(null)
    requestAnimationFrame(() => input.current?.focus())
  }

  function submitQuestion() {
    if (active) navigate(`${active.id}/answer`)
    if (question.trim() && !active) setModal('unavailable')
  }

  const [questionId, page] = route.split('/')
  if (questions.some(q => q.id === questionId) && ['answer', 'graph'].includes(page)) return <Suspense fallback={<main aria-live="polite">Loading evidence…</main>}><EvidenceExplorer key={questionId + page} questionId={questionId} page={page} navigate={navigate} /></Suspense>

  return (
    <div className="app-shell">
      <TerrainBackground paused={modal !== null} />
      <header className="site-header">
        <button className="about-button" onClick={() => setModal('about')}>
          About the evidence <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </header>

      <main id="main-content">
        <div className="launch-content">
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
          <div className="topic-list" aria-label="Supported questions">
            {questions.map((item, index) => {
              const Icon = topicIcons[index]
              return (
                <button key={item.id} className={`topic-button${active?.id === item.id ? ' selected' : ''}`}
                  onClick={() => chooseQuestion(item.question)} aria-pressed={active?.id === item.id} title={item.question}>
                  <Icon size={22} weight="light" aria-hidden="true" /><span>{item.title}</span>
                </button>
              )
            })}
          </div>
        </div>
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
              {questions.map((item) => <button key={item.id} onClick={() => chooseQuestion(item.question)}><span>{item.title}</span><ArrowUpRight size={18} aria-hidden="true" /></button>)}
            </div>
            <button className="edit-button" onClick={() => { setModal(null); requestAnimationFrame(() => input.current?.focus()) }}>Edit my question</button>
          </>}
        </div>
      </dialog>
    </div>
  )
}
export default App
