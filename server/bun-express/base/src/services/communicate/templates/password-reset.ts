// templates/ belongs: pure wording, a function from inputs to a Rendered message. It never does
// I/O and never sends; the caller passes the result to send(). The flow that uses this template
// (password reset) is a later task; the wording ships now so that task only wires it.
import type { Rendered } from '../index'

export function passwordResetTemplate({
  link,
  ttlMinutes,
}: {
  link: string
  ttlMinutes: number
}): Rendered {
  return {
    name: 'password-reset',
    subject: 'Reset your password',
    text: `Use this link to reset your password: ${link}. It expires in ${String(ttlMinutes)} ${
      ttlMinutes === 1 ? 'minute' : 'minutes'
    }.`,
  }
}
