import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shared/ui/button'

// Jsdom has no pointer media, so the sizing contract is asserted on the classes: the shadcn
// density on a fine pointer and 44 px (h-11, size-11) under pointer-coarse.
describe('Button sizing', () => {
  it('is 36 px on a fine pointer and 44 px on a coarse one', () => {
    render(<Button>Save</Button>)

    expect(screen.getByRole('button')).toHaveClass('h-9', 'pointer-coarse:h-11')
  })

  it('makes an icon button a 44 px square under pointer-coarse', () => {
    render(
      <Button size="icon" aria-label="Open">
        +
      </Button>,
    )

    expect(screen.getByRole('button')).toHaveClass('size-9', 'pointer-coarse:size-11')
  })

  it('keeps the compact sizes at 44 px under pointer-coarse', () => {
    render(
      <>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </>,
    )

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('pointer-coarse:h-11')
    }
  })
})
