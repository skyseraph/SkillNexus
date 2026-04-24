import { getAIProvider } from './ai-provider'
import { getActiveModel } from '../ipc/config.handler'
import { getDb } from '../db'
import { getMainWindow } from '../index'
import { join } from 'path'
import { app } from 'electron'
import { SkillXEngine } from './sdk/skillx-engine'
import { ElectronDataStore } from './adapters/electron-data-store'
import { ElectronProgressReporter } from './adapters/electron-progress'
import { ElectronSkillStorage } from './adapters/electron-storage'
import type { SkillXResult } from '../../shared/types'

export async function runSkillX(config: { skillId: string; minScore?: number; sampleLimit?: number }): Promise<SkillXResult> {
  const db = getDb()
  const engine = new SkillXEngine(
    getAIProvider(), getActiveModel(),
    new ElectronDataStore(db),
    new ElectronProgressReporter(getMainWindow()),
    new ElectronSkillStorage(db, join(app.getPath('userData'), 'skills', 'evolved'))
  )
  return engine.run(config)
}
