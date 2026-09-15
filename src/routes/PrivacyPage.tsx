import { isUmamiConfigured } from '../lib/analytics/umamiConfig'
import { isFeedbackEnabled } from '../lib/feedback/config'

export function PrivacyPage() {
  const analyticsActive = isUmamiConfigured()
  const feedbackActive = isFeedbackEnabled()

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-sm text-neutral-600 dark:text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Privacy Policy</h1>

      <p>
        This page describes what Tamamizu: Hiragana &amp; Katakana actually does with data on your device today. It
        does not cover any future change — if that changes, this page will be updated first.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Account (optional)</h2>
        <p>
          You do not need an account to use the free parts of this app — those work entirely from local storage on
          your device, as described below. An account is only involved if you purchase Full Tamamizu, so that your
          purchase can be recognized on your devices. Signing in does not use a password: you enter your email
          address and receive a one-time Magic Link to that address, which signs you in when you open it. Tamamizu
          processes the email address you choose to provide, a minimum account identifier, and the session information
          needed to operate this sign-in flow. This information is used solely for authentication and purchase access,
          not marketing. Magic Link tokens expire quickly and are not retained as a long-term profile of you.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Local storage on your device</h2>
        <p>
          Your learning progress and app settings (which characters/words you've learned, quiz results, volume and
          audio preferences, and similar) are saved only in your browser's local storage, under your device. This
          data is never sent to any server. It stays on the device and browser you're using, and clearing your
          browser's site data for this app will erase it.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Microphone / speech recognition</h2>
        <p>
          Some activities (Word Reading, Restaurant, Cafe) let you speak a word aloud instead of typing it. This uses
          your browser's or device platform's built-in speech recognition (the Web Speech API), which only activates
          when you choose to use it — it is never on in the background. Tamamizu itself does not record, upload, or
          store your microphone audio on its own server. Recognition processing may be performed by your browser or
          device platform (for example, sent to that browser/platform vendor's own speech-recognition service), and
          any such processing is governed by that browser or platform provider's own privacy terms, not Tamamizu's —
          check your browser/device settings if you want details on how it handles this. If your browser doesn't
          support speech recognition, or you prefer not to use it, these activities offer a typed alternative
          instead.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Audio playback</h2>
        <p>
          Character, word, and mascot voice clips are static audio files served with the app — playing them does not
          send any information about you anywhere beyond a normal file request to load the clip.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Hosting</h2>
        <p>
          The learning interface is delivered as a static web app. Loading it involves ordinary web requests to the
          hosting provider that serves it (for example, GitHub Pages), which may process standard request metadata
          such as IP address and request logs under its own privacy terms. Tamamizu also operates a separate,
          security-focused authentication and purchase-access service for signed-in purchasers. That service processes
          only the account, session, purchase-access, webhook, security, and diagnostic information needed to operate
          it; it is not used for advertising or behavioural profiling.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Cookies</h2>
        <p>
          If you sign in to an account (see above), this app sets one cookie to keep you signed in. That cookie
          holds only a random session identifier — never your email address or any other personal data — and is
          used solely to recognize your device as signed in; it is not used for tracking or analytics. The session
          cookie is configured as Secure, HttpOnly, and SameSite=Lax. If you don't sign in, no cookie is set.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Purchases and access</h2>
        <p>
          Full Tamamizu is sold through Paddle. Tamamizu stores only the identifiers and status information needed to
          confirm a purchase and provide or revoke paid access, such as a Paddle customer or transaction reference,
          purchase date, and refund status. Payment card details, complete billing details, and tax data are handled by
          Paddle and are not copied into Tamamizu&apos;s systems unless a record is strictly necessary for legal,
          fraud-prevention, or dispute purposes.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Retention and deletion</h2>
        <p>
          Tamamizu keeps ordinary security and operational logs only for about 90 days and does not intentionally log
          Magic Links, session credentials, secrets, payment tokens, or unnecessary personal data. We keep account
          and purchase-access information only while needed to operate the service, handle refunds or disputes, and
          meet legal, tax, fraud-prevention, or record-keeping obligations.
        </p>
        <p>
          You may request deletion of your Tamamizu account and personal data through the support contact published
          for the service. Deletion removes the account email address and unnecessary Tamamizu-held personal data, or
          anonymizes it where appropriate. It ends paid access, cannot be reversed, and does not itself provide a
          refund. Local learning progress remains on your device unless you clear it. Some minimum records may need to
          be retained for the reasons above, and Paddle may retain its own transaction records under its policies.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Analytics</h2>
        {analyticsActive ? (
          <>
            <p>
              <strong>This build has Umami analytics active.</strong> This app sends a small set of anonymous usage
              events (for example, which activity was started or completed, or a Word Reading speech attempt's
              outcome) to help understand where learners get stuck.
            </p>
            <p>
              Each event this app sends contains only: the Umami website id, the event's name (one of a fixed,
              approved list — e.g. <code>lesson_started</code>), and a small properties object limited to
              low-cardinality fields such as category/row/activity/assessment/score/questionCount/result/screenSize
              (screenSize is a coarse small/medium/large bucket, never your exact screen dimensions). This app never
              includes a speech transcript, microphone audio, free-text you entered, your name/email, or a
              persistent identifier tied to you across visits in that properties object, and Umami's own automatic
              pageview/click/referrer/page-title collection is explicitly disabled for this integration — this app
              does not send the hostname, page title, referrer, or exact screen size that Umami's tracker sends by
              default. This app never enables Umami's separate session-replay or heatmap features.
            </p>
            <p>
              Separately from what this app's code sends, Umami's own servers process the standard technical
              request data every web request includes (such as your IP address and browser User-Agent string) to
              derive approximate, aggregate session information (for example: country/region, and browser/operating
              system name) for its usage dashboard — this is a normal part of how Umami's hosted service operates,
              independent of this app's own payload, and is not something this app's code controls or can suppress.
              See{' '}
              <a href="https://umami.is/docs" target="_blank" rel="noreferrer" className="underline">
                Umami's documentation
              </a>{' '}
              for Umami's own account of what it collects and how.
            </p>
          </>
        ) : (
          <p>
            <strong>As of this build, analytics is inactive</strong> — no event is sent anywhere; this behavior is
            controlled entirely by a build-time configuration flag, not a runtime toggle a learner sets. If a future
            build enables this, the provider is <strong>Umami</strong> (specifically Umami Cloud); this page will
            switch to describing exactly what's sent, as it does above whenever that build-time flag is on.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Feedback</h2>
        {feedbackActive ? (
          <>
            <p>
              <strong>This build has Tally feedback enabled.</strong> A Send Feedback option is available. Clicking
              it opens a Tally form in a new browser tab — opening that form itself sends your current in-app route,
              the build version, and a coarse screen-size category (small/medium/large, never your exact screen
              dimensions) to Tally as part of the form's web address, since that's how this app passes that context
              along. Your written feedback and the category you pick are sent separately, only if and when you
              choose to fill in and submit the form. Neither step sends your learning progress, saved items, Tamamizu account identifier, or your name or
              email — this app does not ask for either, though Tally's own form fields are outside this app's
              control.
            </p>
            <p>
              Separately from what this app sends, Tally itself automatically assigns every form respondent a
              "Respondent ID" — a randomly generated identifier that Tally stores in your browser's local storage.
              Per Tally's own documentation, this identifier is not tied to a name or email by itself, but it is
              designed to persist across every Tally form in the same Tally workspace and lets the form owner (this
              app) tell whether the same browser has responded before. This app does not read, use, or store that
              identifier itself, and does not add any identifier of its own on top of it — it's part of how Tally
              operates the form, independent of this app's own code.
            </p>
            <p>
              Tamamizu reviews submitted feedback and aims to delete it within 12 months. If longer-term learning is
              useful, only anonymous, aggregated trends are retained. Do not include names, email addresses, payment
              details, passwords, Magic Links, or other unnecessary personal information in your feedback.
            </p>
            <p>
              For a submitted response, this app (as the form's creator) is the party responsible for that response
              data, and Tally acts as the service that stores and processes it on this app's behalf; per Tally's own
              documentation, form data is stored in the EU. See{' '}
              <a href="https://tally.so/help/privacy-policy" target="_blank" rel="noreferrer" className="underline">
                Tally's privacy policy
              </a>{' '}
              for Tally's own account of what it collects and how.
            </p>
          </>
        ) : (
          <p>
            <strong>As of this build, no feedback destination is configured</strong>, so the Send Feedback option
            does not appear at all — it is absent, not just quiet. If a future build enables this, the destination
            is a <strong>Tally</strong> form; this page will switch to describing exactly what's sent, as it does
            above whenever that build-time flag is on.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Children and guardians</h2>
        <p>
          Tamamizu is a learning app and does not set a minimum learning age. Where needed, a minor should use the
          service with a parent&apos;s or legal guardian&apos;s permission and supervision. A guardian may buy and manage
          an account for a minor. Tamamizu does not ask for a child&apos;s name, date of birth, school, or address, and
          does not collect a date of birth solely to verify age.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Developer / operator</h2>
        <p>
          Tamamizu: Hiragana &amp; Katakana is developed and operated by{' '}
          <a href="https://github.com/yhalcyon-GH" target="_blank" rel="noreferrer" className="underline">
            yhalcyon-GH
          </a>
          , published from the public{' '}
          <a href="https://github.com/yhalcyon-GH/kana-game" target="_blank" rel="noreferrer" className="underline">
            kana-game
          </a>{' '}
          repository on GitHub.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Questions or privacy inquiries</h2>
        <p>
          To ask a question about this policy or raise a privacy concern, open an issue on the project's public
          GitHub repository:{' '}
          <a
            href="https://github.com/yhalcyon-GH/kana-game/issues"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            github.com/yhalcyon-GH/kana-game/issues
          </a>
          .
        </p>
      </section>
    </div>
  )
}
