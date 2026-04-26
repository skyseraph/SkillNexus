import { ipcMain, shell } from 'electron'
import { registerSkillsHandlers } from './skills.handler'
import { registerTestCasesHandlers } from './testcases.handler'
import { registerEvalHandlers } from './eval.handler'
import { registerStudioHandlers } from './studio.handler'
import { registerConfigHandlers } from './config.handler'
import { registerMarketplaceHandlers } from './marketplace.handler'
import { registerEvoHandlers } from './evo.handler'
import { registerJobsHandlers } from './jobs.handler'
import { registerTelemetryHandlers } from './telemetry.handler'
import { isDemoMode, enterDemoMode, exitDemoMode } from '../demo'

export function registerAllIpcHandlers(): void {
  registerConfigHandlers()
  registerTelemetryHandlers()
  registerSkillsHandlers()
  registerTestCasesHandlers()
  registerEvalHandlers()
  registerStudioHandlers()
  registerMarketplaceHandlers()
  registerEvoHandlers()
  registerJobsHandlers()

  ipcMain.handle('demo:enter', () => { enterDemoMode() })
  ipcMain.handle('demo:exit', () => { exitDemoMode() })
  ipcMain.handle('demo:isActive', () => isDemoMode())

  // SEC-R4: only allow https?:// protocol
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('shell:openPath', (_event, filePath: string) => {
    shell.openPath(filePath)
  })
}
