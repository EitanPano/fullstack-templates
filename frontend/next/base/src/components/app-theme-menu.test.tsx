import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/dropdown-menu'
import { AppThemeMenu } from '@/components/app-theme-menu'

// next-themes is a boundary: its hook is faked so the test asserts which theme is requested.
const setTheme = vi.fn()
let theme: string | undefined = 'dark'
vi.mock('next-themes', () => ({ useTheme: () => ({ theme, setTheme }) }))

// The toggle renders menu items, so it needs an open menu around it.
async function openToggle() {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Theme menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <AppThemeMenu />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Theme menu' }))
}

describe('AppThemeMenu', () => {
  beforeEach(() => {
    setTheme.mockClear()
    theme = 'dark'
  })

  it('offers Light, Dark and System and marks the active one', async () => {
    await openToggle()

    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'System' })).not.toBeChecked()
  })

  it('requests the chosen theme', async () => {
    await openToggle()

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }))

    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('reads a theme that is not resolved yet as System', async () => {
    theme = undefined
    await openToggle()

    expect(screen.getByRole('menuitemradio', { name: 'System' })).toBeChecked()
  })
})
