'use client'

import { useTheme } from 'next-themes'

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

// The theme choices as menu items; the UserMenu renders them. `theme` is undefined until the
// provider has mounted, which reads as System, the provider's own default.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
        {CHOICES.map((choice) => (
          <DropdownMenuRadioItem key={choice.value} value={choice.value}>
            {choice.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
