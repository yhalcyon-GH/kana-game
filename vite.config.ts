/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
        runtimeCaching: [
          {
            // Audio gets its OWN cache, separate from word-icons/mascot/icons
            // below — audio content gets re-recorded/replaced under the SAME
            // filenames from time to time (unlike the image assets), and
            // CacheFirst has no way to notice a same-URL file changed. A
            // dedicated cache name means bumping it (kana-game-audio-v2 ->
            // v3, ...) makes every learner fetch the new clips immediately
            // on next play, instead of some fraction of them keeping the old
            // recording for up to maxAgeSeconds. The old cache's entries
            // simply stop being referenced once this route ships (nothing
            // routes audio requests to it anymore) and age out on their own
            // via its own expiration policy — no explicit cache deletion
            // needed, and the image cache below is untouched either way.
            urlPattern: ({ url }) => /\/audio\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kana-game-audio-v2',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => /\/(word-icons|mascot|icons)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kana-game-media',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
  },
})
