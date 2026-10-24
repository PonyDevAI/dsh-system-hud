// 校验 lib/client.js 里 zh / en 字典键完全一致，并且源码里 t('key') 用到的键都有定义。
// 不依赖浏览器：用桩把 ModuleLoader / React / document / ctx 折起来，跑一遍 apply 抓字典。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = readFileSync(clientPath, 'utf8')

let definition = null
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      definition = entry
    },
  },
}
globalThis.document = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  createElement() {
    return { setAttribute() {}, appendChild() {}, style: {}, classList: { add() {}, remove() {} } }
  },
  head: { appendChild() {}, removeChild() {} },
  body: { appendChild() {}, removeChild() {} },
  querySelector() {
    return null
  },
  documentElement: {},
}
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}
globalThis.setTimeout = () => 0
globalThis.clearTimeout = () => {}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: {} }) })
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const stub = () => undefined
const element = () => null
const reactStub = new Proxy(
  {},
  {
    get(target, key) {
      if (key === 'createElement') return element
      if (key === 'Fragment') return 'fragment'
      return stub
    },
  },
)
const reactDomStub = { createPortal: element }
const primitivesStub = new Proxy(
  {},
  {
    get() {
      return element
    },
  },
)

const dictionaries = {}
const noopDispose = () => {}
const safe = (fn) => {
  try {
    const out = fn()
    return typeof out === 'function' ? out : noopDispose
  } catch {
    return noopDispose
  }
}

const slotsStub = {
  inject() {
    return noopDispose
  },
  register() {
    return { options: {}, comp: element }
  },
  entriesOfSlot() {
    return []
  },
  subscribe() {
    return noopDispose
  },
  renderSlot() {
    return null
  },
}

const ctx = {
  effect: safe,
  interval: () => noopDispose,
  timeout: () => noopDispose,
  get: () => undefined,
  inject(names, callback) {
    try {
      const scope = { ...ctx, effect: safe }
      callback(scope)
    } catch {
      /* 桩不执行真实注入 */
    }
    return noopDispose
  },
  on: () => noopDispose,
  locale: {
    register(namespace, value) {
      dictionaries[namespace] = value
      return noopDispose
    },
    bind() {
      return (key) => key
    },
    subscribe() {
      return noopDispose
    },
    current() {
      return 'zh'
    },
  },
  slots: slotsStub,
  sidebarRight: { openTab() {}, open() {} },
  sidebarRightTabs: { register() { return noopDispose }, unregister() {} },
  connection: { rpc: { call: async () => ({}) } },
  settings: { register() { return noopDispose } },
  theme: { getTheme: () => 'light', subscribe: () => noopDispose },
}

/* eslint-disable no-new-func */
new Function('window', 'document', 'globalThis', source)(globalThis.window, globalThis.document, globalThis)
/* eslint-enable no-new-func */

if (!definition) {
  console.error('FAIL  client.js 没有调用 window.__ModuleLoader__.load')
  process.exit(1)
}

const factory = definition.factory
const requireStub = (name) => {
  if (name === 'react') return reactStub
  if (name === 'react-dom') return reactDomStub
  return primitivesStub
}

try {
  const plugin = factory(requireStub)
  if (plugin && typeof plugin.apply === 'function') {
    plugin.apply(ctx)
  }
} catch (error) {
  console.error('FAIL  apply 抛错：' + (error && error.message ? error.message : error))
  process.exit(1)
}

const ns = Object.keys(dictionaries).find((key) => dictionaries[key] && dictionaries[key].zh)
if (!ns) {
  console.error('FAIL  没有捕获到 locale.register(NS, { zh, en }) 字典')
  process.exit(1)
}

const { zh, en } = dictionaries[ns]
let failures = 0
const zhKeys = new Set(Object.keys(zh || {}))
const enKeys = new Set(Object.keys(en || {}))

for (const key of zhKeys) {
  if (!enKeys.has(key)) {
    console.error('FAIL  en 缺少键：' + key)
    failures += 1
  }
}
for (const key of enKeys) {
  if (!zhKeys.has(key)) {
    console.error('FAIL  zh 缺少键：' + key)
    failures += 1
  }
}

const used = new Set()
for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) used.add(match[1])
for (const match of source.matchAll(/\btr\(\s*'([a-zA-Z0-9_.-]+)'/g)) used.add(match[1])
for (const key of used) {
  if (!zhKeys.has(key)) {
    console.error('FAIL  源码用到但字典缺失：' + key)
    failures += 1
  }
}

if (failures > 0) process.exit(1)
console.log('OK  i18n: ' + ns + ' · ' + zhKeys.size + ' 键，zh/en 一致，源码用键全部存在')
