# Blip Vira Texto 🎙️➡️📝

Transforma voz em texto — **no seu dispositivo, de graça e sem servidor**.
Inspirado no bot *Blip Vira Texto* (+55 31 7228-0540), mas sem depender de
terceiros: aqui quem transcreve é o seu próprio navegador.

App **PWA**: abre no navegador e pode ser **instalado no celular** (Android e
iOS) como app de tela cheia.

## Dois modos de entrada

### 🎤 Falar ao vivo
Você fala no microfone e o texto aparece em tempo real (Web Speech API nativa —
sem chave, sem custo, sem IA de terceiros). Ideal para ditar respostas e colar
no WhatsApp.

### 📁 Áudio do WhatsApp
Você pega o áudio da conversa e **solta aqui** (ou escolhe o arquivo) — o app
transcreve com **Whisper local** (roda em WebAssembly no próprio navegador) e
joga o texto no editor, pronto para copiar/compartilhar.

**Como pegar o áudio:**

| Onde | Caminho |
|---|---|
| WhatsApp Web / Computador | menu ⋮ do áudio → **Baixar** (ou Exportar conversa → ZIP) |
| Android | segure o áudio → **Compartilhar** → *Encaminhar como arquivo* → salve em Arquivos |
| iPhone | segure o áudio → **Encaminhar** → salve em Arquivos/Drive |

Formatos aceitos: `.opus`/`.ogg` (padrão do WhatsApp), além de mp3, m4a, wav,
webm. No iPhone/Safari o `.ogg` é lido por um decoder WASM embutido.

### 📲 Compartilhar direto (Android)

Com o **app instalado** no Android, o fluxo fica igual ao do Blip — sem baixar
nada:

> WhatsApp → segure o áudio → **Compartilhar** → **ViraTexto** → ele abre e
> já transcreve.

Isso funciona via `share_target` no manifesto + service worker: o sistema manda
o arquivo por POST, o worker guarda e o app lê ao abrir. **Restrições:**

- **iPhone**: o Safari ainda não suporta `share_target` (bug do WebKit
  194593) → use *Encaminhar como arquivo* → salvar → abrir o app e escolher;
- **PC (WhatsApp Web)**: não existe folha de compartilhamento do sistema para
  sites → baixe o áudio e arraste para a janela (ou Ctrl+V).

> O Whisper **não sai do seu dispositivo**: o modelo (~40 MB) é baixado uma vez
> do Hugging Face, fica cacheado no navegador e as inferências são locais.
> No celular a primeira vez pode demorar um pouco mais — modelos "Rápido" e
> "Melhor qualidade" são trocáveis no app.

## Rodando

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm run build      # gera dist/ (com service worker)
npm run preview    # serve o build em http://localhost:4173
```

O microfone exige `http://localhost` ou **HTTPS** (regra do navegador).

## Scripts

```bash
npm run icons   # regenera os PNGs do ícone a partir do SVG
npm run smoke   # teste de integração no Chrome headless (requer preview rodando)
npm run lint    # oxlint
```

## Recursos

- Transcrição ao vivo com trecho "ao vivo" (interim) e religação automática
  após silêncio;
- Transcrição de arquivos de áudio com Whisper local (decode + inferência no
  navegador, modelo em cache);
- Texto **editável**, com **Melhorar texto** (regras puras: remove repetições,
  ajusta pontuação e maiúsculas — sem IA);
- **Histórico** em localStorage com copiar / usar / compartilhar / excluir e
  exportação `.txt`;
- **Compartilhar** nativo (Web Share API) e botão **Instalar app**;
- Idiomas: pt-BR, pt-PT, en, es, fr, it, de;
- **Offline** depois da primeira visita (interface e modelo cacheados).

## Estrutura

```
src/
├── App.tsx                        # abas de modo, ações, integração
├── hooks/
│   ├── useSpeechRecognition.ts    # Web Speech API: ciclo de vida, restart, erros
│   ├── useAudioTranscription.ts   # Whisper local: pipeline, download, progresso
│   ├── useTranscriptHistory.ts    # histórico em localStorage
│   └── usePWAInstall.ts           # botão instalar (beforeinstallprompt)
├── lib/
│   ├── audio.ts                   # decode ogg/opus/wav → mono 16 kHz
│   ├── speech.ts                  # idiomas, suporte, mensagens de erro
│   ├── text.ts                    # regras de pós-processamento (sem IA)
│   └── time.ts                    # "há 5 min"
├── sw.js                          # service worker: offline + share_target
├── components/                    # RecordButton, LiveTranscript, AudioDropzone…
└── types.ts                       # tipos da Web Speech API (não estão no lib.dom)
```

## Navegadores

- **Modo ao vivo** (Web Speech API): Chrome, Edge, Safari (desktop/iOS ≥ 14.5) e
  navegadores Chrome no Android. Firefox não tem — o app avisa e permite digitar.
- **Modo arquivo** (Whisper): qualquer navegador moderno com WebAssembly
  (Chrome, Edge, Firefox, Safari).

## Deploy

Qualquer host estático (Netlify, Vercel, GitHub Pages, Cloudflare Pages):
`npm run build` e publique `dist/`. Microfone exige HTTPS em domínio próprio.

Para o Whisper rodar com **mais threads** (transcrição mais rápida), configure
os mesmos headers usados no `vite.config.ts`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Sem esses headers tudo funciona, só cai para um thread (mais lento).

## Limitações

- Áudio sem fala (silêncio) volta com aviso — sem texto para adicionar;
- Modelos muito pequenos erram nomes próprios e termos técnicos: use o modelo
  "Melhor qualidade" quando a precisão importar;
- No Android o fluxo é *Compartilhar → transcreve*; no iPhone e no PC é
  *salvar → escolher/arrastar* (limitação do navegador, não do app);
- Para receber o áudio **dentro** do WhatsApp sem compartilhar nada (estilo
  bot que responde sozinho), seria preciso um bot de WhatsApp — fora do
  escopo deste PWA.
