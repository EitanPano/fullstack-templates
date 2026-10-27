'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useHookFormAction } from '@next-safe-action/adapter-react-hook-form/hooks'
import Link from 'next/link'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'
import { hasField, ignoreNavigation, unplacedMessage } from '@/shared/ui/form/action-form'
import { Form } from '@/shared/ui/form/form'
import { PasswordField } from '@/shared/ui/form/password-field'
import { TextField } from '@/shared/ui/form/text-field'
import { FormActions } from '@/shared/ui/pattern/form-actions'

import { signInSchema } from '../model'
import { signIn } from '../server/action'

// The form recipe: the action's result lands in the form (field errors on their fields, through
// the adapter) or in a toast (the outcome: refused, rate limited, unreachable). A success
// redirects from the action, so there is no success toast.
export function SignInForm({ next }: { next?: string }) {
  const { form, handleSubmitWithAction, action } = useHookFormAction(
    signIn,
    zodResolver(signInSchema),
    {
      formProps: { defaultValues: { email: '', password: '', next } },
      actionProps: {
        onError: ({ error }) => {
          const message =
            error.serverError ??
            unplacedMessage(error.validationErrors, (path) => hasField(form, path))
          if (message) toast.error(message)
        },
      },
    },
  )

  // cacheComponents keeps a visited page mounted but hidden, so a typed password would stay in
  // its state and DOM after the redirect. Success (or the redirect it ends in) empties the form.
  const done = action.hasSucceeded || action.hasNavigated
  const { reset } = form
  useEffect(() => {
    if (done) reset()
  }, [done, reset])

  return (
    <Form
      form={form}
      onSubmit={ignoreNavigation(handleSubmitWithAction)}
      className="flex flex-col gap-4"
    >
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <FormActions>
        <Button type="submit" disabled={action.isPending}>
          {action.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button asChild variant="link">
          <Link href="/sign-up">Create an account</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
