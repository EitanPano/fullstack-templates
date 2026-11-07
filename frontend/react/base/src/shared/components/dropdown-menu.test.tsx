import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/dropdown-menu'

function Menu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Label</DropdownMenuLabel>
        <DropdownMenuItem>Item</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value="a">
          <DropdownMenuRadioItem value="a">A</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="b">B</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('DropdownMenu', () => {
  it('opens on click and lists its items with the styled classes', async () => {
    render(<Menu />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByRole('menu')).toHaveClass('dropdown-menu')
    expect(screen.getByRole('menuitem', { name: 'Item' })).toHaveClass('dropdown-menu__item')
    expect(screen.getByRole('menuitemradio', { name: 'A' })).toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'B' })).not.toBeChecked()
  })

  it('closes on Escape', async () => {
    render(<Menu />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('menu')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
