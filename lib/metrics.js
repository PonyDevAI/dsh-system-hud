// dsh-system-hud · 取数层（Host 半区）
// - 纯解析函数：导出的 parse* 全部是「字符串进、结构出」的纯函数，可离线单测
// - 采样函数：sampleIdentity / sampleFast / sampleSlow / sampleTop，只读、无副作用
// - 子进程：只用本文件写死的 COMMANDS 白名单 + execFile（2s 超时 / 1MB 输出 / SIGKILL）
//   **绝不把外部字符串拼进命令**：调用方只能传白名单 id，参数不可注入
// - 差分（CPU%、网络/IO 速率）由 sample.js 负责；本文件只回传累计量
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename } from 'node:path'
import os from 'node:os'

const EXEC_TIMEOUT_MS = 2000
const EXEC_MAX_BUFFER = 1024 * 1024
const EXEC_KILL_SIGNAL = 'SIGKILL'

/** 平台归一化：契约只认 darwin | linux | other */
export const PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : 'other'

// ── 命令白名单（写死绝对路径 + 固定 argv；没有任何参数来自外部） ─────────────
const DARWIN_COMMANDS = {
  vm_stat: ['/usr/bin/vm_stat'],
  sysctl_memory: ['/usr/sbin/sysctl', '-n', 'hw.memsize', 'vm.swapusage'],
  sysctl_identity: ['/usr/sbin/sysctl', '-n', 'hw.ncpu', 'hw.physicalcpu', 'hw.memsize', 'machdep.cpu.brand_string', 'kern.boottime'],
  df: ['/bin/df', '-k'],
  netstat: ['/usr/sbin/netstat', '-ibn'],
  ioreg_io: ['/usr/sbin/ioreg', '-rc', 'IOBlockStorageDriver', '-w0'],
  ps_top: ['/bin/ps', '-Ao', 'pcpu,pmem,rss,comm', '-r'],
  pmset_therm: ['/usr/bin/pmset', '-g', 'therm'],
}

const LINUX_COMMANDS = {
  df: ['/bin/df', '-k', '/'],
}

export const COMMANDS = Object.freeze(PLATFORM === 'darwin' ? DARWIN_COMMANDS : PLATFORM === 'linux' ? LINUX_COMMANDS : {})

/**
 * 跑一条白名单命令，返回 stdout 文本。
 * @param {keyof typeof COMMANDS} id 白名单 id（不接受任何外部参数）
 * @returns {Promise<string>}
 */
export async function runCommand(id) {
  const argv = COMMANDS[id]
  if (!Array.isArray(argv)) {
    const error = new Error('未知命令: ' + String(id))
    error.code = 'system-hud/unknown-command'
    throw error
  }
  const [file, ...args] = argv
  return await new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, killSignal: EXEC_KILL_SIGNAL, windowsHide: true, encoding: 'utf8' },
      (error, stdout) => {
        if (error) {
          error.commandId = id
          reject(error)
          return
        }
        resolve(String(stdout || ''))
      },
    )
  })
}

// ── 通用小工具 ────────────────────────────────────────────────────────────
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)
const toInt = (v) => (/^\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : null)

// ── darwin: vm_stat ───────────────────────────────────────────────────────
/**
 * 解析 `vm_stat`。返回页大小、页计数与字节数（used 口径在 sampleSlow 里算）。
 * @param {string} text
 */
export function parseVmStat(text) {
  const src = String(text || '')
  const pageMatch = /page size of (\d+) bytes/.exec(src)
  const pageSizeBytes = pageMatch ? Number(pageMatch[1]) : null
  const pages = {}
  for (const line of src.split('\n')) {
    const m = /^"?([A-Za-z][^":]*?)"?:\s+(\d+)\.?\s*$/.exec(line.trim())
    if (!m) continue
    const key = m[1].trim()
    const value = Number(m[2])
    pages[key] = value
  }
  const pick = (label) => (Number.isFinite(pages[label]) ? pages[label] : null)
  const raw = {
    free: pick('Pages free'),
    active: pick('Pages active'),
    inactive: pick('Pages inactive'),
    speculative: pick('Pages speculative'),
    wired: pick('Pages wired down'),
    purgeable: pick('Pages purgeable'),
    compressed: pick('Pages occupied by compressor'),
    fileBacked: pick('File-backed pages'),
    anonymous: pick('Anonymous pages'),
  }
  const bytes = {}
  for (const [key, value] of Object.entries(raw)) bytes[key] = value !== null && pageSizeBytes ? value * pageSizeBytes : null
  return { pageSizeBytes, pages: raw, bytes }
}

// ── darwin: sysctl -n <keys...> ───────────────────────────────────────────
/**
 * 解析 `sysctl -n` 多 key 的逐行输出（第 i 行对应 keys[i]）。
 * 支持三类值：`total = 10240.00M used = ...`、`{ sec = 1792150331, usec = 13886 } ...`、裸数字/字符串。
 * @param {string} text
 * @param {string[]} keys
 */
export function parseSysctl(text, keys = []) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const out = {}
  keys.forEach((key, i) => {
    const line = (lines[i] ?? '').trim()
    if (!line) {
      out[key] = null
      return
    }
    if (/^total\s*=/.test(line)) {
      const total = /total\s*=\s*([\d.]+)([KMG])?/i.exec(line)
      const used = /used\s*=\s*([\d.]+)([KMG])?/i.exec(line)
      const free = /free\s*=\s*([\d.]+)([KMG])?/i.exec(line)
      const scale = (unit) => ({ B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[String(unit || 'B').toUpperCase()] || 1)
      out[key] = {
        totalBytes: total ? Math.round(Number(total[1]) * scale(total[2])) : null,
        usedBytes: used ? Math.round(Number(used[1]) * scale(used[2])) : null,
        freeBytes: free ? Math.round(Number(free[1]) * scale(free[2])) : null,
      }
      return
    }
    if (line.startsWith('{')) {
      const sec = /\bsec\s*=\s*(\d+)/.exec(line)
      const usec = /\busec\s*=\s*(\d+)/.exec(line)
      out[key] = sec ? { sec: Number(sec[1]), usec: usec ? Number(usec[1]) : 0, text: line } : line
      return
    }
    out[key] = /^-?\d+$/.test(line) ? Number(line) : line
  })
  return out
}

// ── darwin: netstat -ibn ──────────────────────────────────────────────────
const NET_VIRTUAL = /^(lo|gif|stf|utun|awdl|llw|bridge|ap|anpi|vmenet|vmnet|p2p|ipsec)/i
const NET_PHYSICAL = /^(en|eth|ens|enp|wlan|wl|em)\d*/i

/**
 * 解析 `netstat -ibn`。只取每个接口的 `<Link#N>` 链路行（其余是地址级重复计数）。
 * 行尾 7 列恒为 `Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll`，因此用「倒数」取值，
 * 兼容有无 Address 列的两种行形态。
 * @param {string} text
 */
export function parseNetstat(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const byName = new Map()
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || /^Name\s+Mtu\s+Network/i.test(trimmed)) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 10) continue
    if (!/^<Link#\d+>$/.test(parts[2] || '')) continue
    const name = parts[0]
    if (!name || name.includes('*')) continue
    if (/^lo\d*$/.test(name)) continue // 回环不是"网络吞吐"，且会与链路流量重复
    const rx = toInt(parts[parts.length - 5])
    const tx = toInt(parts[parts.length - 2])
    if (rx === null || tx === null) continue
    const prev = byName.get(name)
    // 防御：同名接口只保留最大计数（正常只有一行）
    if (!prev || rx + tx > prev.rxTotalBytes + prev.txTotalBytes) byName.set(name, { name, rxTotalBytes: rx, txTotalBytes: tx })
  }
  const ifaces = [...byName.values()].sort((a, b) => b.rxTotalBytes + b.txTotalBytes - (a.rxTotalBytes + a.txTotalBytes))
  return { ifaces, primary: selectPrimary(ifaces) }
}

/** 选主网卡：物理网卡里累计流量最大的那张；排除隧道/Wi-Fi 辅助接口，避免与 en0 重复计数 */
function selectPrimary(ifaces) {
  const physical = ifaces.filter((i) => NET_PHYSICAL.test(i.name) && !NET_VIRTUAL.test(i.name))
  const pool = physical.length ? physical : ifaces.filter((i) => !NET_VIRTUAL.test(i.name))
  return pool.length ? pool[0] : null
}

// ── df -k ─────────────────────────────────────────────────────────────────
/**
 * 解析 `df -k`。APFS 首列不是可用容量，所以 total = used + available（契约要求三者自洽）。
 * @param {string} text
 */
export function parseDf(text) {
  const mounts = []
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || /^Filesystem\s+/i.test(trimmed)) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 4) continue
    // 列序：Filesystem 1024-blocks Used Available [Capacity ...] Mounted on
    const blocks = toInt(parts[1])
    const used = toInt(parts[2])
    const avail = toInt(parts[3])
    if (blocks === null || used === null || avail === null) continue
    const capIdx = parts.findIndex((p, i) => i > 3 && /%$/.test(p) && /^-?\d+%$/.test(p))
    const tail = parts.slice(capIdx >= 0 ? capIdx + 1 : 4).filter((p) => !/^\d+%?$/.test(p))
    const mount = tail.join(' ')
    if (!mount) continue
    mounts.push({
      mount,
      totalBytes: (used + avail) * 1024,
      usedBytes: used * 1024,
      freeBytes: avail * 1024,
      blocksKb: blocks,
    })
  }
  return { mounts }
}

// ── darwin: ioreg IOBlockStorageDriver ────────────────────────────────────
/**
 * 解析 `ioreg -rc IOBlockStorageDriver -w0`，跨所有物理盘累加累计读/写字节。
 * @param {string} text
 */
export function parseIoreg(text) {
  const src = String(text || '')
  const reads = [...src.matchAll(/"Bytes \(Read\)"=(\d+)/g)].map((m) => Number(m[1]))
  const writes = [...src.matchAll(/"Bytes \(Write\)"=(\d+)/g)].map((m) => Number(m[1]))
  if (!reads.length || reads.length !== writes.length) {
    return { devices: 0, readTotalBytes: null, writeTotalBytes: null }
  }
  return {
    devices: reads.length,
    readTotalBytes: reads.reduce((a, b) => a + b, 0),
    writeTotalBytes: writes.reduce((a, b) => a + b, 0),
  }
}

// ── ps（Top 进程；取不到由调用方降级为 null） ──────────────────────────────
/**
 * 解析 `ps -Ao pcpu,pmem,rss,comm -r`。comm 可能含空格，故「前 3 列 + 余下全部」。
 * @param {string} text
 * @param {number} limit
 */
export function parsePs(text, limit = 5) {
  const rows = []
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || /^%?CPU\s+/i.test(trimmed) || /^%?CPU\s*%MEM/i.test(trimmed)) continue
    const m = /^([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(trimmed)
    if (!m) continue
    const comm = m[4].trim()
    if (!comm) continue
    rows.push({
      name: basename(comm),
      cpuPercent: round1(Number(m[1])),
      memoryBytes: Number(m[3]) * 1024,
    })
  }
  rows.sort((a, b) => b.cpuPercent - a.cpuPercent)
  const max = Math.max(1, Math.min(50, Number(limit) || 5))
  return rows.slice(0, max)
}

// ── linux: /proc/stat ─────────────────────────────────────────────────────
/**
 * 解析 `/proc/stat` 的 cpu 行（单位：USER_HZ=100 的 tick）。
 * 每项返回 { idle, total }，其中 idle = idle + iowait，total = 前 8 项之和。
 * @param {string} text
 */
export function parseProcStat(text) {
  const make = (parts) => {
    const t = parts.slice(1, 9).map((v) => Number(v) || 0) // user nice system idle iowait irq softirq steal
    while (t.length < 8) t.push(0)
    const [user, nice, system, idle, iowait, irq, softirq, steal] = t
    return {
      user,
      nice,
      system,
      idle,
      iowait,
      irq,
      softirq,
      steal,
      idleTicks: idle + iowait,
      totalTicks: user + nice + system + idle + iowait + irq + softirq + steal,
    }
  }
  let total = null
  const perCore = []
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^(cpu\d*)\s+(.+)$/.exec(line.trim())
    if (!m) continue
    const parts = [m[1], ...m[2].trim().split(/\s+/)]
    if (m[1] === 'cpu') total = make(parts)
    else perCore.push({ id: Number(m[1].slice(3)), ...make(parts) })
  }
  if (!total) return null
  perCore.sort((a, b) => a.id - b.id)
  return { total, perCore }
}

// ── linux: /proc/meminfo ──────────────────────────────────────────────────
/**
 * 解析 `/proc/meminfo`（值以 kB 给，统一换 bytes）。
 * @param {string} text
 */
export function parseProcMeminfo(text) {
  const map = new Map()
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /^([A-Za-z_()\d]+):\s+(\d+)\s*kB/i.exec(line.trim())
    if (m) map.set(m[1], Number(m[2]))
  }
  const kb = (key) => (map.has(key) ? map.get(key) * 1024 : null)
  const totalBytes = kb('MemTotal')
  const availableBytes = kb('MemAvailable') ?? (() => {
    const free = map.get('MemFree')
    const buffers = map.get('Buffers')
    const cached = map.get('Cached')
    if (free === undefined || buffers === undefined || cached === undefined) return null
    return (free + buffers + cached) * 1024
  })()
  const swapTotalBytes = kb('SwapTotal')
  const swapFreeBytes = kb('SwapFree')
  return {
    totalBytes,
    freeBytes: kb('MemFree'),
    availableBytes,
    buffersBytes: kb('Buffers'),
    cachedBytes: kb('Cached'),
    swapTotalBytes,
    swapFreeBytes,
    swapUsedBytes: swapTotalBytes !== null && swapFreeBytes !== null ? Math.max(0, swapTotalBytes - swapFreeBytes) : null,
  }
}

// ── linux: /proc/net/dev ──────────────────────────────────────────────────
/**
 * 解析 `/proc/net/dev`（字段：rx_bytes 在 index 1，tx_bytes 在 index 9）。
 * @param {string} text
 */
export function parseProcNetDev(text) {
  const byName = new Map()
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || /^\|/.test(trimmed) || /^Inter-|^face/i.test(trimmed)) continue
    const m = /^([^\s:]+):\s*(.+)$/.exec(trimmed)
    if (!m) continue
    const fields = m[2].trim().split(/\s+/)
    if (fields.length < 16) continue
    const rx = toInt(fields[0])
    const tx = toInt(fields[8])
    if (rx === null || tx === null) continue
    byName.set(m[1], { name: m[1], rxTotalBytes: rx, txTotalBytes: tx })
  }
  const ifaces = [...byName.values()].sort((a, b) => b.rxTotalBytes + b.txTotalBytes - (a.rxTotalBytes + a.txTotalBytes))
  const physical = ifaces.filter((i) => NET_PHYSICAL.test(i.name) && i.name !== 'lo')
  const pool = physical.length ? physical : ifaces.filter((i) => i.name !== 'lo')
  return { ifaces, primary: pool.length ? pool[0] : null }
}

// ── linux: /proc/diskstats ────────────────────────────────────────────────
/**
 * 解析 `/proc/diskstats`，按 512B 扇区累加物理盘读/写字节（排除 loop/ram/dm/md）。
 * @param {string} text
 */
export function parseProcDiskstats(text) {
  let readSectors = 0
  let writeSectors = 0
  let devices = 0
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 14) continue
    const name = parts[2]
    if (!name || /^(loop|ram|dm-|md|sr|fd)/.test(name)) continue
    if (!/^(sd|nvme|vd|xvd|mmcblk|hd)/.test(name)) continue
    const sectorsRead = toInt(parts[5])
    const sectorsWritten = toInt(parts[9])
    if (sectorsRead === null || sectorsWritten === null) continue
    readSectors += sectorsRead
    writeSectors += sectorsWritten
    devices += 1
  }
  if (!devices) return { devices: 0, readTotalBytes: null, writeTotalBytes: null }
  return { devices, readTotalBytes: readSectors * 512, writeTotalBytes: writeSectors * 512 }
}

// ── linux: thermal_zone[N]/temp (sysfs) ──────────────────────────────────
/**
 * 解析单个 thermal zone 的 temp 内容（millidegree 或 degree；"temp=45000" 也可）。
 * @param {string} text
 * @returns {{ celsius: number } | null}
 */
export function parseThermalSysfs(text) {
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = /(-?\d+(?:\.\d+)?)/.exec(line)
    if (!m) continue
    const raw = Number(m[1])
    if (!Number.isFinite(raw)) continue
    const celsius = Math.abs(raw) >= 1000 ? raw / 1000 : raw
    if (celsius <= -50 || celsius >= 200) continue
    return { celsius: round1(celsius) }
  }
  return null
}

// ── darwin: pmset -g therm（热压力代理） ──────────────────────────────────
/** 热压力档位（契约 temperature.pressureLevel 的枚举，从轻到重） */
export const PRESSURE_LEVELS = ['nominal', 'fair', 'serious', 'critical']

/**
 * 解析 `pmset -g therm`，映射成契约枚举；没有任何记录（多数机器只有 Note 行）返回 null。
 * 说明：pmset 给的是 CPU 限速/调度上限与历史告警档位，不是 NSProcessInfo 热状态，所以这是
 * **启发式映射**：取 CPU_Speed_Limit / CPU_Scheduler_Limit 里更低的一个，
 * 100→nominal，75–99→fair，50–74→serious，<50→critical；再与 warning level 取更重者。
 * @param {string} text
 * @returns {'nominal'|'fair'|'serious'|'critical'|null}
 */
export function parsePmsetTherm(text) {
  const src = String(text || '')
  const speed = /CPU_Speed_Limit\s*=\s*(-?\d+)/.exec(src)
  const scheduler = /CPU_Scheduler_Limit\s*=\s*(-?\d+)/.exec(src)
  const warning = /(?:Thermal|Performance) warning level(?:\s*has been recorded)?\s*:\s*(-?\d+)/i.exec(src)
  if (!speed && !scheduler && !warning) return null // 只有 "Note: ... has been recorded" → 无记录
  const limits = [speed, scheduler].filter(Boolean).map((m) => Number(m[1]))
  let level = null
  if (limits.length) {
    const limit = Math.min(...limits)
    level = limit >= 100 ? 'nominal' : limit >= 75 ? 'fair' : limit >= 50 ? 'serious' : 'critical'
  }
  if (warning) {
    const value = Number(warning[1])
    const warned = value <= 0 ? 'nominal' : value === 1 ? 'fair' : value === 2 ? 'serious' : 'critical'
    level = worsePressure(level, warned)
  }
  return level
}

/** 取两个热压力档位里更重的一个（null 视为无） */
function worsePressure(a, b) {
  const ia = PRESSURE_LEVELS.indexOf(a)
  const ib = PRESSURE_LEVELS.indexOf(b)
  if (ia < 0) return ib < 0 ? null : b
  return ia >= ib ? a : b
}

// ── CPU 差分（纯函数，供 sampleFast 与单测共用） ──────────────────────────
/**
 * 由两次 `os.cpus()` 归一化快照算 CPU 使用率。
 * @param {{idle:number,total:number}[]|null} prev
 * @param {{idle:number,total:number}[]} cur
 */
export function cpuUsagePercent(prev, cur) {
  if (!Array.isArray(prev) || !Array.isArray(cur) || prev.length !== cur.length || !cur.length) {
    return { usagePercent: null, perCore: null }
  }
  const delta = (a, b) => ({ idle: b.idle - a.idle, total: b.total - a.total })
  const perCore = []
  let idleSum = 0
  let totalSum = 0
  for (let i = 0; i < cur.length; i++) {
    const d = delta(prev[i], cur[i])
    if (!(d.total > 0)) {
      perCore.push(null)
      continue
    }
    idleSum += d.idle
    totalSum += d.total
    perCore.push(round1((1 - d.idle / d.total) * 100))
  }
  if (!(totalSum > 0)) return { usagePercent: null, perCore: null }
  return {
    usagePercent: round1(Math.min(100, Math.max(0, (1 - idleSum / totalSum) * 100))),
    perCore,
  }
}

/** 把 os.cpus() 归一化成 { idle, total } 数组（times 单位是毫秒） */
export function cpuTimesSnapshot() {
  return os.cpus().map((cpu) => {
    const t = cpu.times || {}
    const total = (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.idle || 0) + (t.irq || 0)
    return { idle: t.idle || 0, total }
  })
}

// ── 采样：identity / fast / slow / top ────────────────────────────────────

// ── linux cgroup 配额（容器里 os.cpus()/meminfo 看到的是宿主机，需要读 cgroup 限制） ──
/** 解析 cpu.max（v2）→ 核数；`max` 表示不限 */
export function parseCpuMax(text) {
  const [quotaRaw, periodRaw] = String(text || '').trim().split(/\s+/)
  if (quotaRaw === 'max') return null
  const quota = Number(quotaRaw)
  const period = Number(periodRaw)
  if (!(quota > 0) || !(period > 0)) return null
  return Math.max(1, Math.round(quota / period))
}
/** 解析 cpuset 列表（`0-3,6,8-9`）→ 核数 */
export function countCpuList(text) {
  const parts = String(text || '').trim().split(',')
  let n = 0
  let valid = false
  for (const part of parts) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) continue
    valid = true
    const a = Number(m[1])
    const b = m[2] === undefined ? a : Number(m[2])
    if (b >= a) n += b - a + 1
  }
  return valid ? n : null
}
async function readTextSafe(file) {
  try { return (await readFile(file, 'utf8')).trim() } catch { return null }
}
/** 容器 CPU 核数（读不到返回 null，调用方回退 os.cpus().length） */
export async function readCgroupCores() {
  if (PLATFORM !== 'linux') return null
  const v2 = await readTextSafe('/sys/fs/cgroup/cpu.max')
  if (v2) {
    const n = parseCpuMax(v2)
    if (n) return n
  }
  const quota = Number(await readTextSafe('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'))
  const period = Number(await readTextSafe('/sys/fs/cgroup/cpu/cpu.cfs_period_us'))
  if (quota > 0 && period > 0) return Math.max(1, Math.round(quota / period))
  const set = await readTextSafe('/sys/fs/cgroup/cpuset.cpus.effective')
  if (set) {
    const n = countCpuList(set)
    if (n) return n
  }
  return null
}
/** 容器 CPU 累计用量（微秒）；读不到返回 null */
export async function readCgroupCpuUsageMicros() {
  if (PLATFORM !== 'linux') return null
  const v2 = await readTextSafe('/sys/fs/cgroup/cpu.stat')
  if (v2) {
    const m = /usage_usec\s+(\d+)/.exec(v2)
    if (m) return Number(m[1])
  }
  const v1 = Number(await readTextSafe('/sys/fs/cgroup/cpuacct/cpuacct.usage'))
  if (Number.isFinite(v1) && v1 >= 0) return Math.round(v1 / 1000)
  return null
}

/** 容器内存上限字节（读不到或 `max` 返回 null） */
export async function readCgroupMemBytes() {
  if (PLATFORM !== 'linux') return null
  const v2 = await readTextSafe('/sys/fs/cgroup/memory.max')
  if (v2 && v2 !== 'max') {
    const n = Number(v2)
    if (Number.isFinite(n) && n > 0) return n
  }
  const v1 = Number(await readTextSafe('/sys/fs/cgroup/memory/memory.limit_in_bytes'))
  if (Number.isFinite(v1) && v1 > 0 && v1 < 2 ** 60) return v1
  return null
}

/**
 * 机型、核数、开机时间等一次性信息。
 * @returns {Promise<{name:string,platform:string,chip:string|null,cores:number,uptimeSec:number,bootTime:number|null}>}
 */
export async function sampleIdentity() {
  const uptimeSec = Math.round(os.uptime())
  const cpus = os.cpus()
  let chip = cpus.length && cpus[0].model ? String(cpus[0].model).trim() : null
  let bootTime = Math.round(Date.now() / 1000) - uptimeSec
  let cores = cpus.length
  if (PLATFORM === 'darwin') {
    try {
      const text = await runCommand('sysctl_identity')
      const parsed = parseSysctl(text, ['hw.ncpu', 'hw.physicalcpu', 'hw.memsize', 'machdep.cpu.brand_string', 'kern.boottime'])
      const ncpu = Number(parsed['hw.ncpu'])
      if (Number.isFinite(ncpu) && ncpu > 0) cores = ncpu
      const brand = parsed['machdep.cpu.brand_string']
      if (typeof brand === 'string' && brand) chip = brand
      const boot = parsed['kern.boottime']
      if (boot && typeof boot === 'object' && Number.isFinite(boot.sec)) bootTime = boot.sec
    } catch {
      // 取不到就退回 os 信息，不抛错
    }
  }
  if (PLATFORM === 'linux') {
    try {
      const cg = await readCgroupCores()
      if (Number.isFinite(cg) && cg > 0) cores = Math.min(cores, cg)
    } catch {
      // 读不到就保持 os 值
    }
  }
  return {
    name: os.hostname() || 'unknown',
    platform: PLATFORM,
    chip,
    cores: Number.isFinite(cores) && cores > 0 ? cores : 1,
    uptimeSec,
    bootTime,
  }
}

/**
 * 快层：CPU%（进程内 os.cpus 差分，零子进程）+ 网络累计量（速率由 sample.js 差分）。
 * @param {Awaited<ReturnType<typeof sampleFast>>|null} prev 上一轮结果（只读 `_cpuTimes`）
 */
export async function sampleFast(prev) {
  const warnings = []
  const curTimes = cpuTimesSnapshot()
  let { usagePercent, perCore } = cpuUsagePercent(prev?._cpuTimes ?? null, curTimes)
  // 容器配额：os.cpus() 是宿主机视角，用 cgroup 用量/核数换算；perCore 无对应关系就置空
  if (PLATFORM === 'linux') {
    try {
      const cgCores = await readCgroupCores()
      const cgUsage = await readCgroupCpuUsageMicros()
      const prevUsage = Number.isFinite(prev?._cgUsage) ? prev._cgUsage : null
      const prevAt = Number.isFinite(prev?._cgAt) ? prev._cgAt : null
      if (Number.isFinite(cgCores) && cgCores > 0) {
        perCore = null
        if (cgUsage != null && prevUsage != null && prevAt != null) {
          const elapsedUs = (Date.now() - prevAt) * 1000
          const usedUs = Math.max(0, cgUsage - prevUsage)
          if (elapsedUs > 0) usagePercent = round1(Math.min(100, (usedUs / (elapsedUs * cgCores)) * 100))
        } else {
          usagePercent = null
        }
        prev = { ...(prev || {}), _cgUsage: cgUsage, _cgAt: Date.now() }
      }
    } catch {
      // 失败就退回宿主机口径
    }
  }
  const cpu = {
    usagePercent,
    perCore,
    load: os.loadavg().slice(0, 3).map((v) => round2(v)),
  }

  let network = { iface: null, rxTotalBytes: null, txTotalBytes: null }
  try {
    if (PLATFORM === 'darwin') {
      const text = await runCommand('netstat')
      const parsed = parseNetstat(text)
      if (parsed.primary) {
        network = {
          iface: parsed.primary.name,
          rxTotalBytes: parsed.primary.rxTotalBytes,
          txTotalBytes: parsed.primary.txTotalBytes,
        }
      } else {
        warnings.push({ key: 'network', message: 'netstat 未找到物理网卡' })
      }
    } else if (PLATFORM === 'linux') {
      const text = await readFile('/proc/net/dev', 'utf8')
      const parsed = parseProcNetDev(text)
      if (parsed.primary) {
        network = {
          iface: parsed.primary.name,
          rxTotalBytes: parsed.primary.rxTotalBytes,
          txTotalBytes: parsed.primary.txTotalBytes,
        }
      } else {
        warnings.push({ key: 'network', message: '/proc/net/dev 未找到物理网卡' })
      }
    } else {
      warnings.push({ key: 'network', message: '不支持的平台: ' + process.platform })
    }
  } catch (error) {
    warnings.push({ key: 'network', message: '网络采样失败: ' + messageOf(error) })
  }

  return { cpu, network, warnings, _cpuTimes: curTimes }
}

/**
 * 慢层：内存 + 磁盘容量 + 磁盘 IO 累计量 + 温度。
 * @param {Awaited<ReturnType<typeof sampleSlow>>|null} prev 保留参数（差分层在 sample.js）
 */
export async function sampleSlow(prev) {
  void prev
  const warnings = []
  let memory = { usedBytes: null, totalBytes: null, cacheBytes: null, swapUsedBytes: null }
  let disk = {
    usedBytes: null,
    totalBytes: null,
    freeBytes: null,
    readTotalBytes: null,
    writeTotalBytes: null,
  }
  let temperature = { available: false, reason: 'unsupported', cpuC: null, ssdC: null, ambientC: null, source: null, pressureLevel: null }

  if (PLATFORM === 'darwin') {
    // 内存：vm_stat（禁用 os.freemem）+ sysctl hw.memsize/vm.swapusage
    try {
      const vm = parseVmStat(await runCommand('vm_stat'))
      const sys = parseSysctl(await runCommand('sysctl_memory'), ['hw.memsize', 'vm.swapusage'])
      const b = vm.bytes // 已是字节，不要再乘页大小
      memory = {
        totalBytes: Number(sys['hw.memsize']) || null,
        // 契约口径：used = active - purgeable + wired + compressed（page 内已有未归类页，故不强行配平 total）
        usedBytes: Math.max(0, (b.active ?? 0) - (b.purgeable ?? 0) + (b.wired ?? 0) + (b.compressed ?? 0)),
        cacheBytes: (b.inactive ?? 0) + (b.speculative ?? 0) + (b.purgeable ?? 0),
        swapUsedBytes: sys['vm.swapusage']?.usedBytes ?? null,
      }
      if (!memory.totalBytes) warnings.push({ key: 'memory', message: 'sysctl 未返回 hw.memsize' })
    } catch (error) {
      warnings.push({ key: 'memory', message: '内存采样失败: ' + messageOf(error) })
    }
    // 磁盘容量：df -k（APFS 用 used+free 反算 total）
    try {
      const df = parseDf(await runCommand('df'))
      const chosen = df.mounts.find((m) => m.mount === '/System/Volumes/Data') || df.mounts.find((m) => m.mount === '/') || null
      if (chosen) {
        disk.usedBytes = chosen.usedBytes
        disk.totalBytes = chosen.totalBytes
        disk.freeBytes = chosen.freeBytes
      } else {
        warnings.push({ key: 'disk', message: 'df 未找到根分区' })
      }
    } catch (error) {
      warnings.push({ key: 'disk', message: '磁盘容量采样失败: ' + messageOf(error) })
    }
    // 磁盘 IO：ioreg 累计量（禁用 iostat：会阻塞 1–3s）
    try {
      const io = parseIoreg(await runCommand('ioreg_io'))
      disk.readTotalBytes = io.readTotalBytes
      disk.writeTotalBytes = io.writeTotalBytes
      if (!io.devices) warnings.push({ key: 'disk-io', message: 'ioreg 未找到 IOBlockStorageDriver' })
    } catch (error) {
      warnings.push({ key: 'disk-io', message: '磁盘 IO 采样失败: ' + messageOf(error) })
    }
    // 温度：macOS 26 + Apple Silicon 无免特权来源（实测见 docs/metrics-feasibility.md）
    // 热压力作为代理（M2「代理替代」渲染）：pmset 多数机器只有 Note 行 → pressureLevel null
    let pressureLevel = null
    try {
      pressureLevel = parsePmsetTherm(await runCommand('pmset_therm'))
    } catch (error) {
      warnings.push({ key: 'temperature-pressure', message: '热压力采样失败: ' + messageOf(error) })
    }
    temperature = { available: false, reason: 'needs-helper', cpuC: null, ssdC: null, ambientC: null, source: null, pressureLevel }
  } else if (PLATFORM === 'linux') {
    try {
      const info = parseProcMeminfo(await readFile('/proc/meminfo', 'utf8'))
      let totalBytes = info.totalBytes
      try {
        const cg = await readCgroupMemBytes()
        if (Number.isFinite(cg) && cg > 0 && Number.isFinite(totalBytes)) totalBytes = Math.min(totalBytes, cg)
      } catch {
        // 读不到 cgroup 就用宿主机值
      }
      memory = {
        totalBytes,
        usedBytes: totalBytes !== null && info.availableBytes !== null ? Math.max(0, totalBytes - info.availableBytes) : null,
        cacheBytes: (info.cachedBytes ?? 0) + (info.buffersBytes ?? 0),
        swapUsedBytes: info.swapUsedBytes,
      }
    } catch (error) {
      warnings.push({ key: 'memory', message: '内存采样失败: ' + messageOf(error) })
    }
    try {
      const df = parseDf(await runCommand('df'))
      const chosen = df.mounts.find((m) => m.mount === '/') || df.mounts[0] || null
      if (chosen) {
        disk.usedBytes = chosen.usedBytes
        disk.totalBytes = chosen.totalBytes
        disk.freeBytes = chosen.freeBytes
      } else {
        warnings.push({ key: 'disk', message: 'df 未找到根分区' })
      }
    } catch (error) {
      warnings.push({ key: 'disk', message: '磁盘容量采样失败: ' + messageOf(error) })
    }
    try {
      const io = parseProcDiskstats(await readFile('/proc/diskstats', 'utf8'))
      disk.readTotalBytes = io.readTotalBytes
      disk.writeTotalBytes = io.writeTotalBytes
    } catch (error) {
      warnings.push({ key: 'disk-io', message: '磁盘 IO 采样失败: ' + messageOf(error) })
    }
    temperature = await sampleThermalLinux()
    if (!temperature.available && temperature.reason === 'error') warnings.push({ key: 'temperature', message: '温度读取失败' })
  } else {
    warnings.push({ key: 'sampling', message: '不支持的平台: ' + process.platform })
  }

  return { memory, disk, temperature, warnings }
}

/** Linux 温度：遍历 thermal_zone[N]/temp（sysfs），优先 CPU 相关 zone */
async function sampleThermalLinux() {
  const zonesDir = '/sys/class/thermal'
  try {
    const entries = await readdir(zonesDir)
    const zones = entries.filter((name) => /^thermal_zone\d+$/.test(name)).sort()
    let fallback = null
    for (const zone of zones) {
      try {
        const type = (await readFile(`${zonesDir}/${zone}/type`, 'utf8')).trim()
        const parsed = parseThermalSysfs(await readFile(`${zonesDir}/${zone}/temp`, 'utf8'))
        if (!parsed) continue
        const candidate = { available: true, reason: null, cpuC: parsed.celsius, ssdC: null, ambientC: null, source: `${zone}:${type}`, pressureLevel: null }
        if (/cpu|pkg|soc|core|acpitz|x86_pkg_temp/i.test(type)) return candidate
        if (!fallback) fallback = candidate
      } catch {
        // 单个 zone 不可读就跳过
      }
    }
    return fallback || { available: false, reason: 'unsupported', cpuC: null, ssdC: null, ambientC: null, source: null, pressureLevel: null }
  } catch {
    return { available: false, reason: 'unsupported', cpuC: null, ssdC: null, ambientC: null, source: null, pressureLevel: null }
  }
}

/**
 * Top 进程（仅 darwin）。取不到返回 processes:null + warning，绝不抛错。
 * @param {number} limit
 */
export async function sampleTop(limit = 5) {
  const warnings = []
  if (PLATFORM !== 'darwin') {
    // Linux 用 ps 也可，但 M1 只承诺 darwin；返回不可用而不是失败
    return { processes: null, warnings }
  }
  try {
    const text = await runCommand('ps_top')
    const processes = parsePs(text, limit)
    if (!processes.length) {
      warnings.push({ key: 'processes', message: 'ps 输出无可解析行' })
      return { processes: null, warnings }
    }
    return { processes, warnings }
  } catch (error) {
    warnings.push({ key: 'processes', message: 'Top 进程取不到: ' + messageOf(error) })
    return { processes: null, warnings }
  }
}

function messageOf(error) {
  const text = error && error.message ? String(error.message) : '未知错误'
  return text.length > 200 ? text.slice(0, 200) : text
}
