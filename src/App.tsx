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

export default function App() {
  const speech = useSpeechRecognition()
  const history = useTranscriptHistory()
  const audio = useAudioTranscription()
  const { canInstall, install } = usePWAInstall()

  const [text, setText] = useState('')
  const [mode, setMode] = useState<InputMode>('live')
  const [toast, setToast] = useState<string | null>(null)

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
    baseRef.current = text
    editedRef.current = false
    speech.start()
  }

  const switchMode = (next: InputMode) => {
    if (next === mode) return
    // Não ficar com o microfone aberto escondido atrás da aba de arquivo.
    if (next === 'file' && speech.active) speech.stop()
    setMode(next)
  }

  const handleAudioFile = useCallback(
    async (file: File) => {
      if (!isAudioLike(file)) {
        showToast('Isso não parece um arquivo de áudio')
        return
      }
      try {
        const transcribed = await audio.transcribe(file, whisperLanguageFor(speech.lang))
        if (!transcribed) {
          showToast('Áudio lido, mas não encontrei fala nele')
          return
        }
        editedRef.current = true
        setText((current) =>
          current.trim() ? `${current.trimEnd()}\n\n${transcribed}` : transcribed,
        )
        showToast('Áudio transcrito e adicionado ao texto!')
      } catch (err) {
        showToast(
          err instanceof Error && err.message ? err.message : 'Erro ao transcrever o áudio',
        )
      }
    },
    [audio, speech.lang, showToast],
  )

  // Colar (Ctrl+V) um arquivo de áudio enquanto a aba de arquivo está aberta.
  useEffect(() => {
    if (mode !== 'file') return
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0]
      if (file) {
        event.preventDefault()
        void handleAudioFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [mode, handleAudioFile])

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
        await navigator.share({ title: 'Blip Vira Texto', text: content })
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
    link.download = `blip-vira-texto-${new Date().toISOString().slice(0, 10)}.txt`
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

  const langLabel =
    LANGUAGES.find((entry) => entry.code === speech.lang)?.label ?? speech.lang

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
      <div className="app__glow" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="40" height="40">
              <defs>
                <linearGradient id="brandGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="14" fill="url(#brandGradient)" />
              <path
                d="M24 27a4 4 0 0 0 4-4V15a4 4 0 0 0-8 0v8a4 4 0 0 0 4 4z"
                fill="#fff"
              />
              <path
                d="M31 23a7 7 0 0 1-14 0h-2a9 9 0 0 0 8 8.94V35h2v-3.06A9 9 0 0 0 33 23h-2z"
                fill="#fff"
              />
            </svg>
          </span>
          <div className="brand__text">
            <strong>Blip Vira Texto</strong>
            <span>fale, edite e compartilhe — sem conta e sem API paga</span>
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
        <nav className="mode-tabs" role="tablist" aria-label="Modo de entrada">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'live'}
            className={`mode-tab${mode === 'live' ? ' is-active' : ''}`}
            onClick={() => switchMode('live')}
          >
            🎤 Falar agora
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'file'}
            className={`mode-tab${mode === 'file' ? ' is-active' : ''}`}
            onClick={() => switchMode('file')}
          >
            📁 Áudio do WhatsApp
          </button>
        </nav>

        {mode === 'live' && !speech.supported ? (
          <div className="banner" role="alert">
            <strong>Este navegador não tem ditado nativo (Web Speech API).</strong>
            Abra no Chrome, Edge ou Safari para falar. Por aqui você pode digitar e
            editar o texto normalmente — e a aba <em>Áudio do WhatsApp</em> funciona
            mesmo assim.
          </div>
        ) : null}

        <LiveTranscript
          text={text}
          interim={speech.interim}
          listening={speech.listening}
          langLabel={langLabel}
          onChange={handleTextChange}
        />

        {mode === 'live' ? (
          <div className="record-area">
            <RecordButton
              listening={speech.active}
              disabled={!speech.supported}
              onToggle={handleToggle}
            />
            <p className="record-area__hint" aria-live="polite">
              {statusHint}
            </p>
            {speech.error ? (
              <p className="record-area__error" role="alert">
                {speech.error}
              </p>
            ) : null}
          </div>
        ) : (
          <AudioDropzone
            state={audio.state}
            model={audio.model}
            busy={
              audio.state.phase === 'decoding' ||
              audio.state.phase === 'loading-model' ||
              audio.state.phase === 'downloading' ||
              audio.state.phase === 'transcribing'
            }
            onModelChange={audio.setModel}
            onFile={(file) => void handleAudioFile(file)}
          />
        )}

        <div className="toolbar" aria-label="Ações do texto">
          <button
            type="button"
            className="btn"
            onClick={() => handleCopy(text)}
            disabled={!hasText}
          >
            Copiar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleShare(text)}
            disabled={!hasText}
          >
            Compartilhar
          </button>
          <button
            type="button"
            className="btn btn--accent"
            onClick={handleSave}
            disabled={!hasText}
          >
            Salvar
          </button>
          <button
            type="button"
            className="btn"
            onClick={handlePolish}
            disabled={!hasText}
            title="Remove repetições e ajusta pontuação (só regras, sem IA)"
          >
            Melhorar texto
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleClear}
            disabled={!hasText && !speech.transcript}
          >
            Limpar
          </button>
        </div>

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
      </main>

      <footer className="footer">
        <p>
          Tudo roda <strong>no seu dispositivo</strong> com a Web Speech API nativa —
          sem servidor, sem custo, sem enviar seus áudios para lugar nenhum.
        </p>
      </footer>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
