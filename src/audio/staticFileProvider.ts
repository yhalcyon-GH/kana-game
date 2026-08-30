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
  // Bumped on every speak() call, so an in-flight request can tell whether
  // it's been superseded by a newer one sharing the same <audio> element
  // (e.g. React StrictMode's dev-only double effect invoke firing an
  // auto-play call twice on mount). Reassigning .src mid-play() aborts the
  // OLD play() promise — without this guard, that abort used to be treated
  // as "clip failed" and fall back to the Web Speech voice, which then
  // played on top of the new request's real clip: two different voices
  // audibly overlapping for the same character.
  private requestId = 0

  stop() {
    this.requestId++
    if (!this.audioEl) return
    this.audioEl.pause()
    this.audioEl.currentTime = 0
  }

  waitForEnd(): Promise<void> {
    if (!this.audioEl) return Promise.resolve()
    return new Promise((resolve) => {
      this.audioEl!.addEventListener('ended', () => resolve(), { once: true })
    })
  }

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
    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      // A superseded request (a newer speak() call already reassigned
      // .src) should just quietly resolve — not reject and trigger the
      // Web Speech fallback, which would play a different voice on top of
      // the newer request's own clip. See requestId's comment above.
      audioEl.onerror = () => {
        if (id !== this.requestId) {
          resolve()
          return
        }
        reject(new Error(`no playable clip for "${request.key}"`))
      }
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
      audioEl.play().then(resolve).catch((err) => {
        if (id !== this.requestId) {
          resolve()
          return
        }
        reject(err)
      })
    })
  }
}
