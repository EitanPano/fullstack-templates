import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shared/components/button/button'
import { FormActions } from '@/shared/components/form/form-actions/form-actions'

describe('FormActions', () => {
  it('renders its buttons in the form-actions row without an inline style', () => {
    render(
      <FormActions data-testid="row" className="extra">
        <Button>Cancel</Button>
        <Button type="submit">Save</Button>
      </FormActions>,
    )

    const row = screen.getByTestId('row')
    expect(row).toHaveClass('form-actions', 'extra')
    expect(row).not.toHaveAttribute('style')
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
