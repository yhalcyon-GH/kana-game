import type { AnalyticsEventName, AnalyticsProperties, AnalyticsProvider } from './types'
import { getUmamiHostUrl, getUmamiWebsiteId } from './umamiConfig'

// Minimal shape of the global `window.umami` the Umami tracker script
// attaches — see https://docs.umami.is/docs/tracker-functions. Only the
// one call SHAPE this app actually uses is typed here (the single-object
// payload form — see the doc comment on toUmamiPayload below for why),
// not every overload Umami's real object supports.
type UmamiPayload = { website: string; name: string; data?: Record<string, unknown> }
type UmamiGlobal = {
  track: (payload: UmamiPayload) => void
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

// P1 fix (PR #210 final review): Umami's track(eventName, eventData) call
// form MERGES eventData into a larger default payload that also includes
// hostname, language, referrer, screen (EXACT pixel dimensions), title,
// and url (see docs.umami.is/docs/tracker-functions: "When tracking
// events, default properties are included in the payload"). That directly
// violates this project's data-minimization rule (no exact screen
// dimensions, no unnecessary referrer/title/url — see types.ts's
// AnalyticsProperties doc comment).
//
// Umami's docs also document a SEPARATE single-object call form —
// track(payload) — that sends ONLY the properties included in that object
// ("The above will only send the properties website, url and title" —
// same doc page, describing this exact mechanism for a pageview-shaped
// payload). Using that form with an event-shaped payload
// ({ website, name, data }) is the same documented mechanism, applied to
// this app's actual use case: only the website id, the approved event
// name, and this app's own low-cardinality AnalyticsProperties are ever
// sent — no hostname/language/referrer/screen/title/url field is included
// at all.
function toUmamiPayload(websiteId: string, event: AnalyticsEventName, properties?: AnalyticsProperties): UmamiPayload {
  const payload: UmamiPayload = { website: websiteId, name: event }
  if (properties) payload.data = { ...properties }
  return payload
}

export function createUmamiProvider(): AnalyticsProvider {
  injectUmamiScript()
  const websiteId = getUmamiWebsiteId()
  return {
    track(event: AnalyticsEventName, properties?: AnalyticsProperties) {
      // No configured website id (shouldn't happen — track.ts only
      // constructs this provider via isUmamiConfigured(), which requires
      // one) — drop rather than send a malformed payload.
      if (!websiteId) return
      // window.umami may not exist yet (script still loading, or blocked
      // by an ad-blocker/privacy extension) — silently drop the event
      // rather than queueing or retrying. Analytics is observational only;
      // a missed event before the script finishes loading is an acceptable
      // trade-off for never blocking or complicating the learning flow.
      window.umami?.track(toUmamiPayload(websiteId, event, properties))
    },
  }
}
