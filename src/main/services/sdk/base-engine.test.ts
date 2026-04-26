/**
 * src/main/services/sdk/base-engine.test.ts
 *
 * Direct tests for BaseEvolutionEngine.callAI():
 * - injects model into AIRequestOptions
 * - delegates to ai.call()
 * - returns content string from AIResponse
 * - propagates timeout errors
 * - withTimeout is called with AI_TIMEOUT_MS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseEvolutionEngine } from './base-engine'
import type { IDataStore, IProgressReporter, ISkillStorage } from './interfaces'
import type { AIProvider, AIRequestOptions } from '../ai-provider/types'

vi.mock('../eval-job', () => ({
  AI_TIMEOUT_MS: 30000,
  withTimeout: vi.fn().mockImplementation((p: Promise<unknown>) => p),
}))

beforeEach(() => { vi.clearAllMocks() })

// Minimal concrete subclass that exposes callAI for testing
class TestEngine extends BaseEvolutionEngine<{ prompt: string }, string> {
  async run(config: { prompt: string }): Promise<string> {
    return this.callAI({ systemPrompt: 'sys', userMessage: config.prompt })
  }
}

function makeAI(content = 'ai-response'): AIProvider {
  return {
    name: 'test',
    isAvailable: () => true,
    call: vi.fn().mockResolvedValue({ content, inputTokens: 10, outputTokens: 20, durationMs: 100 }),
    stream: vi.fn(),
  }
}

function makeStore(): IDataStore {
  return {
    queryEvalHistory: vi.fn().mockReturnValue([]),
    querySkill: vi.fn().mockReturnValue(undefined),
    queryTestCases: vi.fn().mockReturnValue([]),
    querySkillChain: vi.fn().mockReturnValue([]),
  }
}

function makeReporter(): IProgressReporter {
  return { report: vi.fn() }
}

function makeStorage(): ISkillStorage {
  return {
    saveEvolvedSkill: vi.fn().mockReturnValue('new-skill-id'),
    copyTestCases: vi.fn(),
  }
}

describe('BaseEvolutionEngine.callAI', () => {
  it('returns content from AIResponse', async () => {
    const engine = new TestEngine(makeAI('hello world'), 'claude-3', makeStore(), makeReporter(), makeStorage())
    const result = await engine.run({ prompt: 'test prompt' })
    expect(result).toBe('hello world')
  })

  it('injects the configured model into AIRequestOptions', async () => {
    const ai = makeAI()
    const engine = new TestEngine(ai, 'my-model-id', makeStore(), makeReporter(), makeStorage())
    await engine.run({ prompt: 'x' })
    const callArg = (ai.call as ReturnType<typeof vi.fn>).mock.calls[0][0] as AIRequestOptions
    expect(callArg.model).toBe('my-model-id')
  })

  it('passes systemPrompt and userMessage through to ai.call', async () => {
    const ai = makeAI()
    const engine = new TestEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    await engine.run({ prompt: 'user input' })
    const callArg = (ai.call as ReturnType<typeof vi.fn>).mock.calls[0][0] as AIRequestOptions
    expect(callArg.systemPrompt).toBe('sys')
    expect(callArg.userMessage).toBe('user input')
  })

  it('wraps the ai.call promise with withTimeout', async () => {
    const { withTimeout } = await import('../eval-job')
    const engine = new TestEngine(makeAI(), 'model', makeStore(), makeReporter(), makeStorage())
    await engine.run({ prompt: 'x' })
    expect(withTimeout).toHaveBeenCalledOnce()
  })

  it('passes AI_TIMEOUT_MS as the timeout value', async () => {
    const { withTimeout, AI_TIMEOUT_MS } = await import('../eval-job')
    const engine = new TestEngine(makeAI(), 'model', makeStore(), makeReporter(), makeStorage())
    await engine.run({ prompt: 'x' })
    const [, timeoutMs] = (withTimeout as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, number]
    expect(timeoutMs).toBe(AI_TIMEOUT_MS)
  })

  it('propagates errors from ai.call', async () => {
    const ai = makeAI()
    ;(ai.call as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'))
    const engine = new TestEngine(ai, 'model', makeStore(), makeReporter(), makeStorage())
    await expect(engine.run({ prompt: 'x' })).rejects.toThrow('API down')
  })

  it('propagates timeout errors', async () => {
    const { withTimeout } = await import('../eval-job')
    ;(withTimeout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('TestEngine timed out after 30000ms'))
    const engine = new TestEngine(makeAI(), 'model', makeStore(), makeReporter(), makeStorage())
    await expect(engine.run({ prompt: 'x' })).rejects.toThrow('timed out')
  })

  it('passes constructor name as context to withTimeout', async () => {
    const { withTimeout } = await import('../eval-job')
    const engine = new TestEngine(makeAI(), 'model', makeStore(), makeReporter(), makeStorage())
    await engine.run({ prompt: 'x' })
    const [, , context] = (withTimeout as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, number, string]
    expect(context).toBe('TestEngine')
  })
})
