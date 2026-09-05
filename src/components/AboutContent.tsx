import { Link } from 'react-router-dom'
import { SendFeedback } from './SendFeedback'
import { SHORT_BUILD_SHA } from '../lib/buildInfo'

// Shared About body used by both /about (kept for old bookmarks/links) and
// SettingsPage (which now shows Settings and About as one continuous
// scrollable page — see SettingsPage.tsx). Never duplicate this copy
// between the two call sites; edit it here only.
export function AboutContent() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">About</h1>

      {/* Exact required wording — do not paraphrase or duplicate elsewhere
          on this page (see the audio section below, which must not also
          claim human recording for the currently-distributed audio). */}
      <p className="text-center text-sm text-neutral-600 dark:text-neutral-300">
        Tamamizu: Hiragana &amp; Katakana was created by a Japanese language teacher. AI was used to create the audio
        and illustrations. All learning content and audio were created and reviewed by a Japanese language teacher.
      </p>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">About the Audio</span>
        <p className="mt-1">
          Character, vocabulary, and reading-prompt audio is AI-generated speech from <strong>Microsoft Azure AI
          Speech</strong> and <strong>ElevenLabs</strong>. Tamamizu's own correct/incorrect answer reactions use a
          separate character voice.
        </p>
        <p className="mt-2">Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand.</p>
      </div>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Legal</span>
        <ul className="mt-2 flex flex-col gap-1">
          <li>
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link to="/third-party-notices" className="underline">
              Third-Party Notices
            </Link>
          </li>
        </ul>
      </div>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">About the Stroke Order Data</span>
        <p className="mt-1">
          Stroke order animations use path data converted from the{' '}
          <a href="https://github.com/zhengkyl/strokesvg" target="_blank" rel="noreferrer" className="underline">
            strokesvg
          </a>{' '}
          project's kana SVGs, which are derived from the <strong>Klee One</strong> font.
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>Klee One is Copyright 2020 The Klee Project Authors.</li>
          <li>
            Licensed under the{' '}
            <a href="https://openfontlicense.org/" target="_blank" rel="noreferrer" className="underline">
              SIL Open Font License, Version 1.1
            </a>
            .
          </li>
        </ul>
        <p className="mt-2">
          The stroke path data bundled in this app (<code>src/data/strokeGlyphs.ts</code>) is generated from these
          vendored SVGs; see <code>vendor/strokesvg/LICENSE</code> and <code>vendor/strokesvg/PROVENANCE.md</code>{' '}
          for full attribution and license text.
        </p>
      </div>

      <SendFeedback />

      <p className="text-xs text-neutral-400 dark:text-neutral-500">Build: {SHORT_BUILD_SHA}</p>
    </div>
  )
}
