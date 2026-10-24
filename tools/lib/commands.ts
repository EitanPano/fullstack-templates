import { spawnSync } from 'node:child_process'

export class CommandError extends Error {
  readonly commandLine: string
  readonly cwd: string
  readonly status: number | null
  // What the program wrote to stderr; only set by runQuiet, which captures it.
  readonly stderr: string

  constructor(
    commandLine: string,
    cwd: string,
    status: number | null,
    detail?: string,
    stderr = '',
  ) {
    const outcome = detail ?? `exited with status ${status}`
    super(`${commandLine} failed in ${cwd}: ${outcome}`)
    this.name = 'CommandError'
    this.commandLine = commandLine
    this.cwd = cwd
    this.status = status
    this.stderr = stderr
  }
}

// On Windows an npm-installed program is a .cmd shim that spawn cannot execute directly.
export function resolveCommand(program: string): { file: string; prefix: string[] } {
  if (process.platform !== 'win32') return { file: program, prefix: [] }
  const where = spawnSync('where.exe', [program], { encoding: 'utf8' })
  const first = (where.stdout ?? '').split(/\r?\n/).find((line) => line.trim() !== '')
  if (first === undefined) return { file: program, prefix: [] }
  return /\.(cmd|bat)$/i.test(first)
    ? { file: 'cmd.exe', prefix: ['/c', first] }
    : { file: first, prefix: [] }
}

function execute(
  commandLine: string,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  capture: boolean,
  quiet = false,
): string {
  const [program = '', ...args] = commandLine.trim().split(/\s+/)
  const { file, prefix } = resolveCommand(program)
  const result = spawnSync(file, [...prefix, ...args], {
    cwd,
    env: env === undefined ? process.env : { ...process.env, ...env },
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error !== undefined) {
    throw new CommandError(commandLine, cwd, null, `cannot run ${program}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new CommandError(commandLine, cwd, result.status, undefined, result.stderr ?? '')
  }
  return capture ? (result.stdout ?? '').trim() : ''
}

export function runCommand(commandLine: string, cwd: string, env?: NodeJS.ProcessEnv): void {
  execute(commandLine, cwd, env, false)
}

// Runs without printing anything; a failure carries the program's stderr for the caller to quote.
export function runQuiet(commandLine: string, cwd: string): void {
  execute(commandLine, cwd, undefined, true, true)
}

export function commandOutput(commandLine: string, cwd: string, env?: NodeJS.ProcessEnv): string {
  return execute(commandLine, cwd, env, true)
}
