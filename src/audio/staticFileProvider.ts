import type { SpeechPlaybackOptions, SpeechProvider, SpeechRequest } from './types'

// Plays a pre-generated clip shipped as a static file under public/audio/
// (see scripts/generateAudioElevenLabs.ts) — the app's primary provider.
// Deliberately provider-agnostic about how the clip was produced: swapping
// which TTS vendor generated the clips means regenerating the files, not
// changing this class.
export class StaticFileProvider implements SpeechProvider {
  private audioEl: HTMLAudioElement | null = null

  speak(request: SpeechRequest, options: SpeechPlaybackOptions): Promise<void> {
    if (!this.audioEl) this.audioEl = new Audio()
    const audioEl = this.audioEl
    return new Promise((resolve, reject) => {
      audioEl.onerror = () => reject(new Error(`no playable clip for "${request.key}"`))
      audioEl.src = `${import.meta.env.BASE_URL}audio/${request.key}.wav`
      // Setting these after assigning `src` (which triggers an implicit
      // load) is the order that reliably sticks across browsers — setting
      // them first can get silently reset by the load.
      audioEl.volume = options.volume
      audioEl.defaultPlaybackRate = options.rate
      audioEl.playbackRate = options.rate
      audioEl.preservesPitch = true
      audioEl.play().then(resolve).catch(reject)
    })
  }
}
