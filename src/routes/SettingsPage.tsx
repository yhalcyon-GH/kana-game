import { useNavigate } from 'react-router-dom'
import { TUTORIAL_CATALOG } from '../data/guideCatalog'
import { buildGuideReplayHref } from '../hooks/useGuideReplay'
import { useProgressStore } from '../store/progressStore'

// Volume sliders go 0-2 rather than 0-1: 1.0 (the raw, unattenuated clip
// level) sits at the midpoint and displays as 50%, leaving headroom above
// it as a real gain boost (see audio/staticFileProvider.ts's GainNode) up
// to 2x at 100%, rather than topping out at the clip's native volume.
const VOLUME_MAX = 2

export function SettingsPage() {
  const audioEnabled = useProgressStore((s) => s.audioEnabled)
  const setAudioEnabled = useProgressStore((s) => s.setAudioEnabled)
  const audioVolume = useProgressStore((s) => s.audioVolume)
  const setAudioVolume = useProgressStore((s) => s.setAudioVolume)
  const audioSpeed = useProgressStore((s) => s.audioSpeed)
  const setAudioSpeed = useProgressStore((s) => s.setAudioSpeed)
  const mascotVoiceEnabled = useProgressStore((s) => s.mascotVoiceEnabled)
  const setMascotVoiceEnabled = useProgressStore((s) => s.setMascotVoiceEnabled)
  const mascotVoiceVolume = useProgressStore((s) => s.mascotVoiceVolume)
  const setMascotVoiceVolume = useProgressStore((s) => s.setMascotVoiceVolume)
  const alwaysShowRomajiHints = useProgressStore((s) => s.alwaysShowRomajiHints)
  const setAlwaysShowRomajiHints = useProgressStore((s) => s.setAlwaysShowRomajiHints)
  const setHasCompletedIntroGuide = useProgressStore((s) => s.setHasCompletedIntroGuide)
  const navigate = useNavigate()

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

      <label className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800">
        <span>Tamamizu's voice reactions</span>
        <input
          type="checkbox"
          checked={mascotVoiceEnabled}
          onChange={(e) => setMascotVoiceEnabled(e.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <div className="flex w-full flex-col gap-4 rounded-xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800">
        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>Volume</span>
            <span className="text-neutral-500 dark:text-neutral-400">{Math.round((audioVolume / VOLUME_MAX) * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={VOLUME_MAX}
            step={0.1}
            value={audioVolume}
            disabled={!audioEnabled}
            onChange={(e) => setAudioVolume(Number(e.target.value))}
            className="w-full disabled:opacity-40"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex justify-between text-sm">
            <span>Tamamizu's voice volume</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {Math.round((mascotVoiceVolume / VOLUME_MAX) * 100)}%
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={VOLUME_MAX}
            step={0.1}
            value={mascotVoiceVolume}
            disabled={!audioEnabled || !mascotVoiceEnabled}
            onChange={(e) => setMascotVoiceVolume(Number(e.target.value))}
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

      <label className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 dark:border-neutral-600 dark:bg-neutral-800">
        <span>Always show romaji hints</span>
        <input
          type="checkbox"
          checked={alwaysShowRomajiHints}
          onChange={(e) => setAlwaysShowRomajiHints(e.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <div className="flex w-full flex-col gap-2">
        <h2 className="self-start text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Tutorials
        </h2>
        {TUTORIAL_CATALOG.map((guide) => (
          <button
            key={guide.id}
            type="button"
            onClick={() => {
              if (guide.kind === 'introFlag') setHasCompletedIntroGuide(false)
              else navigate(buildGuideReplayHref(guide.path, guide.id))
            }}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-300 bg-white px-4 py-3 text-left hover:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800"
          >
            <span>{guide.label}</span>
            <span className="text-blue-600 dark:text-blue-400">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
