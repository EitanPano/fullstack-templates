// client-address.ts belongs: who the caller is for rate limiting. Cloudflare sets CF-Connecting-IP
// on every request that reaches a deployed function; a local run has none and shares one
// constant subject. An IPv6 client is keyed by its /64, since a subscriber owns the whole /64 and
// rotating addresses inside it must not dodge a limit; IPv4-mapped IPv6 is the IPv4.
// It does not belong: counting (middleware/rate-limit.ts).
export const LOCAL_SUBJECT = 'local'

export function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP')?.trim() || LOCAL_SUBJECT
}

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4 = new RegExp(`^(?:${OCTET}\\.){3}${OCTET}$`)

function isIPv4(text: string): boolean {
  return IPV4.test(text)
}

// Hex groups of one to four digits, at most one double colon and an optional dotted IPv4 tail.
function isIPv6(text: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return false
  const halves = text.split('::')
  if (halves.length > 2) return false
  const parts = halves.flatMap((half) => (half === '' ? [] : half.split(':')))
  const last = parts.at(-1)
  const tail = last?.includes('.') === true
  if (tail && !isIPv4(last ?? '')) return false
  const groups = parts.length + (tail ? 1 : 0)
  if (!parts.slice(0, tail ? -1 : undefined).every((part) => /^[0-9a-fA-F]{1,4}$/.test(part))) {
    return false
  }
  return halves.length === 2 ? groups < 8 : groups === 8
}

// Anything that is not an address is returned unchanged.
export function rateLimitSubject(address: string): string {
  const bare = address.split('%')[0] ?? address
  if (isIPv4(bare)) return bare
  if (!isIPv6(bare)) return address
  const hextets = expandIPv6(bare)
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    const [high = 0, low = 0] = hextets.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
  }
  return `${compressIPv6([...hextets.slice(0, 4), 0, 0, 0, 0])}/64`
}

// The eight 16-bit groups of a valid IPv6 address, with `::` and a dotted IPv4 tail expanded.
function expandIPv6(address: string): number[] {
  const [head = '', tail] = address.split('::')
  const groups = (text: string): number[] =>
    text === ''
      ? []
      : text.split(':').flatMap((part) => {
          if (!part.includes('.')) return [parseInt(part, 16)]
          const [a = 0, b = 0, c = 0, d = 0] = part.split('.').map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
  const before = groups(head)
  if (tail === undefined) return before
  const after = groups(tail)
  return [...before, ...Array<number>(8 - before.length - after.length).fill(0), ...after]
}

// RFC 5952: lower-case, no leading zeros, the longest run of two or more zero groups (the first
// on a tie) as `::`.
function compressIPv6(hextets: number[]): string {
  let best = { start: -1, length: 1 }
  for (let start = 0; start < hextets.length; start++) {
    let end = start
    while (hextets[end] === 0) end++
    if (end - start > best.length) best = { start, length: end - start }
  }
  const text = (groups: number[]) => groups.map((h) => h.toString(16)).join(':')
  if (best.start < 0) return text(hextets)
  const left = text(hextets.slice(0, best.start))
  const right = text(hextets.slice(best.start + best.length))
  return `${left}::${right}`
}
