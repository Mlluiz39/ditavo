import type { SpeechRecognitionCtor } from '../types'

/** Idiomas oferecidos no seletor (os que os navegadores mais suportam). */
export const LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'de-DE', label: 'Deutsch' },
]

export const DEFAULT_LANG = 'pt-BR'

/** Remove sobreposição entre resultados, preservando a grafia do trecho novo. */
export function speechContinuation(previous: string, incoming: string): string {
  const words = (value: string) => Array.from(value.matchAll(/[\p{L}\p{N}]+/gu))
  const before = words(previous)
  const after = words(incoming)
  // Uma palavra isolada pode ser repetição intencional ("não, não").
  for (let size = Math.min(before.length, after.length); size >= 2; size--) {
    const matches = after.slice(0, size).every((word, index) =>
      word[0].toLowerCase() === before[before.length - size + index][0].toLowerCase(),
    )
    if (matches) {
      return size === after.length ? '' : incoming.slice(after[size].index).trim()
    }
  }
  return incoming.trim()
}

/** Retorna o construtor da Web Speech API, se o navegador suportar. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null
}

/** Mensagens amigáveis (pt-BR) para os erros da Web Speech API. */
export function describeSpeechError(error: string): string | null {
  switch (error) {
    case 'not-allowed':
      return 'Permissão do microfone negada. Libere o microfone para este site nas configurações do navegador e tente de novo.'
    case 'service-not-allowed':
      return 'O serviço de reconhecimento de voz foi bloqueado pelo navegador.'
    case 'audio-capture':
      return 'Não consegui acessar o microfone. Verifique se existe um microfone conectado.'
    case 'network':
      return 'Falha de rede ao conectar no reconhecimento de voz. Verifique sua internet.'
    case 'no-speech':
      return 'Não ouvi nada. Comece a falar e tente novamente.'
    case 'language-not-supported':
      return 'Este idioma não é suportado pelo seu navegador.'
    case 'aborted':
      return null // interrompido pelo usuário: não é erro
    default:
      return `Erro no reconhecimento de voz (${error}).`
  }
}

/**
 * Erros que não devem ser reiniciados automaticamente: repetir só geraria
 * um loop infinito de falhas.
 */
export function isFatalSpeechError(error: string): boolean {
  return (
    error === 'not-allowed' ||
    error === 'service-not-allowed' ||
    error === 'audio-capture' ||
    error === 'network' ||
    error === 'language-not-supported'
  )
}
