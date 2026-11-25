import { isHttpsUrl } from '../protocol'

// Text from the server or the host reaches the DOM as a text node, never as markup, and a link
// is https. The frame's policy has no `style-src`: a module sets styles through `el.style`.
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
