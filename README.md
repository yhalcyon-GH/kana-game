# Kana Game

A kana-learning web app (hiragana and katakana): one gojūon row at a time, paired with real everyday words, drilled through four graded mini-games plus free-form tracing practice. Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand; deployed to GitHub Pages.

For architecture, data model, and development guidance, see [CLAUDE.md](./CLAUDE.md) — it's written for both human and AI contributors and is the fastest way to get oriented.

## Quick start

```
npm install
npm run dev      # dev server
npm run build    # type-check + production build
npm run lint      # oxlint
npm test          # vitest
```

## Credits

- Character/word pronunciation and the mascot's in-game reactions are generated with **ElevenLabs**.
- Stroke-order animations use path data converted from the [strokesvg](https://github.com/zhengkyl/strokesvg) project's kana SVGs, derived from the **Klee One** font (Copyright 2020 The Klee Project Authors), licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/). See the in-app About page and `vendor/strokesvg/PROVENANCE.md` for full attribution.
