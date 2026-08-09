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
          Characters, words, and reading prompts are voiced by the free character material{' '}
          <strong>Tsukuyomi-chan</strong>. Correct/incorrect answer comments in the practice games are voiced by{' '}
          <strong>COEIROINK:MANA</strong>.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>Character name: つくよみちゃん (<strong>Tsukuyomi-chan</strong>)</li>
          <li>
            Official website:{' '}
            <a href="https://tyc.rei-yumesaki.net/" target="_blank" rel="noreferrer" className="underline">
              https://tyc.rei-yumesaki.net/
            </a>
          </li>
          <li>
            Terms of Use:{' '}
            <a href="https://tyc.rei-yumesaki.net/about/terms/" target="_blank" rel="noreferrer" className="underline">
              https://tyc.rei-yumesaki.net/about/terms/
            </a>
          </li>
        </ul>
        <p className="mt-2">
          Tsukuyomi-chan is a free character created by Rei Yumemi, and the audio is used in accordance with the Terms
          of Use.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>Character name: MANA (COEIROINK's own default character)</li>
          <li>
            Official website:{' '}
            <a href="https://coeiroink.com/" target="_blank" rel="noreferrer" className="underline">
              https://coeiroink.com/
            </a>
          </li>
          <li>
            Terms of Use:{' '}
            <a href="https://coeiroink.com/terms" target="_blank" rel="noreferrer" className="underline">
              https://coeiroink.com/terms
            </a>
          </li>
        </ul>
        <p className="mt-2">
          Generated with COEIROINK. Credit: <strong>COEIROINK:MANA</strong>. Used in accordance with the COEIROINK
          Terms of Use.
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
