import 'server-only'

import { createSafeActionClient } from 'next-safe-action'

import { readSession, type Role } from '@/shared/auth/session' // @server:auth

import { ActionError } from './action-error'

export { ActionError }
export const GENERIC_ERROR = 'Something went wrong. Try again.'

// The one place an action's failure becomes text for the browser: our copy for an ActionError,
// a generic line for anything else. next-safe-action does not log, so the cause is logged here.
export function handleServerError(error: Error): string {
  if (error instanceof ActionError) return error.message
  console.error('[action] unexpected error:', error)
  return GENERIC_ERROR
}

// Every action starts from one of these clients. `.inputSchema(schema)` validates the input,
// `.action(handler)` is the Server Action; `returnValidationErrors` puts an error on a field.
export const action = createSafeActionClient({ handleServerError })

// @server:auth-start
// An action for a signed-in account. The session is read again on every call (it is memoised
// per request), so a revoked or expired session stops the action here.
export const accountAction = action.use(async ({ next }) => {
  const session = await readSession()
  if (!session) throw new ActionError('Sign in to continue.')
  return next({ ctx: { session } })
})

// An action for one role. The server API checks the role again on its own routes; this stops
// the call before it gets there.
export function roleAction(role: Role) {
  return accountAction.use(({ next, ctx }) => {
    if (ctx.session.user.role !== role) throw new ActionError("You don't have access to this.")
    return next()
  })
}
// @server:auth-end
