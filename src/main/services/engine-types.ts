import type { EvolutionEngine } from '../../shared/types'

export interface EngineConfig {
  maxIterations?: number
  maxRounds?: number
  models?: string[]
  frontier?: number
}

export interface EngineResult {
  evolvedContent: string
  engine: EvolutionEngine
  generation: number
}
