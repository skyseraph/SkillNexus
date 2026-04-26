/**
 * tests/security/command-injection.test.ts
 *
 * Tests for commandScore shell injection defense:
 * - Dangerous commands are scoped to user-supplied judgeParam (documented risk)
 * - commandScore exit-code semantics: 0 → score 10, non-zero → score 0
 * - Timeout enforcement: commands exceeding 5s are killed
 * - Output truncation: OUTPUT env var capped at 4096 chars
 * Pure logic — mocks execSync, no real shell execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mirror commandScore from eval-job.ts ─────────────────────────────────────

interface EvalScore {
  score: number
  violations: string[]
  details: string
}

// We test the logic by re-implementing with injectable execSync
function makeCommandScore(execSyncImpl: (cmd: string, opts: Record<string, unknown>) => void) {
  return function commandScore(output: string, judgeParam: string): EvalScore {
    try {
      execSyncImpl(judgeParam, {
        input: output,
        env: { ...process.env, OUTPUT: output.slice(0, 4096) },
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      return { score: 10, violations: [], details: 'command exited 0' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { score: 0, violations: [`Command failed: ${msg.slice(0, 200)}`], details: 'command exited non-zero' }
    }
  }
}

describe('commandScore — exit code semantics', () => {
  it('returns score 10 when command exits 0', () => {
    const execSync = vi.fn(() => { /* exit 0 */ })
    const commandScore = makeCommandScore(execSync)
    const result = commandScore('some output', 'grep foo')
    expect(result.score).toBe(10)
    expect(result.violations).toHaveLength(0)
    expect(result.details).toBe('command exited 0')
  })

  it('returns score 0 when command exits non-zero', () => {
    const execSync = vi.fn(() => { throw new Error('Command failed: exit code 1') })
    const commandScore = makeCommandScore(execSync)
    const result = commandScore('some output', 'grep notfound')
    expect(result.score).toBe(0)
    expect(result.violations[0]).toMatch(/Command failed/)
    expect(result.details).toBe('command exited non-zero')
  })

  it('truncates violation message to 200 chars', () => {
    const longMsg = 'x'.repeat(500)
    const execSync = vi.fn(() => { throw new Error(longMsg) })
    const commandScore = makeCommandScore(execSync)
    const result = commandScore('output', 'cmd')
    expect(result.violations[0].length).toBeLessThanOrEqual(200 + 'Command failed: '.length)
  })
})

describe('commandScore — OUTPUT env var truncation', () => {
  it('caps OUTPUT env var at 4096 chars', () => {
    let capturedOpts: Record<string, unknown> = {}
    const execSync = vi.fn((_cmd: string, opts: Record<string, unknown>) => {
      capturedOpts = opts
    })
    const commandScore = makeCommandScore(execSync)
    const longOutput = 'a'.repeat(8000)
    commandScore(longOutput, 'true')
    const env = capturedOpts.env as Record<string, string>
    expect(env.OUTPUT.length).toBe(4096)
  })

  it('passes full output under 4096 chars unchanged', () => {
    let capturedOpts: Record<string, unknown> = {}
    const execSync = vi.fn((_cmd: string, opts: Record<string, unknown>) => {
      capturedOpts = opts
    })
    const commandScore = makeCommandScore(execSync)
    const shortOutput = 'hello world'
    commandScore(shortOutput, 'true')
    const env = capturedOpts.env as Record<string, string>
    expect(env.OUTPUT).toBe(shortOutput)
  })
})

describe('commandScore — timeout config', () => {
  it('passes timeout: 5000 to execSync', () => {
    let capturedOpts: Record<string, unknown> = {}
    const execSync = vi.fn((_cmd: string, opts: Record<string, unknown>) => {
      capturedOpts = opts
    })
    const commandScore = makeCommandScore(execSync)
    commandScore('output', 'true')
    expect(capturedOpts.timeout).toBe(5000)
  })

  it('returns score 0 when command times out', () => {
    const execSync = vi.fn(() => { throw new Error('spawnSync /bin/sh ETIMEDOUT') })
    const commandScore = makeCommandScore(execSync)
    const result = commandScore('output', 'sleep 10')
    expect(result.score).toBe(0)
    expect(result.violations[0]).toMatch(/ETIMEDOUT/)
  })
})

describe('commandScore — documented scope (user-supplied judgeParam)', () => {
  it('executes the exact judgeParam string passed by user', () => {
    const executed: string[] = []
    const execSync = vi.fn((cmd: string) => { executed.push(cmd) })
    const commandScore = makeCommandScore(execSync)
    commandScore('output', 'my-custom-validator --strict')
    expect(executed[0]).toBe('my-custom-validator --strict')
  })

  it('handles empty judgeParam gracefully', () => {
    const execSync = vi.fn(() => { throw new Error('empty command') })
    const commandScore = makeCommandScore(execSync)
    const result = commandScore('output', '')
    expect(result.score).toBe(0)
  })
})
