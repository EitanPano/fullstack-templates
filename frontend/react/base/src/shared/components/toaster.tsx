import { Toaster as Sonner, type ToasterProps } from 'sonner'
import './toaster.scss'

// sonner's toaster with our class; the caller passes the theme choice, because shared/ never
// reads the store. Its look is in toaster.scss.
export function Toaster({ theme }: Pick<ToasterProps, 'theme'>) {
  return <Sonner theme={theme} className="toaster" />
}
