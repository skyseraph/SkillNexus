import { getAIProvider } from './ai-provider'
import { getActiveModel } from '../ipc/config.handler'
import { getDb } from '../db'
import { getMainWindow } from '../index'
import { join } from 'path'
import { app } from 'electron'
import { SkillClawEngine } from './sdk/skillclaw-engine'
import { ElectronDataStore } from './adapters/electron-data-store'
import { ElectronProgressReporter } from './adapters/electron-progress'
import { ElectronSkillStorage } from './adapters/electron-storage'
import type { SkillClawResult } from '../../shared/types'

export async function runSkillClaw(config: { skillId: string; windowSize?: number; minFailCount?: number }): Promise<SkillClawResult> {
  const db = getDb()
  const engine = new SkillClawEngine(
    getAIProvider(), getActiveModel(),
    new ElectronDataStore(db),
    new ElectronProgressReporter(getMainWindow()),
    new ElectronSkillStorage(db, join(app.getPath('userData'), 'skills', 'evolved'))
  )
  return engine.run(config)
}
