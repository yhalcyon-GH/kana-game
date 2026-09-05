type NoticeEntry = {
  name: string
  license: string
  copyright: string
  homepage?: string
  licenseFile: string
  note?: string
}

// Runtime dependencies that are actually bundled into the distributed
// app (verified against package.json's "dependencies" plus what
// vite-plugin-pwa's generateSW mode actually emits into dist/sw.js and
// dist/workbox-*.js — confirmed by running `npm run build` and inspecting
// the output, not guessed from devDependencies). Build-only/dev-only
// tooling (Vite, TypeScript, Tailwind, Vitest, oxlint, etc.) is
// intentionally excluded — none of it ships in the production bundle.
const RUNTIME_NOTICES: NoticeEntry[] = [
  {
    name: 'React',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://react.dev/',
    licenseFile: 'react-LICENSE.txt',
  },
  {
    name: 'React DOM',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://react.dev/',
    licenseFile: 'react-dom-LICENSE.txt',
  },
  {
    name: 'React Router / React Router DOM',
    license: 'MIT',
    copyright: 'Copyright (c) React Training LLC 2015-2019, Remix Software Inc. 2020-2021, Shopify Inc. 2022-2023',
    homepage: 'https://reactrouter.com/',
    licenseFile: 'react-router-dom-LICENSE.txt',
  },
  {
    name: 'Zustand',
    license: 'MIT',
    copyright: 'Copyright (c) 2019 Paul Henschel',
    homepage: 'https://github.com/pmndrs/zustand',
    licenseFile: 'zustand-LICENSE.txt',
  },
  {
    name: 'Workbox',
    license: 'MIT',
    copyright: 'Copyright 2018 Google LLC',
    homepage: 'https://developer.chrome.com/docs/workbox/',
    licenseFile: 'workbox-LICENSE.txt',
    note: 'Bundled into the generated service worker (offline support) by vite-plugin-pwa.',
  },
  {
    name: 'idb',
    license: 'ISC',
    copyright: 'Copyright (c) 2016, Jake Archibald',
    homepage: 'https://github.com/jakearchibald/idb',
    licenseFile: 'idb-LICENSE.txt',
    note: 'A Workbox dependency, bundled the same way.',
  },
]

export function ThirdPartyNoticesPage() {
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Third-Party Notices</h1>

      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        This app is built with open-source software. Full license text for each project below is linked and also
        available under <code>/licenses/</code>.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Content: stroke order data</h2>
        <div className="rounded-xl border border-neutral-300 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">strokesvg</p>
          <p className="mt-1">
            Stroke order animation path data is converted from the{' '}
            <a href="https://github.com/zhengkyl/strokesvg" target="_blank" rel="noreferrer" className="underline">
              strokesvg
            </a>{' '}
            project's kana SVGs (MIT licensed).
          </p>
          <p className="mt-2">
            <a href="/licenses/strokesvg-LICENSE.txt" target="_blank" rel="noreferrer" className="underline">
              Full license text
            </a>
          </p>
        </div>

        <div className="rounded-xl border border-neutral-300 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">Klee One</p>
          <p className="mt-1">
            The strokesvg kana SVGs above, and this app's kana typeface, are derived from the Klee One font. Klee One
            is Copyright 2020 The Klee Project Authors, licensed under the{' '}
            <a href="https://openfontlicense.org/" target="_blank" rel="noreferrer" className="underline">
              SIL Open Font License, Version 1.1
            </a>
            .
          </p>
          <p className="mt-2">
            <a href="/licenses/strokesvg-LICENSE.txt" target="_blank" rel="noreferrer" className="underline">
              Full license text (includes the OFL)
            </a>
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Software</h2>
        {RUNTIME_NOTICES.map((entry) => (
          <div
            key={entry.name}
            className="rounded-xl border border-neutral-300 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          >
            <p className="font-semibold text-neutral-700 dark:text-neutral-300">
              {entry.name} <span className="font-normal text-neutral-500 dark:text-neutral-400">({entry.license})</span>
            </p>
            <p className="mt-1">{entry.copyright}</p>
            {entry.note && <p className="mt-1">{entry.note}</p>}
            <p className="mt-2 flex flex-wrap gap-x-4">
              {entry.homepage && (
                <a href={entry.homepage} target="_blank" rel="noreferrer" className="underline">
                  Project homepage
                </a>
              )}
              <a href={`/licenses/${entry.licenseFile}`} target="_blank" rel="noreferrer" className="underline">
                Full license text
              </a>
            </p>
          </div>
        ))}
      </section>
    </div>
  )
}
