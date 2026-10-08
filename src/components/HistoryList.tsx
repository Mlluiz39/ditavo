import { formatRelativeTime } from '../lib/time'
import type { HistoryItem } from '../types'

interface HistoryListProps {
  items: HistoryItem[]
  onRestore: (item: HistoryItem) => void
  onCopy: (text: string) => void
  onShare: (text: string) => void
  onRemove: (id: string) => void
  onClearAll: () => void
  onDownloadAll: () => void
}

/** Histórico de transcrições salvas (localStorage, offline). */
export function HistoryList({
  items,
  onRestore,
  onCopy,
  onShare,
  onRemove,
  onClearAll,
  onDownloadAll,
}: HistoryListProps) {
  return (
    <section className="history" aria-label="Histórico">
      <header className="history__head">
        <h2>Histórico</h2>
        {items.length > 0 ? (
          <div className="history__head-actions">
            <button type="button" className="btn btn--ghost" onClick={onDownloadAll}>
              Baixar .txt
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClearAll}>
              Limpar tudo
            </button>
          </div>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="history__empty">
          Nada salvo ainda. Transcreva algo e toque em <strong>Salvar</strong> para
          guardar aqui — tudo fica só no seu dispositivo.
        </p>
      ) : (
        <ul className="history__list">
          {items.map((item) => (
            <li key={item.id} className="history__item">
              <div className="history__item-body">
                <p className="history__item-text">{item.text}</p>
                <span className="history__item-meta">
                  {formatRelativeTime(item.createdAt)} · {item.lang}
                </span>
              </div>
              <div className="history__item-actions">
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => onRestore(item)}
                  title="Usar este texto"
                >
                  Usar
                </button>
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => onCopy(item.text)}
                  title="Copiar"
                >
                  Copiar
                </button>
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => onShare(item.text)}
                  title="Compartilhar"
                >
                  Enviar
                </button>
                <button
                  type="button"
                  className="btn btn--tiny btn--danger"
                  onClick={() => onRemove(item.id)}
                  title="Excluir"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
