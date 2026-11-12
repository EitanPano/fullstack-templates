import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { Form } from '@/shared/components/form/form'

function Probe() {
  const form = useForm({ defaultValues: { name: '' } })
  return (
    <Form form={form} aria-label="Probe">
      <input name="name" />
    </Form>
  )
}

describe('Form', () => {
  it('posts, so a submit before hydration never puts a field in the URL', () => {
    render(<Probe />)

    expect(screen.getByRole('form', { name: 'Probe' })).toHaveAttribute('method', 'post')
  })

  it('is marked hydrated in the browser and not in the server markup', () => {
    render(<Probe />)

    expect(screen.getByRole('form', { name: 'Probe' })).toHaveAttribute('data-hydrated', 'true')
    expect(renderToString(<Probe />)).not.toContain('data-hydrated')
  })
})
