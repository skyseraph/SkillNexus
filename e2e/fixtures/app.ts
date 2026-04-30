import { test as base, expect } from '@playwright/test'
import { ElectronApplication, Page, _electron as electron } from 'playwright'
import path from 'path'

interface AppFixtures {
  app: ElectronApplication
  page: Page
}

export const test = base.extend<AppFixtures>({
  app: [async ({}, use) => {
    const mainPath = path.join(__dirname, '../../out/main/index.js')
    const app = await electron.launch({
      args: [mainPath],
      env: { ...process.env, NODE_ENV: 'test' }
    })
    await use(app)
    await app.close()
  }, { scope: 'test' }],

  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.nav-list', { timeout: 15_000 })
    await use(page)
  }
})

export { expect }
