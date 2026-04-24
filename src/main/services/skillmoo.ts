import { getDb } from '../db'
import { SkillMOOEngine } from './sdk/skillmoo-engine'
import { ElectronDataStore } from './adapters/electron-data-store'
import type { ParetoPoint } from '../../shared/types'

export function computeParetoFrontier(skillId: string): ParetoPoint[] {
  const engine = new SkillMOOEngine(new ElectronDataStore(getDb()))
  return engine.computeParetoFrontier(skillId)
}
