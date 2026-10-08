import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

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
console.log('Speech: cenários de repetição, limpeza, parada e reinício passaram.')
