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
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">No accounts</h2>
        <p>There is no sign-up, login, or user account of any kind. Nobody's identity is collected.</p>
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
          This app is a static site with no backend server of its own. Loading it still involves ordinary web
          requests to whichever hosting provider serves it (for example, GitHub Pages), and that provider may process
          standard request metadata (such as IP address and request logs) as part of operating its own
          infrastructure, under that provider's own privacy terms — Tamamizu does not control or receive that data
          itself.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Cookies</h2>
        <p>This app does not set cookies.</p>
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
          <p>
            <strong>This build has Tally feedback enabled.</strong> A Send Feedback option is available; clicking it
            opens a Tally form in a new browser tab, and nothing is sent until you choose to fill it in and submit it
            there. Along with whatever you write and a category you pick, the link carries your current in-app
            route, the build version, and a coarse screen-size category (small/medium/large, never your exact screen
            dimensions) as context — never your learning progress, saved items, or any identifier tied to you. This
            app does not ask for your name or email, though Tally's own form fields are outside this app's control.
            Tally is the processor for whatever you submit there; see{' '}
            <a href="https://tally.so/help/privacy-policy" target="_blank" rel="noreferrer" className="underline">
              Tally's privacy policy
            </a>{' '}
            for their own terms.
          </p>
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
