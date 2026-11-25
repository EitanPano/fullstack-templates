import { isHttpsUrl } from '../protocol'

// Text from the server or the host reaches the DOM as a text node, never as markup, and a link
// is https. The frame's policy allows no inline style: a module's rules are in its `frame.css`,
// and a value known only at run time goes through `el.style`.
export function appendText(el: Element, text: string): void {
  el.appendChild(el.ownerDocument.createTextNode(text))
}

/** A link that opens in a new tab with no opener, or null when the address is not https. */
export function createLink(doc: Document, href: string, text: string): HTMLAnchorElement | null {
  if (!isHttpsUrl(href)) return null
  const link = doc.createElement('a')
  link.setAttribute('href', href)
  link.setAttribute('rel', 'noopener noreferrer')
  link.setAttribute('target', '_blank')
  appendText(link, text)
  return link
}

/**
 * An image from an https address or from the frame document's own origin, or null. `alt` is
 * required: pass an empty string for a decorative image. The frame's policy lists the origins an
 * image may come from, and no referrer is sent, so the image host never sees the frame's address.
 */
export function createImage(doc: Document, src: string, alt: string): HTMLImageElement | null {
  if (typeof src !== 'string' || src === '' || typeof alt !== 'string') return null
  let url: URL
  try {
    url = new URL(src, doc.baseURI)
  } catch {
    return null
  }
  const own = doc.location.origin !== 'null' && url.origin === doc.location.origin
  if (!isHttpsUrl(src) && !own) return null
  const img = doc.createElement('img')
  img.setAttribute('src', url.href)
  img.setAttribute('alt', alt)
  img.setAttribute('loading', 'lazy')
  img.setAttribute('decoding', 'async')
  img.setAttribute('referrerpolicy', 'no-referrer')
  return img
}
