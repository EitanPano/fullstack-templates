import { own } from '../protocol'

const DEFAULT_PLACEHOLDER = 100

export type InlineOptions = {
  target: Element
  iframe: HTMLIFrameElement
  /** The height held until the frame reports its own, in pixels. */
  placeholderHeight?: number
}

export type InlineMount = {
  /** The frame reported its height. */
  setHeight(height: number): void
  /** Hides the container and the iframe in it; they stay in the page. */
  hide(): void
  /** Takes the container, and the iframe in it, out of the page. */
  remove(): void
}

/** Puts a unit's iframe in the page, in a container of its own at the end of `target`. */
export function mountInline(options: InlineOptions): InlineMount {
  const container = options.target.ownerDocument.createElement('div')
  const setHeight = (height: number) => {
    container.style.setProperty('height', `${height}px`)
    options.iframe.style.setProperty('height', `${height}px`)
  }
  setHeight(own(options, 'placeholderHeight') ?? DEFAULT_PLACEHOLDER)
  container.appendChild(options.iframe)
  options.target.appendChild(container)
  return {
    setHeight,
    hide: () => container.style.setProperty('display', 'none'),
    remove: () => container.remove(),
  }
}
