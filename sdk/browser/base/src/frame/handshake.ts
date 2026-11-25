import { PROTOCOL_VERSION, isHandshake } from '../protocol'

export type HandshakeOptions = {
  win: Window
  onPort: (port: MessagePort) => void
}

/**
 * Takes the loader's port, once. Only the parent window may hand one over, and where the engine
 * names the parent's origin (`ancestorOrigins`; Firefox does not) the message must come from it:
 * the frame-ancestors policy of the document is what keeps the other cases out. The answer goes
 * back on the port the parent gave, which no other window holds.
 */
export function listenForHandshake({ win, onPort }: HandshakeOptions): () => void {
  let taken = false
  const listener = (event: MessageEvent) => {
    if (taken || event.source !== win.parent || !isHandshake(event.data)) return
    const port = event.ports[0]
    if (!port) return
    const ancestor = win.location.ancestorOrigins?.[0]
    if (ancestor && event.origin !== ancestor) return
    taken = true
    win.removeEventListener('message', listener)
    onPort(port)
    port.postMessage({ v: PROTOCOL_VERSION, type: 'ready' })
  }
  win.addEventListener('message', listener)
  return () => win.removeEventListener('message', listener)
}
