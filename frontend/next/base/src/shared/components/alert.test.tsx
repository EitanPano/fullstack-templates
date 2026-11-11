import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Alert } from '@/shared/components/alert'

describe('Alert', () => {
  it('is an alert when destructive', () => {
    render(<Alert variant="destructive">x</Alert>)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('is a status by default', () => {
    render(<Alert>x</Alert>)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('lets a prop override the role', () => {
    render(<Alert role="note">x</Alert>)

    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})
