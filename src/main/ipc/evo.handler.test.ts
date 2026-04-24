import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pure logic tests for evo.handler parameter validation rules
// (extracted as pure functions to avoid Electron/DB dependencies)

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function validateEvoSkillConfig(config: { skillId?: string; maxIterations?: number }) {
  if (!config.skillId) throw new Error('skillId is required')
  if (config.maxIterations !== undefined) {
    config.maxIterations = clamp(config.maxIterations, 1, 10)
  }
  return config
}

function validateCoEvoConfig(config: { skillId?: string; maxRounds?: number }) {
  if (!config.skillId) throw new Error('skillId is required')
  if (config.maxRounds !== undefined) {
    config.maxRounds = clamp(config.maxRounds, 1, 10)
  }
  return config
}

function validateSkillXConfig(config: { skillId?: string; minScore?: number; sampleLimit?: number }) {
  if (!config.skillId) throw new Error('skillId is required')
  if (config.minScore !== undefined) config.minScore = clamp(config.minScore, 0, 10)
  if (config.sampleLimit !== undefined) config.sampleLimit = clamp(config.sampleLimit, 1, 50)
  return config
}

function validateSkillClawConfig(config: { skillId?: string; windowSize?: number }) {
  if (!config.skillId) throw new Error('skillId is required')
  if (config.windowSize !== undefined) config.windowSize = clamp(config.windowSize, 5, 100)
  return config
}

function validateTransferModels(models: string[]) {
  if (!models || models.length === 0) throw new Error('models array must not be empty')
}

describe('evo.handler parameter validation', () => {
  describe('runEvoSkill', () => {
    it('throws when skillId is missing', () => {
      expect(() => validateEvoSkillConfig({})).toThrow('skillId is required')
    })

    it('clamps maxIterations to [1, 10]', () => {
      expect(validateEvoSkillConfig({ skillId: 's1', maxIterations: 0 }).maxIterations).toBe(1)
      expect(validateEvoSkillConfig({ skillId: 's1', maxIterations: 99 }).maxIterations).toBe(10)
      expect(validateEvoSkillConfig({ skillId: 's1', maxIterations: 5 }).maxIterations).toBe(5)
    })

    it('leaves maxIterations undefined when not provided', () => {
      const result = validateEvoSkillConfig({ skillId: 's1' })
      expect(result.maxIterations).toBeUndefined()
    })
  })

  describe('runCoEvo', () => {
    it('throws when skillId is missing', () => {
      expect(() => validateCoEvoConfig({})).toThrow('skillId is required')
    })

    it('clamps maxRounds to [1, 10]', () => {
      expect(validateCoEvoConfig({ skillId: 's1', maxRounds: -5 }).maxRounds).toBe(1)
      expect(validateCoEvoConfig({ skillId: 's1', maxRounds: 100 }).maxRounds).toBe(10)
      expect(validateCoEvoConfig({ skillId: 's1', maxRounds: 7 }).maxRounds).toBe(7)
    })
  })

  describe('runSkillX', () => {
    it('throws when skillId is missing', () => {
      expect(() => validateSkillXConfig({})).toThrow('skillId is required')
    })

    it('clamps minScore to [0, 10]', () => {
      expect(validateSkillXConfig({ skillId: 's1', minScore: -1 }).minScore).toBe(0)
      expect(validateSkillXConfig({ skillId: 's1', minScore: 15 }).minScore).toBe(10)
      expect(validateSkillXConfig({ skillId: 's1', minScore: 7 }).minScore).toBe(7)
    })

    it('clamps sampleLimit to [1, 50]', () => {
      expect(validateSkillXConfig({ skillId: 's1', sampleLimit: 0 }).sampleLimit).toBe(1)
      expect(validateSkillXConfig({ skillId: 's1', sampleLimit: 200 }).sampleLimit).toBe(50)
      expect(validateSkillXConfig({ skillId: 's1', sampleLimit: 20 }).sampleLimit).toBe(20)
    })
  })

  describe('runSkillClaw', () => {
    it('throws when skillId is missing', () => {
      expect(() => validateSkillClawConfig({})).toThrow('skillId is required')
    })

    it('clamps windowSize to [5, 100]', () => {
      expect(validateSkillClawConfig({ skillId: 's1', windowSize: 1 }).windowSize).toBe(5)
      expect(validateSkillClawConfig({ skillId: 's1', windowSize: 500 }).windowSize).toBe(100)
      expect(validateSkillClawConfig({ skillId: 's1', windowSize: 30 }).windowSize).toBe(30)
    })
  })

  describe('runTransferTest', () => {
    it('throws when models array is empty', () => {
      expect(() => validateTransferModels([])).toThrow('must not be empty')
    })

    it('throws when models is undefined-like', () => {
      expect(() => validateTransferModels(null as unknown as string[])).toThrow()
    })

    it('does not throw for valid models array', () => {
      expect(() => validateTransferModels(['anthropic', 'openrouter'])).not.toThrow()
    })
  })
})
