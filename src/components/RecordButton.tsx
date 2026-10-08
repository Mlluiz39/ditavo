interface RecordButtonProps {
  listening: boolean
  disabled: boolean
  onToggle: () => void
}

/** Botão redondo grande: microfone parado / quadrado de parar quando ouvindo. */
export function RecordButton({ listening, disabled, onToggle }: RecordButtonProps) {
  return (
    <button
      type="button"
      className={`record-btn${listening ? ' is-listening' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Parar de ouvir' : 'Começar a falar'}
    >
      <span className="record-btn__pulse" aria-hidden="true" />
      <span className="record-btn__pulse record-btn__pulse--late" aria-hidden="true" />
      <span className="record-btn__face" aria-hidden="true">
        {listening ? (
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
        )}
      </span>
    </button>
  )
}
