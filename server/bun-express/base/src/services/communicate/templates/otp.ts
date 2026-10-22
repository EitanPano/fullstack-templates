// templates/ belongs: pure wording, a function from inputs to a Rendered message. It never does
// I/O and never sends; the caller passes the result to send().
import type { OtpPurpose } from '../../../models/auth/enum'
import type { Rendered } from '../index'

const PURPOSE_WORDS: Record<OtpPurpose, string> = {
  login: 'log in',
  verify: 'verify your contact',
}

export function otpTemplate({
  code,
  purpose,
  ttlMinutes,
}: {
  code: string
  purpose: OtpPurpose
  ttlMinutes: number
}): Rendered {
  return {
    name: 'otp',
    subject: 'Your verification code',
    text: `Your code to ${PURPOSE_WORDS[purpose]} is ${code}. It expires in ${String(ttlMinutes)} ${
      ttlMinutes === 1 ? 'minute' : 'minutes'
    }.`,
  }
}
