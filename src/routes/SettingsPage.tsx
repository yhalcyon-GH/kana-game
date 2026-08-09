import { useProgressStore } from '../store/progressStore'

export function SettingsPage() {
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const setAudioEnabled = useProgressStore((s) => s.setAudioEnabled)
  const audioVolume = useProgressStore((s) => s.audioVolume)
  const setAudioVolume = useProgressStore((s) => s.setAudioVolume)
  const audioSpeed = useProgressStore((s) => s.audioSpeed)
  const setAudioSpeed = useProgressStore((s) => s.setAudioSpeed)

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

      <div className="flex w-full flex-col gap-4 rounded-xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800">
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>Volume</span>
            <span className="text-neutral-500 dark:text-neutral-400">{Math.round(audioVolume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioVolume}
            disabled={!audioEnabled}
            onChange={(e) => setAudioVolume(Number(e.target.value))}
            className="w-full disabled:opacity-40"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>Speed</span>
            <span className="text-neutral-500 dark:text-neutral-400">{audioSpeed.toFixed(2)}x</span>
          </span>
          <input
            type="range"
            min={0.75}
            max={1.5}
            step={0.05}
            value={audioSpeed}
            disabled={!audioEnabled}
            onChange={(e) => setAudioSpeed(Number(e.target.value))}
            className="w-full disabled:opacity-40"
          />
        </label>
      </div>

      <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
        Note: romaji spelling follows the hiragana letter-by-letter (e.g. せんせい → "sensei", おはよう → "ohayou"). In actual
        pronunciation these are long vowels — spoken more like "sensee" and "ohayoo" — so the audio may sound slightly
        different from how the romaji looks.
      </div>
    </div>
  )
}
