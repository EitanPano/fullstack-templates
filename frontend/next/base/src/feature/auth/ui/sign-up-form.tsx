'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useHookFormAction } from '@next-safe-action/adapter-react-hook-form/hooks'
import Link from 'next/link'
import { toast } from 'sonner'

import { Button } from '@/shared/ui/button'
import { Form } from '@/shared/ui/form/form'
import { PasswordField } from '@/shared/ui/form/password-field'
import { TextField } from '@/shared/ui/form/text-field'
import { FormActions } from '@/shared/ui/pattern/form-actions'

import { signUpSchema } from '../model'
import { signUp } from '../server/action'

// A taken email comes back as an error on the email field (the action maps the 409 there), so
// only outcomes without a field (the rate limit, an outage) are toasts.
export function SignUpForm({ next }: { next?: string }) {
  const { form, handleSubmitWithAction, action } = useHookFormAction(
    signUp,
    zodResolver(signUpSchema),
    {
      formProps: { defaultValues: { email: '', password: '', confirm: '', next } },
      actionProps: {
        onError: ({ error }) => {
          if (error.serverError) toast.error(error.serverError)
        },
      },
    },
  )

  return (
    <Form form={form} onSubmit={handleSubmitWithAction} className="flex flex-col gap-4">
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
