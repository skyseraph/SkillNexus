import { registerSkillsHandlers } from './skills.handler'
import { registerTestCasesHandlers } from './testcases.handler'
import { registerEvalHandlers } from './eval.handler'
import { registerStudioHandlers } from './studio.handler'
import { registerConfigHandlers } from './config.handler'
import { registerMarketplaceHandlers } from './marketplace.handler'
import { registerEvoHandlers } from './evo.handler'

export function registerAllIpcHandlers(): void {
  registerConfigHandlers()
  registerSkillsHandlers()
  registerTestCasesHandlers()
  registerEvalHandlers()
  registerStudioHandlers()
  registerMarketplaceHandlers()
  registerEvoHandlers()
}
