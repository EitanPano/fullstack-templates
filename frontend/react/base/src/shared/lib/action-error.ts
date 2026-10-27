// An error whose message is copy we wrote for the user. `call` throws it for an expected failure
// and every other error is shown as a generic line, so a cause never reaches the page.
// `fieldErrors` maps a form field path to its message when the failure belongs to a field.
export class ActionError extends Error {
  readonly code: string | undefined
  readonly status: number | undefined
  readonly fieldErrors: Readonly<Record<string, string>> | undefined

  constructor(
    message: string,
    details: {
      code?: string
      status?: number
      fieldErrors?: Record<string, string>
    } = {},
  ) {
    super(message)
    this.name = 'ActionError'
    this.code = details.code
    this.status = details.status
    this.fieldErrors = details.fieldErrors
  }
}
