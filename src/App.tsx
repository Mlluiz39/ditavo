import { Icon } from './components/Icon'
import { countWords } from './lib/text'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioDropzone } from './components/AudioDropzone'
import { HistoryList } from './components/HistoryList'
import { LiveTranscript } from './components/LiveTranscript'
import { RecordButton } from './components/RecordButton'
import { useAudioTranscription } from './hooks/useAudioTranscription'
import { usePWAInstall } from './hooks/usePWAInstall'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useTranscriptHistory } from './hooks/useTranscriptHistory'
import { isAudioLike, whisperLanguageFor } from './lib/audio'
import { LANGUAGES } from './lib/speech'
import { polishText } from './lib/text'
import type { HistoryItem } from './types'

type InputMode = 'live' | 'file'

/** Texto que "parece" caminho/nome de arquivo de áudio colado do gerenciador. */
const AUDIO_FILE_TEXT = /\b[\w./\\~-]+\.(opus|ogg|oga|mp4|m4a|aac|mp3|wav|webm|amr|flac)\b/i

/** Erro de chunk de JS antigo (deploy novo apagou o arquivo que o HTML
 *  antigo referenciava) — o remédio é recarregar uma vez. */
const STALE_ASSET_RE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const RELOAD_GUARD_KEY = 'blip-vira-texto/recarregou'
/** Rascunho do editor: sobrevive a recargas (automáticas ou do usuário). */
const DRAFT_KEY = 'blip-vira-texto/rascunho'

export default function App() {
  const speech = useSpeechRecognition()
  const history = useTranscriptHistory()
  const audio = useAudioTranscription()
  const { canInstall, install } = usePWAInstall()

  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [mode, setMode] = useState<InputMode>('live')
  const [elapsed, setElapsed] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [largeText, setLargeText] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!speech.listening) return
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [speech.listening])

  // Persiste o rascunho (debounce): uma recarga — inclusive a automática
  // pós-deploy — não pode perder o texto que o usuário já tem na tela.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, text)
      } catch {
        // Armazenamento indisponível: segue sem rascunho.
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text])

  /** Texto que o editor tinha quando a gravação atual começou. */
  const baseRef = useRef('')
  /** O usuário editou o texto nesta sessão? Se sim, não sobrescrever. */
  const editedRef = useRef(false)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Transcrição do hook → editor (a não ser que a pessoa tenha editado à mão).
  useEffect(() => {
    if (editedRef.current) return
    const base = baseRef.current
    const live = speech.transcript
    if (!base && !live) return
    const joined =
      base && live ? (/\s$/.test(base) ? `${base}${live}` : `${base} ${live}`) : base || live
    setText(joined)
  }, [speech.transcript])

  const handleToggle = () => {
    if (!speech.supported) return
    if (speech.active) {
      speech.stop()
      return
    }
    setElapsed(0)
    baseRef.current = text
    editedRef.current = false
    speech.start()
  }

  const { active: speechActive, stop: speechStop } = speech
  const switchMode = useCallback(
    (next: InputMode) => {
      if (next === mode) return
      // Não ficar com o microfone aberto escondido atrás da aba de arquivo.
      if (next === 'file' && speechActive) speechStop()
      setMode(next)
    },
    [mode, speechActive, speechStop],
  )

  /** Transcreve e anexa ao texto. 'recarregando' = deu erro de asset velho
   *  e a página vai recarregar (quem chama decide se apaga o arquivo). */
  const handleAudioFile = useCallback(
    async (file: File): Promise<'ok' | 'falha' | 'recarregando'> => {
      if (!isAudioLike(file)) {
        showToast('Isso não parece um arquivo de áudio')
        return 'falha'
      }
      try {
        const transcribed = await audio.transcribe(file, whisperLanguageFor(speech.lang))
        if (!transcribed) {
          showToast('Áudio lido, mas não encontrei fala nele')
          return 'falha'
        }
        editedRef.current = true
        setText((current) =>
          current.trim() ? `${current.trimEnd()}\n\n${transcribed}` : transcribed,
        )
        sessionStorage.removeItem(RELOAD_GUARD_KEY)
        showToast('Áudio transcrito e adicionado ao texto!')
        return 'ok'
      } catch (err) {
        // Chunk antigo logo após um deploy: recarrega uma vez e tenta de novo
        // (a página recarregada já recebe os arquivos novos do service worker).
        if (
          err instanceof Error &&
          STALE_ASSET_RE.test(err.message) &&
          !sessionStorage.getItem(RELOAD_GUARD_KEY)
        ) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
          showToast('Atualizando os arquivos do app…')
          window.location.reload()
          return 'recarregando'
        }
        showToast(
          err instanceof Error && err.message ? err.message : 'Erro ao transcrever o áudio',
        )
        return 'falha'
      }
    },
    [audio, speech.lang, showToast],
  )

  // Colar (Ctrl+V):
  // - arquivo de verdade no clipboard → transcreve (em qualquer aba);
  // - caminho de arquivo vindo do gerenciador de arquivos → o navegador não
  //   deixa abrir por segurança, então mostramos a orientação certa em vez
  //   de poluir o texto com o caminho.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0]
      if (file) {
        event.preventDefault()
        if (mode !== 'file') switchMode('file')
        void handleAudioFile(file)
        return
      }
      const text = (event.clipboardData?.getData('text') ?? '').trim()
      if (text && AUDIO_FILE_TEXT.test(text)) {
        event.preventDefault()
        showToast(
          'Isso é o caminho de um arquivo, não o arquivo — o navegador não abre caminhos colados. Arraste o arquivo da pasta para dentro desta janela, ou use 📁 → Escolher arquivo.',
        )
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [mode, switchMode, handleAudioFile, showToast])

  // Arquivo vindo da folha "Compartilhar" do celular (share_target).
  // O service worker guardou o áudio e redirecionou para /?share=1.
  // Importante: roda UMA vez (guard por ref) e não é cancelado no meio por
  // re-renders — senão o cache é apagado sem chegar a transcrever. Também
  // consome um arquivo "órfão" deixado por uma navegação interrompida.
  const shareHandledRef = useRef(false)
  useEffect(() => {
    if (shareHandledRef.current) return
    shareHandledRef.current = true

    const hasShareParam = new URLSearchParams(window.location.search).get('share') === '1'
    if (hasShareParam) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    void (async () => {
      try {
        // Espelha SHARE_CACHE/SHARE_KEY de src/sw.js
        const cache = await caches.open('blip-vira-texto/share-target')
        const response = await cache.match('/__shared_audio__')
        if (response) {
          const blob = await response.blob()
          const rawName = response.headers.get('X-File-Name')
          const name = rawName ? decodeURIComponent(rawName) : 'audio'
          const file = new File([blob], name, { type: blob.type })
          setMode('file')
          const result = await handleAudioFile(file)
          // Só apaga depois: se houver recarga (asset velho), o arquivo fica
          // no cache e a página nova retoma a transcrição sozinha.
          if (result !== 'recarregando') {
            await cache.delete('/__shared_audio__')
          }
        } else if (hasShareParam) {
          showToast('Não recebi o arquivo compartilhado')
        }
      } catch {
        if (hasShareParam) showToast('Não consegui abrir o arquivo compartilhado')
      }
    })()
  }, [handleAudioFile, showToast])

  const handleTextChange = (value: string) => {
    editedRef.current = true
    setText(value)
  }

  const copyToClipboard = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fallback para contextos sem permissão de clipboard assíncrono.
      try {
        const helper = document.createElement('textarea')
        helper.value = value
        helper.setAttribute('readonly', '')
        helper.style.position = 'fixed'
        helper.style.opacity = '0'
        document.body.appendChild(helper)
        helper.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(helper)
        return ok
      } catch {
        return false
      }
    }
  }

  const handleCopy = async (value: string) => {
    if (!value.trim()) {
      showToast('Nada para copiar ainda')
      return
    }
    const ok = await copyToClipboard(value)
    showToast(ok ? 'Copiado!' : 'Não consegui copiar o texto')
  }

  const handleShare = async (value: string) => {
    const content = value.trim()
    if (!content) {
      showToast('Nada para compartilhar ainda')
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ditavo', text: content })
        return
      } catch (err) {
        // Cancelado pelo usuário: não faz nada.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    const ok = await copyToClipboard(content)
    showToast(ok ? 'Compartilhamento indisponível — texto copiado!' : 'Não consegui compartilhar')
  }

  const handleSave = () => {
    const saved = history.add(text, speech.lang)
    showToast(saved ? 'Salvo no histórico' : 'Nada novo para salvar')
  }

  const handlePolish = () => {
    if (!text.trim()) {
      showToast('Nada para melhorar ainda')
      return
    }
    const polished = polishText(text)
    if (polished === text) {
      showToast('O texto já está limpo')
      return
    }
    editedRef.current = true
    setText(polished)
    showToast('Regras aplicadas: repetições fora, pontuação ajustada')
  }

  const handleClear = () => {
    baseRef.current = ''
    editedRef.current = false
    speech.reset()
    setText('')
    showToast('Tudo limpo')
  }

  const handleRestore = (item: HistoryItem) => {
    editedRef.current = true
    baseRef.current = ''
    setText(item.text)
    showToast('Texto carregado no editor')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDownloadAll = () => {
    if (history.items.length === 0) return
    const content = history.items
      .map(
        (item) =>
          `[${new Date(item.createdAt).toLocaleString('pt-BR')}] (${item.lang})\n${item.text}`,
      )
      .join('\n\n---\n\n')
    const blob = new Blob([`${content}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ditavo-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showToast('Arquivo .txt baixado')
  }

  const handleInstall = async () => {
    const result = await install()
    if (result === 'accepted') showToast('App instalado!')
  }

  const statusHint = !speech.supported
    ? 'Ditado indisponível neste navegador — você ainda pode digitar'
    : speech.listening
      ? 'Ouvindo… fale agora'
      : speech.active
        ? 'Aguardando o microfone…'
        : 'Pronto: toque para falar'

  const hasText = text.trim().length > 0

  return (
    <div className="app">

      <header className="topbar">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">d.</span>
          <div className="brand__text">
            <strong>ditavo</strong>
            <span><i className={`status-dot${speech.listening ? ' is-live' : ''}`} />{speech.listening ? 'Microfone ativo' : 'Da voz ao papel.'}</span>
          </div>
        </div>

        <div className="topbar__actions">
          <label className="lang-select">
            <span className="lang-select__label">Idioma</span>
            <select
              value={speech.lang}
              onChange={(event) => speech.setLang(event.target.value)}
              aria-label="Idioma do reconhecimento de voz"
            >
              {LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {canInstall ? (
            <button type="button" className="btn btn--accent" onClick={handleInstall}>
              Instalar app
            </button>
          ) : null}
        </div>
      </header>

      <main className="main">
        <div className="session-meta" aria-label="Informações da transcrição">
          <span className="session-meta__time">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
          <span>{countWords(text)} palavras</span>
          <span className="session-meta__mode">{mode === 'live' ? 'Ditado ao vivo' : 'Arquivo de áudio'}</span>
        </div>
        <nav className="mode-tabs" role="tablist" aria-label="Modo de entrada">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'live'}
            className={`mode-tab${mode === 'live' ? ' is-active' : ''}`}
            onClick={() => switchMode('live')}
          >
            <span className="mode-tab__number" aria-hidden="true">01</span> Falar agora
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'file'}
            className={`mode-tab${mode === 'file' ? ' is-active' : ''}`}
            onClick={() => switchMode('file')}
          >
            <span className="mode-tab__number" aria-hidden="true">02</span> Importar áudio
          </button>
        </nav>

        {mode === 'live' && !speech.supported ? (
          <div className="banner" role="alert">
            <strong>Este navegador não tem ditado nativo (Web Speech API).</strong>
            Abra no Chrome, Edge ou Safari para falar. Por aqui você pode digitar e
            editar o texto normalmente — e a aba <em>Importar áudio</em> funciona
            mesmo assim.
          </div>
        ) : null}

        <LiveTranscript
          text={text}
          interim={speech.interim}
          listening={speech.listening}
          largeText={largeText}
          onChange={handleTextChange}
          onPolish={handlePolish}
          onCopy={() => handleCopy(text)}
          onShare={() => handleShare(text)}
          onClear={handleClear}
          onFontToggle={() => setLargeText(value => !value)}
        />

        {mode === 'file' ? (
          <AudioDropzone
            state={audio.state}
            model={audio.model}
            busy={['decoding', 'loading-model', 'downloading', 'transcribing'].includes(audio.state.phase)}
            onModelChange={audio.setModel}
            onFile={(file) => void handleAudioFile(file)}
          />
        ) : (
          <div className={`capture-status${speech.listening ? ' is-live' : ''}`}>
            <div className="capture-status__head"><span>Microfone</span><span aria-live="polite">{statusHint}</span></div>
            <div className="capture-status__bars" aria-hidden="true">
              {Array.from({ length: 40 }, (_, index) => <i key={index} style={{ animationDelay: `${index % 7 * .13}s` }} />)}
            </div>
          </div>
        )}
        {speech.error && mode === 'live' ? <p className="record-area__error" role="alert">{speech.error}</p> : null}

        <button type="button" className="history-toggle" aria-expanded={showHistory} onClick={() => setShowHistory(value => !value)}>
          <Icon name="history" /> Textos salvos <span>{history.items.length}</span><span className="history-toggle__arrow">{showHistory ? '−' : '+'}</span>
        </button>
        {showHistory ? (
        <HistoryList
          items={history.items}
          onRestore={handleRestore}
          onCopy={handleCopy}
          onShare={handleShare}
          onRemove={history.remove}
          onClearAll={() => {
            history.clear()
            showToast('Histórico apagado')
          }}
          onDownloadAll={handleDownloadAll}
        />
        ) : null}
      </main>

      <footer className="record-dock" aria-label="Controles de gravação">
        <div className="record-dock__inner">
          <div className="record-dock__side">
            <button type="button" className="dock-action" onClick={() => switchMode(mode === 'file' ? 'live' : 'file')}><span><Icon name={mode === 'file' ? 'edit' : 'folder'} /></span>{mode === 'file' ? 'Ditado' : 'Importar'}</button>
            <button type="button" className="dock-action" disabled={!speech.supported || mode === 'file'} onClick={handleToggle}><span><Icon name={speech.active ? 'pause' : 'play'} /></span>{speech.active ? 'Pausar' : 'Retomar'}</button>
          </div>
          <div className="record-area">
            <RecordButton listening={speech.active} disabled={!speech.supported || mode === 'file'} onToggle={handleToggle} />
          </div>
          <div className="record-dock__side record-dock__side--end">
            <button type="button" className="dock-action" disabled={!hasText} onClick={handleSave}><span><Icon name="save" /></span>Salvar</button>
          </div>
        </div>
      </footer>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
