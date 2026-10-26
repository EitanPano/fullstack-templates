import { notFound } from 'next/navigation'

// An unmatched URL reaches the root not-found, which renders outside this group's frame.
// This catch-all sends it to the group's own not-found instead, so a 404 keeps the shell.
export default function UnmatchedPage() {
  notFound()
}
