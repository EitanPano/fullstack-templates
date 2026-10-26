// An error whose message is copy we wrote for the user. A server action throws it for an
// expected failure; `handleServerError` hands its message to the client and replaces every
// other error with a generic one, so a cause never reaches the browser.
export class ActionError extends Error {
  readonly code: string | undefined
  readonly status: number | undefined

  constructor(message: string, details: { code?: string; status?: number } = {}) {
    super(message)
    this.name = 'ActionError'
    this.code = details.code
    this.status = details.status
  }
}
