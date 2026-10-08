/**
 * Tipos do projeto.
 *
 * A Web Speech API (SpeechRecognition) não é parte do lib.dom do TypeScript,
 * então declaramos as interfaces mínimas que usamos aqui.
 */

export interface SpeechRecognitionAlternativeLike {
  transcript: string
  confidence: number
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  0: SpeechRecognitionAlternativeLike
}

export interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message?: string
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognitionLike, e: Event) => void) | null
  onend: ((this: SpeechRecognitionLike, e: Event) => void) | null
  onerror:
    | ((this: SpeechRecognitionLike, e: SpeechRecognitionErrorEventLike) => void)
    | null
  onresult:
    | ((this: SpeechRecognitionLike, e: SpeechRecognitionEventLike) => void)
    | null
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

/** Item salvo no histórico de transcrições. */
export interface HistoryItem {
  id: string
  text: string
  lang: string
  createdAt: number
}
