import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, X } from '@phosphor-icons/react'
import { certaintyLabel } from '../data/answer-data'
import type { Finding } from '../data/answer-data'
import { certaintyExplanation, certaintyScaleExplanation, directionExplanation, mixedCertaintyExplanation } from '../data/certainty'
import './CertaintyInfo.css'

type Graded = Pick<Finding, 'certainty' | 'direction' | 'certainty_rationale'>

function Explanation({ finding, id, onClose }: { finding: Graded; id: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    heading.current?.focus()
    return () => { element?.close() }
  }, [])
  return <dialog ref={dialog} id={id} className="certainty-dialog" aria-labelledby={`${id}-heading`} onClose={() => { if (!dialog.current?.open) onClose() }}
    onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) dialog.current?.close() }}>
    <div className="certainty-dialog-content">
      <button className="certainty-dialog-close" type="button" aria-label="Close certainty explanation" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
      <h2 id={`${id}-heading`} tabIndex={-1} ref={heading}>Effect and certainty</h2>
      <p>{directionExplanation}</p>
      <p>{certaintyExplanation}</p>
      <p className={finding.direction === 'mixed' && finding.certainty === 'high' ? 'certainty-mixed-note' : undefined}>{mixedCertaintyExplanation}</p>
      <p className="certainty-scale-note">{certaintyScaleExplanation}</p>
    </div>
  </dialog>
}

export default function CertaintyInfo({ finding, label }: { finding: Graded; label: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <>
    <button type="button" className="certainty-info" aria-label={`Explain ${certaintyLabel(finding.certainty).toLowerCase()} certainty for ${label}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={(event) => { event.stopPropagation(); setOpen(true) }}>
      <Info size={16} aria-hidden="true" />
    </button>
    {open && createPortal(<Explanation finding={finding} id={id} onClose={() => setOpen(false)} />, document.body)}
  </>
}
