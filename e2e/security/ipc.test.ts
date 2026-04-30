import { test, expect } from '../fixtures/app'

// All tests call IPC directly via window.api — no LLM calls, no UI interaction needed.

test.describe('security — IPC invariants', () => {
  test('SEC-R3: config:get does not expose apiKey', async ({ page }) => {
    const config = await page.evaluate(() => window.api.config.get())
    const json = JSON.stringify(config)
    expect(json).not.toContain('"apiKey"')
    // Each provider must have apiKeySet boolean instead
    for (const p of (config as any).providers) {
      expect(typeof p.apiKeySet).toBe('boolean')
      expect(p).not.toHaveProperty('apiKey')
    }
  })

  test('SEC-R7: skills:readFile rejects path traversal', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        await window.api.skills.readFile('../../etc/passwd', 'nonexistent-skill-id')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })
    expect(result.ok).toBe(false)
  })

  test('SEC-R6: eval:start rejects >50 testCaseIds', async ({ page }) => {
    const ids = Array.from({ length: 51 }, (_, i) => `tc-${i}`)
    const result = await page.evaluate(async (ids) => {
      try {
        await window.api.eval.start('fake-skill-id', ids)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }, ids)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/50|limit|array/i)
  })

  test('SEC-R2: studio:install rejects empty content', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        await window.api.studio.install('', 'test-skill')
        return { ok: true }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/empty|content/i)
  })

  test('SEC-R2: studio:install sanitizes path traversal in name', async ({ page }) => {
    const result = await page.evaluate(async () => {
      try {
        const skill = await window.api.studio.install('# Test skill content', '../../../etc/evil')
        return { ok: true, name: (skill as any).name }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    })
    // Either succeeds with sanitized name, or fails — must not write outside skills dir
    if (result.ok) {
      expect(result.name).not.toContain('..')
      expect(result.name).not.toContain('/')
    }
    // If it threw, that's also acceptable
  })
})
