import type { SpeechPlaybackOptions, SpeechProvider, SpeechRequest } from './types'

// Plays a pre-generated clip shipped as a static file under public/audio/
// (see scripts/generateAudioElevenLabs.ts) — the app's primary provider.
// Deliberately provider-agnostic about how the clip was produced: swapping
// which TTS vendor generated the clips means regenerating the files, not
// changing this class.
//
// Routed through a Web Audio GainNode rather than the plain <audio>
// element's own `.volume` (capped natively at 1.0) — the Settings volume
// sliders go up to 2.0 (a real gain boost past the clip's raw level), which
// only a GainNode can do. `createMediaElementSource` can only be called
// once per <audio> element, so the element/context/gain chain is built
// lazily on first use and reused for every subsequent clip. Falls back to
// plain `.volume` (clamped to 1.0) if AudioContext isn't available at all
// (very old browsers, and the jsdom test environment).
export class StaticFileProvider implements SpeechProvider {
  private audioEl: HTMLAudioElement | null = null
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null

  private ensureGraph(): { audioEl: HTMLAudioElement; gainNode: GainNode | null } {
    if (!this.audioEl) {
      this.audioEl = new Audio()
      if (typeof AudioContext !== 'undefined') {
        this.audioContext = new AudioContext()
        const source = this.audioContext.createMediaElementSource(this.audioEl)
        this.gainNode = this.audioContext.createGain()
        source.connect(this.gainNode)
        this.gainNode.connect(this.audioContext.destination)
      }
    }
    return { audioEl: this.audioEl, gainNode: this.gainNode }
  }

  speak(request: SpeechRequest, options: SpeechPlaybackOptions): Promise<void> {
    const { audioEl, gainNode } = this.ensureGraph()
    return new Promise((resolve, reject) => {
      audioEl.onerror = () => reject(new Error(`no playable clip for "${request.key}"`))
      audioEl.src = `${import.meta.env.BASE_URL}audio/${request.key}.wav`
      if (gainNode) {
        gainNode.gain.value = options.volume
        audioEl.volume = 1
      } else {
        audioEl.volume = Math.min(1, options.volume)
      }
      audioEl.defaultPlaybackRate = options.rate
      audioEl.playbackRate = options.rate
      audioEl.preservesPitch = true
      // AudioContext starts 'suspended' until a user gesture resumes it —
      // speak() is always called from one (a click/tap), but resume() still
      // needs to run at least once per context.
      if (this.audioContext?.state === 'suspended') this.audioContext.resume()
      audioEl.play().then(resolve).catch(reject)
    })
  }
}
