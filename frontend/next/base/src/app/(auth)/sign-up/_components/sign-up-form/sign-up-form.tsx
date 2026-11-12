'use client'

import { useHookFormAction } from '@next-safe-action/adapter-react-hook-form/hooks'
import Link from 'next/link'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { signUp } from '@/actions/auth/auth'
import { signUpSchema } from '@/actions/auth/auth.form'
import { Button } from '@/shared/components/button/button'
import { hasField, ignoreNavigation, unplacedMessage } from '@/shared/components/form/action-form/action-form'
import { Form } from '@/shared/components/form/form'
import { PasswordField } from '@/shared/components/form/password-field'
import { TextField } from '@/shared/components/form/text-field'
import { FormActions } from '@/shared/components/form/form-actions/form-actions'
import { formResolver } from '@/shared/utils/validation'

// A taken email comes back as an error on the email field (the action maps the 409 there), so
// only outcomes without a field (the rate limit, an outage) are toasts.
export function SignUpForm({ next }: { next?: string }) {
  const { form, handleSubmitWithAction, action } = useHookFormAction(
    signUp,
    formResolver(signUpSchema),
    {
      formProps: { defaultValues: { email: '', password: '', confirm: '', next } },
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
    <Form form={form} onSubmit={ignoreNavigation(handleSubmitWithAction)} className="auth-form">
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="new-password" />
      <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" />
      <FormActions>
        <Button type="submit" disabled={action.isPending}>
          {action.isPending ? 'Creating account…' : 'Create account'}
        </Button>
        <Button asChild variant="link">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
