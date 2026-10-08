import { useLayoutEffect, useRef } from 'react'
import { countWords } from '../lib/text'

interface LiveTranscriptProps {
  text: string
  interim: string
  listening: boolean
  langLabel: string
  onChange: (value: string) => void
}

/** Cartão da transcrição: campo editável + trecho ao vivo em tempo real. */
export function LiveTranscript({
  text,
  interim,
  listening,
  langLabel,
  onChange,
}: LiveTranscriptProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cresce junto com o conteúdo (com teto para não estourar a tela).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const words = countWords(text)

  return (
    <section className="transcript-card" aria-label="Transcrição">
      <header className="transcript-card__head">
        <span className={`status-dot${listening ? ' is-live' : ''}`} aria-hidden="true" />
        <h2>Transcrição</h2>
        <span className="transcript-card__meta">
          {words} {words === 1 ? 'palavra' : 'palavras'} · {langLabel}
        </span>
      </header>

      <textarea
        ref={textareaRef}
        className="transcript-card__text"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Toque no microfone e comece a falar. O texto aparece aqui — e você pode editar à vontade."
        spellCheck
        autoCorrect="on"
        aria-label="Texto transcrito"
      />

      <div className="transcript-card__live" aria-live="polite">
        {listening && interim ? (
          <p className="interim">
            <span className="interim__tag">ao vivo</span>
            {interim}
          </p>
        ) : null}
      </div>
    </section>
  )
}
