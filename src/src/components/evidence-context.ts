import { createContext, useContext } from 'react'
import type { MouseEvent } from 'react'
import type { Finding, Gap } from '../data/answer-data'

export type Linked = Set<string> | null
export type Opened = { kind: 'finding'; item: Finding } | { kind: 'gap'; item: Gap } | { kind: 'claim'; id: string; direction: string }
export type Drawer = { openId: string | null; toggle: (opened: Opened, trigger: HTMLElement | SVGElement) => void }
export const DrawerContext = createContext<Drawer>({ openId: null, toggle: () => {} })

export function openedId(opened: Opened) {
  return opened.kind === 'claim' ? opened.id : opened.item.id
}

export function useOpener(opened: Opened) {
  const { openId, toggle } = useContext(DrawerContext)
  return {
    'aria-haspopup': 'dialog' as const, 'aria-controls': 'evidence-drawer', 'data-opens': openedId(opened),
    'aria-expanded': openId === openedId(opened), onClick: (event: MouseEvent<HTMLElement | SVGElement>) => toggle(opened, event.currentTarget),
  }
}

export function linkClass(id: string | string[], linked: Linked) {
  if (!linked) return ''
  return (Array.isArray(id) ? id : [id]).some((item) => linked.has(item)) ? ' is-linked' : ' is-dimmed'
}
