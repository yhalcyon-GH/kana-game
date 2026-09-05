# Feedback setup (Tally)

**Status: not yet configured.** This app's Send Feedback entry (About page /
Settings) is hidden until `VITE_FEEDBACK_URL` is set — see
`docs/feedback-analytics-provider-decision.md` for why Tally was chosen.
This doc is a step-by-step setup guide for whoever has (or creates) the
Tally account — Claude Code cannot create third-party accounts, so this is
a manual, one-time task.

Expect this to take about 5 minutes.

## 1. Create a Tally account and form

1. Go to [tally.so](https://tally.so) and sign up (free plan is sufficient
   for a hobby-scale beta — see the provider decision doc for the exact
   free-tier terms as of the decision date).
2. Create a new form. Suggested name: "Tamamizu Feedback".

## 2. Add the form questions

Add exactly two required questions, matching this app's feedback
specification (`docs/feedback-analytics-provider-decision.md`):

1. **Category** (multiple choice, required) with these four options:
   - Something is broken
   - Something is confusing
   - I have an idea
   - Other
2. **Feedback text** (long text, required) — the free-text field.

Do not add a name or email field — this app deliberately does not collect
either. Do not add a rating field unless you specifically want one; the
spec allows at most one small addition, but two questions is the intended
minimum.

### Data collection rules for this form (keep it minimal)

Tamamizu's feedback form is intended to collect, in total:

- Category (the fixed 4-option question above)
- Feedback text (the free-text field above)
- `route`, `build`, and coarse `screen` size — via the hidden fields in
  step 3 below, populated automatically by the app's link, not typed by
  hand

Do not add any of the following to the form unless a future, deliberate
decision changes this spec (and the Privacy Policy is updated first — see
section 9):

- Name, email, or phone fields
- Any account-ID or identity field
- A question asking for exact screen resolution (this app only ever
  passes a coarse small/medium/large category — see `screenSizeCategory.ts`)
- Anything that would capture a speech transcript, microphone audio,
  learning progress, or Saved contents (this app never sends any of
  these to the feedback link in the first place)
- A country/location question
- Any Tamamizu-specific persistent user/feedback ID — this app does not
  generate or send one (see "Tally's own Respondent ID" below for the
  identifier Tally itself assigns, which is separate from anything this
  app adds)

Do not add any third-party analytics or advertising script to the Tally
form itself (Google Analytics, Google Tag Manager, Meta/Facebook Pixel,
or any other marketing/advertising tracker) unless the user explicitly
decides to do so later — this is out of scope for the current setup, and
Tally's own editor may offer integrations that add such scripts, so avoid
enabling anything beyond the form questions and hidden fields above.

### Tally's own Respondent ID

Separately from the fields above, Tally automatically assigns every form
respondent a "Respondent ID" — per Tally's own documentation
([tally.so/help/faq](https://tally.so/help/faq),
[tally.so/help/prevent-duplicate-submissions](https://tally.so/help/prevent-duplicate-submissions)),
this is a randomly generated (UUID v4) identifier that Tally stores in the
respondent's browser local storage, and which persists across every Tally
form in the same Tally workspace — it lets the form owner recognize a
repeat respondent (someone who has answered this or another form in this
workspace before), though a respondent can bypass this by using a
different browser/device or private/incognito mode. This is a Tally
platform behavior, not something this app's own code creates or reads —
this app's implementation has no setting related to it, and no official
Tally documentation reviewed described a way for a form creator to turn
it off; do not claim in the app's Privacy Policy that it can be disabled
unless Tally's own docs are found to say otherwise. This app's own
Privacy Policy (`src/routes/PrivacyPage.tsx`) already discloses the
Respondent ID's existence and behavior; keep that disclosure accurate if
Tally's own documentation is ever clarified further or changes.

## 3. Add hidden fields for context

In the Tally form editor, type `/hidden` to insert a hidden field block for
each of these three field names (case-sensitive — must match exactly):

- `route`
- `build`
- `screen`

These are populated automatically by the app via URL query parameters when
it links to your form (see `src/lib/feedback/config.ts`'s
`buildFeedbackDestinationUrl`) — you do not need to fill them in yourself,
just create the hidden field blocks with these exact names so Tally knows
to capture them from the URL.

Reference: [Tally's Hidden Fields documentation](https://tally.so/help/hidden-fields).

## 4. Publish the form

Use Tally's Publish button. Once published, the form has a permanent public
URL in the form `https://tally.so/r/XXXXXXX`.

## 5. Get the form URL

Copy the published form's URL from Tally's share/embed panel. It should
look like:

```
https://tally.so/r/XXXXXXX
```

## 6. Set `VITE_FEEDBACK_URL`

**Local development:** copy `.env.example` to `.env.local` and set:

```
VITE_FEEDBACK_URL=https://tally.so/r/XXXXXXX
```

**Production (GitHub Pages deploy):** this is a public, non-secret value
(see `.env.example`'s note — anything under `VITE_*` ends up in the public
JS bundle). Set it as a GitHub Actions repository or environment **Variable**
(not a Secret):

1. In the GitHub repo, go to **Settings → Secrets and variables → Actions →
   Variables** tab.
2. Add a new repository variable named `VITE_FEEDBACK_URL` with the Tally
   URL as its value.
3. `.github/workflows/deploy.yml` already reads `${{ vars.VITE_FEEDBACK_URL }}`
   into the build — no workflow file changes are needed once the variable
   is set.
4. Trigger a new deploy (push to `main`, or run the workflow manually) for
   the change to take effect.

## 7. Test it

1. After deploying (or running `npm run dev`/`npm run build` locally with
   `.env.local` set), open the app and go to About (via Settings, or the
   `/about` route directly).
2. Confirm a "Send Feedback" entry now appears (it's hidden entirely when
   `VITE_FEEDBACK_URL` is unset).
3. Click it — it should open your Tally form in a new tab.
4. Submit a test response and confirm it appears in Tally's Submissions
   tab, with the `route`/`build`/`screen` hidden fields populated
   alongside your Category/Feedback text answers.

## 8. Where to find responses, and how to export/delete them

- **View responses:** Tally dashboard → your form → **Submissions** tab.
- **Export:** Submissions tab → CSV export (available on Tally's free
  plan — see the provider decision doc). Individual responses can also be
  exported as PDF.
- **Delete a response:** open the response in the Submissions tab and use
  Tally's delete action there. There is no way for this app itself to
  delete a Tally submission — deletion must happen in the Tally dashboard.
- **Delete the whole form / stop collecting:** unpublish or delete the form
  in Tally, and unset `VITE_FEEDBACK_URL` (or leave it pointing at a
  now-deleted form, which will make Send Feedback open a broken link — so
  prefer unsetting the env var first).

## 9. Relationship to this app's Privacy Policy

`src/routes/PrivacyPage.tsx`'s Feedback section already describes Tally by
name as the intended destination, what context is attached (route/build/
screen), and that name/email are not requested by this app. If the actual
Tally form setup ever diverges from that description (e.g. a name/email
field gets added to the form later, or a different provider is used
instead), **update the Privacy Policy first**, before changing
`VITE_FEEDBACK_URL` in production — see
`docs/analytics-foundation.md`'s equivalent rule for analytics.
