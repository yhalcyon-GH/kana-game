// Deterministic serialization + SHA-256 hash of the FULL ACCENT_PATTERNS
// table, used by scripts/checkAccentData.mjs to detect ANY change to the
// approved 298-entry pitch-accent baseline — a changed value, a renamed id,
// or an added/removed entry all change this hash. See
// docs/pitch-accent-provenance.md for what this baseline is and how it was
// approved.
//
// Both the checker and the one-off "what's the current hash" computation
// (used only when a human-reviewed, intentional change to accents.ts needs
// a new baseline recorded) import this same function, so there is no way
// for the two to drift apart from each other.
import crypto from 'node:crypto'

// Sorted by id so the hash doesn't depend on the source file's own
// (also currently sorted, but not contractually guaranteed) key order.
export function serializeAccentTable(accents) {
  return Object.keys(accents)
    .sort()
    .map((id) => `${id}:${accents[id]}`)
    .join('|')
}

export function hashAccentTable(accents) {
  return crypto.createHash('sha256').update(serializeAccentTable(accents), 'utf8').digest('hex')
}
