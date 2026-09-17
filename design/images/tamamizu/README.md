# Tamamizu finalized reference sheets

The finalized mascot design, after `../character-concepts/` exploration settled on a look. ChatGPT-generated (2026-08-11/12), not Gemini like the concept phase.

- **`tamamizu-fullbody-reference.png`** — the base full-body reference pose. `public/mascot/normal.webp` is cropped from this.
- **`tamamizu-expression-sheet.png`** — a 2×2 bust sheet exploring facial expressions (smile / big laugh / surprised / downcast) beyond the base pose.
- **`tamamizu-pose-sheet.png`** — a 2×2 full-body sheet exploring poses/gestures (sitting, waving, startled, hands-together-happy).
- **`tamamizu-mood-labels-sheet.png`** — a 4-up sheet explicitly labeled ふつう/せいかい！/ふせいかい…/れんぞくせいかい！ (normal/correct/incorrect/streak). This is the direct source for all four `public/mascot/*.webp` mood crops.
- **`tamamizu-sitting.png`** — a standalone sitting pose (2026-08-23), background removed and converted to `public/guide/tamamizu-sitting.webp` for the Tamamizu Guide (see `src/components/IntroGuide.tsx`/`src/data/introGuide.ts`) — a different asset from the answer-feedback mood crops above; not used by `components/Mascot.tsx`.
- **`tamamizu-app-icon-approved.png`** — the human-approved Tamamizu app-icon composition (approved 2026-09-17), normalized to the 512×512 production master used for the PWA/app-icon asset family. Runtime variants live under `public/icons/`.
