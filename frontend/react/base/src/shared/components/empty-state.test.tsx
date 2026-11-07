import { render, screen } from '@testing-library/react'
import { InboxIcon } from 'lucide-react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/shared/components/button'
import { EmptyState } from '@/shared/components/empty-state'

describe('EmptyState', () => {
  it('shows an h2 title, the description and the action', () => {
    render(
      <EmptyState
        icon={InboxIcon}
        title="Nothing yet"
        description="Add one"
        action={<Button>Add</Button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Nothing yet' })).toBeInTheDocument()
    expect(screen.getByText('Add one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('renders the title alone', () => {
    render(<EmptyState title="Empty" />)

    expect(screen.getByRole('heading', { name: 'Empty' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
