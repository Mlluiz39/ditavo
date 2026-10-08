import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const speechExports = {}
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/lib/speech.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText, { exports: speechExports })

// Executa o hook com o motor e o relógio controlados, sem microfone ou rede.
function setup() {
  const states = []
  const timers = new Map()
  let instance
  let cleanup
  let id = 0
  let now = 10000
  class Recognition {
    starts = 0
    stops = 0
    start() { this.starts++ }
    stop() { this.stops++ }
    abort() {}
    constructor() { instance = this }
  }
  const source = readFileSync(new URL('../src/hooks/useSpeechRecognition.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    Date: { now: () => now },
    window: {
      setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id },
      clearTimeout: key => timers.delete(key),
    },
    require: name => name === 'react' ? {
      useState: initial => {
        const slot = states.length
        states.push(typeof initial === 'function' ? initial() : initial)
        return [states[slot], value => { states[slot] = value }]
      },
      useRef: current => ({ current }),
      useCallback: fn => fn,
      useEffect: fn => { cleanup = fn() },
    } : {
      speechContinuation: speechExports.speechContinuation,
      DEFAULT_LANG: 'pt-BR',
      getSpeechRecognitionCtor: () => Recognition,
      isSpeechRecognitionSupported: () => true,
      isFatalSpeechError: error => error === 'not-allowed',
      describeSpeechError: error => error,
    },
  })
  const hook = exports.useSpeechRecognition()
  return {
    hook, states, timers, rec: instance,
    advance: ms => { now += ms },
    tick: () => {
      assert.equal(timers.size, 1)
      const [key, timer] = timers.entries().next().value
      timers.delete(key)
      timer.fn()
      return timer.delay
    },
    cleanup: () => cleanup(),
    result: (...items) => instance.onresult({
      resultIndex: 0,
      results: items.map(([text, isFinal = true]) => ({ 0: { transcript: text }, isFinal })),
    }),
  }
}

const s = setup()
s.hook.start()
s.hook.start()
assert.equal(s.rec.starts, 1, 'iniciar duas vezes não sobrepõe chamadas')
s.rec.onstart()
s.result(['bom dia'], ['mundo', false])
s.result(['bom dia'], ['mundo'])
s.result(['bom dia'], ['mundo'])
assert.equal(s.states[3], 'bom dia mundo', 'finais cumulativos não duplicam')
s.advance(2000)
s.rec.onend()
s.rec.onend()
s.tick()
s.rec.onstart()
s.result(['de novo'])
assert.equal(s.states[3], 'bom dia mundo de novo', 'reinício preserva histórico uma vez')
s.hook.reset()
s.result(['de novo'], ['texto novo'])
assert.equal(s.states[3], 'texto novo', 'limpar não ressuscita finais antigos')
s.hook.stop()
s.hook.start()
assert.equal(s.rec.starts, 2, 'aguarda encerramento antes de iniciar')
s.result(['de novo'], ['texto antigo'])
assert.equal(s.states[3], '', 'descarta resultados da gravação anterior')
s.rec.onend()
s.tick()
s.rec.onstart()
s.result(['nova gravação'])
assert.equal(s.states[3], 'nova gravação')
s.hook.stop()
s.rec.onend()
assert.equal(s.timers.size, 0, 'parada manual cancela reinício')
s.cleanup()

const f = setup()
f.hook.start()
for (let attempt = 1; attempt <= 5; attempt++) {
  f.rec.onstart()
  f.advance(100)
  f.rec.onend()
  if (attempt < 5) assert.equal(f.tick(), 1000 * 2 ** attempt)
}
assert.equal(f.states[1], false, 'falhas rápidas interrompem loop')
assert.equal(f.timers.size, 0)
f.hook.start()
f.rec.onstart()
f.rec.onerror({ error: 'not-allowed' })
f.rec.onend()
assert.equal(f.timers.size, 0, 'permissão negada não reinicia')
f.cleanup()

const overlap = setup()
overlap.hook.start()
overlap.rec.onstart()
overlap.result(['eu quero'], ['Eu quero testar', false], ['quero testar agora', false])
assert.equal(overlap.states[3], 'eu quero')
assert.equal(overlap.states[4], 'testar agora', 'prévia remove sobreposições com finais e parciais')
overlap.result(['eu quero'], ['Eu quero testar'], ['quero testar agora'])
assert.equal(overlap.states[3], 'eu quero testar agora', 'finais sobrepostos não duplicam palavras')
overlap.result(['eu quero'], ['Eu quero testar'], ['quero testar agora'])
assert.equal(overlap.states[3], 'eu quero testar agora', 'eventos repetidos mantêm o mesmo texto')
overlap.rec.onend()
overlap.tick()
overlap.rec.onstart()
overlap.result(['testar agora com calma'])
assert.equal(overlap.states[3], 'eu quero testar agora com calma', 'sobreposição após reinício')
overlap.hook.stop()
overlap.rec.onend()
assert.equal(overlap.states[3], 'eu quero testar agora com calma', 'parada preserva texto sem duplicatas')
overlap.cleanup()

const { speechContinuation } = speechExports
assert.equal(speechContinuation('bom dia', 'Bom dia.'), '', 'ignora caixa e pontuação')
assert.equal(speechContinuation('olá, você', 'OLÁ você está bem?'), 'está bem?')
assert.equal(speechContinuation('não,', 'não quero'), 'não quero', 'preserva repetição separada por pontuação')
assert.equal(speechContinuation('eu quero', 'quero testar'), 'testar', 'remove sobreposição de uma palavra')
assert.equal(speechContinuation('olá', 'Olá'), '', 'remove resultado de uma palavra reenviado')
assert.equal(speechContinuation('', 'eu eu quero quero testar'), 'eu quero testar', 'remove duplicatas dentro do resultado')
assert.equal(speechContinuation('', 'não, não quero. Não quero.'), 'não, não quero. Não quero.', 'preserva frases e pontuação')
assert.equal(speechContinuation('', '11 11'), '11 11', 'preserva números repetidos')
assert.equal(speechContinuation('11', '11 pessoas'), '11 pessoas', 'preserva fronteira numérica')
assert.equal(speechContinuation('eu quero', 'viajar amanhã'), 'viajar amanhã', 'preserva trechos distintos')

const singleWords = setup()
singleWords.hook.start()
singleWords.rec.onstart()
singleWords.result(['eu eu quero'], ['quero testar testar', false])
assert.equal(singleWords.states[3], 'eu quero')
assert.equal(singleWords.states[4], 'testar', 'limpa palavras na prévia')
singleWords.result(['eu eu quero'], ['quero testar testar'])
assert.equal(singleWords.states[3], 'eu quero testar', 'limpa palavras no texto confirmado')
singleWords.rec.onend()
singleWords.tick()
singleWords.rec.onstart()
singleWords.result(['testar novamente novamente'])
assert.equal(singleWords.states[3], 'eu quero testar novamente', 'não repete palavra após reinício')
singleWords.hook.stop()
singleWords.rec.onend()
assert.equal(singleWords.states[3], 'eu quero testar novamente')
singleWords.cleanup()

// Exemplo relatado no celular: repetições triplas, juntas ou em resultados separados.
const reported = 'não  como é que ta ta ta então então então'
const expected = 'não  como é que ta então'
assert.equal(speechContinuation('', reported), expected, 'corrige o exemplo completo do celular')
const phone = setup()
phone.hook.start()
phone.rec.onstart()
phone.result([reported, false])
assert.equal(phone.states[4], expected, 'exemplo do celular na prévia')
phone.result([reported])
assert.equal(phone.states[3], expected, 'exemplo do celular confirmado')
phone.result(['não  como é que ta'], ['ta'], ['ta'], ['então'], ['então'], ['então'])
assert.equal(phone.states[3], expected, 'mesmo exemplo dividido em resultados individuais')
phone.hook.stop()
phone.rec.onend()
assert.equal(phone.states[3], expected, 'parar mantém o exemplo sem repetições')
phone.cleanup()
console.log('Speech: cenários de repetição, limpeza, parada e reinício passaram.')
