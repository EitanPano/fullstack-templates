import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'

import { SIGN_IN_COPY } from '@/pages/auth/auth.copy'
import { signInSchema, type SignInInput } from '@/pages/auth/auth.form'
import { isApiError, withCopy } from '@/models/api-error'
import { useLoginMutation } from '@/services/auth.api'
import { Button } from '@/shared/components/button'
import { FormActions } from '@/shared/components/form-actions'
import { Form } from '@/shared/components/form/form'
import { PasswordField } from '@/shared/components/form/password-field'
import { reportFailure } from '@/shared/components/form/report-failure'
import { TextField } from '@/shared/components/form/text-field'
import { safeNextPath } from '@/shared/utils/next-path'

// The form recipe: the mutation's failure lands on a field or in a toast (the outcome: refused,
// rate limited, unreachable), worded in this form's copy. A success navigates, so there is no
// success toast.
export function SignInForm({ next }: { next?: string }) {
  const form = useForm<SignInInput, unknown, SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })
  const [login, { isLoading }] = useLoginMutation()
  const navigate = useNavigate()

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await login({ email, password }).unwrap()
    } catch (error) {
      reportFailure(form, isApiError(error) ? withCopy(error, SIGN_IN_COPY) : error)
      return
    }
    await navigate(safeNextPath(next), { replace: true })
  })

  return (
    <Form form={form} onSubmit={onSubmit} className="auth-form">
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <FormActions>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button asChild variant="link">
          <Link to="/sign-up">Create an account</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
