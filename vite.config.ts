import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/

// crossOriginIsolated libera SharedArrayBuffer → o Whisper (WASM) roda com
// vários threads e transcreve bem mais rápido. Só afeta dev/preview: em
// produção, configure os mesmos headers no seu host (ver README).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Service worker customizado: além do cache offline, ele recebe o
      // POST do share_target (folha "Compartilhar" do Android).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'ditavo',
        short_name: 'ditavo',
        description:
          'Fale e receba o texto. Transcrição de voz ao vivo, grátis e no seu dispositivo.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#070b14',
        theme_color: '#070b14',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // WhatsApp (Android) → Compartilhar → ditavo: o SO manda o
        // arquivo via POST e o service worker entrega ao app.
        share_target: {
          action: '/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'audio',
                accept: [
                  'audio/*',
                  'application/ogg',
                  '.opus',
                  '.ogg',
                  '.oga',
                  '.mp4',
                  '.m4a',
                  '.mp3',
                  '.wav',
                  '.webm',
                ],
              },
            ],
          },
        },
      },
    }),
  ],
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
})
