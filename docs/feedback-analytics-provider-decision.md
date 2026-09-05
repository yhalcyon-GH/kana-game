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
| Funnel / drop-off analysis | **Yes** — "Umami Funnel" (available since v2.3.0), steps can be specific events (not just URLs), shows per-step counts and drop-off rate ([docs.umami.is/docs/funnel](https://docs.umami.is/docs/funnel)); reported (via secondary sources, not independently confirmed against Umami's own pricing page directly) to be included on every tier including free Hobby, gated by volume/site limits rather than feature availability | **Yes, free tier, no time limit** — a core feature | Yes, but gated to the $19/mo Business tier |
| Custom events + properties | Yes — `umami.track(name, data)` | Yes — `posthog.capture(name, data)` | Yes — `plausible('Event', {props})`; custom properties gated to Business tier+ |
| SPA / client-routed support | Yes, auto + documented manual tracker functions | Yes, `capture_pageview` config + manual `posthog.capture('$pageview')` | Auto for pushState routers; a separate hash-router script variant is required for `HashRouter` |
| Data export | Yes, per Cloud FAQ ([docs.umami.is/docs/cloud/faq](https://docs.umami.is/docs/cloud/faq)) | Yes — CSV/PNG export, query API, scheduled bulk export | Tiered: Stats API (Business), full export (Enterprise) |
| Region choice | US + EU infrastructure, no explicit per-customer selector | Explicit US vs. EU Cloud choice at signup | EU hosting is part of brand identity (exact doc page not confirmed this session) |
| Implementation complexity | Single script tag, no SDK | Script tag or npm SDK; larger product surface overall | Single script tag; optional npm package for advanced use |

Sources as cited inline above; full source list and additional detail (script-size estimates, GitHub Pages-specific considerations, a noted discrepancy across sources on Umami's exact free-tier website-count limit) are preserved in the research transcript behind this decision.

### Decision: Umami (Cloud)

**Reasoning (project judgment, not purely from the comparison table):**

1. **Umami is cookie-free, and offers an officially documented manual-only
   configuration that Tamamizu explicitly enables**, to match this
   project's stated privacy principles (see
   `docs/analytics-foundation.md`'s "what this deliberately is NOT" list).
   Correction: an earlier version of this document stated Umami has "no
   automatic click/session tracking by default" — that was wrong. Per
   Umami's own docs (`docs.umami.is/docs/tracker-configuration`), the
   DEFAULT tracker behavior automatically tracks pageviews, clicks, and
   path-change detection; `data-auto-track="false"` is the documented
   attribute that turns all of that off, and Tamamizu's integration
   (`src/lib/analytics/umamiProvider.ts`) sets it explicitly — this
   privacy-minimal behavior is something this app configures, not
   something Umami ships with by default. It remains the cleanest way to
   guarantee "only the events this app explicitly calls `track()` for are
   ever sent," and it's a single named attribute rather than several
   separate flags — PostHog needs a comparable combination of
   `cookieless_mode` plus disabling session recording to reach a similar
   posture, so on this specific axis Umami and PostHog both require
   explicit configuration, contrary to what the previous wording implied.
2. Umami's free Hobby tier comfortably covers a hobby-scale beta's event
   volume.
3. Umami's **Funnel** feature (`docs.umami.is/docs/funnel`, available
   since v2.3.0) directly supports this app's actual goal — a funnel step
   can be a specific **event**, not just a URL, so this app's existing
   start/complete event pairs map onto it with no new instrumentation:
   - `lesson_started` → `lesson_completed`
   - `practice_started` → `practice_completed`
   - `assessment_started` → `assessment_completed`
   - `restaurant_started` → `restaurant_completed`
   - `cafe_started` → `cafe_completed`
   - `intro_completed` → `lesson_started` → ... → `graduated` (a longer,
     whole-journey funnel)

   Umami's funnel dashboard shows per-step user counts and the drop-off
   rate from the previous step — exactly "where do beginners get stuck,"
   this app's stated analytics goal — without needing to export raw events
   and compute this separately. (An earlier version of this document
   stated Umami had no such feature; that was incorrect and has been
   corrected here after re-checking Umami's current official docs.)

**Correction note (2026-09, PR #210 final review, round 2):** an earlier
version of this document claimed "Umami has no native funnel/drop-off UI"
as a disclosed trade-off favoring PostHog. That claim was wrong — Umami's
Funnel feature exists and directly supports event-based funnels as
described above. No provider change was made or is warranted from this
correction; if anything, it strengthens the case for Umami, since the one
previously-disclosed gap does not actually exist.

**Correction note (2026-09, PR #210 final review, round 3):** an earlier
version of this document's reasoning also stated Umami has "no automatic
click/session tracking by default," offered as a reason Umami was chosen
without extra configuration. That was wrong: Umami's default tracker
automatically does pageview tracking, click tracking, and path-change
detection, per `docs.umami.is/docs/tracker-configuration`. Tamamizu's
privacy-minimal behavior comes specifically from setting
`data-auto-track="false"` in `src/lib/analytics/umamiProvider.ts`, not
from any Umami default. The Umami selection is unchanged; the comparison
table row for this axis ("Named 'manual/custom-events-only' mode," above)
was already accurate and did not need correction — only the reasoning
section's summary sentence was wrong.

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
