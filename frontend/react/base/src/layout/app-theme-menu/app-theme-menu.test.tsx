import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { AppThemeMenu } from '@/layout/app-theme-menu/app-theme-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/dropdown-menu/dropdown-menu'
import { createStore } from '@/store'
import { selectTheme, themeRestored } from '@/store/theme.slice'

function setup() {
  const store = createStore()
  store.dispatch(themeRestored('light'))
  render(
    <Provider store={store}>
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <AppThemeMenu />
        </DropdownMenuContent>
      </DropdownMenu>
    </Provider>,
  )
  return store
}

describe('ThemeMenu', () => {
  it('lists Light, Dark and System with the stored choice checked', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByText('Theme')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio').map((item) => item.textContent)).toEqual([
      'Light',
      'Dark',
      'System',
    ])
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeChecked()
  })

  it('dispatches the choice and sets data-theme on the document', async () => {
    const store = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    expect(selectTheme(store.getState())).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
