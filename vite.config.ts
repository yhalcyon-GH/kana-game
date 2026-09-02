/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export const PWA_RUNTIME_CACHING = [
  {
    // Audio uses NetworkFirst, not CacheFirst — clips get
    // re-recorded/replaced under the SAME filenames from time to
    // time (unlike the image assets below), and CacheFirst has no
    // way to notice a same-URL file's content changed. NetworkFirst
    // always tries the network first (so a learner who's online
    // gets the newest recording on next play, no cache-name
    // versioning needed) and only falls back to whatever's already
    // cached when the network fails — which is also exactly what
    // makes upgrading safe: this targets the SAME 'kana-game-media'
    // cache name the image rule below uses (and that audio itself
    // used before it was briefly split into its own cache), so a
    // learner who already has clips cached there from an earlier
    // visit can still play them offline immediately after this
    // update, instead of hitting an empty new cache. See
    // workbox-expiration's CacheTimestampsModel: expiration
    // bookkeeping is keyed purely by cacheName, so sharing it here
    // with the image rule's identical maxEntries/maxAgeSeconds is
    // safe — it just means the entry budget below is shared across
    // audio+images, same as before audio ever had its own cache.
    urlPattern: ({ url }: { url: URL }) => /\/audio\//.test(url.pathname),
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'kana-game-media',
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  {
    urlPattern: ({ url }: { url: URL }) => /\/(word-icons|mascot|icons)\//.test(url.pathname),
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'kana-game-media',
      expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
]

// https://vite.dev/config/
export default defineConfig({
  base: '/kana-game/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kana Game',
        short_name: 'Kana Game',
        description: 'Learn hiragana one row at a time, paired with real everyday words.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell (JS/CSS/HTML/fonts) is precached on install —
        // deliberately excludes public/audio, word-icons, and mascot
        // (~6MB+ combined) so first load doesn't force a huge download.
        // Those are runtime-cached below instead, building up offline
        // coverage as the learner actually visits rows/plays words.
        globPatterns: ['**/*.{js,css,html,woff2,svg}'],
        runtimeCaching: PWA_RUNTIME_CACHING,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // Default excludes (node_modules, dist, ...) don't cover .claude/ —
    // without this, a leftover agent worktree under .claude/worktrees/
    // (see docs/2026-08-14-review-session.md) gets its own checked-out copy
    // of every *.test.ts file picked up and run a second time, silently
    // inflating the reported pass count with duplicates of old test code.
    // e2e/ holds the Playwright browser-smoke suite (Issue #177) — its specs
    // import `test`/`expect` from '@playwright/test', not 'vitest', and run
    // via `npm run e2e` against a real browser, never under this runner.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', '.worktrees/**', 'e2e/**'],
  },
})
