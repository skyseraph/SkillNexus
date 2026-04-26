/**
 * Telemetry service — PostHog HTTP API, no external SDK required.
 *
 * Design principles:
 *  - All sends are fire-and-forget; never throws or blocks business logic
 *  - Consent (opt-in) is checked before every send; defaults to true for beta
 *  - Distinct ID is a random UUID stored in electron-store, never linked to PII
 *  - In dev mode, events are logged to console but NOT sent
 */

import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import Store from 'electron-store'
import type { TelemetryEvent, TelemetryEventName, TelemetryEventProperties } from '../../shared/telemetry-events'

// PostHog project API key — this is the write-only ingest key, safe to embed in client code.
// Self-hosted alternative: change POSTHOG_HOST to your own PostHog instance.
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY ?? 'phc_zRP2VUe8E6fgh62pPzNMBAqfLHyKboY4G5ZdgVkSUs57'
const POSTHOG_HOST = 'https://app.posthog.com'

interface TelemetryStore {
  distinctId: string
  analyticsEnabled: boolean
  consentAsked: boolean        // whether the opt-in dialog has been shown
}

const store = new Store<TelemetryStore>({
  name: 'telemetry',
  defaults: {
    distinctId: randomUUID(),
    analyticsEnabled: true,    // default opt-in for beta; flip to false for GA
    consentAsked: false
  }
})

// Hash distinctId so PostHog never sees the raw UUID — adds an extra layer of separation
function getHashedId(): string {
  return createHash('sha256').update(store.get('distinctId')).digest('hex').slice(0, 32)
}

function isEnabled(): boolean {
  return store.get('analyticsEnabled') && !isDev()
}

function isDev(): boolean {
  return !app.isPackaged
}

/** Fire-and-forget HTTP send to PostHog */
async function sendToPostHog(event: TelemetryEvent): Promise<void> {
  const body = JSON.stringify({
    api_key: POSTHOG_API_KEY,
    event: event.name,
    distinct_id: getHashedId(),
    timestamp: new Date().toISOString(),
    properties: {
      $lib: 'skillnexus',
      app_version: app.getVersion(),
      platform: process.platform,
      ...event.properties
    }
  })

  // Use Node built-in fetch (available in Electron / Node 18+)
  await fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(5000)
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Track an event. Always fire-and-forget — never awaited in business code.
 * In dev, prints to console instead of sending.
 */
export function track(name: TelemetryEventName, properties?: TelemetryEventProperties): void {
  if (isDev()) {
    console.log('[telemetry:dev]', name, properties ?? {})
    return
  }
  if (!isEnabled()) return

  sendToPostHog({ name, properties }).catch(() => {
    // Silently swallow all network/API errors — telemetry must never surface to the user
  })
}

export function getConsent(): { enabled: boolean; asked: boolean } {
  return {
    enabled: store.get('analyticsEnabled'),
    asked: store.get('consentAsked')
  }
}

export function setConsent(enabled: boolean): void {
  store.set('analyticsEnabled', enabled)
  store.set('consentAsked', true)
}

export function markConsentAsked(): void {
  store.set('consentAsked', true)
}
