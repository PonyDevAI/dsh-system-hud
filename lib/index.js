// dsh-system-hud · Host 半区
// - 自挂 /system-hud 前缀路由（webServer.register + connection.admit 认证围栏）
//   POST { endpoint, payload } → { ok:true, value } | { ok:false, error:{code,message} }
//   （不用 connection.rpc.handle：web 组合下它会因 connection fiber 缺 webServer 注入而抛错）
// - 采样生命周期交给 lib/sample.js：apply 之后才 start()，ctx.effect 处理时清定时器
// - 配置持久化：$DSH_HOME/system-hud/config.json（目录 0700 / 文件 0600，tmp+rename 原子写）
// - 安全：命令白名单在 lib/metrics.js；这里不接受任何前端传入的命令或参数
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSampler } from './sample.js'

export const name = 'dsh-system-hud'

/** 指标 id（metrics.order / metrics.hidden 的合法值） */
export const METRIC_IDS = ['cpu', 'memory', 'disk', 'network', 'io', 'temperature', 'load', 'processes']
/** 区域 id（regions.* 的合法值） */
export const REGION_IDS = ['header', 'dock', 'sidebar', 'rightPane', 'bottomBar']

/** 默认配置：与 cordis.patch.yml、docs/CONTRACT.md §4 保持一致 */
export const DEFAULTS = Object.freeze({
  fastMs: 1000,
  slowMs: 5000,
  topProcMs: 30000,
  regions: Object.freeze({ header: true, dock: true, sidebar: true, rightPane: true, bottomBar: false }),
  metrics: Object.freeze({ order: Object.freeze(['cpu', 'memory', 'disk', 'network', 'io', 'temperature']), hidden: Object.freeze(['load', 'processes']) }),
  unavailable: 'hide',
  thresholds: Object.freeze({ warn: 60, crit: 85, tempC: 90 }),
  units: 'bytes',
  showTotals: true,
  hoverDelayMs: 300,
  clickAction: 'pane',
})

const FAST_CHOICES = [1000, 2000, 5000]
const SLOW_CHOICES = [5000, 10000, 30000]
const TOP_CHOICES = [0, 10000, 30000]
const HOVER_CHOICES = [200, 300, 500]
const UNAVAILABLE_CHOICES = ['hide', 'dash', 'proxy']
const UNIT_CHOICES = ['bytes', 'bits']
const CLICK_CHOICES = ['pane', 'card']
const ENDPOINTS = new Set(['snapshot', 'config', 'save-config', 'refresh'])
const BODY_LIMIT = 1024 * 1024

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
const clampNumber = (value, fallback, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
const pickEnum = (value, choices, fallback) => (typeof value === 'string' && choices.includes(value) ? value : fallback)
const pickChoice = (value, choices, fallback) => (Number.isFinite(Number(value)) && choices.includes(Number(value)) ? Number(value) : fallback)
const pickBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

/**
 * 深合并：普通对象递归合并，数组/标量直接覆盖，`undefined` 忽略。
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} patch
 */
export function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...(isPlainObject(base) ? base : {}) }
  if (!isPlainObject(patch)) return out
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value
  }
  return out
}

/**
 * 把任意（可能非法）配置规范成合法配置：未知键丢弃、非法值回退默认、数组去重过滤。
 * 永不抛错。
 * @param {unknown} raw
 */
export function sanitizeConfig(raw) {
  const merged = deepMerge(DEFAULTS, isPlainObject(raw) ? raw : {})
  const config = {
    fastMs: pickChoice(merged.fastMs, FAST_CHOICES, DEFAULTS.fastMs),
    slowMs: pickChoice(merged.slowMs, SLOW_CHOICES, DEFAULTS.slowMs),
    topProcMs: pickChoice(merged.topProcMs, TOP_CHOICES, DEFAULTS.topProcMs),
    regions: {},
    metrics: {},
    unavailable: pickEnum(merged.unavailable, UNAVAILABLE_CHOICES, DEFAULTS.unavailable),
    thresholds: {
      warn: clampNumber(merged.thresholds?.warn, DEFAULTS.thresholds.warn, 0, 100),
      crit: clampNumber(merged.thresholds?.crit, DEFAULTS.thresholds.crit, 0, 100),
      tempC: clampNumber(merged.thresholds?.tempC, DEFAULTS.thresholds.tempC, 0, 150),
    },
    units: pickEnum(merged.units, UNIT_CHOICES, DEFAULTS.units),
    showTotals: pickBool(merged.showTotals, DEFAULTS.showTotals),
    hoverDelayMs: pickChoice(merged.hoverDelayMs, HOVER_CHOICES, DEFAULTS.hoverDelayMs),
    clickAction: pickEnum(merged.clickAction, CLICK_CHOICES, DEFAULTS.clickAction),
  }
  for (const id of REGION_IDS) {
    config.regions[id] = pickBool(merged.regions?.[id], DEFAULTS.regions[id])
  }
  config.metrics.order = normalizeMetricList(merged.metrics?.order, DEFAULTS.metrics.order, METRIC_IDS)
  config.metrics.hidden = normalizeMetricList(merged.metrics?.hidden, DEFAULTS.metrics.hidden, METRIC_IDS)
  return config
}

function normalizeMetricList(value, fallback, allowed) {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set()
  const out = []
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item) || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out.length ? out : [...fallback]
}

/** 至少一个区域启用时才需要采样 */
export function anyRegionEnabled(config) {
  return REGION_IDS.some((id) => config?.regions?.[id] === true)
}

/** 配置目录/文件路径（$DSH_HOME 优先） */
export function configPaths() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.trim() ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  const dir = join(home, 'system-hud')
  return { dir, file: join(dir, 'config.json') }
}

/** 原子写配置：目录 0700、文件 0600、tmp + rename */
async function persistConfig(config) {
  const { dir, file } = configPaths()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => {})
  const tmp = join(dir, `.config.${process.pid}.${Date.now()}.tmp`)
  try {
    await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    await rename(tmp, file)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

/** 读持久化配置；文件不存在/损坏都回退默认值，并给出 warning */
async function loadPersistedConfig() {
  const { file } = configPaths()
  try {
    const text = await readFile(file, 'utf8')
    return { config: sanitizeConfig(JSON.parse(text)), warning: null }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { config: sanitizeConfig({}), warning: null }
    return { config: sanitizeConfig({}), warning: '配置读取失败，已回退默认值: ' + messageOf(error) }
  }
}

function readBody(req, cap = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > cap) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res, code, payload) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

const okOf = (value) => ({ ok: true, value })
const failOf = (code, message) => ({ ok: false, error: { code, message } })

function messageOf(error) {
  const text = error && error.message ? String(error.message) : '未知错误'
  return text.length > 400 ? text.slice(0, 400) : text
}

export function apply(ctx, rawConfig) {
  const initial = sanitizeConfig(rawConfig || {})
  const state = { config: initial }

  const sampler = createSampler({
    fastMs: initial.fastMs,
    slowMs: initial.slowMs,
    topProcMs: initial.topProcMs,
    log: (line) => safeLog(ctx, 'debug', line),
  })

  // 持久化配置异步就位后覆盖默认值（采样器先按默认周期跑，读到后热更新）
  const ready = loadPersistedConfig()
    .then((result) => {
      state.config = result.config
      sampler.updateConfig(state.config)
      sampler.setEnabled(anyRegionEnabled(state.config))
      if (result.warning) safeLog(ctx, 'warn', result.warning)
    })
    .catch(() => {
      // 读取失败已在上方回退默认值，这里只吞掉异常
    })

  async function handle(endpoint, payload) {
    switch (endpoint) {
      case 'snapshot': {
        sampler.touch()
        return okOf(sampler.getSnapshot())
      }
      case 'config':
        await ready
        return okOf(state.config)
      case 'save-config': {
        await ready
        const merged = sanitizeConfig(deepMerge(state.config, isPlainObject(payload) ? payload : {}))
        state.config = merged
        sampler.updateConfig(merged)
        sampler.setEnabled(anyRegionEnabled(merged))
        const warnings = []
        try {
          await persistConfig(merged)
        } catch (error) {
          const message = '配置保存失败（内存中已生效）: ' + messageOf(error)
          warnings.push(message)
          safeLog(ctx, 'warn', message)
        }
        return warnings.length ? { ok: true, value: merged, warnings } : okOf(merged)
      }
      case 'refresh': {
        await ready
        return okOf(await sampler.forceRefresh())
      }
      default:
        return null
    }
  }

  // 采样器生命周期：apply 之后才启动；ctx 销毁时清定时器
  ctx.effect(() => {
    sampler.start()
    return () => sampler.dispose()
  }, 'dsh-system-hud: sampler')

  // 路由：connection.admit 认证围栏 + webServer 注册
  ctx.inject(['connection', 'webServer'], (scope) => {
    scope.effect(
      () =>
        scope.webServer.register({
          kind: 'prefix',
          path: '/system-hud',
          handler: async (req, res) => {
            const admission = scope.connection.admit(req)
            if ('rejection' in admission) {
              res.writeHead(admission.rejection)
              res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
              return
            }
            if (req.method !== 'POST') {
              json(res, 405, failOf('system-hud/method', '只接受 POST'))
              return
            }
            const pathname = String(req.url || '/').split('?')[0]
            const fromPath = pathname.replace(/^\/system-hud\/?/, '').replace(/\/+$/, '')
            let parsed
            try {
              parsed = JSON.parse((await readBody(req)) || '{}')
            } catch {
              json(res, 400, failOf('system-hud/bad-body', '请求体不是 JSON（或超过 1 MiB）'))
              return
            }
            const body = isPlainObject(parsed) ? parsed : {}
            const endpoint = fromPath || String(body.endpoint || '').trim()
            if (!ENDPOINTS.has(endpoint)) {
              json(res, 404, failOf('system-hud/not-found', '未知接口: ' + (endpoint || '(empty)')))
              return
            }
            try {
              const result = await handle(endpoint, payloadOf(body))
              json(res, 200, result)
            } catch (error) {
              json(res, 200, failOf('system-hud/internal', messageOf(error)))
            }
          },
        }),
      'dsh-system-hud: route',
    )
  })
}

/** 契约要求 body 形如 { endpoint, payload }；同时容忍直接发 payload 的客户端 */
function payloadOf(body) {
  if (isPlainObject(body.payload)) return body.payload
  const { endpoint: _endpoint, payload: _payload, ...rest } = body
  return isPlainObject(rest) && Object.keys(rest).length ? rest : {}
}

function safeLog(ctx, level, message) {
  try {
    if (!ctx || typeof ctx.logger !== 'function') return
    const logger = ctx.logger('system-hud')
    const fn = logger && typeof logger[level] === 'function' ? logger[level] : null
    if (fn) fn.call(logger, message)
  } catch {
    // 日志失败不影响主流程
  }
}
