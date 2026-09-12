import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` matters for GitHub Pages project sites (served from /<repo>/).
// Set VITE_BASE=/Financial-app/ in the deploy workflow; defaults to '/' locally.
const previewOnly = process.env.VITE_PREVIEW_ONLY === '1';

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    // A sandboxed preview host can't register a service worker, and offline
    // caching there would only serve a stale copy of a throwaway link.
    ...(previewOnly ? [] : [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Ledgerly — Household Finance',
        short_name: 'Ledgerly',
        description: 'A fast, shared view of your card transactions, backed by Google Sheets.',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Apps Script endpoint is never cached — stale money is worse than no money.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
    ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: mode !== 'production',
  },
}));
