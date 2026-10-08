import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Blip Vira Texto',
        short_name: 'ViraTexto',
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
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
