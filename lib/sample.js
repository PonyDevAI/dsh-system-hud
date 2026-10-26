// dsh-system-hud · 分层采样器
// - 三层定时器：fast / slow / top；**模块加载时不启动**，只有调用 start() 才开始
// - 每次采样单飞（上一轮没完成就跳过，不排队、不堆积子进程）
// - 累计量差分：速率 = Δbytes / Δt，Δt 用单调时钟（performance.now），不用墙钟
// - 失败策略：保留上一次成功值 + warnings（该 section 的 sampledAt 停在旧值，Client 据此判 stale）
// - 无订阅者暂停：touch() 由 index 每次 snapshot 调用；超过 idlePauseMs 没有 touch 就跳过采样
// - 快照形状严格对齐 docs/CONTRACT.md §3；未采到的数值一律 null（不填 0）
import os from 'node:os'
import { sampleFast, sampleIdentity, sampleSlow, sampleTop } from './metrics.js'

/** 无 snapshot 请求超过该时长即暂停采样（契约 §5 / DESIGN 的 60s） */
export const IDLE_PAUSE_MS = 60_000
/** 兜底刷新机型信息的周期 */
const IDENTITY_REFRESH_MS = 60_000
/** 差分最小间隔：低于它就沿用上一次速率，避免 forceRefresh 抖动出离谱峰值 */
const MIN_RATE_DT_MS = 200
const MAX_WARNINGS = 20
const DEFAULT_LIMIT = 5

const roundMs = (v) => Math.round(v)

/**
 * 计算字节速率（B/s）。数据不足（首帧 / 间隔过短 / 计数回绕）返回 null，由调用方决定是否沿用旧值。
 * @param {number|null} prevTotal 上一轮累计字节
 * @param {number|null} prevMonoMs 上一轮单调时钟 ms
 * @param {number|null} curTotal 本轮累计字节
 * @param {number|null} curMonoMs 本轮单调时钟 ms
 * @returns {number|null}
 */
export function computeRate(prevTotal, prevMonoMs, curTotal, curMonoMs) {
  if (!Number.isFinite(prevTotal) || !Number.isFinite(curTotal)) return null
  if (!Number.isFinite(prevMonoMs) || !Number.isFinite(curMonoMs)) return null
  const dt = curMonoMs - prevMonoMs
  if (!(dt >= MIN_RATE_DT_MS)) return null
  if (curTotal < prevTotal) return null // 计数器回绕/重置
  return Math.round(((curTotal - prevTotal) * 1000) / dt)
}

function emptyCpu() {
  return { usagePercent: null, perCore: null, load: null, scope: null, cgroupCores: null, sampledAt: null }
}
function emptyMemory() {
  return { usedBytes: null, totalBytes: null, cacheBytes: null, swapUsedBytes: null, scope: null, hostTotalBytes: null, limitBytes: null, sampledAt: null }
}
function emptyDisk() {
  return {
    usedBytes: null,
    totalBytes: null,
    freeBytes: null,
    readBytesPerSec: null,
    writeBytesPerSec: null,
    readTotalBytes: null,
    writeTotalBytes: null,
    mount: null,
    source: null,
    scope: null,
    sampledAt: null,
  }
}
function emptyNetwork() {
  return { rxBytesPerSec: null, txBytesPerSec: null, rxTotalBytes: null, txTotalBytes: null, sampledAt: null }
}
function emptyTemperature() {
  return { available: false, reason: 'unsupported', cpuC: null, ssdC: null, ambientC: null, source: null, pressureLevel: null, scope: null, zones: null, sampledAt: null }
}

/**
 * 创建采样器（不启动定时器）。
 * @param {{ fastMs?: number, slowMs?: number, topProcMs?: number, log?: (line: string) => void, idlePauseMs?: number, now?: () => number }} options
 */
export function createSampler(options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {}
  const now = typeof options.now === 'function' ? options.now : () => performance.now()
  const idlePauseMs = Number.isFinite(options.idlePauseMs) && options.idlePauseMs > 0 ? options.idlePauseMs : IDLE_PAUSE_MS

  const config = {
    fastMs: pickPeriod(options.fastMs, 1000),
    slowMs: pickPeriod(options.slowMs, 5000),
    topProcMs: Number.isFinite(options.topProcMs) && options.topProcMs >= 0 ? Math.floor(options.topProcMs) : 30_000,
  }

  const state = {
    started: false,
    disposed: false,
    enabled: true,
    lastTouchAt: 0,
    identity: null,
    identityAt: 0,
    cpu: null,
    memory: null,
    disk: null,
    network: null,
    temperature: null,
    processes: null,
    processesAt: null,
    slowAt: 0,
    warnings: new Map(),
    timers: [],
    inflight: new Map(),
    prevFast: null,
    // 累计量基线：{ rx, tx, mono } / { read, write, mono }
    netBase: null,
    ioBase: null,
    lastNetRate: { rx: null, tx: null },
    lastIoRate: { read: null, write: null },
  }

  function warn(key, message) {
    const text = String(message || '未知错误').slice(0, 300)
    const existed = state.warnings.has(key)
    state.warnings.set(key, text)
    if (!existed) log(`[system-hud] ${key}: ${text}`)
    while (state.warnings.size > MAX_WARNINGS) {
      const first = state.warnings.keys().next()
      if (first.done) break
      state.warnings.delete(first.value)
    }
  }
  function unwarn(key) {
    state.warnings.delete(key)
  }

  function isActive() {
    return state.started && !state.disposed && state.enabled
  }
  function isPaused() {
    return isActive() && Date.now() - state.lastTouchAt > idlePauseMs
  }

  /** 单飞包装：同名任务在飞时直接复用同一个 Promise */
  function single(key, task) {
    const existing = state.inflight.get(key)
    if (existing) return existing
    const promise = (async () => {
      try {
        return await task()
      } finally {
        state.inflight.delete(key)
      }
    })()
    state.inflight.set(key, promise)
    return promise
  }

  async function refreshIdentity() {
    try {
      const identity = await sampleIdentity()
      state.identity = identity
      state.identityAt = Date.now()
      unwarn('identity')
    } catch (error) {
      warn('identity', '机型信息采样失败: ' + messageOf(error))
    }
  }

  async function tickFast() {
    return await single('fast', async () => {
      if (!isActive() || isPaused()) return
      const mono = now()
      const wall = Date.now()
      try {
        const result = await sampleFast(state.prevFast)
        state.prevFast = result
        for (const item of result.warnings || []) warn(item.key || 'fast', item.message)
        state.cpu = { ...result.cpu, sampledAt: wall }

        const net = result.network || {}
        if (Number.isFinite(net.rxTotalBytes) && Number.isFinite(net.txTotalBytes)) {
          const rate = {
            rx: computeRate(state.netBase?.rx ?? null, state.netBase?.mono ?? null, net.rxTotalBytes, mono),
            tx: computeRate(state.netBase?.tx ?? null, state.netBase?.mono ?? null, net.txTotalBytes, mono),
          }
          // 首帧/间隔过短时沿用上一次速率，不清零
          state.lastNetRate = {
            rx: rate.rx ?? state.lastNetRate.rx,
            tx: rate.tx ?? state.lastNetRate.tx,
          }
          state.netBase = { rx: net.rxTotalBytes, tx: net.txTotalBytes, mono }
          state.network = {
            rxBytesPerSec: state.lastNetRate.rx,
            txBytesPerSec: state.lastNetRate.tx,
            rxTotalBytes: net.rxTotalBytes,
            txTotalBytes: net.txTotalBytes,
            sampledAt: wall,
          }
          unwarn('network')
        } else {
          warn('network', '网络计数不可用')
        }
        unwarn('cpu')
      } catch (error) {
        warn('cpu', '快层采样失败: ' + messageOf(error))
      }
    })
  }

  async function tickSlow() {
    return await single('slow', async () => {
      if (!isActive() || isPaused()) return
      const mono = now()
      const wall = Date.now()
      try {
        const result = await sampleSlow(null)
        for (const item of result.warnings || []) warn(item.key || 'slow', item.message)

        const mem = result.memory || {}
        if (Number.isFinite(mem.totalBytes)) {
          state.memory = {
            usedBytes: mem.usedBytes ?? null,
            totalBytes: mem.totalBytes,
            cacheBytes: mem.cacheBytes ?? null,
            swapUsedBytes: mem.swapUsedBytes ?? null,
            sampledAt: wall,
          }
          unwarn('memory')
        } else {
          warn('memory', '内存容量不可用')
        }

        const disk = result.disk || {}
        const ioOk = Number.isFinite(disk.readTotalBytes) && Number.isFinite(disk.writeTotalBytes)
        if (ioOk) {
          const rate = {
            read: computeRate(state.ioBase?.read ?? null, state.ioBase?.mono ?? null, disk.readTotalBytes, mono),
            write: computeRate(state.ioBase?.write ?? null, state.ioBase?.mono ?? null, disk.writeTotalBytes, mono),
          }
          state.lastIoRate = {
            read: rate.read ?? state.lastIoRate.read,
            write: rate.write ?? state.lastIoRate.write,
          }
          state.ioBase = { read: disk.readTotalBytes, write: disk.writeTotalBytes, mono }
          unwarn('disk-io')
        }
        if (Number.isFinite(disk.totalBytes)) {
          state.disk = {
            usedBytes: disk.usedBytes ?? null,
            totalBytes: disk.totalBytes,
            freeBytes: disk.freeBytes ?? null,
            readBytesPerSec: state.lastIoRate.read,
            writeBytesPerSec: state.lastIoRate.write,
            readTotalBytes: ioOk ? disk.readTotalBytes : state.disk?.readTotalBytes ?? null,
            writeTotalBytes: ioOk ? disk.writeTotalBytes : state.disk?.writeTotalBytes ?? null,
            sampledAt: wall,
          }
          unwarn('disk')
        } else {
          warn('disk', '磁盘容量不可用')
        }

        state.slowAt = wall
        const temp = result.temperature
        if (temp) {
          state.temperature = { ...temp, sampledAt: wall }
          if (temp.available) unwarn('temperature')
        }
      } catch (error) {
        warn('slow', '慢层采样失败: ' + messageOf(error))
      }
    })
  }

  async function tickTop() {
    return await single('top', async () => {
      if (!isActive() || isPaused() || config.topProcMs <= 0) return
      try {
        const result = await sampleTop(DEFAULT_LIMIT)
        for (const item of result.warnings || []) warn(item.key || 'top', item.message)
        if (result.processes) {
          state.processes = result.processes
          state.processesAt = Date.now()
          unwarn('processes')
        }
      } catch (error) {
        warn('processes', 'Top 进程采样失败: ' + messageOf(error))
      }
    })
  }

  function clearTimers() {
    for (const timer of state.timers) clearInterval(timer)
    state.timers = []
  }

  function schedule() {
    clearTimers()
    const add = (ms, fn) => {
      if (!(ms > 0)) return
      const timer = setInterval(fn, ms)
      if (typeof timer.unref === 'function') timer.unref()
      state.timers.push(timer)
    }
    add(config.fastMs, () => void tickFast())
    add(config.slowMs, () => void tickSlow())
    add(config.topProcMs, () => void tickTop())
    add(IDENTITY_REFRESH_MS, () => void refreshIdentity())
  }

  function start() {
    if (state.started || state.disposed) return
    state.started = true
    state.lastTouchAt = Date.now()
    // 立刻建基线 + 首帧：CPU% 需要两个时间点，第一帧为 null，一个周期后转真实值
    void refreshIdentity()
    void tickSlow()
    void tickFast()
    void tickTop()
    schedule()
  }

  /** 由 index 在每次 snapshot 调用：续命唤醒；从暂停恢复时立刻补一次快层 */
  function touch() {
    const wasPaused = isPaused()
    state.lastTouchAt = Date.now()
    if (wasPaused && isActive()) {
      void tickFast()
      if (Date.now() - state.slowAt > config.slowMs) void tickSlow()
    }
  }

  function getSnapshot() {
    const host = {
      name: state.identity?.name ?? null,
      platform: state.identity?.platform ?? null,
      chip: state.identity?.chip ?? null,
      cores: state.identity?.cores ?? null,
      uptimeSec: Math.round(os.uptime()),
      sampledAt: state.identityAt || null,
    }
    return {
      timestamp: Date.now(),
      monotonicMs: roundMs(now()),
      intervalMs: config.fastMs,
      host,
      cpu: state.cpu ?? emptyCpu(),
      memory: state.memory ?? emptyMemory(),
      disk: state.disk ?? emptyDisk(),
      network: state.network ?? emptyNetwork(),
      temperature: state.temperature ?? emptyTemperature(),
      processes: state.processes ?? null,
      power: null,
      warnings: [...state.warnings.values()],
    }
  }

  /** 强制重采（refresh endpoint）：join 在飞任务，保证拿到新一帧 */
  async function forceRefresh() {
    touch()
    await Promise.all([tickFast(), tickSlow(), config.topProcMs > 0 ? tickTop() : Promise.resolve(), refreshIdentity()])
    return getSnapshot()
  }

  /** 配置热更新（save-config 后调用）：只处理采样周期，非法值忽略 */
  function updateConfig(patch = {}) {
    let changed = false
    for (const key of ['fastMs', 'slowMs']) {
      if (Number.isFinite(patch[key]) && patch[key] > 0 && patch[key] !== config[key]) {
        config[key] = pickPeriod(patch[key], config[key])
        changed = true
      }
    }
    if (Number.isFinite(patch.topProcMs) && patch.topProcMs >= 0 && patch.topProcMs !== config.topProcMs) {
      config.topProcMs = Math.floor(patch.topProcMs)
      changed = true
    }
    if (changed && state.started && !state.disposed) schedule()
  }

  /** 区域全关时停止采样（仍保留快照与定时器，恢复即生效） */
  function setEnabled(value) {
    const next = value !== false
    if (next === state.enabled) return
    state.enabled = next
    if (next) {
      touch()
      void tickFast()
      void tickSlow()
    }
  }

  function dispose() {
    if (state.disposed) return
    state.disposed = true
    clearTimers()
    state.inflight.clear()
  }

  return {
    start,
    touch,
    getSnapshot,
    forceRefresh,
    updateConfig,
    setEnabled,
    dispose,
    isRunning: () => state.started && !state.disposed,
    isEnabled: () => state.enabled,
    isPaused,
    getConfig: () => ({ ...config }),
  }
}

function pickPeriod(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

function messageOf(error) {
  const text = error && error.message ? String(error.message) : '未知错误'
  return text.length > 200 ? text.slice(0, 200) : text
}
