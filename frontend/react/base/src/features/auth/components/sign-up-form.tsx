import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { SIGN_UP_COPY } from '@/features/auth/auth.copy'
import { signUpSchema, type SignUpInput } from '@/features/auth/auth.form'
import { isApiError, withCopy } from '@/models/api-error'
import { useRegisterMutation } from '@/services/auth.api'
import { Button } from '@/shared/components/button'
import { FormActions } from '@/shared/components/form-actions'
import { Form } from '@/shared/components/form/form'
import { PasswordField } from '@/shared/components/form/password-field'
import { reportFailure } from '@/shared/components/form/report-failure'
import { TextField } from '@/shared/components/form/text-field'
import { safeNextPath } from '@/shared/utils/next-path'

// A taken email comes back as a conflict that this form puts on the email field, so only outcomes
// without a field (the rate limit, an outage) are toasts. The confirmation never leaves the form.
export function SignUpForm({ next }: { next?: string }) {
  const form = useForm<SignUpInput, unknown, SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  })
  const [register, { isLoading }] = useRegisterMutation()
  const navigate = useNavigate()

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await register({ email, password }).unwrap()
    } catch (error) {
      reportFailure(
        form,
        isApiError(error) ? withCopy(error, SIGN_UP_COPY, { conflict: 'email' }) : error,
      )
      return
    }
    await navigate(safeNextPath(next), { replace: true })
  })

  return (
    <Form form={form} onSubmit={onSubmit} className="auth-form">
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="new-password" />
      <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" />
      <FormActions>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
        <Button asChild variant="link">
          <Link to="/sign-in">Sign in</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
