/**
 * Service worker do Blip Vira Texto.
 *
 * 1. Cache offline dos assets (precache do Workbox).
 * 2. Recebe o arquivo enviado pela folha "Compartilhar" do Android
 *    (share_target POST), guarda em Cache Storage e redireciona o app
 *    para /?share=1, onde a página lê e transcreve.
 *
 * Os nomes SHARE_CACHE/SHARE_KEY precisam bater com os do src/App.tsx.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'

const SHARE_CACHE = 'blip-vira-texto/share-target'
const SHARE_KEY = '/__shared_audio__'

// Conserta o precache e serve o index.html para SPA offline.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
const pageHandler = createHandlerBoundToURL('/index.html')

self.skipWaiting()
self.clients.claim()

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // share_target: POST do sistema operacional com o arquivo de áudio.
  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    (url.pathname === '/' || url.pathname === '/index.html')
  ) {
    event.respondWith(handleSharedFile(request))
    return
  }

  // Navegação com query (?share=1) não casa com o precache: tenta a rede
  // e, se estiver offline, cai no index.html. Navegações sem query são
  // resolvidas pelo precache (não respondemos para não conflitar).
  if (request.mode === 'navigate' && url.search) {
    event.respondWith(fetch(request).catch(() => pageHandler(event)))
  }
})

async function handleSharedFile(request) {
  try {
    const form = await request.formData()
    const file = form.get('audio')
    if (file && typeof file === 'object' && 'size' in file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE)
      const headers = new Headers()
      headers.set('Content-Type', file.type || 'application/octet-stream')
      // encodeURIComponent garante cabeçalho ASCII (nomes com acento).
      headers.set('X-File-Name', encodeURIComponent(file.name || 'audio'))
      await cache.put(SHARE_KEY, new Response(file, { headers }))
    }
  } catch {
    // Form inválido ou vazio: o app avisa que não recebeu nada.
  }
  // 303 → o navegador refaz como GET e a página inicia em modo arquivo.
  return Response.redirect(new URL('/?share=1', self.location.origin).href, 303)
}
