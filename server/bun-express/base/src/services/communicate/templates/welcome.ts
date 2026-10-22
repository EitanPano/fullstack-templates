// templates/ belongs: pure wording, a function from inputs to a Rendered message. It never does
// I/O and never sends; the caller passes the result to send().
import type { Rendered } from '../index'

export function welcomeTemplate({ email }: { email: string }): Rendered {
  return {
    name: 'welcome',
    subject: 'Welcome',
    text: `Welcome aboard. Your account for ${email} is ready.`,
  }
}
