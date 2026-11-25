import { isModuleName, own } from '../protocol'

import type { ModuleDeclaration, Props, Unit } from './types'

// The names of `slot.props` are `dataset` names: `itemId` is read from `data-item-id`.
const PROP_NAME = /^[a-z][a-zA-Z0-9]*$/

export type SlotsDeps = {
  win: Window
  /** The attribute that marks a slot; its value is the module's name. */
  attribute: string
  modules: ModuleDeclaration[]
  /** Also mount slots added later, and close the unit of a slot that left the document. */
  observe: boolean
  mount(module: string, target: Element, props: Props): Unit
  /** Closes a unit whose slot element is gone; true when it was still open. */
  closeRemoved(unit: Unit): boolean
  /** A slot the kernel refuses: the module's name when it is a name. */
  reportBad(module: string | undefined): void
  guard(step: () => void): void
}

export type Slots = {
  /** The kill switch said enabled: scan the document, and watch it when asked to. */
  start(): void
  /** Takes its listener and observer away. */
  stop(): void
}

/**
 * Mounts the elements of a page that carry the slot attribute. A page under a strict policy
 * configures a unit this way. Only a module that declares `slot` is mounted, and only the
 * `data-` entries it lists become props: a sanitizer lets `data-*` through, so nothing else
 * the page holds is read.
 */
export function createSlots(deps: SlotsDeps): Slots {
  const doc = deps.win.document
  const selector = `[${deps.attribute}]`
  // Seen elements are remembered here, never on the host's element, so a slot is mounted (or
  // refused) once, and a closed one is not drawn again by a later scan.
  const seen = new WeakMap<Element, true>()
  const live = new Map<Element, Unit>()
  let observer: MutationObserver | undefined
  let onLoaded: (() => void) | undefined

  function mountSlot(element: Element): void {
    if (seen.has(element)) return
    seen.set(element, true)
    const value = element.getAttribute(deps.attribute) ?? ''
    const declaration = deps.modules.find((module) => module.name === value)
    const slotted = declaration ? own(declaration, 'slot') : undefined
    if (!declaration || !slotted || own(declaration, 'display') === 'modal') {
      deps.reportBad(isModuleName(value) ? value : undefined)
      return
    }
    // A name that is no dataset name could never be read from the element: refused whole.
    if (!slotted.props.every((name) => PROP_NAME.test(name))) {
      deps.reportBad(declaration.name)
      return
    }
    const props: Props = {}
    const dataset = (element as HTMLElement).dataset
    for (const name of slotted.props) {
      const prop = dataset?.[name]
      if (typeof prop === 'string') props[name] = prop
    }
    live.set(element, deps.mount(declaration.name, element, props))
  }

  function scan(root: ParentNode): void {
    if (root instanceof Element && root.matches(selector)) mountSlot(root)
    for (const element of root.querySelectorAll(selector)) mountSlot(element)
  }

  function sweepRemoved(): void {
    for (const [element, unit] of live) {
      if (element.isConnected) continue
      live.delete(element)
      // Forgotten only when this close ended the unit: an element whose unit failed stays
      // remembered, so a failing module is not mounted again each time the page re-adds it.
      if (deps.closeRemoved(unit)) seen.delete(element)
    }
  }

  function stopListening(): void {
    if (onLoaded) doc.removeEventListener('DOMContentLoaded', onLoaded)
    onLoaded = undefined
  }

  function watch(): void {
    const { MutationObserver: Observer } = deps.win as Window & typeof globalThis
    observer = new Observer((records) =>
      deps.guard(() => {
        for (const record of records) {
          for (const node of record.addedNodes) if (node.nodeType === 1) scan(node as Element)
        }
        sweepRemoved()
      }),
    )
    observer.observe(doc.documentElement, { childList: true, subtree: true })
  }

  return {
    start() {
      scan(doc)
      if (doc.readyState === 'loading') {
        onLoaded = () => {
          stopListening()
          deps.guard(() => scan(doc))
        }
        doc.addEventListener('DOMContentLoaded', onLoaded)
      }
      if (deps.observe) watch()
    },
    stop() {
      stopListening()
      observer?.disconnect()
      observer = undefined
      live.clear()
    },
  }
}
