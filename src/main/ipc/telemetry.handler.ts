import { ipcMain } from 'electron'
import { track, getConsent, setConsent } from '../services/telemetry'
import type { TelemetryEventName, TelemetryEventProperties } from '../../shared/telemetry-events'

export function registerTelemetryHandlers(): void {
  // Renderer tracks an event via main process (keeps PostHog key out of renderer)
  ipcMain.handle('telemetry:track', (
    _event,
    name: TelemetryEventName,
    properties?: TelemetryEventProperties
  ): void => {
    track(name, properties)
  })

  ipcMain.handle('telemetry:getConsent', (): { enabled: boolean; asked: boolean } => {
    return getConsent()
  })

  ipcMain.handle('telemetry:setConsent', (_event, enabled: boolean): void => {
    setConsent(enabled)
  })
}
