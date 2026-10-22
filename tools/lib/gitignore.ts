const header = (name: string): string => `# --- fullstack-templates: ${name} ---`

export function mergeGitignore(
  existing: string | undefined,
  sections: ReadonlyArray<{ name: string; body: string }>,
): string {
  const base = existing ?? ''
  // Header presence is the idempotence key, so a rerun never duplicates a section.
  const missing = sections.filter(({ name }) => !base.includes(header(name)))
  const written = missing.map(({ name, body }) => `${header(name)}\n${body.trim()}\n`)
  if (base.trim() === '') return written.join('\n')
  if (written.length === 0) return base
  const kept = base.endsWith('\n') ? base : `${base}\n`
  return `${kept}\n${written.join('\n')}`
}
