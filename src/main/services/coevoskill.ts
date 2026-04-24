import { getAIProvider } from './ai-provider'
import { getActiveModel } from '../ipc/config.handler'
import { getDb } from '../db'
import { CoEvoSkillEngine } from './sdk/coevoskill-engine'
import { ElectronDataStore } from './adapters/electron-data-store'
import { ElectronProgressReporter } from './adapters/electron-progress'
import { ElectronSkillStorage } from './adapters/electron-storage'
import type { CoEvoResult } from '../../shared/types'

export async function runCoEvo(config: { skillId: string; maxRounds?: number }): Promise<CoEvoResult> {
  const db = getDb()
  const engine = new CoEvoSkillEngine(
    getAIProvider(), getActiveModel(),
    new ElectronDataStore(db),
    new ElectronProgressReporter(null),
    new ElectronSkillStorage(db, '')
  )
  return engine.run(config)
}
