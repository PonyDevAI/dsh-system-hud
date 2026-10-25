// dsh-system-hud · 离线 UI 预览
// 用途：不重启 dsh，用假的 __ModuleLoader__ / React / ctx / fetch 渲染
//      三个位置（顶栏 / 输入框底部 / 侧栏底部）、右栏「系统」详情、设置页，
//      然后用本机 Chrome 截图到 docs/screenshots/01-regions.png。
// 用法：node scripts/render-test.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
const CLIENT_ESCAPED = CLIENT.replace(/<\/script>/g, '<\\/script>')

const OUT_HTML = '/tmp/dsh-system-hud-render.html'
const OUT_PNG = join(ROOT, 'docs', 'screenshots', '01-regions.png')
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

// 与 DESIGN/mockup 一致的设计稿数值（真实运行时这些字段都来自 Host 快照）
const FIXTURE = {
  host: {
    name: 'Mac Studio',
    platform: 'darwin',
    chip: 'Apple M1 Max',
    cores: 10,
    uptimeSec: 738000,
    sampledAt: 0,
  },
  cpu: {
    usagePercent: 71.2,
    perCore: [38.0, 62.4, 45.1, 81.3, 57.0, 92.2, 49.4, 68.1, 34.2, 74.0],
    load: [2.31, 2.1, 1.98],
    sampledAt: 0,
  },
  memory: {
    usedBytes: 26424115200,
    totalBytes: 34359738368,
    cacheBytes: 1572864000,
    swapUsedBytes: 1288490188,
    sampledAt: 0,
  },
  disk: {
    usedBytes: 1100219413708,
    totalBytes: 2000398934016,
    freeBytes: 870000000000,
    readBytesPerSec: 161480704,
    writeBytesPerSec: 38692454,
    readTotalBytes: 106945000000000,
    writeTotalBytes: 67900000000000,
    sampledAt: 0,
  },
  network: {
    rxBytesPerSec: 5872025,
    txBytesPerSec: 11010048,
    rxTotalBytes: 10335409301094,
    txTotalBytes: 5712000000000,
    sampledAt: 0,
  },
  temperature: {
    available: true,
    reason: null,
    cpuC: 62,
    ssdC: 41,
    ambientC: 28,
    source: 'fixture',
    sampledAt: 0,
  },
  processes: [
    { name: 'node', cpuPercent: 38.2, memoryBytes: 4404019200 },
    { name: 'WindowServer', cpuPercent: 12.6, memoryBytes: 1932735283 },
    { name: 'mds_stores', cpuPercent: 6.1, memoryBytes: 641728512 },
  ],
  power: { watts: 28 },
  warnings: [],
}

const DEFAULT_CONFIG = {
  fastMs: 1000,
  slowMs: 5000,
  topProcMs: 30000,
  regions: { header: true, dock: true, sidebar: true, rightPane: true, bottomBar: false },
  metrics: { order: ['cpu', 'memory', 'disk', 'network', 'io', 'temperature', 'load', 'processes'], hidden: ['load'] },
  unavailable: 'hide',
  thresholds: { warn: 60, crit: 85, tempC: 90 },
  units: 'bytes',
  showTotals: true,
  hoverDelayMs: 300,
  clickAction: 'pane',
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-system-hud render</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',sans-serif;color:#191f28;-webkit-font-smoothing:antialiased}
  body{
    --dsw-alias-bg-base:#f6f7f9; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#ffffff;
    --dsw-alias-label-primary:#191f28; --dsw-alias-label-secondary:#637182; --dsw-alias-label-tertiary:#98a2b3;
    --dsw-alias-border-l1:#e3e7ed; --dsw-alias-border-l2:#edf0f4; --dsw-alias-border-l3:#d5dae2; --dsw-alias-border-l4:#c6ccd6;
    --dsw-alias-scrollbar-bg-l1:#e4e8ee; --dsw-alias-scrollbar-bg-l2:#e4e8ee; --dsw-alias-scrollbar-hover-l1:#d5dae2; --dsw-alias-scrollbar-hover-l2:#d5dae2;
    --dsw-alias-interactive-bg-hover:rgba(38,49,72,.06);
    --dsw-alias-state-business-primary:#4176e6; --dsw-alias-state-business-tertiary:#e8effd;
    --dsw-alias-state-success-primary:#12b76a; --dsw-alias-state-success-secondary:#4ed17e; --dsw-alias-state-success-tertiary:#e7f8f0;
    --dsw-alias-state-warn-primary:#f79009; --dsw-alias-state-warn-secondary:#f7ad31; --dsw-alias-state-warn-tertiary:#fdf2e3;
    --dsw-alias-state-error-primary:#f04438; --dsw-alias-state-error-secondary:#f25a5a;
    --dsw-alias-settings-card-fill:#ffffff; --dsw-alias-settings-card-stroke:#e3e7ed;
    --dsw-alias-link:#4176e6; --dsw-alias-toast-bg:#353638; --dsw-alias-toast-label:#fff;
    --dsw-elevation-prominent:0 8px 24px rgba(16,24,40,.10);
    --dsw-radius-xs:4px; --dsw-radius-sm:8px; --dsw-radius-md:12px; --dsw-radius-lg:16px; --dsw-radius-panel:28px;
    --ds-font-family-code:ui-monospace,SFMono-Regular,Menlo,monospace;
    --dsh-content-font-size:14px; --dsh-content-font-size-secondary:13px;
    font-variant-numeric:tabular-nums;
  }
  .app{width:1600px;height:1000px;display:flex;background:#f6f7f9;overflow:hidden;position:relative}
  .sidebar{width:280px;flex:none;background:#eceff3;background-image:linear-gradient(180deg,rgba(122,155,240,.10),rgba(143,137,184,.06));border-right:.5px solid #e3e7ed;display:flex;flex-direction:column;padding:0 0 10px}
  .brand{height:52px;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:13px;font-weight:600}
  .logo{width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,#4c7ef3,#8aa9ff);flex:none}
  .sideactions{padding:0 12px;display:flex;flex-direction:column;gap:8px}
  .sbtn{height:34px;border-radius:10px;background:#fff;border:1px solid #e3e7ed;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12.5px;color:#637182;box-shadow:0 1px 2px rgba(16,24,40,.05)}
  .search{height:32px;border-radius:9px;background:#f6f7f9;border:1px solid #e3e7ed;display:flex;align-items:center;gap:7px;padding:0 10px;font-size:12px;color:#98a2b3}
  .scroll{flex:1;padding:10px 8px 0;overflow:hidden}
  .grp{font-size:10.5px;color:#98a2b3;padding:8px 10px 5px}
  .item{height:32px;border-radius:9px;padding:0 10px;display:flex;align-items:center;font-size:12.5px;color:#637182;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .item.on{background:#fff;color:#191f28;box-shadow:0 1px 2px rgba(16,24,40,.06)}
  .foot{flex:none;padding:0 8px;display:flex;flex-direction:column;gap:2px}
  .qcard{padding:9px 10px 10px;border-radius:11px;background:#fff;border:1px solid #e3e7ed;box-shadow:0 1px 2px rgba(16,24,40,.05)}
  .qcard .r1{display:flex;align-items:center;gap:8px;font-size:11px;color:#637182}
  .qcard .r1 .nm{font-weight:600;color:#191f28}
  .qcard .bar{flex:1;height:5px;border-radius:99px;background:#e4e8ee;overflow:hidden}
  .qcard .bar i{display:block;height:100%;width:46%;background:#191f28}
  .qcard .left{font-size:11px;font-weight:600;color:#191f28}
  .frow{height:30px;border-radius:8px;padding:0 10px;display:flex;align-items:center;gap:8px;font-size:12px;color:#637182}
  .frow .ic{color:#98a2b3}
  .main{flex:1;min-width:0;display:flex;flex-direction:column;background:#f6f7f9}
  .head{height:52px;flex:none;display:flex;align-items:center;gap:10px;padding:0 18px;border-bottom:.5px solid #e3e7ed;background:#f6f7f9}
  .head .title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px}
  .tools{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12px;color:#98a2b3}
  .account{width:30px;height:30px;border-radius:9px;background:#fff;border:1px solid #e3e7ed;display:flex;align-items:center;justify-content:center;color:#637182}
  .chat{flex:1;display:flex;flex-direction:column;align-items:center;padding:26px 0 6px;overflow:hidden;min-height:0}
  .wo{width:800px;display:flex;flex-direction:column;gap:20px}
  .umsg{align-self:flex-end;max-width:560px;background:#e8effd;border-radius:14px 14px 4px 14px;padding:10px 14px;font-size:13px;line-height:1.7}
  .asst{display:flex;gap:10px}
  .av{width:22px;height:22px;border-radius:7px;flex:none;background:linear-gradient(135deg,#4c7ef3,#8aa9ff)}
  .abody{flex:1;display:flex;flex-direction:column;gap:9px}
  .who{font-size:11px;color:#98a2b3;display:flex;gap:8px;align-items:center}
  .sk{height:11px;border-radius:6px;background:#e6e9ef}
  .p{font-size:13px;line-height:1.85}
  .toolchip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid #e3e7ed;border-radius:10px;background:#fff;font-size:11.5px;color:#637182;width:fit-content;box-shadow:0 1px 2px rgba(16,24,40,.05)}
  .cwrap{flex:none;padding:6px 22px 14px;display:flex;flex-direction:column;align-items:center;gap:8px}
  .composer{width:800px;background:#fff;border:1px solid #e3e7ed;border-radius:18px;padding:11px 12px 9px;box-shadow:0 8px 24px rgba(16,24,40,.08)}
  .crow1{display:flex;align-items:flex-start;gap:10px;min-height:40px}
  .cplus{width:28px;height:28px;border-radius:8px;border:1px solid #e3e7ed;display:flex;align-items:center;justify-content:center;color:#637182;flex:none;font-size:16px}
  .ctext{font-size:13px;line-height:1.6;padding-top:3px}
  .crow2{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#98a2b3}
  .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:8px;background:#f7f9fc;border:1px solid #e3e7ed;font-size:11.5px;color:#637182}
  .model{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#637182}
  .model .b{font-weight:600;color:#191f28}
  .model .send{width:30px;height:30px;border-radius:50%;background:#4176e6;color:#fff;display:flex;align-items:center;justify-content:center;margin-left:4px}
  /* 复刻 DSH 的 composer dock 容器：单行 flex、居中、gap、无 wrap、不占满整行 */
  .meta{display:flex;justify-content:center;align-items:center;gap:12px;max-width:100%;min-height:22px;font-size:11.5px;color:#98a2b3}
  .meta .pill{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:0 1 auto;min-width:0;overflow:hidden}
  .meta .pill b{color:#637182;font-weight:600}
  .meta .ctxring{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto}
  #dockRoot{display:contents}
  .pane{width:420px;flex:none;background:#f6f7f9;border-left:.5px solid #e3e7ed;display:flex;flex-direction:column;min-height:0}
  .ptabs{height:44px;flex:none;display:flex;align-items:center;gap:2px;padding:0 12px;border-bottom:.5px solid #e3e7ed;background:#f6f7f9}
  .ptab{font-size:11.5px;color:#98a2b3;padding:5px 10px;border-radius:7px}
  .ptab.on{color:#191f28;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.06);font-weight:600}
  #paneRoot{flex:1;min-height:0}
  .settingsWrap{width:1400px;margin:24px auto 40px;background:#f6f7f9;border:1px solid #e3e7ed;border-radius:16px;padding:26px 34px;display:flex;gap:28px}
  .settingsNav{width:180px;flex:none;font-size:12px;color:#637182}
  .settingsNav h1{font-size:13px;font-weight:650;color:#191f28;padding:0 10px 14px}
  .snavitem{height:32px;border-radius:8px;display:flex;align-items:center;padding:0 10px;margin-bottom:1px}
  .snavitem.on{background:#fff;color:#191f28;font-weight:600;box-shadow:0 1px 2px rgba(16,24,40,.06)}
  .settingsBody{flex:1;min-width:0}
  .caption{font-size:11px;color:#98a2b3;margin:0 0 8px 2px}
  .err{color:#f04438;font-size:12px;padding:8px}
</style>
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
</head><body>
<div class="app">
  <div id="overlayRoot" style="position:fixed;left:0;top:0;width:100%;height:100%;z-index:20;pointer-events:none"></div>
  <aside class="sidebar">
    <div class="brand"><span class="logo"></span>DeepSeek Harness</div>
    <div class="sideactions"><div class="sbtn">＋ 新会话</div><div class="search">搜索会话</div></div>
    <div class="scroll">
      <div class="grp">今天</div>
      <div class="item on">把硬件状态条加进 dsh</div>
      <div class="item">修复 dsh 插件热更新</div>
      <div class="item">整理模型用量方案</div>
      <div class="grp">昨天</div>
      <div class="item">排查 zai-coding-cn 401</div>
      <div class="item">升级 Node 24</div>
    </div>
    <div class="foot">
      <div class="qcard"><div class="r1"><span class="nm">每月限额</span><span class="bar"><i></i></span><span class="left">剩余 54%</span></div></div>
      <div id="footHost" style="width:256px;display:flex">
        <div data-slot="sidebar.footer.action" style="display:contents"><div id="footRoot"></div></div>
      </div>
      <div class="frow"><span class="ic">◇</span>插件</div>
      <div class="frow"><span class="ic">⋯</span>更多</div>
    </div>
  </aside>
  <main class="main">
    <div class="head">
      <span class="title">把硬件状态条加进 dsh</span>
      <div class="tools"><span>⌘L 会话日志</span><span>更多</span><span id="headerRoot"></span><span class="account">◔</span></div>
    </div>
    <div class="chat"><div class="wo">
      <div class="umsg">我想做个 dsh 插件，显示设备的 CPU、内存、硬盘、网络、温度。位置我想放三处：右上、输入框下面、左下。</div>
      <div class="asst"><div class="av"></div><div class="abody">
        <div class="who"><span>deepseek-v4.1-flash</span><span>·</span><span>12s</span></div>
        <div class="sk" style="width:92%"></div><div class="sk" style="width:78%"></div>
        <div class="toolchip">▸ bash — vm_stat | head -8 &amp;&amp; netstat -ibn | head -4<span style="color:#12b76a;font-weight:600;margin-left:4px">✓ 200</span></div>
        <div class="sk" style="width:64%"></div>
        <div class="p">三个位置都能落在 DSH 原生插槽里：<b>顶栏 utilities</b>（点它开右侧「系统」tab）、<b>composer dock</b>（和 token 统计同一行）、<b>sidebar footer</b>（在「每月限额」和「更多」之间）。默认全开，设置里可以单独关。</div>
      </div></div>
    </div></div>
    <div class="cwrap"><div class="composer">
      <div class="crow1"><span class="cplus">＋</span><span class="ctext">好，就按这三个位置接：顶栏入口、输入框底部、侧边栏底部</span></div>
      <div class="crow2"><span class="chip">▱ 工作区内容修改 ⌄</span><span class="model"><span class="b">DeepSeek V4.1 Flash</span><span>Default</span><span class="send">↑</span></span></div>
    </div>
    <div class="meta">
      <span id="dockRoot"></span>
      <span class="pill">◔ <b>1 轮 100 步</b> · 148 tok/s</span>
      <span class="pill">▤ <b>13.5M tok</b> · 缓存命中 98%</span>
      <span class="ctxring">◯ 22%</span>
    </div></div>
  </main>
  <section class="pane">
    <div class="ptabs"><span class="ptab on">系统</span><span class="ptab">文件</span><span class="ptab">终端</span></div>
    <div id="paneRoot"></div>
  </section>
</div>
<div class="settingsWrap">
  <aside class="settingsNav">
    <h1>设置</h1>
    <div class="snavitem">通用</div><div class="snavitem">模型</div><div class="snavitem">插件</div>
    <div class="snavitem on">系统 HUD</div><div class="snavitem">快捷键</div><div class="snavitem">关于</div>
  </aside>
  <div class="settingsBody"><div class="caption">设置 → 系统 HUD（M1）</div><div id="settingsRoot"></div></div>
</div>
<script>
window.__ModuleLoader__ = { load(definition) { window.__DEF__ = definition } }
window.onerror = function (message) { document.title = 'ERR ' + message }
window.addEventListener('unhandledrejection', function (event) {
  document.title = 'REJ ' + (event.reason && event.reason.message || event.reason)
})
</script>
<script id="client-src">${CLIENT_ESCAPED}</script>
<script>
const React = window.React
const ReactDOM = window.ReactDOM
const h = React.createElement

// ---- 假快照：字段与 docs/CONTRACT.md §3 一致；sampledAt/timestamp 每次调用刷新
const BASE = ${JSON.stringify(FIXTURE)}
let pollCount = 0
const HASH = String(location.hash || '')
const FIRST_FRAME = HASH.indexOf('firstframe') >= 0
const NO_TEMP = FIRST_FRAME || HASH.indexOf('unavailable') >= 0
function makeSnapshot() {
  const now = Date.now()
  const out = JSON.parse(JSON.stringify(BASE))
  pollCount += 1
  if (FIRST_FRAME) {
    // Host 首帧：没有前值 → usagePercent / perCore / load / 速率全部 null
    out.cpu.usagePercent = null
    out.cpu.perCore = null
    out.cpu.load = null
    out.memory.usedBytes = null
    out.memory.totalBytes = null
    out.disk.usedBytes = null
    out.disk.totalBytes = null
    out.disk.freeBytes = null
    out.disk.readBytesPerSec = null
    out.disk.writeBytesPerSec = null
    out.network.rxBytesPerSec = null
    out.network.txBytesPerSec = null
    out.memory.swapUsedBytes = null
    out.processes = null
    out.cpu.sampledAt = null
    out.memory.sampledAt = null
    out.disk.sampledAt = null
    out.network.sampledAt = null
  }
  if (NO_TEMP) {
    out.temperature = { available: false, reason: 'needs-helper', cpuC: null, ssdC: null, ambientC: null, source: null, sampledAt: null }
  }
  if (!FIRST_FRAME && pollCount < 45) {
    const wave = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(pollCount * 0.7))
    out.network.rxBytesPerSec = Math.round(BASE.network.rxBytesPerSec * wave)
    out.network.txBytesPerSec = Math.round(BASE.network.txBytesPerSec * (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(pollCount * 0.55))))
  }
  out.timestamp = now
  out.monotonicMs = 812341
  out.intervalMs = 1000
  out.host.sampledAt = now - 2000
  if (!FIRST_FRAME) {
    out.cpu.sampledAt = now - 300
    out.memory.sampledAt = now - 1800
    out.disk.sampledAt = now - 2300
    out.network.sampledAt = now - 300
  }
  if (!NO_TEMP) out.temperature.sampledAt = now - 2200
  return out
}
let config = JSON.parse(JSON.stringify(${JSON.stringify(DEFAULT_CONFIG)}))
if (FIRST_FRAME || NO_TEMP) config.unavailable = 'dash'
function merge(target, patch) {
  const out = JSON.parse(JSON.stringify(target))
  for (const key of Object.keys(patch || {})) {
    const value = patch[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = Object.assign({}, out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}
window.fetch = async function (url, init) {
  const endpoint = String(url).split('/').pop()
  let body = {}
  try { body = init && init.body ? JSON.parse(init.body) : {} } catch (error) { body = {} }
  let value = null
  if (endpoint === 'snapshot') value = makeSnapshot()
  else if (endpoint === 'config') value = config
  else if (endpoint === 'save-config') {
    config = merge(config, body.payload || {})
    value = config
    window.__SAVED__ = (window.__SAVED__ || 0) + 1
    window.__LAST_SAVE__ = body.payload || null
  } else {
    return new Response(JSON.stringify({ ok: false, error: { code: 'not-found', message: endpoint } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } })
}

// ---- 假 ctx：捕获 slot 注册，locale 提供字典，sidebarRight* 记录调用
const DICT = {}
const captured = Object.create(null)
const noop = function () {}
let injectingSlot = null
const ctx = {
  effect(fn) {
    try { const dispose = fn(); return typeof dispose === 'function' ? dispose : noop } catch (error) { console.error('effect failed', error); return noop }
  },
  locale: {
    register(namespace, dictionaries) { DICT.zh = dictionaries.zh; DICT.en = dictionaries.en; return noop },
    bind() { return function (key, vars) { let text = DICT.zh && DICT.zh[key] != null ? DICT.zh[key] : key; if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name])); return text } },
    subscribe() { return noop }
  },
  slots: {
    inject(slot, register) {
      const previous = injectingSlot
      injectingSlot = slot
      try { register() } catch (error) { console.error('slot inject failed', slot, error) }
      finally { injectingSlot = previous }
      return noop
    },
    register(options, comp) {
      const key = injectingSlot || options.name
      captured[key] = { options, comp }
      return noop
    },
    entriesOfSlot() { return [] },
    subscribe() { return noop }
  },
  inject(names, callback) {
    try { callback(ctx) } catch (error) { console.error('ctx.inject failed', error) }
    return noop
  },
  get(name) {
    if (name === 'sidebarRight') return { openTab() { window.__OPENED__ = (window.__OPENED__ || 0) + 1 } }
    if (name === 'sidebarRightTabs') return { register(definition) { window.__TABTYPE__ = definition; return noop } }
    return undefined
  },
  sidebarRight: { openTab() { window.__OPENED__ = (window.__OPENED__ || 0) + 1 } },
  sidebarRightTabs: { register(definition) { window.__TABTYPE__ = definition; return noop } },
  on() { return noop }
}
window.__CTX__ = ctx

function requireStub(name) {
  if (name === 'react') return React
  if (name === 'react-dom') return ReactDOM
  return {
    Button(props) {
      return h('button', { type: 'button', className: 'huds-btn ' + (props.variant || ''), onClick: props.onClick, disabled: props.disabled }, props.children)
    },
    SegmentedTabs(props) {
      return h('div', { className: 'huds-seg', role: 'tablist' }, props.items.map(function (item) {
        return h('button', {
          key: String(item.value), type: 'button', role: 'tab',
          className: item.value === props.value ? 'on' : '',
          'aria-selected': item.value === props.value ? 'true' : 'false',
          onClick: function () { props.onChange(item.value) }
        }, item.label)
      }))
    }
  }
}

const plugin = window.__DEF__.factory(requireStub)
plugin.apply(ctx)

const t = function (key, vars) {
  let text = DICT.zh && DICT.zh[key] != null ? DICT.zh[key] : key
  if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
  return text
}
function renderSlot(slot, extra) {
  const entry = captured[slot]
  if (!entry) { console.error('slot not captured:', slot); return h('div', { className: 'err' }, 'slot not captured: ' + slot) }
  const injected = entry.options.inject ? entry.options.inject('demo-session') : {}
  const props = Object.assign({ t: t, sessionId: 'demo-session' }, injected, extra || {})
  return h(entry.comp, props)
}
const tabInfo = { tab: { id: 'tab-1', visible: true, navigation: { params: {} } }, panel: { id: 'pane-1' }, sidebar: { expanded: true, fullscreen: false } }
ReactDOM.createRoot(document.getElementById('headerRoot')).render(renderSlot('conversation.session.header.utilities'))
ReactDOM.createRoot(document.getElementById('dockRoot')).render(renderSlot('conversation.composer.dock'))
ReactDOM.createRoot(document.getElementById('footRoot')).render(renderSlot('sidebar.footer.action', { wide: true }))
ReactDOM.createRoot(document.getElementById('overlayRoot')).render(renderSlot('shell.overlay'))
ReactDOM.createRoot(document.getElementById('paneRoot')).render(renderSlot('sidebar.right.pane.tab', { useTabInfo: function () { return tabInfo } }))
ReactDOM.createRoot(document.getElementById('settingsRoot')).render(renderSlot('settings.section', { close: function () {} }))

// #interact：点侧栏卡片（应 openTab）+ 打开「全宽底栏」开关（应 save-config）
if (HASH.indexOf('interact') >= 0) {
  setTimeout(function () {
    const card = document.querySelector('#overlayRoot .huds-card')
    if (card) card.click()
    const switches = document.querySelectorAll('#settingsRoot .huds-region .huds-switch')
    if (switches.length >= 5) switches[4].click()
  }, 3200)
}

setTimeout(function () {
  const slots = Object.keys(captured).join(',')
  const rootText = ['#headerRoot', '#dockRoot', '#overlayRoot', '#paneRoot']
    .map(function (selector) { const node = document.querySelector(selector); return node ? node.innerText : '' })
    .join(String.fromCharCode(10))
  window.__RENDER_INFO__ = {
    slots: slots,
    tabType: window.__TABTYPE__ ? window.__TABTYPE__.id + '/' + window.__TABTYPE__.kind : 'missing',
    saved: window.__SAVED__ || 0,
    lastSave: window.__LAST_SAVE__ || null,
    opened: window.__OPENED__ || 0,
    header: !!document.querySelector('#headerRoot .huds-head'),
    dock: !!document.querySelector('#dockRoot .huds-dock'),
    card: !!document.querySelector('#overlayRoot .huds-card'),
    pane: !!document.querySelector('#paneRoot .huds-pane'),
    settings: !!document.querySelector('#settingsRoot .huds-settings'),
    nan: /NaN|undefined/.test(rootText),
    dashCount: (rootText.match(/—/g) || []).length,
    dockText: (document.querySelector('#dockRoot .huds-dock') || {}).innerText || '',
    headerText: (document.querySelector('#headerRoot .huds-head') || {}).innerText || '',
    cardText: (document.querySelector('#overlayRoot .huds-card') || {}).innerText || '',
    paneText: (document.querySelector('#paneRoot .huds-pane') || {}).innerText || ''
  }
  document.title = 'ready ' + JSON.stringify(window.__RENDER_INFO__)
  console.log('render', window.__RENDER_INFO__)
}, 4800)
</script>
</body></html>`

mkdirSync(join(ROOT, 'docs', 'screenshots'), { recursive: true })
writeFileSync(OUT_HTML, html)
console.log('html  ' + OUT_HTML)

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (!chrome) {
  console.log('chrome not found; open the html manually: ' + OUT_HTML)
  process.exit(0)
}
try {
  execFileSync(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--hide-scrollbars',
    '--user-data-dir=/tmp/dsh-system-hud-chrome',
    '--force-device-scale-factor=2',
    '--window-size=1600,1000',
    '--virtual-time-budget=65000',
    '--screenshot=' + OUT_PNG,
    'file://' + OUT_HTML,
  ], { stdio: 'ignore', timeout: 90000 })
  console.log('png   ' + OUT_PNG)
  const settingsPng = join(ROOT, 'docs', 'screenshots', '02-settings.png')
  execFileSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-crash-reporter', '--disable-breakpad', '--hide-scrollbars',
    '--user-data-dir=/tmp/dsh-system-hud-chrome-settings',
    '--force-device-scale-factor=1',
    '--window-size=1400,3300',
    '--virtual-time-budget=65000',
    '--screenshot=' + settingsPng,
    'file://' + OUT_HTML,
  ], { stdio: 'ignore', timeout: 90000 })
  console.log('png   ' + settingsPng)

  // 无头断言：交互是否真的落 save-config / null 首帧是否出现 — 而不是 0/NaN
  const dump = (hash) => {
    const out = execFileSync(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-crash-reporter', '--disable-breakpad', '--hide-scrollbars',
      '--user-data-dir=/tmp/dsh-system-hud-chrome-' + hash.replace(/[^a-z0-9]/gi, ''),
      '--window-size=1600,1000',
      '--virtual-time-budget=9000',
      '--dump-dom',
      'file://' + OUT_HTML + '#' + hash,
    ], { encoding: 'utf8', timeout: 90000 })
    const match = out.match(/<title>ready (\{.*?\})<\/title>/)
    if (!match) throw new Error('no render info for #' + hash)
    return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  }
  const interact = dump('interact')
  const first = dump('firstframe')
  const checks = [
    ['settings toggle -> save-config', interact.saved >= 1 && interact.lastSave && interact.lastSave.regions && interact.lastSave.regions.bottomBar === true],
    ['region click -> openTab', interact.opened >= 1],
    ['first frame no NaN/undefined', first.nan === false],
    ['first frame shows dash', first.dashCount > 0 && first.dockText.indexOf('—') >= 0 && first.headerText.indexOf('—') >= 0 && first.paneText.indexOf('—') >= 0],
    ['first frame card dash', first.cardText.indexOf('—') >= 0]
  ]
  let failed = 0
  for (const [name, ok] of checks) {
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
    if (!ok) failed += 1
  }
  if (failed > 0) {
    console.error('render assertions failed: ' + failed)
    process.exitCode = 1
  }
} catch (error) {
  console.error('screenshot failed: ' + (error && error.message ? error.message : error))
  process.exitCode = 1
}
