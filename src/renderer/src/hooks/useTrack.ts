/**
 * useTrack — renderer-side telemetry hook.
 *
 * Usage:
 *   const track = useTrack()
 *   track('eval_ran', { test_case_count: 3, success: true })
 *
 * All calls are fire-and-forget. Import ONLY from this file in renderer code.
 */

import { useCallback } from 'react'
import type { TelemetryEventName, TelemetryEventProperties } from '../../../shared/telemetry-events'

export function useTrack() {
  return useCallback((name: TelemetryEventName, properties?: TelemetryEventProperties) => {
    window.api.telemetry.track(name, properties).catch(() => {
      // Silently swallow — telemetry never surfaces errors to the user
    })
  }, [])
}
