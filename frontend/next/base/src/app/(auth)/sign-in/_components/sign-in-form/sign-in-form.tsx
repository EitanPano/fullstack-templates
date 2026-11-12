'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { signIn } from '@/actions/auth/auth'
import { signInSchema } from '@/actions/auth/auth.form'
import { Button } from '@/shared/components/button/button'
import {
  hasField,
  ignoreNavigation,
  unplacedMessage,
  useActionForm,
} from '@/shared/components/form/action-form/action-form'
import { Form } from '@/shared/components/form/form'
import { PasswordField } from '@/shared/components/form/password-field'
import { TextField } from '@/shared/components/form/text-field'
import { FormActions } from '@/shared/components/form/form-actions/form-actions'
import { toastError } from '@/shared/components/toaster/toaster'
import { formResolver } from '@/shared/utils/validation'

// The form recipe: the action's result lands in the form (field errors on their fields, through
// the adapter) or in a toast (the outcome: refused, rate limited, unreachable). A success
// redirects from the action, so there is no success toast.
export function SignInForm({ next }: { next?: string }) {
  const { form, handleSubmitWithAction, action } = useActionForm(
    signIn,
    formResolver(signInSchema),
    {
      formProps: { defaultValues: { email: '', password: '', next } },
      actionProps: {
        onError: ({ error }) => {
          const message =
            error.serverError ??
            unplacedMessage(error.validationErrors, (path) => hasField(form, path))
          if (message) toastError(message)
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
    <Form form={form} onSubmit={ignoreNavigation(handleSubmitWithAction)} className="auth-form">
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
