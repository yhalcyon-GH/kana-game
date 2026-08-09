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
          Some of the audio used in this application is generated using the voice of the free character material{' '}
          <strong>Tsukuyomi-chan</strong>.
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
        <p className="mt-2">Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand.</p>
      </div>
    </div>
  )
}
