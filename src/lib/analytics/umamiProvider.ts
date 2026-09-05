import type { AnalyticsEventName, AnalyticsProperties, AnalyticsProvider } from './types'
import { getUmamiHostUrl, getUmamiWebsiteId } from './umamiConfig'

// Minimal shape of the global `window.umami` the Umami tracker script
// attaches — see https://umami.is/docs/tracker-configuration and
// https://umami.is/docs/track-events. Only the one method this app
// actually calls is typed; the real object has more.
type UmamiGlobal = {
  track: (eventName: string, eventData?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    umami?: UmamiGlobal
  }
}

const DEFAULT_UMAMI_SCRIPT_HOST = 'https://cloud.umami.is'
const SCRIPT_MARKER_ATTR = 'data-kana-game-umami-tracker'

// Injects Umami's tracker script tag exactly once per page load (checked
// via a marker attribute on the injected tag itself, rather than a
// module-level flag, so this stays correct across HMR/test-module
// re-evaluation), configured for MANUAL tracking only — data-auto-track=
// "false" is Umami's own documented mechanism (see
// docs.umami.is/docs/tracker-configuration) for disabling ALL automatic
// behavior (pageviews, click tracking, path detection), so the ONLY data
// ever sent is what this app explicitly calls track() for. This
// deliberately does not opt into Umami's separate session-replay/heatmap
// script (recorder.js) at all — see docs/analytics-foundation.md and the
// provider decision doc for why.
function injectUmamiScript(): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector(`script[${SCRIPT_MARKER_ATTR}]`)) return
  const websiteId = getUmamiWebsiteId()
  if (!websiteId) return
  const host = getUmamiHostUrl() || DEFAULT_UMAMI_SCRIPT_HOST
  const script = document.createElement('script')
  script.defer = true
  script.src = `${host.replace(/\/$/, '')}/script.js`
  script.setAttribute('data-website-id', websiteId)
  script.setAttribute('data-auto-track', 'false')
  script.setAttribute(SCRIPT_MARKER_ATTR, '')
  document.head.appendChild(script)
}

// Umami's track() signature accepts a string event name and an optional
// flat properties object — this app's own low-cardinality
// AnalyticsProperties shape (see types.ts) maps directly onto that with no
// transformation needed.
function toUmamiEventData(properties?: AnalyticsProperties): Record<string, unknown> | undefined {
  if (!properties) return undefined
  return { ...properties }
}

export function createUmamiProvider(): AnalyticsProvider {
  injectUmamiScript()
  return {
    track(event: AnalyticsEventName, properties?: AnalyticsProperties) {
      // window.umami may not exist yet (script still loading, or blocked
      // by an ad-blocker/privacy extension) — silently drop the event
      // rather than queueing or retrying. Analytics is observational only;
      // a missed event before the script finishes loading is an acceptable
      // trade-off for never blocking or complicating the learning flow.
      window.umami?.track(event, toUmamiEventData(properties))
    },
  }
}
