import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from '@/shared/components/badge/badge'

describe('Badge', () => {
  it('defaults to the default variant', () => {
    render(<Badge>New</Badge>)

    expect(screen.getByText('New')).toHaveClass('badge', 'badge--default')
  })

  it.each(['default', 'success', 'warning', 'destructive', 'muted', 'info'] as const)(
    'renders the %s variant class',
    (variant) => {
      render(<Badge variant={variant}>x</Badge>)

      expect(screen.getByText('x')).toHaveClass(`badge--${variant}`)
    },
  )

  it('passes role and other span props through', () => {
    render(
      <Badge role="status" aria-live="polite">
        Online
      </Badge>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Online')
  })
})
