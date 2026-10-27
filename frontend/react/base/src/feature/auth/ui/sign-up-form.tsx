import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { safeNextPath } from '@/shared/auth/next-path'
import { Button } from '@/shared/ui/button'
import { Form } from '@/shared/ui/form/form'
import { PasswordField } from '@/shared/ui/form/password-field'
import { reportFailure } from '@/shared/ui/form/report-failure'
import { TextField } from '@/shared/ui/form/text-field'
import { FormActions } from '@/shared/ui/pattern/form-actions'

import { useSignUp } from '../api/auth'
import { signUpSchema, type SignUpInput } from '../model'

// A taken email comes back as an error on the email field (`call` maps the 409 there), so only
// outcomes without a field (the rate limit, an outage) are toasts.
export function SignUpForm({ next }: { next?: string }) {
  const form = useForm<SignUpInput, unknown, SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  })
  const signUp = useSignUp()
  const navigate = useNavigate()

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signUp.mutateAsync(values)
    } catch (error) {
      reportFailure(form, error)
      return
    }
    await navigate(safeNextPath(next), { replace: true })
  })

  return (
    <Form form={form} onSubmit={onSubmit} className="flex flex-col gap-4">
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="new-password" />
      <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" />
      <FormActions>
        <Button type="submit" disabled={signUp.isPending}>
          {signUp.isPending ? 'Creating account…' : 'Create account'}
        </Button>
        <Button asChild variant="link">
          <Link to="/sign-in">Sign in</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
