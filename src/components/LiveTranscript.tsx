import { Icon } from './Icon'

interface LiveTranscriptProps {
  text: string
  interim: string
  listening: boolean
  largeText: boolean
  onPolish: () => void
  onCopy: () => void
  onShare: () => void
  onClear: () => void
  onFontToggle: () => void
  onChange: (value: string) => void
}

/** Cartão da transcrição: campo editável + trecho ao vivo em tempo real. */
export function LiveTranscript({
  text,
  interim,
  listening,
  largeText, onPolish, onCopy, onShare, onClear, onFontToggle,
  onChange,
}: LiveTranscriptProps) {
  const hasText = Boolean(text.trim())

  return (
    <section className={`transcript-card${largeText ? ' is-large-text' : ''}`} aria-label="Transcrição">
      <header className="transcript-card__head">
        <span className={`status-dot${listening ? ' is-live' : ''}`} aria-hidden="true" />
        <h2>Documento em andamento</h2>
        <button type="button" className="btn btn--accent improve-btn" onClick={onPolish} disabled={!hasText} title="Ajustar pontuação e repetições"><Icon name="edit" /> Melhorar texto</button>
      </header>
      <div className="toolbar" aria-label="Ações do texto">
        <button type="button" className="btn btn--tiny" onClick={onCopy} disabled={!hasText}><Icon name="copy" /> Copiar</button>
        <button type="button" className="btn btn--tiny" onClick={onShare} disabled={!hasText}><Icon name="share" /> Compartilhar</button>
        <button type="button" className="btn btn--ghost font-toggle" onClick={onFontToggle} aria-label="Alternar tamanho do texto" aria-pressed={largeText}>Aa</button>
        <button type="button" className="btn btn--ghost clear-btn" onClick={onClear} disabled={!hasText} aria-label="Limpar" title="Limpar"><Icon name="trash" /></button>
      </div>

      <textarea
        className="transcript-card__text"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Suas palavras começam aqui…"
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
      <div className="document-footer"><span>Você pode editar o texto à vontade.</span><span>Rascunho automático</span></div>
    </section>
  )
}
