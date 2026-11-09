import { toTheme } from '@/core/theme/theme'
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/shared/components/dropdown-menu'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectTheme, themeChanged } from '@/store/theme.slice'

const CHOICES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

// The theme choices as menu items for the user menu. The listener behind the slice writes
// data-theme and the stored choice.
export function ThemeMenu() {
  const theme = useAppSelector(selectTheme)
  const dispatch = useAppDispatch()

  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          dispatch(themeChanged(toTheme(value)))
        }}
      >
        {CHOICES.map((choice) => (
          <DropdownMenuRadioItem key={choice.value} value={choice.value}>
            {choice.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
