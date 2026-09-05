export function PrivacyPage() {
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
        <p>
          The app can record anonymous, aggregate usage events (for example, which activity was started or
          completed) to help understand how the app is used. As of this release, that data is <strong>not</strong>{' '}
          sent to any third-party analytics service — no external analytics provider is active. If that changes in
          the future, this page will be updated to name the provider and describe what's collected before it's
          enabled.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Feedback</h2>
        <p>
          A Send Feedback option may be available if a feedback destination is configured for this build. Feedback
          you choose to submit is sent only when you actively use that feature; it is not linked to your learning
          progress data or any identity.
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
