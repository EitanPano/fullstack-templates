import { Toaster as Sonner, type ToasterProps } from 'sonner'

// sonner's toaster with our class; the caller passes the theme choice, because shared/ never
// reads the store. Its look is in styles/components.
export function Toaster({ theme }: Pick<ToasterProps, 'theme'>) {
  return <Sonner theme={theme} className="toaster" />
}
