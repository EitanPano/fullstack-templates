import { useTheme, type Theme } from '@/shared/ui/theme-provider'

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/shared/ui/dropdown-menu'

const CHOICES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

// The theme choices as menu items; the UserMenu renders them.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => {
          setTheme(value as Theme)
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
