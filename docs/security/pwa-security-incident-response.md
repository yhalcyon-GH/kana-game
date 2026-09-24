# PWA security incident response

Documentation only — no remote kill switch. This is the runbook to follow if
a malicious or compromised Tamamizu PWA release is suspected in Production
(e.g. a compromised dependency, a bad third-party script, or a
supply-chain-compromised build reaching users). See
`docs/security/security-audit-v1.md` and `docs/security/threat-model-v1.md`
for the general security posture this responds to, and
`docs/pwa-update-flow.md` for how normal (non-incident) PWA updates work.

One narrow piece of this posture is automated: every built GitHub Pages
artifact is checked by `scripts/checkProductionArtifactSafety.mjs`
(`npm run check:artifact-safety`, run as part of `npm run verify` and in
`.github/workflows/deploy.yml` immediately after `npm run build` and before
`upload-pages-artifact`) for forbidden native installer/executable file
extensions (Tamamizu is a PWA and must never ship one) and for cross-origin
executable script imports (an HTML `<script src>` or service-worker
`importScripts()` call whose resolved origin is not
`https://app.tamamizu.giganihongo.com`). This is a deterministic, fail-closed
build-time gate against one specific class of accidental regression — it is
not a substitute for the rest of this runbook, and it does not detect a
compromise that ships as same-origin/normal-extension code.

## 1. Stop normal promotion/deployment work

The moment a malicious or compromised release is suspected:

- Do not merge or promote any pending PR, including unrelated ones, until
  the incident is triaged. A second deploy on top of a compromised one only
  widens the blast radius and complicates root-causing.
- Say so explicitly in the relevant issue/PR thread so other agents/humans
  don't merge in parallel.

## 2. Identify the first bad and last known-good `main` SHA

- Use `git log --oneline` on `main` and the GitHub Pages deploy history
  (Actions runs for `.github/workflows/deploy.yml`) to find the exact
  commit SHA of the first suspect deploy and the SHA of the last deploy
  believed clean.
- Cross-check against `ops/project-state.json` / `npm run resume` output
  and any recent dependency/workflow-pinned-SHA changes (see
  `.github/workflows/dependency-review.yml` and
  `.github/workflows/osv-scanner.yml`) for anything that changed between
  the two SHAs and could explain the compromise (a new/changed dependency,
  a changed third-party script host, a workflow permission change).

## 3. Revoke/disable the compromised third-party source or config

- If the suspected vector is a third-party script host (for example, a
  misconfigured or compromised analytics host — see
  `docs/analytics-foundation.md`'s same-origin enforcement), unset the
  relevant repository Variable(s) (`VITE_ANALYTICS_PROVIDER`,
  `VITE_UMAMI_WEBSITE_ID`, `VITE_UMAMI_HOST_URL`) so the next build ships
  with that integration inert, and confirm via the built bundle that no
  script tag is emitted for that host.
- If the suspected vector is a compromised npm dependency, identify the
  exact package/version from `package-lock.json` and remove/pin it to a
  known-good version rather than merely upgrading blindly.
- If the suspected vector is a GitHub Actions workflow or action, compare
  the pinned SHA in the workflow file against the action's legitimate
  release history; a workflow using an unpinned ref (a tag or branch name)
  is a bigger red flag than one pinned to a full SHA, since a full-SHA pin
  cannot be silently repointed by the upstream maintainer.
- Do not re-enable the disabled source/config until its root cause is
  understood and fixed.

## 4. Prepare a clean emergency release from reviewed code

- Branch from the last known-good `main` SHA (step 2), or from `main` after
  the fix for the identified root cause has been reviewed and merged —
  whichever is actually clean.
- The emergency release still goes through the same review bar as any
  other Production change (PR, CI, human review) — an incident is not a
  reason to skip review, since a rushed unreviewed "fix" can itself
  introduce a second issue.
- Deploy through the normal `.github/workflows/deploy.yml` GitHub Pages
  pipeline; do not hand-push build artifacts outside of CI.

## 5. Assess whether an already-open bad client needs emergency activation

Normal Tamamizu PWA updates are prompt-only and non-destructive (see
`docs/pwa-update-flow.md`): a waiting service worker only activates when
the learner taps **Update**, and `registration.update()` is called on
launch/foreground/hourly rather than instantly pushing changes to an
already-open tab. That is the correct behavior for routine releases, but
during a genuine security incident it means an already-open client running
the bad build can remain running — with the bad code still executing in
that tab — until the learner taps Update or reloads.

Incident response must explicitly assess, case by case, whether that gap is
acceptable for the specific incident:

- If the compromise is something that only matters going forward (e.g. a
  supply-chain issue in code that isn't actively executing anything
  harmful against an already-open session), the normal prompt-based update
  reaching users over the next few update cycles may be sufficient.
- If the compromise could actively harm an already-open session (e.g.
  active exfiltration, credential theft, or unwanted third-party code
  execution against a signed-in user), that is not acceptable to leave
  running silently, and a faster activation path needs to be considered
  for this specific incident.

**Do NOT create a permanent unauthenticated remote kill switch in this
tranche.** Any faster-than-normal activation mechanism considered during an
active incident must be scoped to that incident, reviewed like any other
Production change, and torn back down afterward — not left in place as
standing infrastructure. Evaluate options like a forced-immediate SW
activation for a specific, time-boxed incident on their own merits at the
time, rather than pre-building a general-purpose mechanism speculatively.

## 6. Verify the exact deployed Pages artifact SHA and scan it before declaring recovery

- Confirm, from the GitHub Pages deployment (Actions run for `deploy.yml`,
  and the live site's `Build: <short sha>` shown in Settings → About —
  see `src/lib/buildInfo.ts`), the exact commit SHA actually serving
  Production traffic. Do not rely on `main`'s HEAD alone — confirm the
  artifact that was actually built and published matches the intended
  clean SHA.
- Re-run dependency/vulnerability scanning (Dependency Review, OSV
  Scanner — see `.github/workflows/dependency-review.yml` and
  `.github/workflows/osv-scanner.yml`) against that exact SHA and confirm
  it is clean before declaring the incident resolved.
- That deploy's `deploy.yml` run already ran the automated
  `npm run check:artifact-safety` gate (see the intro above) against the
  built `dist/` before upload; confirm that step passed for the SHA in
  question rather than re-deriving the same check by hand.
- Only after the artifact SHA is confirmed clean and scanned should normal
  promotion/deployment work (step 1) resume.
