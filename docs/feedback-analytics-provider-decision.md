# Feedback & analytics provider decision

**Decision date: 2026-09-05.** Pricing, free-tier terms, and feature gating
for hosted SaaS products change without notice — re-verify against each
provider's own current pricing/docs pages before relying on anything below
if this document is read much later than the decision date.

This document separates **what official documentation says** (cited,
factual) from **project-specific judgment** (this app's priorities,
explicitly marked). Neither Tally nor Umami has been activated as of this
decision — both integrations are code-complete and gated behind unset
`VITE_*` config; see `docs/feedback-setup.md` and
`docs/analytics-foundation.md` for what activating each requires.

## Feedback: Tally vs. Formspree

### Comparison

| Axis | Tally | Formspree |
|---|---|---|
| Free tier at hobby scale | Free plan: unlimited forms/submissions (fair-use limited, no published numeric cap) | Free plan: hard cap of 50 submissions/month, account-wide |
| Respondent login required | No | No |
| Forced name/email from respondent | No — creator controls fields | No — creator controls fields |
| Hidden fields via URL query params | **Yes — named, documented "Hidden Fields" feature.** Add a `/hidden` field, link with `?fieldname=value`. ([tally.so/help/hidden-fields](https://tally.so/help/hidden-fields)) | Possible via plain HTML hidden `<input>`, but populating it from the URL requires custom JS — not a named Formspree feature |
| GDPR / data location | EU company (Belgium); data stored in Europe; DPA auto-accepted on signup ([tally.so/help/gdpr](https://tally.so/help/gdpr)) | US-hosted (AWS), GDPR compliance via Standard Contractual Clauses, not EU storage ([formspree.io/security](https://formspree.io/security/)) |
| Commercial use on free tier | Not restricted (project judgment, after reading Tally's ToS — the anti-reselling clause there targets reselling Tally's own platform, not using Tally forms inside a commercial product) | Not restricted; explicitly marketed for commercial use |
| Branding on free tier | Forced Tally branding on the form itself | Branding on outbound notification emails |
| Implementation complexity | External link or iframe embed — no SDK/npm package | Plain HTML `<form>` works with zero JS; optional npm package for AJAX |
| Data export | CSV export included on free tier | CSV export requires a paid plan |
| GitHub Pages fit | No CORS/referrer concerns for a plain external link | AJAX submission has documented Referrer-Policy/Brave-browser edge cases (not an issue for a plain-link, non-AJAX integration) |

Sources: [tally.so/pricing](https://tally.so/pricing), [tally.so/help/hidden-fields](https://tally.so/help/hidden-fields), [tally.so/help/gdpr](https://tally.so/help/gdpr), [tally.so/help/terms-conditions](https://tally.so/help/terms-conditions), [formspree.io/security](https://formspree.io/security/), [help.formspree.io/articles/account-management/account-limits](https://help.formspree.io/articles/account-management/account-limits).

### Decision: Tally

**Reasoning:**
1. Tally's Hidden Fields is a first-class, zero-code feature for exactly
   this app's need (carrying route/build/screen as invisible context) —
   Formspree requires writing custom JS to achieve the same thing.
2. Tally's free tier has no documented numeric submission cap; Formspree's
   free tier hard-caps at 50/month account-wide.
3. Tally's EU data storage is a simpler story for a Privacy Policy than
   Formspree's US-storage-plus-SCCs approach.
4. The one real cost — forced branding on Tally's free-tier forms — is
   matched by Formspree's own free-tier branding (on notification emails),
   so it isn't a clean differentiator either way.

No deal-breaking issue was found with Tally for this use case. This
confirms the task's initial hypothesis; no provider change was made.

## Analytics: Umami Cloud vs. PostHog vs. Plausible

### Comparison

| Axis | Umami Cloud | PostHog | Plausible |
|---|---|---|---|
| Free tier | Hobby: $0/mo, 100K events/mo, 1 website, 6mo retention ([umami.is/pricing](https://umami.is/pricing)) | Free: $0/mo, 1M events/mo + 5K session replays/mo, 1yr retention, no time limit ([posthog.com/pricing](https://posthog.com/pricing)) | **No standing free tier** — 30-day trial only, then $9/mo minimum ([plausible.io/docs/trial](https://plausible.io/docs/trial)) |
| Cookie-free by default | **Yes** — "no cookies, no personal data collection" is the default behavior ([docs.umami.is/docs/about](https://docs.umami.is/docs/about)) | **No** — cookie-based by default; a documented `cookieless_mode` config exists but is opt-in ([posthog.com/docs/privacy/data-collection](https://posthog.com/docs/privacy/data-collection)) | Yes — cookie-free is a core design principle |
| Named "manual/custom-events-only" mode | **Yes — `data-auto-track="false"`**, a documented script-tag attribute that disables ALL automatic tracking (pageviews, clicks, path detection) ([docs.umami.is/docs/tracker-configuration](https://docs.umami.is/docs/tracker-configuration)) | Achievable via combining `autocapture: false` + `disable_session_recording: true` — multiple flags, no single named mode | N/A — the default script has no autocapture/replay to disable in the first place |
| Session replay / heatmaps | Offered (recently added, v3.1/v3.2), **off by default**, requires a separate `recorder.js` script to activate ([docs.umami.is/docs/replays](https://docs.umami.is/docs/replays)) | Offered, **recording auto-starts by default** unless explicitly disabled | Not offered at all |
| Funnel / drop-off analysis | **Not found in official docs** — likely absent | **Yes, free tier, no time limit** — a core feature | Yes, but gated to the $19/mo Business tier |
| Custom events + properties | Yes — `umami.track(name, data)` | Yes — `posthog.capture(name, data)` | Yes — `plausible('Event', {props})`; custom properties gated to Business tier+ |
| SPA / client-routed support | Yes, auto + documented manual tracker functions | Yes, `capture_pageview` config + manual `posthog.capture('$pageview')` | Auto for pushState routers; a separate hash-router script variant is required for `HashRouter` |
| Data export | Yes, per Cloud FAQ ([docs.umami.is/docs/cloud/faq](https://docs.umami.is/docs/cloud/faq)) | Yes — CSV/PNG export, query API, scheduled bulk export | Tiered: Stats API (Business), full export (Enterprise) |
| Region choice | US + EU infrastructure, no explicit per-customer selector | Explicit US vs. EU Cloud choice at signup | EU hosting is part of brand identity (exact doc page not confirmed this session) |
| Implementation complexity | Single script tag, no SDK | Script tag or npm SDK; larger product surface overall | Single script tag; optional npm package for advanced use |

Sources as cited inline above; full source list and additional detail (script-size estimates, GitHub Pages-specific considerations, a noted discrepancy across sources on Umami's exact free-tier website-count limit) are preserved in the research transcript behind this decision.

### Decision: Umami (Cloud)

**Reasoning (project judgment, not purely from the comparison table):**

1. **Privacy defaults match this project's stated principles** (see
   `docs/analytics-foundation.md`'s "what this deliberately is NOT" list)
   without requiring extra configuration — Umami is cookie-free and has no
   automatic click/session tracking by default, whereas PostHog requires
   deliberately opting into `cookieless_mode` and disabling session
   recording to reach a comparable posture.
2. Umami's `data-auto-track="false"` is the cleanest, most explicitly
   documented way to guarantee "only the events this app explicitly calls
   `track()` for are ever sent" — this app's actual implementation
   (`src/lib/analytics/umamiProvider.ts`) uses exactly this attribute.
3. Umami's free Hobby tier comfortably covers a hobby-scale beta's event
   volume.
4. This app's existing event taxonomy (start/complete pairs per activity —
   see `src/lib/analytics/types.ts`) already captures the funnel/drop-off
   signal this app wants (where does a learner stop between
   `lesson_started` and `lesson_completed`, etc.) as raw exported events,
   even without Umami providing a built-in funnel-visualization UI.

**Known trade-off, disclosed rather than hidden:** Umami's own
documentation does not appear to offer a native funnel/retention/drop-off
analysis feature in its dashboard — PostHog does, for free, and Plausible
does at its $19/mo Business tier. If dashboard-native funnel visualization
(rather than computing drop-off from Umami's raw exported event data)
becomes a hard requirement later, PostHog is the strongest alternative,
at the cost of needing deliberate configuration (`cookieless_mode`,
`disable_session_recording: true`, EU hosting via `eu.posthog.com`, never
calling `identify()`) to reach a privacy posture Umami provides by default.
This is a real gap, not a marketing claim to be taken at face value — it
is recorded here so a future reviewer can weigh it explicitly rather than
discovering it after activation.

No provider change was made from the task's initial hypothesis; this
document exists to make the trade-off above visible, per the review
requirement to disclose (not silently absorb) any significant drawback
found during research.

## What activation still requires (see docs/feedback-setup.md and docs/analytics-foundation.md)

- **Tally:** a human needs to create a Tally account, build the form per
  the spec in `docs/feedback-setup.md`, and set `VITE_FEEDBACK_URL`.
  Claude Code did not and will not create this account, log in anywhere,
  or invent a form URL.
- **Umami:** a human needs to create an Umami Cloud account, create a
  website there, and set `VITE_ANALYTICS_PROVIDER=umami` +
  `VITE_UMAMI_WEBSITE_ID`. Claude Code did not and will not create this
  account or invent a website id.

Both integrations are fully implemented, tested, and documented in this
branch; only the account-creation and config steps above remain, and they
require a human with a real email address and (for Tally, potentially)
payment method if a paid tier is ever chosen.
