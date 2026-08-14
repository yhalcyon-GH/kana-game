export function AboutPage() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">About</h1>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">
        Kana Game is a hiragana learning app: it teaches one gojūon row at a time, paired with real everyday words, and
        reviews you on both with a spaced-repetition-style practice loop.
      </p>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">About the Audio</span>
        <p className="mt-1">
          Characters, words, and reading prompts are voiced by a dedicated narrator voice, and the mascot's
          correct/incorrect answer reactions are voiced by a separate character voice — both generated with{' '}
          <strong>ElevenLabs</strong>.
        </p>
        <p className="mt-2">Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand.</p>
      </div>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">About the Stroke Order Data</span>
        <p className="mt-1">
          Stroke order animations use path data from the <strong>KanjiVG</strong> project.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>Copyright (C) 2009/2010/2011 Ulrich Apel.</li>
          <li>
            Project website:{' '}
            <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer" className="underline">
              https://kanjivg.tagaini.net/
            </a>
          </li>
          <li>
            Licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/3.0/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              CC BY-SA 3.0
            </a>
            .
          </li>
        </ul>
        <p className="mt-2">
          The stroke path data bundled in this app (<code>src/data/strokes.ts</code>) is a derivative work — the
          original stroke paths, re-keyed to this app's character ids — and is itself licensed under CC BY-SA 3.0.
        </p>
      </div>
    </div>
  )
}
