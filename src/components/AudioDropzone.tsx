import { useRef, useState } from 'react'
import {
  WHISPER_MODELS,
  type AudioTranscriptionState,
  type ModelSize,
} from '../hooks/useAudioTranscription'

interface AudioDropzoneProps {
  state: AudioTranscriptionState
  model: ModelSize
  busy: boolean
  onModelChange: (model: ModelSize) => void
  onFile: (file: File) => void
}

function statusLabel(state: AudioTranscriptionState): string {
  switch (state.phase) {
    case 'decoding':
      return 'Lendo o arquivo de áudio…'
    case 'loading-model':
      return 'Preparando o modelo de voz…'
    case 'downloading':
      return state.detail ?? 'Baixando o modelo de voz…'
    case 'transcribing':
      return state.detail ?? 'Transcrevendo…'
    case 'done':
      return 'Pronto! Texto adicionado acima.'
    case 'error':
      return state.error ?? 'Deu erro na transcrição.'
    default:
      return ''
  }
}

/** Área para soltar/escolher o áudio do WhatsApp e transcrever localmente. */
export function AudioDropzone({
  state,
  model,
  busy,
  onModelChange,
  onFile,
}: AudioDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) onFile(file)
  }

  const handlePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onFile(file)
    // Permite escolher o mesmo arquivo de novo.
    event.target.value = ''
  }

  const showProgress =
    state.phase !== 'idle' &&
    state.phase !== 'done' &&
    state.phase !== 'error'

  return (
    <div
      className={`dropzone${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      data-phase={state.phase}
    >
      <span className="dropzone__icon" aria-hidden="true">
        🎵
      </span>
      <strong className="dropzone__title">
        Solte aqui o áudio do WhatsApp (ou clique para escolher)
      </strong>

      <button
        type="button"
        className="btn btn--accent"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        Escolher arquivo de áudio
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.opus,.ogg,.oga,.mp4,.m4a,.aac,.mp3,.wav,.webm,.amr"
        onChange={handlePick}
        hidden
      />

      <p className="dropzone__hint">
        <strong>Como pegar o áudio:</strong> no PC, WhatsApp Web/Computador → menu ⋮ do
        áudio → <em>Baixar</em> (ou Exportar conversa). No celular → segure o áudio →{' '}
        <em>Compartilhar</em> → <em>Encaminhar como arquivo</em> → salve nos Arquivos.
      </p>
      <p className="dropzone__hint dropzone__hint--ok">
        🔒 O áudio não sai do seu dispositivo: a transcrição roda no seu navegador
        (modelo Whisper baixado uma única vez).
      </p>

      <div className="dropzone__model">
        <span>Modelo:</span>
        {(Object.keys(WHISPER_MODELS) as ModelSize[]).map((size) => (
          <button
            key={size}
            type="button"
            className={`btn btn--tiny${model === size ? ' is-active' : ''}`}
            onClick={() => onModelChange(size)}
            disabled={busy}
            title={WHISPER_MODELS[size].id}
          >
            {WHISPER_MODELS[size].label} · {WHISPER_MODELS[size].size}
          </button>
        ))}
      </div>

      {state.phase !== 'idle' ? (
        <div
          className={`dropzone__status dropzone__status--${state.phase}`}
          role="status"
          aria-live="polite"
        >
          {showProgress ? <span className="spinner" aria-hidden="true" /> : null}
          <span className="dropzone__status-text">{statusLabel(state)}</span>
          {state.phase === 'downloading' && typeof state.progress === 'number' ? (
            <progress max={100} value={state.progress} aria-label="Progresso do download" />
          ) : null}
          {state.fileName && state.phase !== 'done' ? (
            <small className="dropzone__file">{state.fileName}</small>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
