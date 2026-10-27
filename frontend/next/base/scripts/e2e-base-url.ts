// The origin of an existing stack to test, or undefined to start the suite's own servers. A CI
// variable exported empty ("E2E_BASE_URL=") counts as unset, not as an origin of ''.
export function externalBaseUrl(configured: string | undefined): string | undefined {
  return configured?.trim() || undefined
}
