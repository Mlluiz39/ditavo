# Blip Vira Texto 🎙️➡️📝

Fale e receba o texto. App de **transcrição de voz ao vivo** (estilo "áudio vira texto")
que roda **100% no seu dispositivo**, sem servidor, sem conta e sem API paga.

Construído como **PWA**: abre no navegador e também pode ser **instalado no celular
(Android e iOS)** como app de tela cheia.

## Como funciona

| Parte | Tecnologia |
|---|---|
| Reconhecimento de voz | **Web Speech API** nativa do navegador (grátis, sem chave) |
| Interface | React 19 + Vite 8 + TypeScript |
| PWA (instalável + offline) | vite-plugin-pwa (service worker + manifest) |
| Persistência | `localStorage` (histórico fica no dispositivo) |
| "Melhorar texto" | Regras puras de pós-processamento — **sem IA** |

Nenhum áudio sai do seu aparelho: quem transcreve é o próprio navegador
(Chrome/Edge usam o serviço de voz deles; no celular, o reconhecedor do sistema).

## Rodando

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm run build      # gera dist/ (com service worker)
npm run preview    # serve o build em http://localhost:4173
```

Para falar pelo microfone é preciso `http://localhost` ou **HTTPS** (regra do navegador).

## Scripts úteis

```bash
npm run icons   # regenera os PNGs do ícone a partir do SVG
npm run smoke   # teste de integração no Chrome headless (requer preview rodando)
npm run lint    # oxlint
```

## Funcionalidades

- **Gravação contínua** com transcrição ao vivo (palavras ainda não confirmadas
  aparecem em itálico com a etiqueta "ao vivo");
- Se o navegador parar de ouvir por silêncio, ele **religa sozinho**;
- Texto **editável** durante e depois da transcrição;
- **Melhorar texto**: regras locais que removem repetições ("eu eu vou" → "eu vou"),
  colapsam pontuação duplicada e capitalizam frases;
- **Histórico** salvo no dispositivo com copiar / usar / compartilhar / excluir,
  e exportação em `.txt`;
- **Compartilhar** usa a Web Share API (no celular abre a folha de compartilhamento
  nativa; no desktop, cai para copiar);
- Seletor de idioma (pt-BR, pt-PT, en, es, fr, it, de);
- Botão **Instalar app** quando o navegador oferece;
- Funciona **offline** depois da primeira visita (o que já foi cacheado).

## Estrutura

```
src/
├── App.tsx                        # composição, ações (copiar/salvar/compartilhar)
├── hooks/
│   ├── useSpeechRecognition.ts    # Web Speech API: ciclo de vida, restart, erros
│   ├── useTranscriptHistory.ts    # histórico em localStorage
│   └── usePWAInstall.ts           # botão instalar (beforeinstallprompt)
├── lib/
│   ├── speech.ts                  # idiomas, suporte, mensagens de erro
│   ├── text.ts                    # regras de pós-processamento (sem IA)
│   └── time.ts                    # "há 5 min"
├── components/                    # RecordButton, LiveTranscript, HistoryList
└── types.ts                       # tipos da Web Speech API (não estão no lib.dom)
```

## Navegadores suportados

Web Speech API: **Chrome**, **Edge**, **Safari** (desktop e iOS ≥ 14.5) e
navegadores **baseados no Chrome** no Android. Firefox desktop não suporta —
o app detecta e mostra um aviso, permitindo digitação manual.

## Deploy

Qualquer host estático (Netlify, Vercel, GitHub Pages, Cloudflare Pages):
faça `npm run build` e publique a pasta `dist/`. É obrigatório HTTPS em domínio
próprio para o microfone funcionar.
