import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/tabs'

function Example() {
  return (
    <Tabs defaultValue="one">
      <TabsList aria-label="Sections">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('shows the selected panel and switches on click', async () => {
    render(<Example />)
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel')

    await userEvent.click(screen.getByRole('tab', { name: 'Two' }))

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel')
  })

  it('moves between tabs with the arrow keys', async () => {
    render(<Example />)
    screen.getByRole('tab', { name: 'One' }).focus()

    await userEvent.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')
  })
})
