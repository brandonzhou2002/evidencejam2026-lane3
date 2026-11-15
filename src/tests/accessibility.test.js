import test from 'node:test'
import assert from 'node:assert/strict'
import { AnswerView } from '../src/answer-view.js'

test('drawer keyboard navigation wraps at both ends and excludes hidden controls', (t) => {
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  globalThis.document = { activeElement: null }
  globalThis.window = { getComputedStyle: () => ({ visibility: 'visible' }) }
  const control = (visible = true) => ({
    tabIndex: 0,
    getClientRects: () => (visible ? [{}] : []),
    focus() {
      document.activeElement = this
    },
  })
  const first = control(),
    middle = control(),
    last = control(),
    hidden = control(false)
  const heading = control()
  let closed = false
  const view = {
    openedId: 'finding',
    drawer: {
      querySelectorAll: () => [first, middle, last, hidden],
      querySelector: () => heading,
    },
    closeDrawer: () => {
      closed = true
    },
  }
  const press = (key, shiftKey = false) => {
    const event = {
      key,
      shiftKey,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }
    AnswerView.prototype.drawerKeydown.call(view, event)
    return event
  }
  heading.focus()
  assert.equal(press('Tab').defaultPrevented, true)
  assert.equal(document.activeElement, first)
  first.focus()
  assert.equal(press('Tab', true).defaultPrevented, true)
  assert.equal(document.activeElement, last)
  last.focus()
  assert.equal(press('Tab').defaultPrevented, true)
  assert.equal(document.activeElement, first)
  middle.focus()
  assert.equal(press('Tab').defaultPrevented, false)
  assert.equal(press('ArrowDown').defaultPrevented, false)
  assert.equal(press('F6').defaultPrevented, true)
  assert.equal(closed, true)
  view.openedId = null
  assert.equal(press('Tab').defaultPrevented, false)
})
