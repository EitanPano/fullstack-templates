import { spyOn } from 'bun:test'

// For a test that makes the code log a warning or an error on purpose (a failed delivery, a reused
// refresh token): the lines are captured so a green run prints no stack trace. `allow` lists what
// the test expects; `restore` throws on any other line, so an unexpected failure is not swallowed.
// Call it in `beforeEach` and `restore` in `afterEach`.
export function captureLogs(allow: readonly RegExp[]): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const push = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  const spies = [
    spyOn(console, 'warn').mockImplementation(push),
    spyOn(console, 'error').mockImplementation(push),
  ]
  return {
    lines,
    restore: () => {
      for (const spy of spies) spy.mockRestore()
      const unexpected = lines.filter((line) => !allow.some((pattern) => pattern.test(line)))
      if (unexpected.length > 0) {
        throw new Error(`unexpected log output:\n${unexpected.join('\n')}`)
      }
    },
  }
}
