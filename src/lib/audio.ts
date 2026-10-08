/**
 * Decodificação de arquivos de áudio (WhatsApp: .opus/.ogg, mas aceita
 * wav/mp3/m4a/webm também) → mono 16 kHz, o formato que o Whisper espera.
 *
 * Caminho principal: decoder nativo do navegador (Chrome/Edge fazem ogg/opus).
 * Fallback: decoder ogg/opus em WASM (Safari/iOS não abrem .ogg nativamente).
 */

const TARGET_SAMPLE_RATE = 16_000

export interface DecodedAudio {
  /** Onda contínua mono a 16 kHz. */
  samples: Float32Array
  sampleRate: number
  durationSeconds: number
  /** Qual decoder leu o arquivo (para diagnóstico). */
  decoder: 'nativo' | 'ogg-opus'
}

const AUDIO_LIKE = /\.(ogg|opus|oga|mp4|m4a|aac|mp3|wav|webm|amr|flac)$/i

/** Checagem barata: o arquivo parece um áudio? */
export function isAudioLike(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_LIKE.test(file.name)
}

/**
 * Código de idioma do app (pt-BR) → nome que o Whisper entende.
 * `undefined` = deixar o modelo detectar o idioma sozinho.
 */
const WHISPER_LANGUAGES: Record<string, string> = {
  'pt-BR': 'portuguese',
  'pt-PT': 'portuguese',
  'en-US': 'english',
  'es-ES': 'spanish',
  'fr-FR': 'french',
  'it-IT': 'italian',
  'de-DE': 'german',
}

export function whisperLanguageFor(code: string): string | undefined {
  return WHISPER_LANGUAGES[code]
}

export async function decodeAudioFile(file: Blob): Promise<DecodedAudio> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error('O arquivo está vazio.')

  // 1) Decoder nativo (rápido; Chrome/Edge/Safari modernos).
  try {
    const context = new OfflineAudioContext(2, 1, 44_100)
    // Cópia do buffer: decodeAudioData "desanexa" o ArrayBuffer original.
    const copy = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    )
    const decoded = await context.decodeAudioData(copy)
    return await resampleToMono16k(decoded, 'nativo')
  } catch {
    // 2) Fallback: ogg/opus via WASM — cobre Safari/iOS e navegadores sem ogg.
  }

  try {
    const { OggOpusDecoder } = await import('ogg-opus-decoder')
    const decoder = new OggOpusDecoder()
    const result = await decoder.decodeFile(bytes)
    decoder.free()

    const length = result.channelData[0]?.length ?? 0
    if (length === 0) {
      throw new Error(describeDecoderErrors(result.errors))
    }

    const buffer = new AudioBuffer({
      numberOfChannels: result.channelData.length,
      length,
      sampleRate: result.sampleRate,
    })
    result.channelData.forEach((channel, index) => {
      const target = buffer.getChannelData(index)
      target.set(channel.subarray(0, target.length))
    })
    return await resampleToMono16k(buffer, 'ogg-opus')
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
    throw new Error(
      `Não consegui ler este arquivo${detail}. Aceito formatos de áudio como ogg/opus (WhatsApp), mp3, m4a, wav e webm.`,
    )
  }
}

async function resampleToMono16k(
  buffer: AudioBuffer,
  decoder: DecodedAudio['decoder'],
): Promise<DecodedAudio> {
  if (!buffer.length || !buffer.duration) {
    throw new Error('Este áudio não tem duração.')
  }

  const targetLength = Math.max(1, Math.round(buffer.duration * TARGET_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()

  // O OfflineAudioContext já faz downmix para mono e reamostra para 16 kHz.
  const rendered = await offline.startRendering()
  return {
    samples: rendered.getChannelData(0).slice(),
    sampleRate: TARGET_SAMPLE_RATE,
    durationSeconds: buffer.duration,
    decoder,
  }
}

function describeDecoderErrors(
  errors: ReadonlyArray<{ message?: string } | Error>,
): string {
  const messages = errors
    .map((error) => ('message' in error ? error.message : String(error)))
    .filter(Boolean)
  return messages.length > 0 ? messages.join('; ') : 'arquivo opus inválido'
}
