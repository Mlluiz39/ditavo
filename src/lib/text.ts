/**
 * "Vira texto" sem IA: apenas regras de pós-processamento para deixar a
 * transcrição mais legível. Nada de API, tudo local.
 */

/** Conta palavras (tokens separados por espaço). */
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/** Remove espaços/excessos sem mudar o conteúdo. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * Remove repetições imediatas de palavras ("eu eu vou" → "eu vou") e de
 * pontuação ("!!!" → "!"). Feito palavra a palavra para não brigar com
 * idiomas sem espaço entre palavras. Quando a palavra descartada tinha
 * pontuação, ela é aproveitada na palavra que ficou ("sim sim," → "sim,").
 */
export function removeRepeats(text: string): string {
  const words = text.split(/(\s+)/)
  const out: string[] = []
  let lastWordIndex = -1

  for (const token of words) {
    if (/^\s+$/.test(token)) {
      if (lastWordIndex >= 0) out.push(token)
      continue
    }

    const previous = lastWordIndex >= 0 ? out[lastWordIndex] : ''
    if (previous && normalizeForCompare(previous) === normalizeForCompare(token)) {
      const keptPunct = punctuationOf(previous)
      const droppedPunct = punctuationOf(token)
      if (droppedPunct && droppedPunct !== keptPunct) {
        out[lastWordIndex] = coreOf(previous) + droppedPunct
      }
      continue
    }

    out.push(token)
    lastWordIndex = out.length - 1
  }

  return out
    .join('')
    .trimEnd()
    .replace(/([!?.]){2,}/g, '$1')
    .replace(/,{2,}/g, ',')
}

/**
 * Maiúscula no início de cada frase e fecha a última frase: terminou em
 * vírgula/ponto-e-vírgula vira ponto final; sem pontuação ganha um ponto.
 */
export function punctuateSentences(text: string): string {
  const fixed = text
    .split(/([.!?]\s+|\n+)/)
    .map((part, index) => {
      if (index % 2 === 1) return part // separadores ficam como estão
      const trimmed = part.trim()
      if (!trimmed) return ''
      const first = trimmed.charAt(0)
      const rest = trimmed.slice(1)
      return first.toLocaleUpperCase() + rest
    })
    .join('')
    .trim()

  if (!fixed) return ''
  if (/[.!?…]$/.test(fixed)) return fixed
  if (/[,:;]$/.test(fixed)) return `${fixed.slice(0, -1)}.`
  return `${fixed}.`
}

/**
 * Aplica todas as regras de uma vez. Esta é a ação "Melhorar texto" do app.
 */
export function polishText(text: string): string {
  let result = tidyText(text)
  result = removeRepeats(result)
  result = punctuateSentences(result)
  return tidyText(result)
}

function normalizeForCompare(word: string): string {
  return coreOf(word)
    .toLocaleLowerCase()
    .replace(/["'`“”‘’()[\]]/g, '')
}

/** Pontuação final de uma palavra com pontuação grudada ("sim," → ","). */
function punctuationOf(word: string): string {
  return word.match(/[.,;:!?…]+$/)?.[0] ?? ''
}

/** A palavra sem a pontuação final ("sim," → "sim"). */
function coreOf(word: string): string {
  return word.replace(/[.,;:!?…]+$/, '')
}
