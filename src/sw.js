/**
 * Service worker do Blip Vira Texto.
 *
 * 1. Precache dos assets (Workbox, sem roteamento automático).
 * 2. Navegações: REDE PRIMEIRO — sempre serve o index.html do build atual
 *    (o precache fica só para offline). Sem isso, um deploy novo deixa o
 *    HTML antigo referenciando chunks já apagados e a transcrição falha com
 *    "Failed to fetch dynamically imported module".
 * 3. Assets com hash: cache primeiro, senão rede.
 * 4. share_target: recebe o POST da folha "Compartilhar" do Android, guarda
 *    o áudio em Cache Storage e redireciona para /?share=1, onde a página
 *    lê e transcreve.
 *
 * Os nomes SHARE_CACHE/SHARE_KEY precisam bater com os do src/App.tsx.
 */
import { cleanupOutdatedCaches, precache } from 'workbox-precaching'

const SHARE_CACHE = 'blip-vira-texto/share-target'
const SHARE_KEY = '/__shared_audio__'

// Só baixa/atualiza o precache; o roteamento é manual (ver fetch abaixo).
precache(self.__WB_MANIFEST)
cleanupOutdatedCaches()

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

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Navegação: rede primeiro (HTML fresco a cada build), offline volta ao
  // index.html do precache.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cached = await caches.match('/index.html')
          if (cached) return cached
          return Response.error()
        }
      })(),
    )
    return
  }

  // Assets: cache primeiro (URLs têm hash), senão rede.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      return cached ?? (await fetch(request))
    })(),
  )
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
