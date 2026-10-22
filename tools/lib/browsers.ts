// Playwright is a dependency of the generated package, so its browser is installed from there.
// Linux CI runners also need the system libraries; other platforms ship them.
export function browserInstallCommand(platform: NodeJS.Platform): string {
  const deps = platform === 'linux' ? ' --with-deps' : ''
  return `bun x playwright install${deps} chromium`
}
