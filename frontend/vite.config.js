import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'apple-touch-icon.png'],
      // Enable the SW in `npm run dev` so the install prompt can fire on
      // localhost during development (production builds are unaffected).
      // suppressWarnings silences the dev-only "glob patterns don't match
      // any files" notice for the empty dev-dist/ precache folder.
      devOptions: { enabled: true, suppressWarnings: true, type: 'module' },
      manifest: {
        name: 'WeighToGo',
        short_name: 'WeighToGo',
        description: 'Barangay child growth monitoring — masterlists, checkups, supplements, and reports.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f5f6f7',
        theme_color: '#20483a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          // Auth/session + AI must never be served from any cache — explicit
          // NetworkOnly first so a future-broadened pattern below can't
          // accidentally capture them. (Non-GET methods never match the
          // GET-only patterns anyway; this is belt-and-braces.)
          {
            urlPattern: /\/api\/(users|ai)(\/|\?|$)/,
            handler: 'NetworkOnly',
          },
          // The rev-check itself must always hit the network — a stale
          // revision snapshot would freeze rev-gated pages on old data.
          {
            urlPattern: /\/api\/reports\/sync-status(\/|\?|$)/,
            handler: 'NetworkOnly',
          },
          // Cacheable read endpoints — mirrors the backend Redis allowlist
          // (children, assessments, supplements, reports, barangays). Fresh
          // data renders instantly from cache, then revalidates in the
          // background. Responses carry `Cache-Control: no-store` for the
          // browser HTTP cache, but the Cache Storage API doesn't enforce
          // that directive — this explicit runtime rule is the offline layer.
          {
            urlPattern: /\/api\/(children|assessments|supplements|reports|barangays)(\/|\?|$)/,
            handler: 'StaleWhileRevalidate',
            method: 'GET',
            options: {
              cacheName: 'wtg-api-v1',
              expiration: { maxEntries: 200, maxAgeSeconds: 600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // Safety net: failed mutations queue inside the SW and replay on
          // reconnect (deduped server-side by Idempotency-Key, so a race
          // with the page's own outbox flush can never double-create).
          // Registered AFTER the GET-only SWR rule so reads never land here.
          // NOTE: workbox defaults an unspecified method to GET, so each
          // mutating method needs its own entry.
          ...["POST", "PATCH", "DELETE"].map((method) => ({
            urlPattern: /\/api\/(children|assessments|supplements|reports)(\/|\?|$)/,
            handler: "NetworkOnly",
            method,
            options: {
              backgroundSync: {
                name: "wtg-mutations",
                options: { maxRetentionTime: 24 * 60 },
              },
            },
          })),
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
