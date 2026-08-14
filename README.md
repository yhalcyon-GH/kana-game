# Kana Game

A hiragana-learning web app: one gojūon row at a time, paired with real everyday words, drilled through four graded mini-games plus free-form tracing practice. Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Zustand; deployed to GitHub Pages.

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
- Stroke-order animations use path data from the **KanjiVG** project (Copyright © 2009/2010/2011 Ulrich Apel), licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). See the in-app About page for full attribution.
