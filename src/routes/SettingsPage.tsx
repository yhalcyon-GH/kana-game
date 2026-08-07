import { useState } from 'react'
import { useProgressStore } from '../store/progressStore'

export function SettingsPage() {
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const setAudioEnabled = useProgressStore((s) => s.setAudioEnabled)
  const resetProgress = useProgressStore((s) => s.resetProgress)
  const [confirmingReset, setConfirmingReset] = useState(false)

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <label className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800">
        <span>Pronunciation audio</span>
        <input
          type="checkbox"
          checked={audioEnabled}
          onChange={(e) => setAudioEnabled(e.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
        Note: romaji spelling follows the hiragana letter-by-letter (e.g. せんせい → "sensei", おはよう → "ohayou"). In actual
        pronunciation these are long vowels — spoken more like "sensee" and "ohayoo" — so the audio may sound slightly
        different from how the romaji looks.
      </div>

      <div className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm text-neutral-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Voice credit</span>
        <p className="mt-1">
          Pronunciation audio uses{' '}
          <a
            href="https://coeiroink.com/character/audio-character/tsukuyomi-chan"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            COEIROINK:つくよみちゃん
          </a>
          . 音声ライブラリは、フリー素材キャラクター「
          <a href="https://tyc.rei-yumesaki.net" target="_blank" rel="noreferrer" className="underline">
            つくよみちゃん
          </a>
          」が無料公開している
          <a href="https://tyc.rei-yumesaki.net/material/corpus/" target="_blank" rel="noreferrer" className="underline">
            つくよみちゃんコーパス
          </a>
          （CV.夢前黎）を利用しています。© Rei Yumesaki
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
        <span className="font-semibold text-red-700 dark:text-red-300">Reset progress</span>
        <p className="text-sm text-red-600 dark:text-red-400">
          This clears every character and row you've learned. This can't be undone.
        </p>
        {confirmingReset ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetProgress()
                setConfirmingReset(false)
              }}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Yes, reset everything
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:border-neutral-400 dark:border-neutral-600"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="self-start rounded-full border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900"
          >
            Reset progress
          </button>
        )}
      </div>
    </div>
  )
}
