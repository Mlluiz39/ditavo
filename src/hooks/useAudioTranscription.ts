import { useCallback, useRef, useState } from 'react'
import { decodeAudioFile } from '../lib/audio'

export type TranscriptionPhase =
  | 'idle'
  | 'decoding'
  | 'loading-model'
  | 'downloading'
  | 'transcribing'
  | 'done'
  | 'error'

export type ModelSize = 'tiny' | 'base'

interface ModelInfo {
  id: string
  label: string
  size: string
}

/** Modelos Whisper (Hugging Face) — baixados uma vez e cacheados no navegador. */
export const WHISPER_MODELS: Record<ModelSize, ModelInfo> = {
  tiny: { id: 'Xenova/whisper-tiny', label: 'Rápido', size: '~40 MB' },
  base: { id: 'Xenova/whisper-base', label: 'Melhor qualidade', size: '~80 MB' },
}

export interface AudioTranscriptionState {
  phase: TranscriptionPhase
  fileName: string | null
  /** Progresso do download do modelo (0–100), quando aplicável. */
  progress: number | null
  detail: string | null
  error: string | null
}

interface ProgressEventLike {
  status?: string
  file?: string
  name?: string
  progress?: number
}

type ASRCall = (
  samples: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text?: string }>

const STORAGE_MODEL_KEY = 'blip-vira-texto/whisper-model'

function loadStoredModel(): ModelSize {
  try {
    const stored = window.localStorage.getItem(STORAGE_MODEL_KEY)
    return stored === 'base' ? 'base' : 'tiny'
  } catch {
    return 'tiny'
  }
}

async function loadPipeline(
  modelId: string,
  onProgress: (event: ProgressEventLike) => void,
): Promise<ASRCall> {
  const { pipeline } = await import('@huggingface/transformers')
  const created = await pipeline('automatic-speech-recognition', modelId, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: onProgress,
  })
  return created as unknown as ASRCall
}

export interface UseAudioTranscriptionResult {
  state: AudioTranscriptionState
  model: ModelSize
  setModel: (model: ModelSize) => void
  /** Decodifica e transcreve. Lança Error com mensagem amigável em falha. */
  transcribe: (file: File, language?: string) => Promise<string>
}

/**
 * Transcrição 100% local: Whisper via ONNX no navegador (WebAssembly).
 * Nenhum áudio é enviado para servidor algum.
 */
export function useAudioTranscription(): UseAudioTranscriptionResult {
  const [state, setState] = useState<AudioTranscriptionState>({
    phase: 'idle',
    fileName: null,
    progress: null,
    detail: null,
    error: null,
  })
  const [model, setModelState] = useState<ModelSize>(() => loadStoredModel())

  const pipeRef = useRef<{ key: string; pipe: ASRCall } | null>(null)
  const busyRef = useRef(false)
  const modelRef = useRef<ModelSize>(model)

  const setModel = useCallback((next: ModelSize) => {
    setModelState(next)
    modelRef.current = next
    try {
      window.localStorage.setItem(STORAGE_MODEL_KEY, next)
    } catch {
      // Sem localStorage, a escolha vale só nesta sessão.
    }
  }, [])

  const transcribe = useCallback(
    async (file: File, language?: string): Promise<string> => {
      if (busyRef.current) {
        throw new Error('Já estou transcrevendo um áudio. Aguarde terminar.')
      }
      busyRef.current = true
      const fileName = file.name || 'áudio'

      try {
        setState({
          phase: 'decoding',
          fileName,
          progress: null,
          detail: 'Lendo o arquivo de áudio…',
          error: null,
        })
        const audio = await decodeAudioFile(file)

        const modelId = WHISPER_MODELS[modelRef.current].id
        const cached = pipeRef.current?.key === modelId ? pipeRef.current.pipe : null

        if (cached) {
          setState({
            phase: 'transcribing',
            fileName,
            progress: null,
            detail: `Transcrevendo ${Math.round(audio.durationSeconds)} s de áudio…`,
            error: null,
          })
        } else {
          setState({
            phase: 'loading-model',
            fileName,
            progress: null,
            detail: 'Preparando o modelo de voz…',
            error: null,
          })
        }

        const pipe =
          cached ??
          (await loadPipeline(modelId, (event) => {
            const status = event.status
            if (status === 'initiate' || status === 'progress') {
              setState({
                phase: 'downloading',
                fileName,
                progress: typeof event.progress === 'number' ? Math.round(event.progress) : null,
                detail: `Baixando o modelo (só desta vez): ${event.file ?? event.name ?? modelId}`,
                error: null,
              })
            } else if (status === 'done') {
              setState((current) => ({
                ...current,
                phase: current.phase === 'downloading' ? 'loading-model' : current.phase,
                progress: 100,
              }))
            }
          }))
        pipeRef.current = { key: modelId, pipe }

        setState({
          phase: 'transcribing',
          fileName,
          progress: null,
          detail: `Transcrevendo ${Math.round(audio.durationSeconds)} s de áudio…`,
          error: null,
        })

        const output = await pipe(audio.samples, {
          chunk_length_s: 30,
          stride_length_s: 5,
          task: 'transcribe',
          ...(language ? { language } : {}),
        })

        setState({
          phase: 'done',
          fileName,
          progress: 100,
          detail: null,
          error: null,
        })
        return (output.text ?? '').trim()
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Erro desconhecido ao transcrever o áudio.'
        setState({
          phase: 'error',
          fileName,
          progress: null,
          detail: null,
          error: message,
        })
        throw new Error(message)
      } finally {
        busyRef.current = false
      }
    },
    [],
  )

  return { state, model, setModel, transcribe }
}
