/**
 * Smoke test de integração: abre o app no Chrome headless (CDP) e valida
 * a UI reagindo de verdade — digita, salva no histórico, melhora o texto,
 * limpa e tenta gravar.
 *
 * Requisitos: preview rodando (npm run preview) e google-chrome no PATH.
 * Uso: npm run smoke
 */
import { spawn } from 'node:child_process'

const APP_URL = process.env.APP_URL ?? 'http://localhost:4173/'
const DEBUG_PORT = 9333
const PROFILE_DIR = '/tmp/opencode/chrome-smoke-profile'

// ---------- infra mínima de CDP ----------
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
        return
      }
      if (msg.method) this.listeners.push(msg)
    })
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    return new CDP(ws)
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    this.ws.close()
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      const tabs = await res.json()
      const page = tabs.find((tab) => tab.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // ainda subindo
    }
    await sleep(250)
  }
  throw new Error('Chrome não iniciou o DevTools')
}

// ---------- helper de avaliação ----------
function makeEval(cdp) {
  return async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'erro no evaluate')
    }
    return result.result.value
  }
}

/** Digita num textarea controlado pelo React. */
const TYPE_SCRIPT = (value) => `
(() => {
  const el = document.querySelector('.transcript-card__text')
  if (!el) return 'sem textarea'
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()
`

// ---------- cenário ----------
const failures = []
const notes = []

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` → ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let cdp
try {
  const wsUrl = await waitForDevTools()
  cdp = await CDP.connect(wsUrl)
  const evaluate = makeEval(cdp)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(2000)

  // 1. Renderizou?
  check(
    'app renderiza',
    await evaluate(`Boolean(document.querySelector('.transcript-card__text') && document.querySelector('.record-btn'))`),
  )

  // 2. Estado inicial
  check('campo vazio no início', (await evaluate(`document.querySelector('.transcript-card__text').value`)) === '')

  // 3. Digitar habilita as ações
  await evaluate(TYPE_SCRIPT('bom dia bom dia mundo'))
  await sleep(150)
  check(
    'digitar habilita "Salvar"',
    await evaluate(`!document.querySelector('.btn--accent')?.disabled && document.body.textContent.includes('palavra')`),
  )

  // 4. Salvar no histórico
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salvar').click()`)
  await sleep(200)
  const saved = await evaluate(
    `JSON.parse(localStorage.getItem('blip-vira-texto/history/v1') ?? '[]').length`,
  )
  check('salva no histórico (localStorage)', saved === 1, `itens=${saved}`)
  check('histórico aparece na tela', await evaluate(`document.querySelectorAll('.history__item').length === 1`))

  // 5. "Melhorar texto" aplica as regras
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Melhorar texto').click()`)
  await sleep(200)
  const polished = await evaluate(`document.querySelector('.transcript-card__text').value`)
  check('melhorar texto aplica regras', polished === 'Bom dia bom dia mundo.', `valor=${JSON.stringify(polished)}`)

  // 6. Toast aparece
  check('toast de confirmação', await evaluate(`Boolean(document.querySelector('.toast'))`))

  // 7. Recarregar mantém histórico
  await cdp.send('Page.navigate', { url: APP_URL })
  await sleep(1800)
  check('histórico persiste após reload', await evaluate(`document.querySelectorAll('.history__item').length === 1`))

  // 8. Botão de gravação não pode explodir (mic indisponível em headless é esperado)
  await evaluate(`document.querySelector('.record-btn').click()`)
  await sleep(1500)
  const stillAlive = await evaluate(`Boolean(document.querySelector('.transcript-card__text'))`)
  check('clicar em gravar não quebra a página', stillAlive)
  const status = await evaluate(
    `document.querySelector('.record-area__hint')?.textContent ?? ''`,
  )
  const error = await evaluate(`document.querySelector('.record-area__error')?.textContent ?? ''`)
  notes.push(`status pós-gravação: "${status}" | erro: "${error}" || (nenhum)`)
  check(
    'estado de escuta ou erro amigável',
    /Ouvindo|Aguardando|microfone|Permissão|rede/i.test(status + error),
    JSON.stringify(status || error),
  )

  // 9. Limpar zera o editor
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Limpar')?.click()`)
  await sleep(200)
  check('limpar zera o editor', (await evaluate(`document.querySelector('.transcript-card__text').value`)) === '')
} catch (err) {
  failures.push(`exceção: ${err.message}`)
  console.error('ERRO:', err.message)
} finally {
  for (const note of notes) console.log(`ℹ️  ${note}`)
  cdp?.close()
  chrome.kill('SIGTERM')
}

console.log(failures.length === 0 ? '\nSMOKE OK' : `\nSMOKE FALHOU: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
