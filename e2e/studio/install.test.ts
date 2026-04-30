import { test, expect } from '../fixtures/app'

test.describe('studio — install validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByText('Studio', { exact: true }).first().click()
    await page.waitForTimeout(500)
  })

  test('TC-S-003: install button is disabled when name is empty', async ({ page }) => {
    // The install bar button is disabled when name is blank
    const installBtn = page.locator('.studio-v2-btn.primary').filter({ hasText: '安装 Skill' })
    // Clear name field if present
    const nameInput = page.locator('.studio-v2-install-bar input[type="text"]').first()
    if (await nameInput.isVisible()) {
      await nameInput.fill('')
      await expect(installBtn).toBeDisabled()
    }
  })

  test('TC-S-004: studio:install IPC sanitizes dangerous name', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const skill = await window.api.studio.install('# Skill content for test', '../evil skill!@#')
        return { ok: true, name: (skill as any).name }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })
    if (result.ok) {
      expect(result.name).not.toContain('..')
      expect(result.name).not.toContain('/')
      expect(result.name).not.toContain('!')
    }
  })

  test('TC-S-003: studio:install IPC rejects whitespace-only content', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        await window.api.studio.install('   \n\t  ', 'test-skill')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })
    expect(result.ok).toBe(false)
  })
})
