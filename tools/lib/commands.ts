import { spawnSync } from 'node:child_process'

export class CommandError extends Error {
  readonly commandLine: string
  readonly cwd: string
  readonly status: number | null

  constructor(commandLine: string, cwd: string, status: number | null, detail?: string) {
    const outcome = detail ?? `exited with status ${status}`
    super(`${commandLine} failed in ${cwd}: ${outcome}`)
    this.name = 'CommandError'
    this.commandLine = commandLine
    this.cwd = cwd
    this.status = status
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
): string {
  const [program = '', ...args] = commandLine.trim().split(/\s+/)
  const { file, prefix } = resolveCommand(program)
  const result = spawnSync(file, [...prefix, ...args], {
    cwd,
    env: env === undefined ? process.env : { ...process.env, ...env },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error !== undefined) {
    throw new CommandError(commandLine, cwd, null, `cannot run ${program}: ${result.error.message}`)
  }
  if (result.status !== 0) throw new CommandError(commandLine, cwd, result.status)
  return capture ? (result.stdout ?? '').trim() : ''
}

export function runCommand(commandLine: string, cwd: string, env?: NodeJS.ProcessEnv): void {
  execute(commandLine, cwd, env, false)
}

export function commandOutput(commandLine: string, cwd: string): string {
  return execute(commandLine, cwd, undefined, true)
}
