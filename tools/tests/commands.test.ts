import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { CommandError, commandOutput, runCommand } from '../lib/commands'
import { FIXTURE } from './helpers'

const base = path.join(FIXTURE, 'server', 'mini', 'base')

describe('runCommand', () => {
  test('runs a program with arguments in a directory', () => {
    expect(() => runCommand('bun ./ok.ts', base)).not.toThrow()
  })
  test('throws CommandError with the command and cwd on a non-zero exit', () => {
    try {
      runCommand('bun ./fail.ts', base)
      throw new Error('did not throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CommandError)
      expect((error as CommandError).status).toBe(3)
      expect((error as CommandError).message).toContain('bun ./fail.ts')
      expect((error as CommandError).message).toContain(base)
    }
  })
  test('throws CommandError naming the program when it cannot be started', () => {
    expect(() => runCommand('no-such-program-xyz --flag', base)).toThrow(/no-such-program-xyz/)
  })
})

describe('commandOutput', () => {
  test('captures trimmed stdout', () => {
    expect(commandOutput('bun --version', base)).toMatch(/^\d+\.\d+\.\d+/)
  })
})
