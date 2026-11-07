import { render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shared/components/button'

describe('Button', () => {
  it('defaults to a primary button of type button', () => {
    render(<Button>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('button', 'button--primary')
  })

  it.each(['primary', 'secondary', 'ghost', 'danger', 'link'] as const)(
    'renders the %s variant class',
    (variant) => {
      render(<Button variant={variant}>Go</Button>)

      expect(screen.getByRole('button')).toHaveClass(`button--${variant}`)
    },
  )

  it('renders the size class and keeps a caller class', () => {
    render(
      <Button size="icon" className="extra" aria-label="Open menu">
        x
      </Button>,
    )

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveClass('button--icon', 'extra')
  })

  it('lets a form submit when asked', () => {
    render(<Button type="submit">Send</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('renders the child link with the button classes under asChild', () => {
    render(
      <MemoryRouter>
        <Button asChild variant="secondary">
          <Link to="/x">Back</Link>
        </Button>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Back' })
    expect(link).toHaveClass('button', 'button--secondary')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
