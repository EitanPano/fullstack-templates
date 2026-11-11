import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// The one class-name joiner: later classes win over earlier conflicting ones, so a caller's
// `className` can override a primitive's default.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
