import { test, expect } from '../fixtures/app'

test.describe('smoke — app launch & navigation', () => {
  test('app launches and renders nav', async ({ page }) => {
    await expect(page.locator('.nav-list')).toBeVisible()
    for (const label of ['Home', 'Studio', 'Eval', 'Evo', 'Tasks', 'Trending']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
  })

  test('navigates to each page without crash', async ({ page }) => {
    const pages = ['Studio', 'Eval', 'Evo', 'Tasks', 'Trending', 'Home']
    for (const label of pages) {
      await page.getByText(label, { exact: true }).first().click()
      // Page should render something — no blank screen
      await expect(page.locator('main, [class*="page"], [class*="container"]').first()).toBeVisible()
    }
  })

  test('Settings nav item is visible', async ({ page }) => {
    await expect(page.getByText('Settings', { exact: true }).first()).toBeVisible()
  })

  test('navigates to Settings page', async ({ page }) => {
    await page.getByText('Settings', { exact: true }).first().click()
    await expect(page.locator('main, [class*="page"], [class*="container"]').first()).toBeVisible()
  })
})
