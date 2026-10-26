#!/usr/bin/env node
// dsh-system-hud · 离线冒烟
// 覆盖：所有 parse* 纯函数（真实 fixture）、单位换算、累计量差分、配置深合并/非法值回退、命令白名单。
// 约束：不触网、不起子进程、不读写 $DSH_HOME。`node scripts/smoke.mjs` 必须全绿。
import assert from 'node:assert/strict'
import {
  COMMANDS,
  PLATFORM,
  cpuUsagePercent,
  parseDf,
  parseIoreg,
  parseNetstat,
  parseProcDiskstats,
  parseProcMeminfo,
  parseProcNetDev,
  parsePmsetTherm,
  parseProcStat,
  parseCpuMax,
  countCpuList,
  parseCgroupStatNumbers,
  composeLinuxMemory,
  parsePs,
  parseSysctl,
  parseThermalSysfs,
  parseVmStat,
  runCommand,
} from '../lib/metrics.js'
import { computeRate, createSampler } from '../lib/sample.js'
import {
  DEFAULTS,
  METRIC_IDS,
  REGION_IDS,
  anyRegionEnabled,
  configPaths,
  deepMerge,
  sanitizeConfig,
} from '../lib/index.js'

// ── 脱敏 fixture（macOS 典型输出；机型 / 网卡地址等均为示例值；Linux 为用户态 /proc 典型输出） ──
const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     8781.
Pages active:                                 771996.
Pages inactive:                               754982.
Pages speculative:                             16561.
Pages throttled:                                   0.
Pages wired down:                             289304.
Pages purgeable:                               14580.
"Translation faults":                    13091854144.
File-backed pages:                            439337.
Anonymous pages:                             1104202.
Pages occupied by compressor:                 206681.
Compressions:                              269117635.
`

const SYSCTL_MEMORY = `34359738368
total = 10240.00M  used = 8579.19M  free = 1660.81M  (encrypted)
`

const SYSCTL_IDENTITY = `10
10
34359738368
Apple M2 Pro
{ sec = 1792150331, usec = 13886 } Fri Oct 16 19:32:11 2026
`

const NETSTAT = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
lo0        16384 <Link#1>                      155496501     0 280084702782 155496501     0 280084702782     0
lo0        16384 127           127.0.0.1       155496501     - 280084702782 155496501     - 280084702782     -
gif0*      1280  <Link#2>                             0     0          0        0     0          0     0
stf0*      1280  <Link#3>                             0     0          0        0     0          0     0
anpi1      1500  <Link#6>    02:00:00:00:00:01     1120     0     116481     1196     0     131526     0
en1        1500  <Link#9>    02:00:00:00:00:02 1000000     0  672463849  2000000     0  161828971     0
en0        1500  <Link#20>   02:00:00:00:00:03 119663674     0 101991625338 186715703     0 165591376489     0
utun4      1500  <Link#24>                           0     0 12039947737       1     0 25992060898     0
awdl0      1500  <Link#18>   02:00:00:00:00:04   198003     0   68549938   175986     0   42691103      0
`

// 无 Address 列（字段数 10）的链路行也要能解析
const NETSTAT_NO_ADDRESS = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
en9        1500  <Link#99>                          123     0        456      124     0        789     0
`

const DF_DARWIN = `Filesystem     1024-blocks      Used  Available Capacity iused       ifree %iused  Mounted on
/dev/disk3s1s1  1948455240  12349208 1674407152     1%  458735  4294075059    0%   /
/dev/disk3s5    1948455240 242411680 1674407152    13% 5316479 16744071520    0%   /System/Volumes/Data
`

const DF_LINUX = `Filesystem     1K-blocks     Used Available Use% Mounted on
/dev/sda1       51474876 20033812  28809832  42% /
`

const IOREG = `+-o IOBlockStorageDriver  <class IOBlockStorageDriver, id 0x100000b41>
    {
      "Statistics" = {"Operations (Write)"=0,"Latency Time (Write)"=0,"Bytes (Read)"=0,"Errors (Write)"=0,"Total Time (Read)"=0,"Latency Time (Read)"=0,"Retries (Read)"=0,"Errors (Read)"=0,"Total Time (Write)"=0,"Bytes (Write)"=0,"Operations (Read)"=0,"Retries (Write)"=0}
    }
+-o IOBlockStorageDriver  <class IOBlockStorageDriver, id 0x100000aa0>
    {
      "Statistics" = {"Operations (Write)"=504,"Latency Time (Write)"=0,"Bytes (Read)"=337778688,"Errors (Write)"=0,"Total Time (Read)"=271986523037,"Latency Time (Read)"=0,"Retries (Read)"=0,"Errors (Read)"=0,"Total Time (Write)"=2553066297,"Bytes (Write)"=4006912,"Operations (Read)"=21016,"Retries (Write)"=0}
    }
`

const PS = `%CPU %MEM    RSS COMM
 38.2  5.6 4404019 /Applications/Node.app/Contents/MacOS/node
  5.1  1.2  401234 node
  0.3  0.1   12000 /usr/libexec/foo bar
`

const PROC_STAT = `cpu  100 0 50 800 50 0 0 0 0 0
cpu0 60 0 30 400 10 0 0 0 0 0
cpu1 40 0 20 400 40 0 0 0 0 0
intr 12345 0 0 0
`

const PROC_MEMINFO = `MemTotal:       16384000 kB
MemFree:         1000000 kB
MemAvailable:    8000000 kB
Buffers:           50000 kB
Cached:          2000000 kB
SwapCached:            0 kB
SwapTotal:       2097152 kB
SwapFree:        1048576 kB
`

const PROC_NET_DEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 1000       10    0    0    0     0          0         0     1000       10    0    0    0     0       0          0
  eth0: 5000       50    0    0    0     0          0         0     7000       70    0    0    0     0       0          0
  eth1: 5000       50    0    0    0     0          0         0      100       70    0    0    0     0       0          0
`

const PROC_DISKSTATS = `   8       0 sda 1000 0 20000 500 2000 0 40000 800 0 900 1300
 259       0 nvme0n1 500 0 1000 50 600 0 2000 120 0 60 80
   7       0 loop0 10 0 20 1 0 0 0 0 0 0 0
`

// pmset -g therm：典型输出（无任何记录 / 有记录两个样例）
const PMS_THERM_NONE = `Note: No thermal warning level has been recorded
Note: No performance warning level has been recorded
Note: No CPU power status has been recorded
`

const PMS_THERM_LIMITED = `Note: No thermal warning level has been recorded
Note: No performance warning level has been recorded
CPU_Scheduler_Limit     = 100
CPU_Available_CPUs      = 8
CPU_Speed_Limit         = 78
`

// ── 迷你测试框架（支持 async，最后统一汇总） ─────────────────────────────
const cases = []
const test = (name, fn) => cases.push({ name, fn })
let passed = 0
const failures = []

// ── 1. vm_stat ────────────────────────────────────────────────────────────
test('parseVmStat：页大小与页计数', () => {
  const vm = parseVmStat(VM_STAT)
  assert.equal(vm.pageSizeBytes, 16384)
  assert.equal(vm.pages.free, 8781)
  assert.equal(vm.pages.active, 771996)
  assert.equal(vm.pages.inactive, 754982)
  assert.equal(vm.pages.speculative, 16561)
  assert.equal(vm.pages.wired, 289304)
  assert.equal(vm.pages.purgeable, 14580)
  assert.equal(vm.pages.compressed, 206681)
  assert.equal(vm.pages.fileBacked, 439337)
})

test('parseVmStat：页→字节换算与 used 口径', () => {
  const vm = parseVmStat(VM_STAT)
  const page = vm.pageSizeBytes
  assert.equal(vm.bytes.free, 8781 * page)
  assert.equal(vm.bytes.compressed, 206681 * page)
  // 契约口径：used = active - purgeable + wired + compressed
  const used = (771996 - 14580 + 289304 + 206681) * page
  assert.equal(used, 1253401 * page)
  assert.ok(used > 0 && used < 34359738368)
  // 缓存口径：inactive + speculative + purgeable
  assert.equal((754982 + 16561 + 14580) * page, 786123 * page)
})

test('parseVmStat：空/脏输入不抛错', () => {
  const vm = parseVmStat('')
  assert.equal(vm.pageSizeBytes, null)
  assert.equal(vm.bytes.free, null)
  assert.doesNotThrow(() => parseVmStat('Pages free: abc.\n乱码'))
})

// ── 2. sysctl ─────────────────────────────────────────────────────────────
test('parseSysctl：memsize / swapusage / boottime / brand', () => {
  const s = parseSysctl(SYSCTL_IDENTITY, ['hw.ncpu', 'hw.physicalcpu', 'hw.memsize', 'machdep.cpu.brand_string', 'kern.boottime'])
  assert.equal(s['hw.ncpu'], 10)
  assert.equal(s['hw.physicalcpu'], 10)
  assert.equal(s['hw.memsize'], 34359738368)
  assert.equal(s['machdep.cpu.brand_string'], 'Apple M2 Pro')
  assert.equal(s['kern.boottime'].sec, 1792150331)

  const mem = parseSysctl(SYSCTL_MEMORY, ['hw.memsize', 'vm.swapusage'])
  assert.equal(mem['hw.memsize'], 34359738368)
  assert.equal(mem['vm.swapusage'].totalBytes, 10240 * 1024 ** 2)
  assert.equal(mem['vm.swapusage'].usedBytes, Math.round(8579.19 * 1024 ** 2))
  assert.equal(mem['vm.swapusage'].freeBytes, Math.round(1660.81 * 1024 ** 2))
  assert.ok(mem['vm.swapusage'].usedBytes + mem['vm.swapusage'].freeBytes <= mem['vm.swapusage'].totalBytes)
})

test('parseSysctl：缺失行返回 null，不串位', () => {
  const s = parseSysctl('42\n', ['a', 'b'])
  assert.equal(s.a, 42)
  assert.equal(s.b, null)
})

// ── 3. netstat ────────────────────────────────────────────────────────────
test('parseNetstat：选 en0 为主网卡并取累计字节', () => {
  const net = parseNetstat(NETSTAT)
  assert.ok(net.primary, '应识别出物理主网卡')
  assert.equal(net.primary.name, 'en0')
  assert.equal(net.primary.rxTotalBytes, 101991625338)
  assert.equal(net.primary.txTotalBytes, 165591376489)
  const en1 = net.ifaces.find((i) => i.name === 'en1')
  assert.equal(en1.rxTotalBytes, 672463849)
  // lo0 / utun / awdl 都不能当主网卡
  assert.ok(!net.ifaces.some((i) => i.name === 'lo0'), 'loopback 不应进入接口表')
  assert.ok(!net.ifaces.some((i) => i.name.endsWith('*')), '带 * 的虚拟接口应被跳过')
})

test('parseNetstat：无 Address 列的链路行（10 字段）可解析', () => {
  const net = parseNetstat(NETSTAT_NO_ADDRESS)
  assert.equal(net.ifaces.length, 1)
  assert.equal(net.ifaces[0].name, 'en9')
  assert.equal(net.ifaces[0].rxTotalBytes, 456)
  assert.equal(net.ifaces[0].txTotalBytes, 789)
})

test('parseNetstat：空输入返回空表', () => {
  const net = parseNetstat('')
  assert.deepEqual(net.ifaces, [])
  assert.equal(net.primary, null)
})

// ── 4. df ─────────────────────────────────────────────────────────────────
test('parseDf：darwin APFS 用 used+free 反算 total', () => {
  const df = parseDf(DF_DARWIN)
  assert.equal(df.mounts.length, 2)
  const data = df.mounts.find((m) => m.mount === '/System/Volumes/Data')
  assert.ok(data, '应解析出 Data 卷')
  assert.equal(data.source, '/dev/disk3s5', '解析出挂载源设备')
  assert.equal(data.usedBytes, 242411680 * 1024)
  assert.equal(data.freeBytes, 1674407152 * 1024)
  assert.equal(data.totalBytes, (242411680 + 1674407152) * 1024)
  assert.equal(data.usedBytes + data.freeBytes, data.totalBytes, '三者必须自洽')
  assert.ok(data.usedBytes < data.totalBytes)
})

test('parseDf：linux 单行根分区', () => {
  const df = parseDf(DF_LINUX)
  assert.equal(df.mounts.length, 1)
  assert.equal(df.mounts[0].mount, '/')
  assert.equal(df.mounts[0].usedBytes, 20033812 * 1024)
  assert.equal(df.mounts[0].totalBytes, (20033812 + 28809832) * 1024)
})

// ── 5. ioreg ──────────────────────────────────────────────────────────────
test('parseIoreg：跨盘累加读/写累计字节', () => {
  const io = parseIoreg(IOREG)
  assert.equal(io.devices, 2)
  assert.equal(io.readTotalBytes, 337778688)
  assert.equal(io.writeTotalBytes, 4006912)
})

test('parseIoreg：无 Statistics 时返回 null 而不是 0', () => {
  const io = parseIoreg('+-o nothing\n')
  assert.equal(io.devices, 0)
  assert.equal(io.readTotalBytes, null)
  assert.equal(io.writeTotalBytes, null)
})

// ── 6. ps ─────────────────────────────────────────────────────────────────
test('parsePs：取 top N，rss→bytes，comm 取 basename', () => {
  const rows = parsePs(PS, 5)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].name, 'node')
  assert.equal(rows[0].cpuPercent, 38.2)
  assert.equal(rows[0].memoryBytes, 4404019 * 1024)
  assert.equal(rows[2].name, 'foo bar') // 含空格的 comm 保留
  const limited = parsePs(PS, 2)
  assert.equal(limited.length, 2)
  assert.deepEqual(limited.map((r) => r.name), ['node', 'node'])
})

// ── 7. /proc（linux） ─────────────────────────────────────────────────────
test('parseProcStat：聚合行与每核行', () => {
  const stat = parseProcStat(PROC_STAT)
  assert.ok(stat)
  assert.equal(stat.total.totalTicks, 100 + 0 + 50 + 800 + 50)
  assert.equal(stat.total.idleTicks, 800 + 50)
  assert.equal(stat.perCore.length, 2)
  assert.equal(stat.perCore[0].id, 0)
  assert.equal(stat.perCore[1].idleTicks, 400 + 40)
  assert.equal(stat.perCore[1].totalTicks, 40 + 0 + 20 + 400 + 40)
})

test('parseProcStat：无 cpu 行返回 null', () => {
  assert.equal(parseProcStat('intr 1 2 3\n'), null)
})

test('parseProcMeminfo：kB→bytes 与 swap', () => {
  const mem = parseProcMeminfo(PROC_MEMINFO)
  assert.equal(mem.totalBytes, 16384000 * 1024)
  assert.equal(mem.availableBytes, 8000000 * 1024)
  assert.equal(mem.cachedBytes, 2000000 * 1024)
  assert.equal(mem.buffersBytes, 50000 * 1024)
  assert.equal(mem.swapUsedBytes, (2097152 - 1048576) * 1024)
  assert.equal(mem.totalBytes - mem.availableBytes, 8384000 * 1024) // used = total - available
})

test('parseProcNetDev：rx/tx 取第 1/9 字段，排除 lo', () => {
  const net = parseProcNetDev(PROC_NET_DEV)
  assert.equal(net.ifaces.length, 3)
  assert.ok(net.primary)
  assert.equal(net.primary.name, 'eth0')
  assert.equal(net.primary.rxTotalBytes, 5000)
  assert.equal(net.primary.txTotalBytes, 7000)
})

test('parseProcDiskstats：扇区×512，排除 loop', () => {
  const io = parseProcDiskstats(PROC_DISKSTATS)
  assert.equal(io.devices, 2)
  assert.equal(io.readTotalBytes, (20000 + 1000) * 512)
  assert.equal(io.writeTotalBytes, (40000 + 2000) * 512)
})

// ── 8. 温度 ───────────────────────────────────────────────────────────────
test('parseThermalSysfs：millidegree / degree / temp= 前缀', () => {
  assert.equal(parseThermalSysfs('45000\n').celsius, 45)
  assert.equal(parseThermalSysfs('52\n').celsius, 52)
  assert.equal(parseThermalSysfs('temp=61500').celsius, 61.5)
  assert.equal(parseThermalSysfs(''), null)
  assert.equal(parseThermalSysfs('n/a'), null)
  assert.equal(parseThermalSysfs('999999'), null) // 超范围视为脏数据
})

test('parsePmsetTherm：无记录（只有 Note 行）→ null', () => {
  assert.equal(parsePmsetTherm(PMS_THERM_NONE), null)
  assert.equal(parsePmsetTherm(''), null)
  assert.equal(parsePmsetTherm('Note: No CPU power status has been recorded\n'), null)
})

test('parsePmsetTherm：限速/告警档位映射 pressureLevel', () => {
  assert.equal(parsePmsetTherm(PMS_THERM_LIMITED), 'fair') // 78 → fair
  assert.equal(parsePmsetTherm('CPU_Speed_Limit = 100\n'), 'nominal')
  assert.equal(parsePmsetTherm('CPU_Speed_Limit = 42\n'), 'critical')
  // 取 Speed/Scheduler 里更低的一个：min(90, 60) = 60 → serious
  assert.equal(parsePmsetTherm('CPU_Scheduler_Limit = 60\nCPU_Speed_Limit = 90\n'), 'serious')
  assert.equal(parsePmsetTherm('Thermal warning level has been recorded: 2\n'), 'serious')
  // 限速 100 但告警档 1 → 取更重者 fair
  assert.equal(parsePmsetTherm('CPU_Speed_Limit = 100\nThermal warning level: 1\n'), 'fair')
  assert.equal(parsePmsetTherm('Thermal warning level: 3\n'), 'critical')
})

// ── 9. CPU 差分 ───────────────────────────────────────────────────────────
test('cpuUsagePercent：两次采样差分', () => {
  const prev = [{ idle: 8000, total: 10000 }]
  const cur = [{ idle: 8400, total: 11000 }]
  const { usagePercent, perCore } = cpuUsagePercent(prev, cur)
  assert.equal(usagePercent, 60) // Δidle 400 / Δtotal 1000 → 60%
  assert.deepEqual(perCore, [60])
})

test('cpuUsagePercent：首帧/长度不一致返回 null', () => {
  assert.deepEqual(cpuUsagePercent(null, [{ idle: 1, total: 2 }]), { usagePercent: null, perCore: null })
  assert.deepEqual(cpuUsagePercent([{ idle: 1, total: 2 }], [{ idle: 1, total: 2 }, { idle: 1, total: 2 }]), { usagePercent: null, perCore: null })
})

// ── 10. 速率差分（网络 / IO 共用） ────────────────────────────────────────
test('computeRate：Δbytes/Δt 换算 B/s', () => {
  assert.equal(computeRate(1000, 1000, 2000, 2000), 1000)
  assert.equal(computeRate(1000, 1000, 2000, 1500), 2000)
  assert.equal(computeRate(0, 0, 1024 * 1024, 1000), 1048576)
})

test('computeRate：首帧 / 间隔过短 / 计数回绕都返回 null', () => {
  assert.equal(computeRate(null, null, 2000, 2000), null) // 首帧
  assert.equal(computeRate(1000, 1000, 2000, 1100), null) // Δt=100ms < 200ms
  assert.equal(computeRate(2000, 1000, 1000, 2000), null) // 回绕/重置
})

// ── 11. 配置：深合并 / 非法值回退 ─────────────────────────────────────────
test('deepMerge：对象递归、数组覆盖、undefined 忽略', () => {
  const merged = deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { b: 9 }, list: [3], gone: undefined })
  assert.deepEqual(merged, { a: { b: 9, c: 2 }, list: [3] })
  assert.equal(deepMerge({ a: 1 }, null).a, 1)
})

test('sanitizeConfig：空输入等于默认值且键集一致', () => {
  const cfg = sanitizeConfig({})
  assert.deepEqual(Object.keys(cfg).sort(), Object.keys(DEFAULTS).sort())
  assert.deepEqual(cfg, sanitizeConfig(DEFAULTS))
  assert.deepEqual(cfg.regions, DEFAULTS.regions)
  assert.deepEqual(cfg.metrics.order, DEFAULTS.metrics.order)
  assert.deepEqual(cfg.metrics.hidden, DEFAULTS.metrics.hidden)
})

test('sanitizeConfig：非法周期/枚举/数字全部回退默认', () => {
  const cfg = sanitizeConfig({
    fastMs: 777,
    slowMs: '2s',
    topProcMs: 15000,
    unavailable: 'nope',
    units: 'bit',
    clickAction: 'nope',
    hoverDelayMs: 250,
    showTotals: 'yes',
    thresholds: { warn: -5, crit: 999, tempC: 'x' },
    regions: { header: 'yes', bottomBar: true },
  })
  assert.equal(cfg.fastMs, 1000)
  assert.equal(cfg.slowMs, 5000)
  assert.equal(cfg.topProcMs, 30000)
  assert.equal(cfg.unavailable, 'hide')
  assert.equal(cfg.units, 'bytes')
  assert.equal(cfg.clickAction, 'pane')
  assert.equal(cfg.hoverDelayMs, 300)
  assert.equal(cfg.showTotals, true)
  assert.equal(cfg.thresholds.warn, 0)
  assert.equal(cfg.thresholds.crit, 100)
  assert.equal(cfg.thresholds.tempC, 90)
  assert.equal(cfg.regions.header, true) // 非布尔回退默认 true
  assert.equal(cfg.regions.bottomBar, true) // 布尔则采纳
})

test('sanitizeConfig：合法值原样保留 + 未知键丢弃', () => {
  const cfg = sanitizeConfig({ fastMs: 2000, slowMs: 10000, topProcMs: 10000, units: 'bits', clickAction: 'card', unknown: 1 })
  assert.equal(cfg.fastMs, 2000)
  assert.equal(cfg.slowMs, 10000)
  assert.equal(cfg.topProcMs, 10000)
  assert.equal(cfg.units, 'bits')
  assert.equal(cfg.clickAction, 'card')
  assert.equal('unknown' in cfg, false)
})

test('sanitizeConfig：metrics 数组去重过滤，空数组回退默认', () => {
  const cfg = sanitizeConfig({ metrics: { order: ['cpu', 'bogus', 'cpu', 'memory'], hidden: [] } })
  assert.deepEqual(cfg.metrics.order, ['cpu', 'memory'])
  assert.deepEqual(cfg.metrics.hidden, DEFAULTS.metrics.hidden)
  for (const id of cfg.metrics.order) assert.ok(METRIC_IDS.includes(id))
})

test('anyRegionEnabled：全关为 false', () => {
  const off = sanitizeConfig({ regions: Object.fromEntries(REGION_IDS.map((id) => [id, false])) })
  assert.equal(anyRegionEnabled(off), false)
  assert.equal(anyRegionEnabled(DEFAULTS), true)
})

test('configPaths：落在 $DSH_HOME/system-hud 下', () => {
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/dsh-smoke-home'
  try {
    const paths = configPaths()
    assert.equal(paths.dir, '/tmp/dsh-smoke-home/system-hud')
    assert.equal(paths.file, '/tmp/dsh-smoke-home/system-hud/config.json')
  } finally {
    if (before === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = before
  }
})

// ── 12. 采样器：不启动定时器 + 快照契约形状 ───────────────────────────────
test('createSampler：构造时不启动、不采样', () => {
  const sampler = createSampler({ fastMs: 1000, slowMs: 5000, topProcMs: 0 })
  try {
    assert.equal(sampler.isRunning(), false)
    assert.deepEqual(sampler.getConfig(), { fastMs: 1000, slowMs: 5000, topProcMs: 0 })
    const snap = sampler.getSnapshot()
    assert.equal(snap.intervalMs, 1000)
    assert.equal(snap.power, null)
    assert.equal(snap.processes, null)
    assert.deepEqual(snap.warnings, [])
  } finally {
    sampler.dispose()
  }
})

test('createSampler：非法周期回退默认', () => {
  const sampler = createSampler({ fastMs: 'x', slowMs: -1, topProcMs: -5 })
  try {
    assert.deepEqual(sampler.getConfig(), { fastMs: 1000, slowMs: 5000, topProcMs: 30000 })
  } finally {
    sampler.dispose()
  }
})

test('快照形状严格对齐契约 §3（首帧全 null，不填 0）', () => {
  const sampler = createSampler({})
  try {
    const snap = sampler.getSnapshot()
    assert.deepEqual(
      Object.keys(snap).sort(),
      ['cpu', 'disk', 'host', 'intervalMs', 'memory', 'monotonicMs', 'network', 'power', 'processes', 'temperature', 'timestamp', 'warnings'].sort(),
    )
    assert.equal(snap.cpu.usagePercent, null)
    assert.equal(snap.cpu.perCore, null)
    assert.equal(snap.cpu.load, null)
    assert.equal(snap.memory.totalBytes, null)
    assert.equal(snap.disk.totalBytes, null)
    assert.equal(snap.network.rxBytesPerSec, null)
    assert.equal(snap.temperature.available, false)
    assert.equal(snap.temperature.cpuC, null)
    assert.equal(snap.temperature.pressureLevel, null) // 首帧无热压力数据
    assert.ok(['needs-helper', 'unsupported', 'error'].includes(snap.temperature.reason))
    assert.equal(typeof snap.timestamp, 'number')
    assert.equal(typeof snap.monotonicMs, 'number')
    assert.equal(typeof snap.host.uptimeSec, 'number')
    for (const section of ['cpu', 'memory', 'disk', 'network', 'temperature']) {
      assert.ok('sampledAt' in snap[section], section + ' 必须带 sampledAt')
    }
  } finally {
    sampler.dispose()
  }
})

// ── 13. 命令白名单：无 shell、无外部参数 ──────────────────────────────────
test('COMMANDS：全部是固定绝对路径 argv，无 shell 拼接', () => {
  const ids = Object.keys(COMMANDS)
  // darwin 需要 7 条外部命令；linux 主要读 /proc，只有 df/ps 等少量命令
  assert.ok(ids.length >= (PLATFORM === 'darwin' ? 5 : 1), '白名单命令数量异常（' + PLATFORM + '）')
  for (const id of ids) {
    const argv = COMMANDS[id]
    assert.ok(Array.isArray(argv), id + ' 必须是 argv 数组')
    assert.ok(argv.length >= 1, id + ' 至少要有可执行文件')
    assert.ok(argv.every((part) => typeof part === 'string'), id + ' 参数必须全是字符串')
    assert.ok(argv[0].startsWith('/'), id + ' 可执行文件必须是绝对路径')
    assert.ok(!/(^|\/)(sh|bash|zsh|dash)$/.test(argv[0]), id + ' 禁止经由 shell')
    assert.ok(!argv.includes('-c'), id + ' 禁止 -c（shell 字符串）')
    for (const part of argv) {
      assert.ok(!/[$`;|&<>]/.test(part), id + ' 参数不得含 shell 元字符: ' + part)
      assert.ok(!part.includes('${'), id + ' 参数不得含插值')
    }
  }
})

test('COMMANDS：darwin 必备命令齐全且不含 iostat/top', () => {
  if (PLATFORM !== 'darwin') return
  for (const id of ['vm_stat', 'sysctl_memory', 'sysctl_identity', 'df', 'netstat', 'ioreg_io', 'ps_top', 'pmset_therm']) {
    assert.ok(COMMANDS[id], '缺少白名单命令: ' + id)
  }
  const flat = Object.values(COMMANDS).flat().join(' ')
  assert.ok(!/iostat/.test(flat), 'iostat 会阻塞 1–3s，禁止')
  assert.ok(!/\btop\b/.test(flat), 'top 需 1s 采样窗口，禁止')
  assert.ok(/\bnetstat\b/.test(flat) && /-ibn/.test(flat), 'netstat 必须带 -n')
})

test('runCommand：未知 id 直接拒绝，不落到任何命令', async () => {
  assert.equal(runCommand.length, 1, 'runCommand 只能接收白名单 id，不接受参数')
  await assert.rejects(() => runCommand('freestyle'), (error) => {
    assert.equal(error.code, 'system-hud/unknown-command')
    return true
  })
})

test('cgroup 配额解析：cpu.max / cpuset', () => {
  assert.equal(parseCpuMax('400000 100000'), 4, 'cpu.max → 4 核')
  assert.equal(parseCpuMax('max 100000'), null, 'cpu.max=max 表示不限')
  assert.equal(parseCpuMax('garbage'), null, 'cpu.max 非法值 → null')
  assert.equal(countCpuList('0-3'), 4, 'cpuset 0-3 → 4 核')
  assert.equal(countCpuList('0-1,3'), 3, 'cpuset 0-1,3 → 3 核')
  assert.equal(countCpuList(''), null, 'cpuset 空 → null')
})

test('cgroup 内存口径：容器 used/limit/cache 与宿主总量分离', () => {
  const stat = parseCgroupStatNumbers('anon 1048576\nfile 524288\nkernel 65536\n')
  assert.equal(stat.get('file'), 524288, 'memory.stat 解析 file')
  const host = { totalBytes: 8 * 2 ** 30, availableBytes: 6 * 2 ** 30, cachedBytes: 3 * 2 ** 30, buffersBytes: 0, swapUsedBytes: 0 }
  const cg = { scope: 'cgroup-v2', usedBytes: 3 * 2 ** 30, limitBytes: 6 * 2 ** 30, cacheBytes: 2 ** 30, swapUsedBytes: 256 * 2 ** 20 }
  const mem = composeLinuxMemory(host, cg)
  assert.equal(mem.scope, 'container', '容器口径')
  assert.equal(mem.cgroupVersion, 'v2', 'cgroup 版本单独保留')
  assert.equal(mem.usedBytes, 3 * 2 ** 30, 'used 取 memory.current')
  assert.equal(mem.totalBytes, 6 * 2 ** 30, 'total 取 memory.max')
  assert.equal(mem.hostTotalBytes, 8 * 2 ** 30, '宿主总量单独保留')
  assert.equal(mem.cacheBytes, 2 ** 30, 'cache 取 memory.stat.file')
  const fallback = composeLinuxMemory(host, null)
  assert.equal(fallback.scope, 'host', '无 cgroup 回退宿主口径')
  assert.equal(fallback.usedBytes, 2 * 2 ** 30, '宿主 used = total - available')
  assert.equal(fallback.limitBytes, null, '宿主口径无 limit')
})

// ── 执行 ──────────────────────────────────────────────────────────────────
for (const item of cases) {
  try {
    await item.fn()
    passed += 1
    console.log('  ✓ ' + item.name)
  } catch (error) {
    failures.push({ name: item.name, error })
    console.log('  ✗ ' + item.name)
  }
}

console.log('')
console.log(`smoke: ${passed}/${cases.length} passed, ${failures.length} failed`)
if (failures.length) {
  for (const failure of failures) {
    console.error('\nFAILED: ' + failure.name)
    console.error(failure.error && failure.error.stack ? failure.error.stack : failure.error)
  }
  process.exit(1)
}
process.exit(0)
