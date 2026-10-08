import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_LANG,
  describeSpeechError,
  getSpeechRecognitionCtor,
  isFatalSpeechError,
  isSpeechRecognitionSupported,
  speechContinuation,
} from '../lib/speech'
import type { SpeechRecognitionLike } from '../types'

/** Espera antes de religar o reconhecimento após ele parar sozinho. */
const RESTART_DELAY_MS = 1000
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
  const sessionFinalsRef = useRef<string[]>([])
  const interimRef = useRef('')
  const engineStateRef = useRef<'idle' | 'starting' | 'running' | 'stopping'>('idle')
  const beginRef = useRef<(() => void) | null>(null)
  const ignoredResultsRef = useRef(0)
  const resultCountRef = useRef(0)
  const discardResultsRef = useRef(false)
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

    const begin = () => {
      if (!wantListeningRef.current || engineStateRef.current !== 'idle') return
      engineStateRef.current = 'starting'
      startedAtRef.current = Date.now()
      lastResultAtRef.current = 0
      sessionFinalsRef.current = []
      ignoredResultsRef.current = 0
      resultCountRef.current = 0
      discardResultsRef.current = false
      rec.lang = langRef.current
      try {
        rec.start()
      } catch {
        engineStateRef.current = 'idle'
        wantListeningRef.current = false
        setActive(false)
        setError('Não consegui iniciar o microfone. Tente novamente.')
      }
    }
    beginRef.current = begin

    const scheduleRestart = () => {
      clearRestartTimer()
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null
        begin()
      }, RESTART_DELAY_MS * 2 ** fastFailRef.current)
    }

    rec.onstart = () => {
      if (!wantListeningRef.current || engineStateRef.current === 'stopping') {
        engineStateRef.current = 'stopping'
        rec.stop()
        return
      }
      engineStateRef.current = 'running'
      setListening(true)
      setError(null)
    }

    rec.onresult = (event) => {
      if (discardResultsRef.current) return
      resultCountRef.current = event.results.length
      lastResultAtRef.current = Date.now()
      fastFailRef.current = 0

      const sessionFinals: string[] = []
      let live = ''
      let confirmed = finalsRef.current.join(' ')
      // A lista é cumulativa: substituir os finais da rodada evita
      // anexar novamente resultados já confirmados.
      for (let i = ignoredResultsRef.current; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const continuation = speechContinuation(confirmed, text)
          if (continuation) {
            sessionFinals.push(continuation)
            confirmed = [confirmed, continuation].filter(Boolean).join(' ')
          }
        } else {
          const continuation = speechContinuation([confirmed, live].filter(Boolean).join(' '), text)
          live = [live, continuation].filter(Boolean).join(' ')
        }
      }

      sessionFinalsRef.current = sessionFinals
      interimRef.current = live
      setInterim(live)
      setTranscript([...finalsRef.current, ...sessionFinals].join(' '))
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
      if (engineStateRef.current === 'idle') return
      engineStateRef.current = 'idle'
      setListening(false)

      // Salva os resultados da rodada atual no histórico global
      if (sessionFinalsRef.current.length > 0) {
        finalsRef.current.push(...sessionFinalsRef.current)
        sessionFinalsRef.current = []
      }

      interimRef.current = ''
      setInterim('')
      setTranscript(finalsRef.current.join(' '))

      if (!wantListeningRef.current) return

      // Proteção contra loop infinito: motor morrendo antes de ouvir nada.
      const aliveFor = Date.now() - startedAtRef.current
      const heardSomething = lastResultAtRef.current !== 0
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
      beginRef.current = null
      engineStateRef.current = 'idle'
    }
  }, [clearRestartTimer])

  const start = useCallback(() => {
    const rec = recRef.current
    if (!rec) return
    if (wantListeningRef.current) return
    const freshSession = !wantListeningRef.current
    clearRestartTimer()
    fastFailRef.current = 0
    setError(null)
    wantListeningRef.current = true
    setActive(true)
    // Nova gravação = nova sessão de texto (reinícios automáticos não passam
    // por aqui, então não apaga nada durante uma escuta contínua).
    if (freshSession) {
      finalsRef.current = []
      sessionFinalsRef.current = []
      interimRef.current = ''
      setTranscript('')
      setInterim('')
      // Uma rodada que ainda está encerrando não pertence à nova gravação.
      discardResultsRef.current = engineStateRef.current !== 'idle'
    }
    beginRef.current?.()
  }, [clearRestartTimer])

  const stop = useCallback(() => {
    wantListeningRef.current = false
    setActive(false)
    clearRestartTimer()
    setListening(false)
    const rec = recRef.current
    if (!rec) return
    try {
      if (engineStateRef.current === 'idle' || engineStateRef.current === 'stopping') return
      engineStateRef.current = 'stopping'
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
    if (next === langRef.current) return
    langRef.current = next
    setLangState(next)
    const rec = recRef.current
    if (!rec) return
    rec.lang = next
    // Reinicia (via onend) para o novo idioma valer imediatamente.
    if (wantListeningRef.current && engineStateRef.current === 'running') {
      try {
        engineStateRef.current = 'stopping'
        rec.stop()
      } catch {
        // Ignorar — o onend já vai religar.
      }
    }
  }, [])

  const reset = useCallback(() => {
    // Os eventos seguintes ainda contêm os finais anteriores ao limpar.
    ignoredResultsRef.current = resultCountRef.current
    finalsRef.current = []
    sessionFinalsRef.current = []
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
