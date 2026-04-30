// Type shim for window.api in Playwright e2e tests
import type { ElectronAPI } from '../../src/preload/index'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
