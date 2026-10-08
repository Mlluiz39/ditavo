import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_LANG,
  describeSpeechError,
  getSpeechRecognitionCtor,
  isFatalSpeechError,
  isSpeechRecognitionSupported,
} from '../lib/speech'
import type { SpeechRecognitionLike } from '../types'

/** Espera antes de religar o reconhecimento após ele parar sozinho. */
const RESTART_DELAY_MS = 300
/** Motor que vive menos que isso sem ouvir nada é considerado defeituoso. */
const MIN_ALIVE_MS = 1500
/** Reinícios "relâmpago" consecutivos tolerados antes de desistir. */
const MAX_FAST_FAILS = 5

export interface UseSpeechRecognitionResult {
  supported: boolean
  /**
   * O usuário quer que esteja ouvindo (fonte da verdade do toggle).
   * Pode ser `true` mesmo com `listening === false` enquanto o motor
   * reinicia sozinho ou o pedido de permissão está na tela.
   */
  active: boolean
  /** Motor ativo (microfone aberto). */
  listening: boolean
  /** Texto final já reconhecido na sessão atual. */
  transcript: string
  /** Trecho ainda não confirmado (aparece em cinza na tela). */
  interim: string
  error: string | null
  lang: string
  setLang: (lang: string) => void
  start: () => void
  stop: () => void
  toggle: () => void
  /** Zera a sessão atual (transcript + interim + erro). */
  reset: () => void
}

/**
 * Hook que encapsula a Web Speech API (grátis e nativa do navegador —
 * nenhuma API externa é usada).
 *
 * Comportamento:
 * - gravação contínua com resultados parciais em tempo real;
 * - se o navegador parar de ouvir (silêncio), religa sozinho;
 * - erros fatais (permissão, rede, microfone) param o loop automaticamente.
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [supported] = useState(() => isSpeechRecognitionSupported())
  const [active, setActive] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lang, setLangState] = useState(DEFAULT_LANG)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalsRef = useRef<string[]>([])
  const interimRef = useRef('')
  /** O usuário quer que esteja ouvindo? Fonte da verdade para toggle. */
  const wantListeningRef = useRef(false)
  const langRef = useRef(DEFAULT_LANG)
  const restartTimerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const lastResultAtRef = useRef(0)
  const fastFailRef = useRef(0)

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  // Cria a instância do reconhecimento uma única vez.
  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.lang = langRef.current

    const scheduleRestart = () => {
      clearRestartTimer()
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null
        if (!wantListeningRef.current) return
        try {
          rec.start()
        } catch {
          // Já ativo — ignorar InvalidStateError.
        }
      }, RESTART_DELAY_MS)
    }

    rec.onstart = () => {
      startedAtRef.current = Date.now()
      setListening(true)
      setError(null)
    }

    rec.onresult = (event) => {
      lastResultAtRef.current = Date.now()
      fastFailRef.current = 0
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const trimmed = text.trim()
          if (trimmed) finalsRef.current.push(trimmed)
        } else {
          live += text
        }
      }
      interimRef.current = live
      setInterim(live)
      setTranscript(finalsRef.current.join(' '))
    }

    rec.onerror = (event) => {
      if (isFatalSpeechError(event.error)) {
        wantListeningRef.current = false
        setActive(false)
        clearRestartTimer()
      }
      const message = describeSpeechError(event.error)
      if (message) setError(message)
    }

    rec.onend = () => {
      setListening(false)

      // Não perder palavras presas no "interim" ao encerrar a rodada.
      const pending = interimRef.current.trim()
      if (pending) finalsRef.current.push(pending)
      interimRef.current = ''
      setInterim('')
      setTranscript(finalsRef.current.join(' '))

      if (!wantListeningRef.current) return

      // Proteção contra loop infinito: motor morrendo antes de ouvir nada.
      const aliveFor = Date.now() - startedAtRef.current
      const heardSomething = lastResultAtRef.current > startedAtRef.current
      if (!heardSomething && aliveFor < MIN_ALIVE_MS) {
        fastFailRef.current += 1
        if (fastFailRef.current >= MAX_FAST_FAILS) {
          wantListeningRef.current = false
          setActive(false)
          setError(
            'Não consegui manter o microfone aberto. Recarregue a página e verifique as permissões do navegador.',
          )
          return
        }
      } else {
        fastFailRef.current = 0
      }

      scheduleRestart()
    }

    recRef.current = rec

    return () => {
      wantListeningRef.current = false
      clearRestartTimer()
      rec.onstart = null
      rec.onend = null
      rec.onerror = null
      rec.onresult = null
      try {
        rec.abort()
      } catch {
        // Nada a fazer se o motor já estiver parado.
      }
      recRef.current = null
    }
  }, [clearRestartTimer])

  const start = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    const freshSession = !wantListeningRef.current
    setError(null)
    wantListeningRef.current = true
    setActive(true)
    // Nova gravação = nova sessão de texto (reinícios automáticos não passam
    // por aqui, então não apaga nada durante uma escuta contínua).
    if (freshSession) {
      finalsRef.current = []
      interimRef.current = ''
      setTranscript('')
      setInterim('')
    }
    try {
      rec.start()
    } catch {
      // Já ativo — ignorar InvalidStateError.
    }
  }, [])

  const stop = useCallback(() => {
    wantListeningRef.current = false
    setActive(false)
    clearRestartTimer()
    setListening(false)
    const rec = recRef.current
    if (!rec) return
    try {
      rec.stop()
    } catch {
      // Já parado — ignorar.
    }
  }, [clearRestartTimer])

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop()
    else start()
  }, [start, stop])

  const setLang = useCallback((next: string) => {
    langRef.current = next
    setLangState(next)
    const rec = recRef.current
    if (!rec) return
    rec.lang = next
    // Reinicia (via onend) para o novo idioma valer imediatamente.
    if (wantListeningRef.current) {
      try {
        rec.stop()
      } catch {
        // Ignorar — o onend já vai religar.
      }
    }
  }, [])

  const reset = useCallback(() => {
    finalsRef.current = []
    interimRef.current = ''
    setTranscript('')
    setInterim('')
    setError(null)
  }, [])

  return {
    supported,
    active,
    listening,
    transcript,
    interim,
    error,
    lang,
    setLang,
    start,
    stop,
    toggle,
    reset,
  }
}
