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

import { useSignIn } from '../api/auth'
import { signInSchema, type SignInInput } from '../model'

// The form recipe: the mutation's failure lands on a field or in a toast (the outcome: refused,
// rate limited, unreachable). A success navigates, so there is no success toast.
export function SignInForm({ next }: { next?: string }) {
  const form = useForm<SignInInput, unknown, SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })
  const signIn = useSignIn()
  const navigate = useNavigate()

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signIn.mutateAsync(values)
    } catch (error) {
      reportFailure(form, error)
      return
    }
    await navigate(safeNextPath(next), { replace: true })
  })

  return (
    <Form form={form} onSubmit={onSubmit} className="flex flex-col gap-4">
      <TextField name="email" label="Email" type="email" autoComplete="email" />
      <PasswordField name="password" label="Password" autoComplete="current-password" />
      <FormActions>
        <Button type="submit" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button asChild variant="link">
          <Link to="/sign-up">Create an account</Link>
        </Button>
      </FormActions>
    </Form>
  )
}
