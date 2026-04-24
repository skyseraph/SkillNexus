import { ipcMain, shell } from 'electron'
import { registerSkillsHandlers } from './skills.handler'
import { registerTestCasesHandlers } from './testcases.handler'
import { registerEvalHandlers } from './eval.handler'
import { registerStudioHandlers } from './studio.handler'
import { registerConfigHandlers } from './config.handler'
import { registerMarketplaceHandlers } from './marketplace.handler'
import { registerEvoHandlers } from './evo.handler'
import { registerJobsHandlers } from './jobs.handler'

export function registerAllIpcHandlers(): void {
  registerConfigHandlers()
  registerSkillsHandlers()
  registerTestCasesHandlers()
  registerEvalHandlers()
  registerStudioHandlers()
  registerMarketplaceHandlers()
  registerEvoHandlers()
  registerJobsHandlers()

  // SEC-R4: only allow https?:// protocol
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
}
