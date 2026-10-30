import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'icons.svg', 'apple-touch-icon.png', 'weightogo.jpg', 'logo.jpg'],
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
            src: 'weightogo.jpg',
            sizes: '512x512',
            type: 'image/jpeg',
          },
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
          // These dashboard queries have their own user-scoped IndexedDB
          // snapshots and Redis-backed revalidation. Avoid returning a
          // service-worker response that the React query cannot observe
          // being refreshed in the background.
          {
            urlPattern: /\/api\/(reports\/(trends|barangay-comparison)|barangays)(\/|\?|$)/,
            handler: 'NetworkOnly',
            method: 'GET',
          },
          // Authenticated API responses must not use a URL-only shared cache:
          // separate tabs can carry different per-tab bearer tokens. Offline
          // reads use the user-scoped IndexedDB cache in the frontend instead.
          {
            urlPattern: /\/api\/(children|assessments|supplements|reports|barangays)(\/|\?|$)/,
            handler: 'NetworkOnly',
            method: 'GET',
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
                name: `wtg-mutations-${method.toLowerCase()}`,
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
