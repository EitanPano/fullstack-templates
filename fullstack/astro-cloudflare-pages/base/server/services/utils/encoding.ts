// encoding.ts belongs: base64url for bytes and text, on the web platform's btoa and atob (no
// Buffer). It does not belong: any cryptography (services/security/crypto.ts).
export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

// Throws on input that is not base64url.
export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url')
  const padded = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

export function textToBase64Url(text: string): string {
  return toBase64Url(new TextEncoder().encode(text))
}

export function base64UrlToText(text: string): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(fromBase64Url(text))
}
