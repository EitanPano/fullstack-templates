export type ModalOptions = {
  doc: Document
  iframe: HTMLIFrameElement
  /** The dialog's accessible name: the module's title. */
  title: string
  /** What had focus when the unit was opened; it gets the focus back when the unit closes. */
  opener: Element | null
  /** The dialog's own `cancel` (Escape with focus outside the frame): the unit is to close. */
  onCancel(): void
  /** The page took the container out while the dialog was shown: a removed dialog fires no `close`. */
  onDetached(): void
}

export type ModalMount = {
  /** Opens the dialog, moves the focus into the frame and locks the page's scroll. Once. */
  show(): void
  /** Closes the dialog and gives back the scroll and the focus, if shown. The container stays. */
  hide(): void
  /** Hides, then takes the container, and the frame in it, out of the page. */
  remove(): void
}

// The default backdrop dims the page by a tenth; the frame paints its own scrim.
const BACKDROP = 'dialog::backdrop { background: transparent; }'

const FILL: Array<[string, string]> = [
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['width', '100%'],
  ['height', '100%'],
  ['max-width', 'none'],
  ['max-height', 'none'],
  ['overflow', 'hidden'],
  ['background', 'transparent'],
]

/**
 * Puts a unit's iframe in a modal `<dialog>`, in a closed shadow root on a container at the end
 * of the body: the page's own rules for `dialog` and `iframe` and its stacking contexts do not
 * reach it. Every style goes through the CSSOM, as the host's policy may allow none. The dialog
 * is created closed: the caller shows it once the frame has answered the handshake.
 */
export function mountModal(options: ModalOptions): ModalMount {
  const { doc, iframe } = options
  const container = doc.createElement('div')
  const root = container.attachShadow({ mode: 'closed' })
  const dialog = doc.createElement('dialog')
  dialog.setAttribute('aria-label', options.title)
  for (const [name, value] of FILL) dialog.style.setProperty(name, value)
  iframe.style.setProperty('width', '100%')
  iframe.style.setProperty('height', '100%')
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    options.onCancel()
  })
  try {
    const sheet = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet()
    sheet.replaceSync(BACKDROP)
    root.adoptedStyleSheets = [sheet]
  } catch {
    // An engine without constructable sheets keeps the default dim: nothing else depends on it.
  }
  dialog.appendChild(iframe)
  root.appendChild(dialog)
  // A page still in its head has no body yet.
  ;(doc.body ?? doc.documentElement).appendChild(container)

  let shown = false
  let earlier: { value: string; priority: string } | undefined
  let watcher: MutationObserver | undefined
  const page = doc.documentElement.style

  // A removed modal dialog fires no event: Turbo or htmx swapping the body would leave the page
  // locked behind a frame that is gone. The unit is told, and closes through the normal path.
  function watch(): void {
    const Observer = (doc.defaultView as Window & typeof globalThis).MutationObserver
    watcher = new Observer(() => {
      if (!container.isConnected) options.onDetached()
    })
    for (const node of [doc.body, doc.documentElement]) {
      if (node) watcher.observe(node, { childList: true })
    }
  }

  function hide(): void {
    watcher?.disconnect()
    watcher = undefined
    if (!shown) return
    shown = false
    dialog.close()
    // Put back only what is still ours: another instance, or the page, may have written since.
    if (
      page.getPropertyValue('overflow') === 'hidden' &&
      page.getPropertyPriority('overflow') === ''
    ) {
      if (earlier?.value) page.setProperty('overflow', earlier.value, earlier.priority)
      else page.removeProperty('overflow')
    }
    const { opener } = options
    if (opener && opener !== doc.body && opener !== doc.documentElement && opener.isConnected) {
      ;(opener as HTMLElement).focus()
    }
  }

  return {
    show() {
      if (shown) return
      dialog.showModal()
      shown = true
      // WebKit scrolls the page behind a frame whatever `overscroll-behavior` says (ADR 0021 U5).
      earlier = {
        value: page.getPropertyValue('overflow'),
        priority: page.getPropertyPriority('overflow'),
      }
      page.setProperty('overflow', 'hidden')
      watch()
      iframe.focus()
    },
    hide,
    remove() {
      hide()
      container.remove()
    },
  }
}
