// Every tunable knob for the pipeline lives here. If a processed clip sounds
// wrong, turn things DOWN here first rather than reaching for a stronger
// algorithm — see the project brief this tool was built from: "弱くする"
// before "強くする".
export const CONFIG = {
  segmentation: {
    // RMS analysis window for the speech/silence envelope.
    windowMs: 8,
    hopMs: 4,
    // Noise floor is estimated from the Nth percentile of the whole
    // envelope (assumes most of the recording is silence between syllables).
    floorPercentile: 15,
    // Hysteresis thresholds, both expressed as dB ABOVE the estimated
    // floor (relative, not absolute — adapts to mic gain per session).
    enterThresholdDb: 12,
    exitThresholdDb: 6,
    // Minimum sustained duration for a threshold crossing to count, so a
    // brief dip inside one syllable (e.g. devoiced す) isn't treated as a
    // real gap, and a single-sample spike isn't treated as speech onset.
    minSpeechMs: 25,
    minSilenceMs: 150,
    // Segments separated by less silence than this get merged into one
    // (guards against one syllable being split into two pieces).
    mergeGapMs: 120,
    // Asymmetric margins added around each detected core segment — short
    // before (attack matters less to preserve), longer after (vowel
    // release/resonance tail matters more — see project brief).
    preMarginMs: 60,
    postMarginMs: 150,
  },
  clickRepair: {
    enabled: true,
    // A click candidate is a very short, sharp, isolated amplitude spike
    // inside the margin region (never inside the core segment).
    maxDurationMs: 15,
    // Spike must be at least this many dB above the local margin baseline
    // to be treated as a click rather than normal texture.
    minProminenceDb: 18,
  },
  breathAttenuation: {
    enabled: true,
    // A breath candidate is a longer, broadband hump in the margin region,
    // below the speech threshold but above the noise floor.
    minDurationMs: 150,
    maxDurationMs: 600,
    // How much to pull the identified breath hump down — a reduction, not
    // a mute, so natural breathing texture survives.
    attenuationDb: 8,
  },
  environmentNoise: {
    // Only run ffmpeg's afftdn at all if the measured floor exceeds this
    // (i.e. skip entirely for an already-quiet recording).
    floorThresholdDbfs: -50,
    // Conservative afftdn reduction amount (dB) — afftdn's own max is much
    // higher; deliberately staying well below it.
    reductionDb: 10,
  },
  loudness: {
    // Matches scripts/normalizeAudioVolume.mjs's existing target so new
    // recordings sit at the same perceived loudness as the rest of the
    // shipped catalog.
    integratedLufs: -16,
    truePeakDb: -1.5,
    loudnessRangeLu: 11,
    limiterCeiling: 0.97,
    outputSampleRateHz: 24000,
  },
} as const
