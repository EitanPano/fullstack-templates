const E164 = /^\+[1-9]\d{6,14}$/

// Calling codes of two digits, from the ITU numbering plan; 1 and 7 are one digit, the rest three.
const TWO_DIGIT = new Set(
  (
    '20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 ' +
    '60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98'
  ).split(' '),
)

function codeLength(digits: string): number {
  if (digits.startsWith('1') || digits.startsWith('7')) return 1
  return TWO_DIGIT.has(digits.slice(0, 2)) ? 2 : 3
}

// Groups of three; a lone last digit joins the group before it (`541 234 5678`).
function group(digits: string): string {
  const parts = digits.match(/\d{1,3}/g) ?? []
  const last = parts.at(-1)
  if (parts.length > 1 && last?.length === 1) {
    parts.splice(-2, 2, (parts.at(-2) ?? '') + last)
  }
  return parts.join(' ')
}

// An E.164 number (`+14155550132`) as `+1 (415) 555-0132` for the North American plan and
// `+<code> <groups of three>` elsewhere. Anything that is not E.164 comes back unchanged, and
// null or undefined as ''. Display only: the stored value stays E.164.
export function formatPhone(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (!E164.test(value)) return value
  const digits = value.slice(1)
  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  const length = codeLength(digits)
  return `+${digits.slice(0, length)} ${group(digits.slice(length))}`
}
