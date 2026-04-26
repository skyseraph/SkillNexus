import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────
// electron and electron-store must be mocked before importing the module
// because telemetry.ts calls `new Store()` at module load time.

const mockStore: Record<string, unknown> = {}
vi.mock('electron-store', () => {
  return {
    default: vi.fn().mockImplementation(({ defaults }: { defaults: Record<string, unknown> }) => {
      Object.assign(mockStore, defaults)
      return {
        get: (key: string) => mockStore[key],
        set: (key: string, value: unknown) => { mockStore[key] = value }
      }
    })
  }
})

// isPackaged = false → dev mode (no real sends)
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.1.0'
  }
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Import after mocks ─────────────────────────────────────────────────────
const { track, getConsent, setConsent } = await import('./telemetry')

// ── Tests ──────────────────────────────────────────────────────────────────
describe('telemetry service', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    // reset to default consent state
    mockStore['analyticsEnabled'] = true
    mockStore['consentAsked'] = false
  })

  describe('track() in dev mode', () => {
    it('does NOT call fetch when app is not packaged', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      track('app_launched', { platform: 'darwin', version: '0.1.0' })
      expect(mockFetch).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('logs to console in dev mode', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      track('eval_ran', { test_case_count: 5 })
      expect(consoleSpy).toHaveBeenCalledWith('[telemetry:dev]', 'eval_ran', { test_case_count: 5 })
      consoleSpy.mockRestore()
    })

    it('logs with empty object when no properties', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      track('skill_uninstalled')
      expect(consoleSpy).toHaveBeenCalledWith('[telemetry:dev]', 'skill_uninstalled', {})
      consoleSpy.mockRestore()
    })
  })

  describe('getConsent()', () => {
    it('returns default state: enabled=true, asked=false', () => {
      const consent = getConsent()
      expect(consent.enabled).toBe(true)
      expect(consent.asked).toBe(false)
    })
  })

  describe('setConsent()', () => {
    it('sets analyticsEnabled and marks consentAsked=true', () => {
      setConsent(false)
      const consent = getConsent()
      expect(consent.enabled).toBe(false)
      expect(consent.asked).toBe(true)
    })

    it('can re-enable after disabling', () => {
      setConsent(false)
      setConsent(true)
      expect(getConsent().enabled).toBe(true)
    })
  })
})
