// dsh-system-hud · Client 半区（手写 ModuleLoader bundle，无构建步骤）
// - 三个原生位置：conversation.session.header.utilities / conversation.composer.dock / sidebar.footer.action
// - 右侧「系统」tab（sidebar.right.pane.tab）+ 无会话时退化的大卡（shell.overlay）
// - 设置页（settings.section）：位置开关、指标顺序、不可用策略、采样、阈值、交互
// - 所有数据只来自 Host 的 /system-hud/* JSON 协议，单轮询、三处共享快照
window.__ModuleLoader__.load({
  id: '@ponydev/dsh-system-hud',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement
    const NS = 'dsh-system-hud'

    // 可选组件库：没有就用自己的 token 样式（不硬依赖）
    let P = null
    try { P = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { P = null }

    // ---------------------------------------------------------------- i18n
    const zh = {
      title: '系统 HUD',
      shortTitle: '系统',
      desc: '本机 CPU、内存、磁盘、网络与温度',
      device: '设备状态',
      localMachine: '本机',
      platformDarwin: 'macOS',
      platformLinux: 'Linux',
      platformOther: '本机',
      cpu: 'CPU',
      memory: '内存',
      disk: '磁盘',
      network: '网络',
      io: 'I/O',
      temperature: '温度',
      load: '负载',
      processes: '进程数',
      cpuShort: 'CPU',
      memShort: 'MEM',
      diskShort: 'DISK',
      netShort: 'NET',
      cores: '{n} 核',
      coreCount: '{n} 核',
      loadLabel: '负载',
      up: '↑',
      down: '↓',
      read: '读',
      write: '写',
      used: '已用',
      available: '可用',
      swap: '交换',
      total: '总',
      capacity: '容量',
      lastSeconds: '近 {n}s',
      totals: '累计',
      netTotals: '累计 ↑{up} · ↓{down}',
      tempCpu: 'CPU',
      tempSsd: 'SSD',
      tempAmbient: '环境',
      normal: '正常',
      normalAt: '正常 ≤',
      elevated: '偏高',
      critical: '严重',
      unavailable: '不可用',
      staleLabel: '数据过期',
      staleFor: '已过期 {s}s',
      needsHelper: '需 helper',
      unsupported: '不支持',
      readError: '读取失败',
      pressure: '热压力',
      pressureUnavailable: '热压力档位暂不可用（需要 pmset 数据）',
      temperatureUnknown: '温度不可用',
      openPane: '打开系统详情',
      openCard: '展开大卡',
      close: '关闭',
      settings: '设置',
      panelTitle: '系统',
      perCore: '每核占用',
      memoryLine: '已用 {used} · 可用 {free} · 交换 {swap}',
      diskLine: '{free} 可用 / {total}',
      topProc: 'Top 进程',
      topProcCol: 'CPU / 内存',
      noData: '暂无数据',
      waitingHost: '正在等待宿主接口 /system-hud…',
      guideDesc: '本机 CPU、内存、磁盘、网络与温度',
      cardHint: '点击查看系统详情',
      disabled: '系统 HUD 已关闭',
      groupPreview: '实时预览',
      groupPreviewDesc: '当前配置下三个位置的样子（深色主题自动跟随）。',
      regionHeader: '顶栏入口',
      regionDock: '输入框底部',
      regionSidebar: '侧边栏底部',
      regionRightPane: '右侧详情',
      regionBottomBar: '全宽底栏（备选）',
      regionHeaderDesc: '两个小环 + 温度，点击开右侧详情',
      regionDockDesc: '和 token 统计同一行，一眼可见',
      regionSidebarDesc: '240px 卡片，「每月限额」和「更多」之间',
      regionRightPaneDesc: '原生「系统」tab：每核 / 曲线 / 进程',
      regionBottomBarDesc: '46px 全宽状态条，占一行高度',
      groupRegions: '显示位置',
      groupRegionsDesc: '每个位置独立开关；关掉即完全卸载（不注册、不渲染、不采样）。至少保留一个。',
      groupMetrics: '指标与顺序',
      groupMetricsDesc: '上移 / 下移调整顺序；关闭的指标在状态条与详情里一起隐藏，不占位。',
      moveUp: '上移',
      moveDown: '下移',
      metricCpuSub: '使用率 · 每核',
      metricMemorySub: '已用 / 总',
      metricDiskSub: '可用 / 总量',
      metricNetworkSub: '↑↓ 速率',
      metricIoSub: '读 / 写',
      metricTemperatureSub: '需 helper',
      metricLoadSub: '1 / 5 / 15 分钟',
      metricProcessesSub: 'Top 5',
      showMetric: '显示该指标',
      hideMetric: '隐藏该指标',
      groupUnavailable: '拿不到的数据怎么办',
      groupUnavailableDesc: 'macOS 26 没有免特权温度源：不装 helper 时温度取不到，不要用 0 或假值。',
      policyHide: '自动隐藏该指标（推荐）',
      policyHideDesc: '拿不到就整格不显示，状态条不留空位；Linux 端会自动出现温度。',
      policyDash: '显示 “—” 并标注不可用',
      policyDashDesc: '保留位置，鼠标悬停说明原因；适合固定布局。',
      policyProxy: '用代理指标替代',
      policyProxyDesc: '温度不可用时显示热压力档位（Host 提供时生效）。',
      thermalNote: '温度 helper 需要安装可选组件后重启宿主；在此之前 macOS 按上面的策略处理。',
      groupSampling: '采样与开销',
      groupSamplingDesc: '只有页面可见且至少一个位置启用时才采样；后台标签页 0 开销。',
      fastPeriod: '快层周期',
      fastPeriodDesc: 'CPU + 网络',
      slowPeriod: '慢层周期',
      slowPeriodDesc: '内存 / 磁盘 / IO / 温度',
      topPeriod: 'Top 进程',
      topPeriodDesc: '每轮约 30ms，仅详情可见时采样',
      off: '关',
      units: '单位',
      unitsDesc: '网络与 I/O 的显示单位',
      unitsBytes: 'B/s',
      unitsBits: 'bps',
      showTotals: '累计流量',
      showTotalsDesc: '在详情里显示开机以来的累计',
      groupThresholds: '阈值与颜色',
      groupThresholdsDesc: '低于正常值绿、偏高值琥珀、严重值红；温度阈值单独设置。',
      warnAt: '偏高 ≤',
      critAt: '温度告警 ≥',
      thresholdNote: '告警时状态条数字变红，不弹窗',
      groupInteraction: '交互',
      clickAction: '点击指标',
      clickPane: '右侧详情',
      clickCard: '展开大卡',
      hoverDelay: '悬停延时',
      hoverDelayDesc: '避免鼠标划过就展开大卡（M2 生效）',
      reset: '恢复默认',
      done: '完成',
      saving: '保存中…',
      saved: '已保存',
      saveFailed: '保存失败，显示的是内存中的配置',
      activeRegions: '已启用 {n} 个位置',
      atLeastOne: '至少保留一个显示位置',
      samplingFooter: '采样 {v} · 仅本机',
      settingsHint: '设置 → 系统 HUD',
      memoryUsedOf: '{used} / {total}',
      netRateUp: '↑{v}',
      netRateDown: '↓{v}',
      ioReadWrite: '读 {read} · 写 {write}',
      bootUptime: '已运行 {v}',
      unknownChip: '未知机型',
      policyNote: '温度不可用不会填 0；其他指标同样按这个策略处理。',
      github: 'GitHub',
      feedback: '问题反馈',
      checkUpdate: '检查更新',
      checkingUpdate: '检查中…',
      upToDate: '已是最新版本',
      updateFailed: '检查失败：{msg}',
      notPublished: '尚未发布到 npm（当前是本地 link 安装），无需更新',
      updateDialogTitle: '系统 HUD 更新',
      updateDesc: '仅检查当前插件是否有新版本，不联动安装其他插件；更新需要重启 DSH Web。',
      currentVersion: '运行版本',
      latestVersion: '最新版本',
      manualUpdateTitle: '手工更新',
      manualUpdateNote: '插件由 DSH profile 管理：在终端执行以下命令，然后重启 DSH Web。',
      retryCheck: '重新检查',
      copyCommand: '复制命令',
      copied: '已复制',

      valueDash: '—'
    }
    const en = {
      title: 'System HUD',
      shortTitle: 'System',
      desc: 'Local CPU, memory, disk, network and temperature',
      device: 'Device status',
      localMachine: 'This machine',
      platformDarwin: 'macOS',
      platformLinux: 'Linux',
      platformOther: 'This machine',
      cpu: 'CPU',
      memory: 'Memory',
      disk: 'Disk',
      network: 'Network',
      io: 'I/O',
      temperature: 'Temperature',
      load: 'Load',
      processes: 'Processes',
      cpuShort: 'CPU',
      memShort: 'MEM',
      diskShort: 'DISK',
      netShort: 'NET',
      cores: '{n} cores',
      coreCount: '{n} cores',
      loadLabel: 'Load',
      up: '↑',
      down: '↓',
      read: 'Read',
      write: 'Write',
      used: 'Used',
      available: 'Available',
      swap: 'Swap',
      total: 'Total',
      capacity: 'Capacity',
      lastSeconds: 'Last {n}s',
      totals: 'Total',
      netTotals: 'Total ↑{up} · ↓{down}',
      tempCpu: 'CPU',
      tempSsd: 'SSD',
      tempAmbient: 'Ambient',
      normal: 'Normal',
      normalAt: 'Normal ≤',
      elevated: 'Elevated',
      critical: 'Critical',
      unavailable: 'Unavailable',
      staleLabel: 'Stale',
      staleFor: 'Stale {s}s',
      needsHelper: 'Needs helper',
      unsupported: 'Unsupported',
      readError: 'Read failed',
      pressure: 'Thermal pressure',
      pressureUnavailable: 'Thermal pressure unavailable (needs pmset data)',
      temperatureUnknown: 'Temperature unavailable',
      openPane: 'Open system details',
      openCard: 'Expand card',
      close: 'Close',
      settings: 'Settings',
      panelTitle: 'System',
      perCore: 'Per-core usage',
      memoryLine: 'Used {used} · Available {free} · Swap {swap}',
      diskLine: '{free} free / {total}',
      topProc: 'Top processes',
      topProcCol: 'CPU / Memory',
      noData: 'No data',
      waitingHost: 'Waiting for the host API /system-hud…',
      guideDesc: 'Local CPU, memory, disk, network and temperature',
      cardHint: 'Click for system details',
      disabled: 'System HUD is off',
      groupPreview: 'Live preview',
      groupPreviewDesc: 'How the three positions look with the current settings (dark theme follows automatically).',
      regionHeader: 'Header entry',
      regionDock: 'Composer dock',
      regionSidebar: 'Sidebar footer',
      regionRightPane: 'Right pane details',
      regionBottomBar: 'Full-width bottom bar (optional)',
      regionHeaderDesc: 'Two small rings + temperature; click opens the right pane',
      regionDockDesc: 'Same line as token stats, at a glance',
      regionSidebarDesc: '240px card between quota and More',
      regionRightPaneDesc: 'Native System tab: per-core / chart / processes',
      regionBottomBarDesc: '46px full-width status bar, costs one row',
      groupRegions: 'Display positions',
      groupRegionsDesc: 'Each position is independent; turning it off fully unloads it (no registration, render or sampling). Keep at least one.',
      groupMetrics: 'Metrics & order',
      groupMetricsDesc: 'Move up / down to reorder; hidden metrics disappear from the status bar and details without leaving a gap.',
      moveUp: 'Move up',
      moveDown: 'Move down',
      metricCpuSub: 'Usage · per core',
      metricMemorySub: 'Used / total',
      metricDiskSub: 'Free / capacity',
      metricNetworkSub: '↑↓ rate',
      metricIoSub: 'Read / write',
      metricTemperatureSub: 'Needs helper',
      metricLoadSub: '1 / 5 / 15 min',
      metricProcessesSub: 'Top 5',
      showMetric: 'Show this metric',
      hideMetric: 'Hide this metric',
      groupUnavailable: 'When data is unavailable',
      groupUnavailableDesc: 'macOS 26 has no unprivileged temperature source; without the helper it must not be faked as 0.',
      policyHide: 'Hide the metric (recommended)',
      policyHideDesc: 'No gap is left behind; temperature appears automatically on Linux.',
      policyDash: 'Show “—” and mark unavailable',
      policyDashDesc: 'Keeps the slot and explains why on hover; good for fixed layouts.',
      policyProxy: 'Substitute a proxy metric',
      policyProxyDesc: 'Show thermal pressure when temperature is unavailable (when the host provides it).',
      thermalNote: 'The optional temperature helper needs to be installed and the host restarted; until then macOS follows the policy above.',
      groupSampling: 'Sampling & overhead',
      groupSamplingDesc: 'Sampling only runs while the page is visible and at least one position is enabled; background tabs cost nothing.',
      fastPeriod: 'Fast interval',
      fastPeriodDesc: 'CPU + network',
      slowPeriod: 'Slow interval',
      slowPeriodDesc: 'Memory / disk / IO / temperature',
      topPeriod: 'Top processes',
      topPeriodDesc: 'About 30ms per round, only while details are visible',
      off: 'Off',
      units: 'Units',
      unitsDesc: 'Display unit for network and I/O',
      unitsBytes: 'B/s',
      unitsBits: 'bps',
      showTotals: 'Cumulative traffic',
      showTotalsDesc: 'Show totals since boot in the details pane',
      groupThresholds: 'Thresholds & colors',
      groupThresholdsDesc: 'Below normal is green, elevated is amber, critical is red; temperature has its own threshold.',
      warnAt: 'Elevated ≤',
      critAt: 'Temp alarm ≥',
      thresholdNote: 'Alarming numbers turn red; no popups',
      groupInteraction: 'Interaction',
      clickAction: 'Metric click',
      clickPane: 'Details pane',
      clickCard: 'Expand card',
      hoverDelay: 'Hover delay',
      hoverDelayDesc: 'Avoid opening the big card on a quick pointer pass (M2)',
      reset: 'Reset defaults',
      done: 'Done',
      saving: 'Saving…',
      saved: 'Saved',
      saveFailed: 'Save failed; showing the in-memory config',
      activeRegions: '{n} positions enabled',
      atLeastOne: 'Keep at least one display position',
      samplingFooter: 'Sampling {v} · local only',
      settingsHint: 'Settings → System HUD',
      memoryUsedOf: '{used} / {total}',
      netRateUp: '↑{v}',
      netRateDown: '↓{v}',
      ioReadWrite: 'Read {read} · Write {write}',
      bootUptime: 'Up {v}',
      unknownChip: 'Unknown model',
      policyNote: 'Unavailable temperature is never shown as 0; other metrics follow the same policy.',
      github: 'GitHub',
      feedback: 'Issues',
      checkUpdate: 'Check for updates',
      checkingUpdate: 'Checking…',
      upToDate: 'Up to date',
      updateFailed: 'Check failed: {msg}',
      notPublished: 'Not published on npm yet (local link install); nothing to update',
      updateDialogTitle: 'System HUD update',
      updateDesc: 'Checks this plugin only; updating requires a DSH Web restart.',
      currentVersion: 'Running version',
      latestVersion: 'Latest version',
      manualUpdateTitle: 'Manual update',
      manualUpdateNote: 'The plugin is managed by the DSH profile: run the command below, then restart DSH Web.',
      retryCheck: 'Check again',
      copyCommand: 'Copy command',
      copied: 'Copied',

      valueDash: '—'
    }

    // ---------------------------------------------------------------- locale tick
    const LOCALE_SUBS = new Set()
    function useLocaleTick() {
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const fn = () => bump((n) => n + 1)
        LOCALE_SUBS.add(fn)
        return () => { LOCALE_SUBS.delete(fn) }
      }, [])
    }
    function makeT(dict) {
      return (key, vars) => {
        let text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
        if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
        return text
      }
    }
    function trWith(t) {
      if (typeof t === 'function') return (key, vars) => {
        let out = null
        try { out = vars ? t(key, vars) : t(key) } catch (error) { out = null }
        if (out != null && out !== key) return out
        const dict = zh[key] != null ? zh : en
        let text = dict[key] != null ? dict[key] : en[key] != null ? en[key] : key
        if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
        return text
      }
      return makeT(zh)
    }

    // ---------------------------------------------------------------- constants
    const METRIC_KEYS = ['cpu', 'memory', 'disk', 'network', 'io', 'temperature', 'load', 'processes']
    const REGION_KEYS = ['header', 'dock', 'sidebar', 'rightPane', 'bottomBar']
    const RING_KEYS = ['cpu', 'memory', 'disk']
    const FAST_OPTIONS = [1000, 2000, 5000]
    const SLOW_OPTIONS = [5000, 10000, 30000]
    const TOP_OPTIONS = [0, 10000, 30000]
    const HOVER_OPTIONS = [200, 300, 500]

    const DEFAULT_CONFIG = {
      fastMs: 1000,
      slowMs: 5000,
      topProcMs: 30000,
      regions: { header: true, dock: true, sidebar: true, rightPane: true, bottomBar: false },
      metrics: { order: METRIC_KEYS.slice(), hidden: ['load', 'processes'] },
      unavailable: 'hide',
      thresholds: { warn: 60, crit: 85, tempC: 90 },
      units: 'bytes',
      showTotals: true,
      hoverDelayMs: 300,
      clickAction: 'pane'
    }

    // ---------------------------------------------------------------- formatting
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
    const clampPct = (v) => Math.max(0, Math.min(100, isNum(v) ? v : 0))

    function fmtBytes(bytes) {
      if (!isNum(bytes) || bytes < 0) return '—'
      const units = ['B', 'K', 'M', 'G', 'T', 'P']
      let value = bytes
      let index = 0
      while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1 }
      const text = index === 0 ? String(Math.round(value)) : value >= 100 ? value.toFixed(0) : value.toFixed(1)
      return text + units[index]
    }
    function fmtBits(bytes) {
      if (!isNum(bytes) || bytes < 0) return '—'
      const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
      let value = bytes * 8
      let index = 0
      while (value >= 1000 && index < units.length - 1) { value /= 1000; index += 1 }
      const text = index === 0 ? String(Math.round(value)) : value >= 100 ? value.toFixed(0) : value.toFixed(1)
      return text + units[index]
    }
    function fmtRate(bytes, units) {
      if (!isNum(bytes)) return '—'
      return units === 'bits' ? fmtBits(bytes) : fmtBytes(bytes) + '/s'
    }
    function fmtShortRate(bytes, units) {
      if (!isNum(bytes)) return '—'
      return units === 'bits' ? fmtBits(bytes) : fmtBytes(bytes)
    }
    function fmtPct(value) {
      return isNum(value) ? Math.round(value) + '%' : '—'
    }
    function fmtTemp(value) {
      return isNum(value) ? Math.round(value) + '°C' : '—'
    }
    function fmtUptime(seconds) {
      if (!isNum(seconds) || seconds < 0) return '—'
      const days = Math.floor(seconds / 86400)
      const hours = Math.floor((seconds % 86400) / 3600)
      if (days > 0) return days + 'd ' + hours + 'h'
      const minutes = Math.floor((seconds % 3600) / 60)
      if (hours > 0) return hours + 'h ' + minutes + 'm'
      return minutes + 'm'
    }
    function intervalLabel(cfg) {
      const ms = cfg && isNum(cfg.fastMs) ? cfg.fastMs : 1000
      return ms % 1000 === 0 ? String(ms / 1000) + 's' : String(ms) + 'ms'
    }

    function severity(pct, cfg) {
      const thresholds = (cfg && cfg.thresholds) || DEFAULT_CONFIG.thresholds
      if (!isNum(pct)) return 'muted'
      if (pct >= thresholds.crit) return 'error'
      if (pct >= thresholds.warn) return 'warn'
      return 'ok'
    }
    function toneVar(tone) {
      if (tone === 'error') return 'var(--dsw-alias-state-error-primary,#f04438)'
      if (tone === 'warn') return 'var(--dsw-alias-state-warn-primary,#f79009)'
      if (tone === 'ok') return 'var(--dsw-alias-state-success-primary,#12b76a)'
      return 'var(--dsw-alias-label-tertiary,#98a2b3)'
    }
    function toneClass(tone) { return 'huds-tone-' + (tone || 'muted') }

    function reasonText(reason, t) {
      if (reason === 'needs-helper') return t('needsHelper')
      if (reason === 'unsupported') return t('unsupported')
      if (reason === 'error') return t('readError')
      return t('unavailable')
    }

    function unique(list) {
      const out = []
      for (const item of list) if (!out.includes(item)) out.push(item)
      return out
    }
    function normalizeConfig(raw) {
      const src = raw && typeof raw === 'object' ? raw : {}
      const regions = { ...DEFAULT_CONFIG.regions }
      if (src.regions && typeof src.regions === 'object') {
        for (const key of REGION_KEYS) if (typeof src.regions[key] === 'boolean') regions[key] = src.regions[key]
      }
      const rawOrder = src.metrics && Array.isArray(src.metrics.order) ? src.metrics.order : DEFAULT_CONFIG.metrics.order
      const rawHidden = src.metrics && Array.isArray(src.metrics.hidden) ? src.metrics.hidden : DEFAULT_CONFIG.metrics.hidden
      const order = unique(rawOrder.filter((key) => METRIC_KEYS.includes(key)).concat(METRIC_KEYS))
      const hidden = unique(rawHidden.filter((key) => METRIC_KEYS.includes(key)))
      const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)
      const num = (value, fallback, min, max) => {
        if (!isNum(value)) return fallback
        return Math.max(min, Math.min(max, Math.round(value)))
      }
      const thresholds = src.thresholds && typeof src.thresholds === 'object' ? src.thresholds : {}
      return {
        fastMs: pick(src.fastMs, FAST_OPTIONS, DEFAULT_CONFIG.fastMs),
        slowMs: pick(src.slowMs, SLOW_OPTIONS, DEFAULT_CONFIG.slowMs),
        topProcMs: pick(src.topProcMs, TOP_OPTIONS, DEFAULT_CONFIG.topProcMs),
        regions,
        metrics: { order, hidden },
        unavailable: pick(src.unavailable, ['hide', 'dash', 'proxy'], DEFAULT_CONFIG.unavailable),
        thresholds: {
          warn: num(thresholds.warn, DEFAULT_CONFIG.thresholds.warn, 1, 99),
          crit: num(thresholds.crit, DEFAULT_CONFIG.thresholds.crit, 2, 100),
          tempC: num(thresholds.tempC, DEFAULT_CONFIG.thresholds.tempC, 30, 120)
        },
        units: pick(src.units, ['bytes', 'bits'], DEFAULT_CONFIG.units),
        showTotals: typeof src.showTotals === 'boolean' ? src.showTotals : DEFAULT_CONFIG.showTotals,
        hoverDelayMs: pick(src.hoverDelayMs, HOVER_OPTIONS, DEFAULT_CONFIG.hoverDelayMs),
        clickAction: pick(src.clickAction, ['pane', 'card'], DEFAULT_CONFIG.clickAction)
      }
    }
    function mergeConfig(base, patch) {
      const out = { ...(base || DEFAULT_CONFIG) }
      if (!patch || typeof patch !== 'object') return out
      for (const key of Object.keys(patch)) {
        const value = patch[key]
        if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
          out[key] = { ...out[key], ...value }
        } else {
          out[key] = value
        }
      }
      return normalizeConfig(out)
    }
    function visibleMetrics(cfg, allowed) {
      const order = (cfg && cfg.metrics && cfg.metrics.order) || DEFAULT_CONFIG.metrics.order
      const hidden = new Set((cfg && cfg.metrics && cfg.metrics.hidden) || [])
      return order.filter((key) => METRIC_KEYS.includes(key) && !hidden.has(key) && (!allowed || allowed.includes(key)))
    }
    function regionOn(cfg, key) {
      const regions = (cfg && cfg.regions) || DEFAULT_CONFIG.regions
      return regions[key] !== false
    }
    function activeRegionCount(cfg) {
      const regions = (cfg && cfg.regions) || DEFAULT_CONFIG.regions
      return REGION_KEYS.reduce((sum, key) => sum + (regions[key] ? 1 : 0), 0)
    }
    function anyRegionOn(cfg) { return activeRegionCount(cfg) > 0 }

    function cpuPercent(snapshot) {
      const value = snapshot && snapshot.cpu && snapshot.cpu.usagePercent
      return isNum(value) ? clampPct(value) : null
    }
    function memoryPercent(snapshot) {
      const memory = snapshot && snapshot.memory
      if (!memory || !isNum(memory.usedBytes) || !isNum(memory.totalBytes) || memory.totalBytes <= 0) return null
      return clampPct((memory.usedBytes / memory.totalBytes) * 100)
    }
    function diskPercent(snapshot) {
      const disk = snapshot && snapshot.disk
      if (!disk || !isNum(disk.usedBytes) || !isNum(disk.totalBytes) || disk.totalBytes <= 0) return null
      return clampPct((disk.usedBytes / disk.totalBytes) * 100)
    }
    function metricPercent(snapshot, key) {
      if (key === 'cpu') return cpuPercent(snapshot)
      if (key === 'memory') return memoryPercent(snapshot)
      if (key === 'disk') return diskPercent(snapshot)
      return null
    }
    function metricSubText(snapshot, key, cfg, t) {
      if (key === 'cpu') {
        const cores = snapshot && snapshot.host && snapshot.host.cores
        return isNum(cores) ? t('cores', { n: cores }) : ''
      }
      if (key === 'memory') return snapshot && snapshot.memory ? fmtBytes(snapshot.memory.usedBytes) : ''
      if (key === 'disk') {
        const disk = snapshot && snapshot.disk
        if (!disk) return ''
        if (isNum(disk.freeBytes)) return fmtBytes(disk.freeBytes)
        if (isNum(disk.totalBytes) && isNum(disk.usedBytes)) return fmtBytes(disk.totalBytes - disk.usedBytes)
        return ''
      }
      return ''
    }

    function tempState(snapshot, cfg, t) {
      const temp = snapshot && snapshot.temperature ? snapshot.temperature : null
      const policy = (cfg && cfg.unavailable) || 'hide'
      if (temp && temp.available === true && isNum(temp.cpuC)) {
        const limit = (cfg && cfg.thresholds && cfg.thresholds.tempC) || 90
        return {
          kind: 'ok',
          short: fmtTemp(temp.cpuC),
          tone: temp.cpuC >= limit ? 'error' : temp.cpuC >= limit - 10 ? 'warn' : 'ok',
          title: ''
        }
      }
      if (policy === 'hide') return { kind: 'hidden', short: '', tone: 'muted', title: '' }
      if (policy === 'proxy') {
        const pressure = temp && (temp.pressure || temp.proxyLabel)
        return {
          kind: 'proxy',
          short: pressure ? t('pressure') + ' ' + pressure : t('pressure') + ' ' + t('valueDash'),
          tone: 'muted',
          title: pressure ? t('pressure') : t('pressureUnavailable')
        }
      }
      return { kind: 'dash', short: t('valueDash'), tone: 'muted', title: reasonText(temp && temp.reason, t) }
    }

    function sectionPending(snapshot, key) {
      const section = sectionOf(snapshot, key)
      return !!section && section.sampledAt == null
    }
    function firstFrameDash(cfg) { return (cfg && cfg.unavailable) !== 'hide' }
    function staleSeconds(section, snapshot, cfg) {
      if (!section || !isNum(section.sampledAt) || !snapshot || !isNum(snapshot.timestamp)) return null
      const age = Math.max(0, snapshot.timestamp - section.sampledAt)
      const base = snapshot.intervalMs || (cfg && cfg.fastMs) || 1000
      if (age <= base * 3) return null
      return Math.round(age / 1000)
    }
    function sectionOf(snapshot, key) {
      if (!snapshot) return null
      if (key === 'processes') return { sampledAt: snapshot.host && snapshot.host.sampledAt }
      return snapshot[key] || null
    }
    function staleOf(snapshot, key, cfg, t) {
      const seconds = staleSeconds(sectionOf(snapshot, key), snapshot, cfg)
      return seconds == null ? '' : t('staleFor', { s: seconds })
    }
    function anyStale(snapshot, cfg) {
      if (!snapshot) return false
      for (const key of ['cpu', 'memory', 'disk', 'network', 'temperature', 'processes']) {
        if (staleSeconds(sectionOf(snapshot, key), snapshot, cfg) != null) return true
      }
      return false
    }

    function displayHostName(host, t) {
      const loopback = (() => {
        try {
          const name = String((window.location && window.location.hostname) || '')
          if (!name) return true
          return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name.endsWith('.localhost')
        } catch (error) { return true }
      })()
      if (!loopback) return t('localMachine')
      return (host && host.name) || t('localMachine')
    }
    function platformLabel(platform, t) {
      if (platform === 'darwin') return t('platformDarwin')
      if (platform === 'linux') return t('platformLinux')
      return t('platformOther')
    }

    function summaryText(snapshot, cfg, t) {
      const units = (cfg && cfg.units) || 'bytes'
      const parts = []
      for (const key of visibleMetrics(cfg, ['cpu', 'memory', 'disk'])) {
        const value = metricPercent(snapshot, key)
        if (value != null) parts.push(t(key) + ' ' + fmtPct(value))
      }
      const network = snapshot && snapshot.network
      if (network && (isNum(network.txBytesPerSec) || isNum(network.rxBytesPerSec))) {
        parts.push('↑' + fmtShortRate(network.txBytesPerSec, units) + ' ↓' + fmtShortRate(network.rxBytesPerSec, units))
      }
      const disk = snapshot && snapshot.disk
      if (visibleMetrics(cfg, ['io']).length && disk) {
        parts.push(t('read') + fmtShortRate(disk.readBytesPerSec, units) + ' ' + t('write') + fmtShortRate(disk.writeBytesPerSec, units))
      }
      const temp = tempState(snapshot, cfg, t)
      if (temp.kind !== 'hidden') parts.push(temp.short)
      return parts.join(' · ')
    }

    // ---------------------------------------------------------------- CSS
    const CSS = `
.huds-ring{display:block;flex:none;overflow:visible}
.huds-icon{display:inline-flex;flex:none;align-items:center;justify-content:center}
.huds-tone-ok{color:var(--dsw-alias-state-success-primary,#12b76a)}
.huds-tone-warn{color:var(--dsw-alias-state-warn-primary,#f79009)}
.huds-tone-error{color:var(--dsw-alias-state-error-primary,#f04438)}
.huds-tone-muted{color:var(--dsw-alias-label-tertiary,#98a2b3)}

/* ① header entry */
.huds-head{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;margin:0;border-radius:8px;
  background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e3e7ed);
  box-shadow:0 1px 2px rgba(16,24,40,.05);color:var(--dsw-alias-label-secondary,#637182);
  font-size:10.5px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;
  font-family:inherit;transition:background .15s var(--ds-ease-in-out,none)}
.huds-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.huds-head:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:2px}
.huds-head .huds-v{font-weight:650;color:var(--dsw-alias-label-primary,#191f28);font-size:10.5px}
.huds-head .huds-temp{font-weight:600;font-size:10.5px}
.huds-head .huds-sep{width:1px;height:12px;background:var(--dsw-alias-border-l2,#edf0f4)}
.huds-head .huds-alertdot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#98a2b3);flex:none}

/* ② composer dock */
.huds-dockwrap{display:inline-flex;align-items:center;min-width:0;max-width:100%;flex:0 1 auto;padding:0 2px;margin:0}
.huds-dock{display:inline-flex;align-items:center;gap:5px;height:20px;color:var(--dsw-alias-label-tertiary,#98a2b3);
  font-size:11.5px;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;cursor:pointer;max-width:100%}
.huds-dock .huds-icon{color:var(--dsw-alias-label-tertiary,#98a2b3)}
.huds-dock b{color:var(--dsw-alias-label-secondary,#637182);font-weight:600}
.huds-dock .huds-dot{color:var(--dsw-alias-border-l3,#d5dae2);font-weight:400}
.huds-dock .huds-temp{font-weight:600}
.huds-dock:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:2px;border-radius:4px}

/* ③ sidebar footer */
.huds-footrow{flex:none;width:calc(100% - 16px);margin:2px 8px 4px;min-width:0}
.huds-floatwrap{position:absolute;z-index:21;pointer-events:none;display:flex;justify-content:center}
.huds-floatinner{pointer-events:auto;width:100%;min-width:0}
.huds-floatinner .huds-card{box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(16,24,40,.12))}
.huds-card{background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2,#fff));
  border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));
  border-radius:11px;padding:9px 10px 10px;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.04);
  transition:border-color .15s var(--ds-ease-in-out,none)}
.huds-card:hover{border-color:var(--dsw-alias-border-l2,#d8dce2)}
.huds-card:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:2px}
.huds-cardhead{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary,#637182)}
.huds-cardhead .huds-cardtitle{color:var(--dsw-alias-label-secondary,#637182)}
.huds-cardhead .huds-cardrate{margin-left:auto;font-size:9px;font-weight:400;color:var(--dsw-alias-label-tertiary,#98a2b3);font-variant-numeric:tabular-nums}
.huds-cardhead .huds-staledot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#98a2b3);opacity:.7;flex:none}
.huds-rings{display:flex;justify-content:space-between;align-items:flex-start;margin-top:8px}
.huds-ringc{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0}
.huds-ringc .huds-lb{font-size:8px;line-height:1;letter-spacing:.5px;color:var(--dsw-alias-label-tertiary,#98a2b3);font-weight:600}
.huds-ringc .huds-sb{font-size:8.5px;line-height:1;color:var(--dsw-alias-label-secondary,#637182);font-variant-numeric:tabular-nums;white-space:nowrap}
.huds-cardfoot{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:7px;border-top:.5px solid var(--dsw-alias-border-l1,#edf0f4);
  font-size:9.5px;line-height:1;color:var(--dsw-alias-label-tertiary,#98a2b3);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
.huds-cardfoot b{font-weight:650;color:var(--dsw-alias-label-secondary,#637182)}
.huds-cardfoot .huds-tp{margin-left:auto;font-weight:650}
.huds-railrow{display:flex;justify-content:center}
.huds-railbtn{width:36px;height:36px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;color:var(--dsw-alias-label-secondary,#637182);
  display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;padding:0}
.huds-railbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.huds-railbtn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:2px}
.huds-railbtn .huds-staledot{position:absolute;top:5px;right:5px;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#98a2b3)}

/* ⑤ optional bottom bar */
.huds-bottombar{height:46px;display:flex;align-items:center;gap:10px;padding:0 14px;background:var(--dsw-alias-bg-layer-1,#fff);
  border-top:.5px solid var(--dsw-alias-border-l1,#e3e7ed);color:var(--dsw-alias-label-secondary,#637182);font-size:11.5px;
  font-variant-numeric:tabular-nums;cursor:pointer;white-space:nowrap;overflow:hidden;width:100%;box-sizing:border-box}
.huds-bottombar .huds-bname{font-weight:600;color:var(--dsw-alias-label-primary,#191f28)}
.huds-bottombar .huds-bitem{display:inline-flex;align-items:center;gap:5px;padding:0 9px;border-left:.5px solid var(--dsw-alias-border-l1,#e3e7ed)}
.huds-bottombar .huds-bitem:first-of-type{border-left:0;padding-left:2px}
.huds-bottombar .huds-bitem b{font-weight:650;color:var(--dsw-alias-label-primary,#191f28)}
.huds-bottombar .huds-bspacer{margin-left:auto}

/* ④ right pane */
.huds-pane{display:flex;flex-direction:column;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;
  background:var(--dsw-alias-bg-base,#f6f7f9);color:var(--dsw-alias-label-primary,#191f28);
  --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.huds-pane .huds-dev{flex:none;display:flex;align-items:center;gap:6px;padding:9px 16px 0;font-size:10px;color:var(--dsw-alias-label-tertiary,#98a2b3);white-space:nowrap;overflow:hidden}
.huds-pane .huds-dev i{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#12b76a);flex:none}
.huds-pane .huds-dev .huds-devrate{margin-left:auto;font-variant-numeric:tabular-nums}
.huds-pane .huds-sec{padding:10px 16px 11px;border-bottom:.5px solid var(--dsw-alias-border-l1,#edf0f4)}
.huds-pane .huds-sec:last-of-type{border-bottom:0}
.huds-pane .huds-sech{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin-bottom:8px}
.huds-pane .huds-sech .huds-secnm{font-weight:600;color:var(--dsw-alias-label-secondary,#637182)}
.huds-pane .huds-sech .huds-secrt{margin-left:auto;display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.huds-pane .huds-bigrow{display:flex;align-items:center;gap:11px}
.huds-pane .huds-bignum{font-size:22px;font-weight:700;letter-spacing:-.5px;line-height:1;font-variant-numeric:tabular-nums}
.huds-pane .huds-meta{margin-left:auto;text-align:right;font-size:9.5px;line-height:1.7;color:var(--dsw-alias-label-tertiary,#98a2b3);font-variant-numeric:tabular-nums;white-space:nowrap}
.huds-pane .huds-cores{display:flex;align-items:flex-end;gap:3px;height:20px;margin-top:8px}
.huds-pane .huds-cores i{flex:1;border-radius:2px;min-height:2px}
.huds-pane .huds-bar{height:6px;border-radius:99px;background:var(--dsw-alias-scrollbar-bg-l1,#e4e8ee);overflow:hidden}
.huds-pane .huds-bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease}
.huds-pane .huds-kv{font-size:10px;color:var(--dsw-alias-label-tertiary,#98a2b3);display:flex;gap:12px;margin-top:6px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
.huds-pane .huds-kv b{color:var(--dsw-alias-label-primary,#191f28);font-size:10.5px;font-weight:650}
.huds-pane .huds-pill{font-size:9.5px;line-height:1.4;padding:1px 6px;border-radius:5px;font-weight:600;white-space:nowrap}
.huds-pane .huds-pill.ok{background:var(--dsw-alias-state-success-tertiary,#e7f8f0);color:var(--dsw-alias-state-success-primary,#12b76a)}
.huds-pane .huds-pill.warn{background:var(--dsw-alias-state-warn-tertiary,#fdf2e3);color:var(--dsw-alias-state-warn-primary,#f79009)}
.huds-pane .huds-pill.error{background:var(--dsw-alias-state-error-secondary,#fee2e2);color:var(--dsw-alias-state-error-primary,#f04438)}
.huds-pane .huds-pill.muted{background:var(--dsw-alias-scrollbar-bg-l1,#e4e8ee);color:var(--dsw-alias-label-secondary,#637182)}
.huds-pane .huds-chart{display:flex;align-items:flex-end;gap:2px;height:26px;margin-top:6px}
.huds-pane .huds-chart i{flex:1;border-radius:2px 2px 0 0;background:var(--dsw-alias-state-business-primary,#4176e6);opacity:.55;min-height:2px}
.huds-pane .huds-prow{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#637182);height:20px;min-width:0}
.huds-pane .huds-prow .huds-pname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.huds-pane .huds-prow .huds-pv{color:var(--dsw-alias-label-tertiary,#98a2b3);font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap}
.huds-pane .huds-pfoot{flex:none;display:flex;align-items:center;gap:8px;padding:9px 16px 12px;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.huds-pane .huds-pfoot .huds-pflink{margin-left:auto;color:var(--dsw-alias-link,var(--dsw-alias-state-business-primary,#4176e6))}
.huds-stale{font-size:9px;line-height:1.4;color:var(--dsw-alias-label-tertiary,#98a2b3);background:var(--dsw-alias-scrollbar-bg-l1,#e4e8ee);border-radius:5px;padding:1px 5px;font-weight:500}
.huds-empty{padding:18px 12px;text-align:center;font-size:11.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}

/* settings */
.huds-settings{padding:0 0 4px;color:var(--dsw-alias-label-primary,#191f28);font-size:13px}
.huds-stitlewrap{display:flex;align-items:center;gap:8px;min-width:0}
.huds-stitlewrap .huds-icon{color:var(--dsw-alias-label-secondary,#637182)}
.huds-sver{font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary,#98a2b3);background:var(--dsw-alias-bg-base,#f2f4f7);border-radius:6px;padding:1px 6px;font-variant-numeric:tabular-nums}
.huds-updbody{display:flex;flex-direction:column;gap:10px}
.huds-upddesc{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary,#637182)}
.huds-updrow{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--dsw-alias-label-secondary,#637182)}
.huds-updrow b{color:var(--dsw-alias-label-primary,#191f28);font-weight:600}
.huds-updstatus{font-size:12px;line-height:1.6;padding:8px 10px;border-radius:8px}
.huds-updstatus.ok{background:var(--dsw-alias-state-success-surface,#e7f8f0);color:var(--dsw-alias-state-success-primary,#12b76a)}
.huds-updstatus.warn{background:var(--dsw-alias-state-warn-surface,#fdf2e3);color:var(--dsw-alias-state-warn-primary,#f79009)}
.huds-updstatus.err{background:var(--dsw-alias-state-error-surface,#fdecec);color:var(--dsw-alias-state-error-primary,#f04438)}
.huds-updtitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#191f28);margin:2px 0 6px}
.huds-updcmdrow{display:flex;gap:8px;align-items:flex-start}
.huds-updcmd{flex:1;display:block;font-family:var(--dsh-font-mono,ui-monospace,Menlo,monospace);font-size:12px;background:var(--dsw-alias-bg-base,#f2f4f7);padding:8px 10px;border-radius:8px;word-break:break-all;color:var(--dsw-alias-label-primary,#191f28)}
.huds-dlgfoot{display:flex;justify-content:flex-end;gap:8px}
.huds-updatepanel{position:fixed;z-index:1000;top:50%;left:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 48px));max-height:80vh;overflow:auto;background:var(--dsw-alias-bg-layer-2,#fff);border-radius:14px;box-shadow:var(--dsw-elevation-modal,0 24px 64px rgba(0,0,0,.28));padding:18px 20px;display:flex;flex-direction:column;gap:12px}
.huds-updhead{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:650}
.huds-pclose{border:0;background:transparent;font-size:18px;line-height:1;color:var(--dsw-alias-label-tertiary,#98a2b3);cursor:pointer}
.huds-shead{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.huds-shead .huds-stitle{font-size:20px;line-height:28px;font-weight:600;margin:0}
.huds-shead .huds-spill{font-size:10px;color:var(--dsw-alias-state-business-primary,#4176e6);background:var(--dsw-alias-state-business-tertiary,#e8effd);border-radius:6px;padding:2px 7px;font-weight:600;white-space:nowrap}
.huds-shead .huds-sactions{margin-left:auto;display:flex;align-items:center;gap:8px}
.huds-sdesc{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#98a2b3);margin:0 0 14px}
.huds-setcard{background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-2,#fff));
  border:1px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l1,#e3e7ed));
  border-radius:14px;padding:15px 17px 17px;margin-bottom:12px}
.huds-settitle{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap}
.huds-settitle h3{font-size:13px;line-height:18px;font-weight:650;margin:0}
.huds-settitle .huds-setright{margin-left:auto;font-size:10px;color:var(--dsw-alias-state-success-primary,#12b76a);font-weight:600}
.huds-setdesc{font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#98a2b3);margin:0 0 11px}
.huds-regions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.huds-region{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);background:var(--dsw-alias-bg-layer-2,#fff);border-radius:11px;padding:9px 10px;min-width:0}
.huds-region.on{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 4%,var(--dsw-alias-bg-layer-2,#fff))}
.huds-region .huds-rinfo{flex:1;min-width:0}
.huds-region .huds-rname{display:block;font-size:11.5px;font-weight:600;line-height:16px;color:var(--dsw-alias-label-primary,#191f28)}
.huds-region code{display:block;font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:8.5px;line-height:14px;color:var(--dsw-alias-state-business-primary,#4176e6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.huds-region .huds-rdesc{display:block;font-size:9.5px;line-height:13px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.huds-switch{width:32px;height:18px;border-radius:99px;border:0;padding:2px;background:var(--dsw-alias-border-l3,#d5dae2);display:inline-flex;align-items:center;cursor:pointer;flex:none;transition:background .15s var(--ds-ease-in-out,none)}
.huds-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#4176e6)}
.huds-switch > i{width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.2);margin-left:0;transition:margin .15s var(--ds-ease-in-out,none)}
.huds-switch[aria-checked=true] > i{margin-left:14px}
.huds-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:2px}
.huds-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.huds-mrow{display:flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);background:var(--dsw-alias-bg-layer-2,#fff);border-radius:9px;padding:6px 7px;min-width:0}
.huds-mrow.off{opacity:.62}
.huds-mrow .huds-mname{font-size:11px;font-weight:550;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.huds-mrow .huds-msub{font-size:9px;color:var(--dsw-alias-label-tertiary,#98a2b3);white-space:nowrap}
.huds-mini{width:18px;height:18px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);border-radius:5px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#637182);font-size:10px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:none}
.huds-mini:disabled{opacity:.35;cursor:default}
.huds-mini:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.huds-policies{display:flex;flex-direction:column;gap:7px}
.huds-policy{display:flex;align-items:flex-start;gap:10px;text-align:left;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);background:var(--dsw-alias-bg-layer-2,#fff);border-radius:10px;padding:9px 11px;cursor:pointer;font-family:inherit}
.huds-policy.on{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 5%,var(--dsw-alias-bg-layer-2,#fff))}
.huds-policy .huds-radio{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l4,#c6ccd6);display:flex;align-items:center;justify-content:center;flex:none;margin-top:1px}
.huds-policy.on .huds-radio{border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.huds-policy.on .huds-radio:after{content:"";width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary,#4176e6)}
.huds-policy .huds-pinfo{flex:1;min-width:0}
.huds-policy .huds-ptitle{display:block;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary,#191f28);line-height:16px}
.huds-policy .huds-pdesc{display:block;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary,#98a2b3);margin-top:1px}
.huds-note{display:flex;align-items:flex-start;gap:7px;margin-top:9px;padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);background:var(--dsw-alias-bg-layer-1,#f8f9fb);font-size:10px;line-height:1.6;color:var(--dsw-alias-label-secondary,#637182)}
.huds-kvrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l1,#edf0f4);flex-wrap:wrap}
.huds-kvrow:last-child{border-bottom:0;padding-bottom:0}
.huds-kvrow .huds-kn{font-size:11.5px;color:var(--dsw-alias-label-primary,#191f28);width:118px;flex:none}
.huds-kvrow .huds-kd{font-size:10px;color:var(--dsw-alias-label-tertiary,#98a2b3);flex:1;min-width:120px;line-height:1.5}
.huds-seg{display:inline-flex;background:var(--dsw-alias-scrollbar-bg-l1,#e4e8ee);border-radius:8px;padding:2px;gap:2px}
.huds-seg button{font-family:inherit;font-size:11px;line-height:16px;padding:3px 10px;border-radius:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#637182);cursor:pointer}
.huds-seg button.on{background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#191f28);font-weight:600;box-shadow:0 1px 2px rgba(16,24,40,.08)}
.huds-num{width:48px;height:26px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);border-radius:7px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#191f28);font-family:inherit;font-size:11.5px;font-weight:600;text-align:center;padding:0 4px}
.huds-num:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4176e6));outline-offset:1px}
.huds-thresholds{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.huds-th{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#637182)}
.huds-th i{width:8px;height:8px;border-radius:2px;display:inline-block}
.huds-th .huds-unit{font-size:9.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.huds-chipx{font-size:10px;color:var(--dsw-alias-label-secondary,#637182);background:var(--dsw-alias-scrollbar-bg-l1,#e4e8ee);border-radius:6px;padding:2px 7px;white-space:nowrap}
.huds-notice{margin:0 0 10px;padding:6px 10px;border-radius:7px;font-size:11px;color:var(--dsw-alias-state-warn-primary,#f79009);background:var(--dsw-alias-state-warn-tertiary,#fdf2e3)}
.huds-sfoot{display:flex;align-items:center;gap:10px;padding:2px 2px 0;font-size:10px;color:var(--dsw-alias-label-tertiary,#98a2b3);flex-wrap:wrap}
.huds-sfoot .huds-sfsave{margin-left:auto}
.huds-preview{display:flex;flex-direction:column;gap:9px}
.huds-pvrow{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);border-radius:10px;padding:9px 11px;background:var(--dsw-alias-bg-layer-1,#f8f9fb);min-width:0}
.huds-pvlabel{font-size:9.5px;font-weight:600;color:var(--dsw-alias-label-tertiary,#98a2b3);width:92px;flex:none;white-space:nowrap}
.huds-pvbody{flex:1;min-width:0;display:flex;justify-content:flex-end;align-items:center;overflow:hidden}
.huds-pvbody.huds-pvleft{justify-content:flex-start}
.huds-pvside{width:248px;flex:none}
.huds-empty2{padding:10px;text-align:center;font-size:11px;color:var(--dsw-alias-label-tertiary,#98a2b3)}

/* fallback primitives */
.huds-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1,#e3e7ed);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-secondary,#637182);border-radius:8px;padding:5px 10px;font-family:inherit;font-size:11.5px;cursor:pointer}
.huds-btn.primary{background:var(--dsw-alias-state-business-primary,#4176e6);border-color:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;font-weight:600}
.huds-btn.ghost{border-color:transparent;background:transparent}
.huds-btn:disabled{opacity:.5;cursor:default}

/* big card (shell.overlay fallback) */
.huds-cardwrap{position:fixed;right:20px;bottom:20px;z-index:30;pointer-events:none}
.huds-bigcard{pointer-events:auto;width:440px;max-width:calc(100vw - 32px);height:130px;box-sizing:border-box;
  background:var(--dsw-alias-bg-layer-2,#fff);border:0;border-radius:var(--dsw-radius-lg,16px);
  box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(16,24,40,.16));
  --dsw-elevation-stroke-color:var(--dsw-alias-border-l1,#e3e7ed);
  color:var(--dsw-alias-label-primary,#191f28);padding:11px 13px;display:flex;flex-direction:column;
  font-variant-numeric:tabular-nums}
.huds-bigcard .huds-bchead{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#98a2b3)}
.huds-bigcard .huds-bchead .huds-bctitle{font-weight:600;color:var(--dsw-alias-label-secondary,#637182)}
.huds-bigcard .huds-bchead .huds-bcrate{margin-left:auto;font-size:9px}
.huds-bigcard .huds-bcclose{width:18px;height:18px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#98a2b3);cursor:pointer;border-radius:5px;font-size:12px;line-height:1;padding:0}
.huds-bigcard .huds-bcclose:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06))}
.huds-bigcard .huds-bcbody{flex:1;display:flex;align-items:center;gap:12px;margin-top:8px;min-width:0}
.huds-bigcard .huds-bcell{display:flex;align-items:center;gap:7px;min-width:0}
.huds-bigcard .huds-bcv{font-size:10.5px;font-weight:650;color:var(--dsw-alias-label-primary,#191f28);line-height:1.15}
.huds-bigcard .huds-bcl{display:block;font-size:8px;letter-spacing:.5px;color:var(--dsw-alias-label-tertiary,#98a2b3);font-weight:600;margin-top:2px}
.huds-bigcard .huds-bsep{width:1px;height:24px;background:var(--dsw-alias-border-l1,#edf0f4);flex:none}
.huds-bigcard .huds-bstack{display:flex;flex-direction:column;gap:2px;min-width:0}
.huds-bigcard .huds-bline{font-size:9.5px;line-height:13px;color:var(--dsw-alias-label-tertiary,#98a2b3);white-space:nowrap}
.huds-bigcard .huds-bline b{color:var(--dsw-alias-label-secondary,#637182);font-weight:650}

@media (prefers-reduced-motion:reduce){.huds-head,.huds-card,.huds-switch,.huds-switch > i,.huds-pane .huds-bar i,.huds-dock,.huds-pvrow{transition:none!important}}
`

    // ---------------------------------------------------------------- api / store
    function createApi() {
      const unwrap = async (endpoint, payload) => {
        const res = await fetch('system-hud/' + endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, payload: payload || {} })
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const json = await res.json()
        if (json && json.ok) return json.value
        throw new Error((json && json.error && json.error.message) || ('rpc failed: ' + endpoint))
      }
      return {
        snapshot: () => unwrap('snapshot', {}),
        config: () => unwrap('config', {}),
        saveConfig: (patch) => unwrap('save-config', patch),
        updateCheck: (force) => unwrap('update-check', { force: !!force })
      }
    }

    function createStore(api) {
      let state = {
        config: null,
        snapshot: null,
        history: [],
        error: null,
        saving: false,
        saveError: null,
        cardOpen: false,
        paneVisible: false
      }
      const listeners = new Set()
      let timer = null
      let disposed = false
      let inflight = false
      let saveChain = Promise.resolve()

      function emit() {
        for (const listener of Array.from(listeners)) {
          try { listener() } catch (error) { /* 单个订阅失败不拖垮其他 */ }
        }
      }
      function getState() { return state }
      function patchState(patch) {
        state = { ...state, ...patch }
        emit()
      }
      function configNow() { return state.config || DEFAULT_CONFIG }
      function shouldPoll() {
        const config = state.config
        if (!config) return false
        return anyRegionOn(config) && (state.paneVisible || activeRegionCount(config) > 0 || state.cardOpen)
      }
      function stopTimer() {
        if (timer) { clearInterval(timer); timer = null }
      }
      function startTimer() {
        if (disposed || timer) return
        if (!state.config) return
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
        if (!anyRegionOn(state.config)) return
        void tick()
        const interval = Math.max(500, state.config.fastMs || 1000)
        timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
          void tick()
        }, interval)
      }
      function restartTimer() { stopTimer(); startTimer() }
      function onVisibilityChange() {
        if (typeof document === 'undefined') return
        if (document.visibilityState === 'visible') {
          startTimer()
          void tick()
        } else {
          stopTimer()
        }
      }
      async function tick() {
        if (disposed || inflight) return
        inflight = true
        try {
          const snapshot = await api.snapshot()
          if (disposed || !snapshot) return
          const network = snapshot.network || {}
          const history = state.history.concat([{
            t: snapshot.timestamp,
            rx: isNum(network.rxBytesPerSec) ? network.rxBytesPerSec : null,
            tx: isNum(network.txBytesPerSec) ? network.txBytesPerSec : null
          }]).slice(-60)
          state = { ...state, snapshot, history, error: null }
          emit()
        } catch (error) {
          state = { ...state, error: error && error.message ? error.message : 'snapshot failed' }
          emit()
        } finally {
          inflight = false
        }
      }
      async function loadConfig() {
        try {
          const config = normalizeConfig(await api.config())
          state = { ...state, config }
          emit()
          startTimer()
        } catch (error) {
          state = { ...state, config: normalizeConfig({}), error: error && error.message ? error.message : 'config failed' }
          emit()
          startTimer()
        }
      }
      function saveConfig(patch) {
        const merged = mergeConfig(configNow(), patch)
        state = { ...state, config: merged, saving: true, saveError: null }
        emit()
        restartTimer()
        saveChain = saveChain
          .then(() => api.saveConfig(patch))
          .then((config) => {
            if (disposed) return
            state = { ...state, config: normalizeConfig(config), saving: false, saveError: null }
            emit()
            restartTimer()
          })
          .catch((error) => {
            if (disposed) return
            state = { ...state, saving: false, saveError: error && error.message ? error.message : 'save failed' }
            emit()
          })
        return saveChain
      }
      function setCardOpen(open) {
        if (state.cardOpen === open) return
        patchState({ cardOpen: Boolean(open) })
      }
      function setPaneVisible(visible) {
        if (state.paneVisible === visible) return
        state = { ...state, paneVisible: visible }
        if (visible) startTimer()
      }
      function subscribe(listener) {
        listeners.add(listener)
        if (listeners.size === 1) {
          if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange)
          startTimer()
        }
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) {
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
            stopTimer()
          }
        }
      }
      function dispose() {
        disposed = true
        stopTimer()
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
        listeners.clear()
      }
      return { getState, subscribe, loadConfig, saveConfig, tick, setCardOpen, setPaneVisible, updateCheck: (force) => api.updateCheck(!!force), dispose }
    }

    const hasSyncExternalStore = typeof React.useSyncExternalStore === 'function'
    function useStoreState(store) {
      if (hasSyncExternalStore) {
        return React.useSyncExternalStore(store.subscribe, store.getState, store.getState)
      }
      const [, force] = React.useState(0)
      React.useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])
      return store.getState()
    }

    // ---------------------------------------------------------------- atoms
    function Ring(props) {
      const size = props.size || 34
      const stroke = props.stroke || 3.2
      const dash = props.dash === true || !isNum(props.pct)
      const pct = dash ? 0 : clampPct(props.pct)
      const radius = (size - stroke) / 2
      const circumference = 2 * Math.PI * radius
      const offset = circumference * (1 - pct / 100)
      const color = dash ? 'var(--dsw-alias-label-tertiary,#98a2b3)' : props.color || toneVar(severity(pct, props.cfg))
      return h('svg', {
        className: 'huds-ring',
        width: size,
        height: size,
        viewBox: '0 0 ' + size + ' ' + size,
        role: 'img',
        'aria-label': dash ? '—' : (props.label || Math.round(pct) + '%')
      },
        h('circle', {
          cx: size / 2, cy: size / 2, r: radius, fill: 'none',
          stroke: 'var(--dsw-alias-scrollbar-bg-l1,#e4e8ee)', strokeWidth: stroke
        }),
        h('circle', {
          cx: size / 2, cy: size / 2, r: radius, fill: 'none',
          stroke: color, strokeWidth: stroke, strokeLinecap: 'round',
          strokeDasharray: circumference.toFixed(2),
          strokeDashoffset: offset.toFixed(2),
          transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'
        }),
        props.center === false ? null : h('text', {
          x: size / 2, y: size / 2 + 0.5, textAnchor: 'middle', dominantBaseline: 'central',
          fontSize: props.fs || Math.max(7.5, size * 0.25), fontWeight: 700,
          fill: 'var(--dsw-alias-label-primary,#191f28)'
        }, dash ? '—' : Math.round(pct) + '%')
      )
    }

    function IconServer(props) {
      const size = props.size || 13
      return h('span', { className: 'huds-icon', style: { width: size, height: size } },
        h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
          h('rect', { x: 2.2, y: 2.6, width: 11.6, height: 4.4, rx: 1.4 }),
          h('rect', { x: 2.2, y: 9, width: 11.6, height: 4.4, rx: 1.4 }),
          h('circle', { cx: 5, cy: 4.8, r: 0.55, fill: 'currentColor', stroke: 'none' }),
          h('circle', { cx: 5, cy: 11.2, r: 0.55, fill: 'currentColor', stroke: 'none' })))
    }

    function Glyph(props) {
      const size = props.size || 12
      return h('span', { className: 'huds-icon', style: { width: size, height: size } },
        h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', 'aria-hidden': true },
          h('path', { d: 'M2.4 11.4a6.6 6.6 0 1 1 11.2 0' }),
          h('path', { d: 'M8 9.2l2.6-2.8' })))
    }

    const IcoGitHub = () => h('span', { className: 'huds-icon', style: { width: 14, height: 14 } },
      h('svg', { viewBox: '0 0 16 16', fill: 'currentColor', width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z' })))
    const IcoLink = () => h('span', { className: 'huds-icon', style: { width: 14, height: 14 } },
      h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: 'M9.5 6.5 14 2m0 0h-3.6M14 2v3.6', strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M13 9.5v3A1.5 1.5 0 0 1 11.5 14h-8A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3h3', strokeLinecap: 'round' })))
    const IcoRefresh = () => h('span', { className: 'huds-icon', style: { width: 14, height: 14 } },
      h('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11', strokeLinecap: 'round', strokeLinejoin: 'round' })))

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked ? 'true' : 'false',
        'aria-label': props.label || '',
        className: 'huds-switch',
        disabled: props.disabled,
        onClick: () => { if (!props.disabled && typeof props.onChange === 'function') props.onChange(!props.checked) }
      }, h('i', null))
    }

    function Btn(props) {
      if (P && typeof P.Button === 'function') {
        return h(P.Button, {
          variant: props.variant || 'outline',
          size: props.size || 'sm',
          onClick: props.onClick,
          disabled: props.disabled
        }, props.children)
      }
      return h('button', {
        type: 'button',
        className: 'huds-btn ' + (props.variant || '') + ' ' + (props.className || ''),
        onClick: props.onClick,
        disabled: props.disabled
      }, props.children)
    }

    function Seg(props) {
      if (P && typeof P.SegmentedTabs === 'function') {
        return h(P.SegmentedTabs, {
          items: props.items,
          value: props.value,
          onChange: props.onChange,
          label: props.label || ''
        })
      }
      return h('div', { className: 'huds-seg', role: 'tablist', 'aria-label': props.label || '' },
        props.items.map((item) => h('button', {
          key: String(item.value),
          type: 'button',
          role: 'tab',
          'aria-selected': item.value === props.value ? 'true' : 'false',
          className: item.value === props.value ? 'on' : '',
          onClick: () => props.onChange(item.value)
        }, item.label)))
    }

    function NumberField(props) {
      const [text, setText] = React.useState(String(props.value))
      React.useEffect(() => { setText(String(props.value)) }, [props.value])
      const commit = () => {
        const value = Number(text)
        if (Number.isFinite(value) && value >= props.min && value <= props.max) props.onCommit(Math.round(value))
        else setText(String(props.value))
      }
      return h('input', {
        className: 'huds-num',
        type: 'number',
        min: props.min,
        max: props.max,
        value: text,
        'aria-label': props.label,
        onChange: (event) => setText(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }
      })
    }

    function isConstructor(value) {
      if (typeof value !== 'function') return false
      try { new value() ; return true } catch (error) { return false }
    }
    function withBoundary(Comp) {
      // 非浏览器桩（check-i18n）里 React.Component 可能不可构造：直接返回组件，不装边界
      const Base = React.Component
      if (!isConstructor(Base)) return Comp
      class Boundary extends Base {
        constructor(props) { super(props); this.state = { failed: false } }
        static getDerivedStateFromError() { return { failed: true } }
        componentDidCatch(error) {
          try { console.warn('[dsh-system-hud] render error:', error && error.message) } catch (ignored) { /* noop */ }
          try { document.documentElement.setAttribute('data-huds-error', String(error && (error.stack || error.message) || error).slice(0, 400)) } catch (ignored) { /* noop */ }
        }
        render() { return this.state.failed ? null : this.props.children }
      }
      return function Bounded(props) { return h(Boundary, null, h(Comp, props)) }
    }

    // ---------------------------------------------------------------- ① header
    const HudHeader = React.memo(function HudHeader(props) {
      useLocaleTick()
      const { store, onOpen } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      if (!snapshot) return null
      const rings = []
      for (const key of visibleMetrics(cfg, RING_KEYS)) {
        const pct = metricPercent(snapshot, key)
        if (pct != null) {
          rings.push({ key, pct, dash: false })
        } else {
          const pending = sectionPending(snapshot, key)
          if (!pending && cfg.unavailable === 'hide') continue
          rings.push({ key, pct: null, dash: true })
        }
        if (rings.length === 2) break
      }
      const temp = tempState(snapshot, cfg, t)
      const pendingAny = RING_KEYS.some((key) => sectionPending(snapshot, key))
      if (!rings.length && temp.kind === 'hidden' && !pendingAny) return null
      const full = summaryText(snapshot, cfg, t)
      const children = []
      rings.forEach((item, index) => {
        if (index > 0) children.push(h('span', { key: 'sep' + index, className: 'huds-sep' }))
        children.push(h(Ring, { key: 'ring' + item.key, pct: item.pct, dash: item.dash, size: 15, stroke: 2, center: false, cfg, label: t(item.key) + ' ' + fmtPct(item.pct) }))
        children.push(h('span', { key: 'v' + item.key, className: 'huds-v' }, fmtPct(item.pct)))
      })
      if (temp.kind !== 'hidden') {
        if (children.length) children.push(h('span', { key: 'tsep', className: 'huds-sep' }))
        children.push(h('span', { key: 'temp', className: 'huds-temp ' + toneClass(temp.tone), title: temp.title || '' }, temp.short))
      }
      if (!children.length) children.push(h('span', { key: 'dash', className: 'huds-v' }, t('valueDash')))
      return h('button', {
        type: 'button',
        className: 'huds-head',
        title: full,
        'aria-label': full,
        onClick: onOpen
      }, children)
    })

    // ---------------------------------------------------------------- ② dock
    const HudDock = React.memo(function HudDock(props) {
      useLocaleTick()
      const { store, onOpen } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      // 主窗口布局固定：直接用视口断点，避免 ResizeObserver 量到自身内容宽度造成自我反馈
      const [viewport, setViewport] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1600))
      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onResize = () => setViewport(window.innerWidth)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])
      if (!snapshot) return h('div', { className: 'huds-dockwrap' })
      const units = cfg.units || 'bytes'
      const order = visibleMetrics(cfg, ['cpu', 'memory', 'disk', 'network'])
      // ≥1100 全显；1000–1100 去 DISK；<1000 去 DISK+NET（只留 CPU/MEM/温度）
      const drop = viewport < 1000 ? ['disk', 'network'] : viewport < 1100 ? ['disk'] : []
      const hiddenSet = new Set(drop)
      const parts = []
      const network = snapshot.network
      const temp = tempState(snapshot, cfg, t)
      const full = summaryText(snapshot, cfg, t)
      for (const key of order) {
        if (hiddenSet.has(key)) continue
        if (key === 'cpu' || key === 'memory' || key === 'disk') {
          const pct = metricPercent(snapshot, key)
          if (pct == null) {
            const pending = sectionPending(snapshot, key)
            if (!pending && cfg.unavailable === 'hide') continue
          }
          if (parts.length) parts.push(h('span', { key: 'd' + key, className: 'huds-dot' }, '·'))
          parts.push(h('span', { key: 'm' + key }, t(key) + ' ', h('b', null, fmtPct(pct))))
        } else if (key === 'network') {
          const hasRate = network && (isNum(network.txBytesPerSec) || isNum(network.rxBytesPerSec))
          if (!hasRate) {
            const pending = sectionPending(snapshot, 'network')
            if (!pending && cfg.unavailable === 'hide') continue
          }
          if (parts.length) parts.push(h('span', { key: 'dnet', className: 'huds-dot' }, '·'))
          parts.push(h('span', { key: 'net' },
            h('span', { className: hasRate ? 'huds-tone-ok' : '' }, '↑' + fmtShortRate(network && network.txBytesPerSec, units)),
            ' ',
            h('span', { className: hasRate ? 'huds-tone-ok' : '' }, '↓' + fmtShortRate(network && network.rxBytesPerSec, units))))
        }
      }
      if (temp.kind !== 'hidden') {
        if (parts.length) parts.push(h('span', { key: 'dtemp', className: 'huds-dot' }, '·'))
        parts.push(h('span', { key: 'temp', className: 'huds-temp ' + toneClass(temp.tone), title: temp.title || '' }, temp.short))
      }
      if (!parts.length) parts.push(h('span', { key: 'dash', className: 'huds-v' }, t('valueDash')))
      return h('div', { className: 'huds-dockwrap', title: full },
        h('span', {
          className: 'huds-dock',
          role: 'button',
          tabIndex: 0,
          'aria-label': full,
          onClick: onOpen,
          onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }
        }, h(IconServer, { size: 12 }), parts))
    })

    // ---------------------------------------------------------------- ③ sidebar footer
    // 侧栏用户卡内容（原来直接塞在 footer 单行里，现在同时给浮层复用）
    function footCardNode(props) {
      const { store, onOpen, snapshot, cfg, stale, t } = props
      const staleTitle = stale ? t('staleLabel') : ''
      const rings = []
      for (const key of visibleMetrics(cfg, RING_KEYS)) {
        const pct = metricPercent(snapshot, key)
        if (pct != null) {
          rings.push({ key, pct, dash: false })
        } else {
          const pending = sectionPending(snapshot, key)
          if (!pending && cfg.unavailable === 'hide') continue
          rings.push({ key, pct: null, dash: true })
        }
        if (rings.length === 3) break
      }
      if (!rings.length) rings.push({ key: 'cpu', pct: null, dash: true })
      const network = snapshot.network
      const disk = snapshot.disk
      const units = cfg.units || 'bytes'
      const temp = tempState(snapshot, cfg, t)
      const foot = []
      const netRate = network && (isNum(network.txBytesPerSec) || isNum(network.rxBytesPerSec))
      if (network && (netRate || sectionPending(snapshot, 'network') || cfg.unavailable !== 'hide')) {
        foot.push(h('span', { key: 'net' },
          h('span', { className: netRate ? 'huds-tone-ok' : '' }, '↑' + fmtShortRate(network.txBytesPerSec, units)),
          ' ',
          h('span', { className: netRate ? 'huds-tone-ok' : '' }, '↓' + fmtShortRate(network.rxBytesPerSec, units))))
      }
      if (disk && visibleMetrics(cfg, ['io']).length) {
        foot.push(h('span', { key: 'io' }, t('read') + fmtShortRate(disk.readBytesPerSec, units), ' ', t('write') + fmtShortRate(disk.writeBytesPerSec, units)))
      }
      if (temp.kind !== 'hidden') {
        foot.push(h('span', { key: 'temp', className: 'huds-tp ' + toneClass(temp.tone), title: temp.title || '' }, temp.short))
      }
      return h('div', { className: 'huds-footrow' },
        h('div', {
          className: 'huds-card',
          role: 'button',
          tabIndex: 0,
          'aria-label': t('device'),
          title: t('cardHint'),
          onClick: onOpen,
          onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }
        },
          h('div', { className: 'huds-cardhead' },
            h(IconServer, { size: 13 }),
            h('span', { className: 'huds-cardtitle' }, t('device')),
            stale ? h('span', { className: 'huds-staledot', title: staleTitle }) : null,
            h('span', { className: 'huds-cardrate' }, intervalLabel(cfg))),
          h('div', { className: 'huds-rings' }, rings.map((item) => h('div', { key: item.key, className: 'huds-ringc' },
            h(Ring, { pct: item.pct, dash: item.dash, size: 34, stroke: 3.2, cfg, fs: 8.5, label: t(item.key) + ' ' + fmtPct(item.pct) }),
            h('span', { className: 'huds-lb' }, t(item.key === 'cpu' ? 'cpuShort' : item.key === 'memory' ? 'memShort' : 'diskShort')),
            h('span', { className: 'huds-sb' }, metricSubText(snapshot, item.key, cfg, t) || t('valueDash'))))),
          foot.length ? h('div', { className: 'huds-cardfoot' }, foot) : null))
    }

    const HudFootCard = React.memo(function HudFootCard(props) {
      useLocaleTick()
      const { store, onOpen, wide = true } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      if (!snapshot) return null
      const stale = anyStale(snapshot, cfg)
      const staleTitle = stale ? t('staleLabel') : ''
      if (!wide) {
        const cpu = cpuPercent(snapshot)
        return h('div', { className: 'huds-footrow huds-railrow' },
          h('button', {
            type: 'button',
            className: 'huds-railbtn',
            title: t('device') + (stale ? ' · ' + staleTitle : ''),
            'aria-label': t('device'),
            onClick: onOpen
          }, h(IconServer, { size: 18 }), stale ? h('span', { className: 'huds-staledot' }) : null,
          cpu != null && cpu >= (cfg.thresholds.crit || 85) ? h('span', { className: 'huds-staledot', style: { background: 'var(--dsw-alias-state-error-primary,#f04438)' } }) : null))
      }
      // 展开态：footer 是 nowrap 单行、已被「模型额度」卡片占满，卡片改由 HudSidebarFloat 浮层渲染
      return null
    })

    // 侧栏底部悬浮卡：锚定在 footer 单行上方（该行被模型额度卡占满，放不下第二张整宽卡）
    const HudSidebarFloat = React.memo(function HudSidebarFloat(props) {
      useLocaleTick()
      const { store, onOpen } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      const [pos, setPos] = React.useState(null)
      React.useEffect(() => {
        if (typeof document === 'undefined') return undefined
        let raf = 0
        const measure = () => {
          raf = 0
          const slot = document.querySelector('[data-slot="sidebar.footer.action"]')
          if (!slot) { setPos(null); return }
          // data-slot 容器是 display:contents，量不到尺寸，改量它的父级（footerActions 行）
          const host = slot.parentElement || slot
          const rect = host.getBoundingClientRect()
          if (rect.width < 140) { setPos(null); return }
          setPos({
            left: Math.max(0, Math.round(rect.left)),
            width: Math.round(rect.width),
            bottom: Math.round(Math.max(8, window.innerHeight - rect.top + 6))
          })
        }
        const schedule = () => { if (!raf) raf = requestAnimationFrame(measure) }
        schedule()
        window.addEventListener('resize', schedule)
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
        if (observer) observer.observe(document.body)
        const mutations = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
        if (mutations) mutations.observe(document.body, { childList: true, subtree: true })
        const timer = setInterval(schedule, 1500)
        return () => {
          window.removeEventListener('resize', schedule)
          if (observer) observer.disconnect()
          if (mutations) mutations.disconnect()
          clearInterval(timer)
          if (raf) cancelAnimationFrame(raf)
        }
      }, [])
      if (!snapshot || !pos) return null
      return h('div', {
        className: 'huds-floatwrap',
        style: { left: pos.left + 'px', bottom: pos.bottom + 'px', width: pos.width + 'px' }
      }, h('div', { className: 'huds-floatinner' },
        footCardNode({ store, onOpen, snapshot, cfg, stale: anyStale(snapshot, cfg), t })))
    })

    // ---------------------------------------------------------------- ⑤ optional bottom bar
    const HudBottomBar = React.memo(function HudBottomBar(props) {
      useLocaleTick()
      const { store, onOpen } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      if (!snapshot) return null
      const units = cfg.units || 'bytes'
      const items = []
      for (const key of visibleMetrics(cfg, RING_KEYS)) {
        const pct = metricPercent(snapshot, key)
        if (pct == null && !sectionPending(snapshot, key) && cfg.unavailable === 'hide') continue
        items.push(h('span', { key: key, className: 'huds-bitem' },
          h(Ring, { pct, dash: pct == null, size: 15, stroke: 1.9, cfg, center: false }),
          h('span', null, t(key), ' ', h('b', null, fmtPct(pct)))))
      }
      const network = snapshot.network
      const netRate = network && (isNum(network.txBytesPerSec) || isNum(network.rxBytesPerSec))
      if (network && (netRate || sectionPending(snapshot, 'network') || cfg.unavailable !== 'hide')) {
        items.push(h('span', { key: 'net', className: 'huds-bitem' },
          h('span', { className: netRate ? 'huds-tone-ok' : '' }, '↑' + fmtShortRate(network.txBytesPerSec, units)),
          ' ',
          h('span', { className: netRate ? 'huds-tone-ok' : '' }, '↓' + fmtShortRate(network.rxBytesPerSec, units))))
      }
      const disk = snapshot.disk
      if (disk && visibleMetrics(cfg, ['io']).length) {
        items.push(h('span', { key: 'io', className: 'huds-bitem' },
          t('read') + fmtShortRate(disk.readBytesPerSec, units), ' ', t('write') + fmtShortRate(disk.writeBytesPerSec, units)))
      }
      const temp = tempState(snapshot, cfg, t)
      if (temp.kind !== 'hidden') items.push(h('span', { key: 'temp', className: 'huds-bitem ' + toneClass(temp.tone), title: temp.title || '' }, temp.short))
      return h('div', {
        className: 'huds-bottombar',
        role: 'button',
        tabIndex: 0,
        onClick: onOpen,
        onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }
      }, h(IconServer, { size: 13 }), h('span', { className: 'huds-bname' }, t('title')), items,
      h('span', { className: 'huds-bspacer' }), h('span', { className: 'huds-chipx' }, intervalLabel(cfg)))
    })

    // ---------------------------------------------------------------- ④ right pane
    function PaneSection(props) {
      return h('div', { className: 'huds-sec' },
        h('div', { className: 'huds-sech' },
          h('span', { className: 'huds-secnm' }, props.title),
          props.stale ? h('span', { className: 'huds-stale' }, props.stale) : null,
          h('span', { className: 'huds-secrt' }, props.right)),
        props.children)
    }

    function NetworkChart({ history, t }) {
      const values = history.map((item) => Math.max(isNum(item.rx) ? item.rx : 0, isNum(item.tx) ? item.tx : 0))
      const max = values.reduce((top, value) => Math.max(top, value), 1)
      return h('div', { className: 'huds-chart', role: 'img', 'aria-label': t('network') },
        values.map((value, index) => h('i', { key: index, style: { height: Math.max(2, (value / max) * 26) + 'px' } })))
    }

    const SystemPane = React.memo(function SystemPane(props) {
      useLocaleTick()
      const { store, t: tProp, useTabInfo } = props
      const t = trWith(tProp)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      const info = typeof useTabInfo === 'function' ? useTabInfo() : null
      const visible = !info || !info.tab || info.tab.visible !== false
      React.useEffect(() => {
        store.setPaneVisible(Boolean(visible))
        return () => store.setPaneVisible(false)
      }, [visible, store])
      if (regionOn(cfg, 'rightPane') === false) {
        return h('div', { className: 'huds-pane' }, h('div', { className: 'huds-empty' }, t('disabled')))
      }
      if (!snapshot) return h('div', { className: 'huds-pane' }, h('div', { className: 'huds-empty' }, t('waitingHost')))
      const host = snapshot.host || {}
      const units = cfg.units || 'bytes'
      const hidden = new Set(cfg.metrics.hidden || [])
      const order = visibleMetrics(cfg)
      const sections = []
      const temp = tempState(snapshot, cfg, t)
      for (const key of order) {
        if (key === 'cpu') {
          const pct = cpuPercent(snapshot)
          if (pct == null) { if (cfg.unavailable === 'hide') continue }
          const cpu = snapshot.cpu || {}
          const perCore = Array.isArray(cpu.perCore) ? cpu.perCore : []
          const limit = cfg.thresholds.tempC || 90
          sections.push(h(PaneSection, {
            key,
            title: t('cpu'),
            stale: staleOf(snapshot, 'cpu', cfg, t),
            right: h('span', null, t('perCore'))
          },
            h('div', { className: 'huds-bigrow' },
              h(Ring, { pct: pct, dash: pct == null, size: 46, stroke: 4, cfg, fs: 11, center: false }),
              h('span', { className: 'huds-bignum' }, pct == null ? t('valueDash') : Math.round(pct) + '%'),
              h('span', { className: 'huds-meta' },
                h('span', null, (host.chip || t('unknownChip')) + (isNum(host.cores) ? ' · ' + t('cores', { n: host.cores }) : '')),
                h('br'),
                visibleMetrics(cfg, ['load']).length && Array.isArray(cpu.load)
                  ? h('span', null, t('loadLabel') + ' ' + cpu.load.map((value) => (isNum(value) ? value.toFixed(2) : '—')).join(' / '))
                  : null,
                temp.kind !== 'hidden' ? h('span', null, h('br'), temp.short) : null)),
            perCore.length ? h('div', { className: 'huds-cores', role: 'img', 'aria-label': t('perCore') },
              perCore.map((value, index) => h('i', {
                key: index,
                title: '#' + (index + 1) + ' ' + fmtPct(value),
                style: {
                  height: Math.max(2, (clampPct(value) / 100) * 20) + 'px',
                  background: toneVar(severity(value, cfg))
                }
              }))) : null))
          continue
        }
        if (key === 'memory') {
          const memory = snapshot.memory || {}
          const pct = memoryPercent(snapshot)
          if (pct == null) { if (cfg.unavailable === 'hide') continue }
          const used = fmtBytes(memory.usedBytes)
          const total = fmtBytes(memory.totalBytes)
          const free = isNum(memory.usedBytes) && isNum(memory.totalBytes) ? fmtBytes(Math.max(0, memory.totalBytes - memory.usedBytes)) : '—'
          sections.push(h(PaneSection, {
            key,
            title: t('memory'),
            stale: staleOf(snapshot, 'memory', cfg, t),
            right: h('span', null, h('b', { style: { fontSize: 11, color: 'var(--dsw-alias-label-primary,#191f28)' } }, used), ' / ' + total)
          },
            h('div', { className: 'huds-bar' }, h('i', { style: { width: (pct == null ? 0 : pct) + '%', background: 'var(--dsw-alias-state-business-primary,#4176e6)' } })),
            h('div', { className: 'huds-kv' },
              h('span', null, t('used') + ' ' + used),
              h('span', null, t('available') + ' ' + free),
              h('span', null, t('swap') + ' ' + fmtBytes(memory.swapUsedBytes)))))
          continue
        }
        if (key === 'disk') {
          const disk = snapshot.disk || {}
          const pct = diskPercent(snapshot)
          if (pct == null) { if (cfg.unavailable === 'hide') continue }
          const total = fmtBytes(disk.totalBytes)
          const free = isNum(disk.freeBytes) ? fmtBytes(disk.freeBytes) : isNum(disk.totalBytes) && isNum(disk.usedBytes) ? fmtBytes(Math.max(0, disk.totalBytes - disk.usedBytes)) : '—'
          sections.push(h(PaneSection, {
            key,
            title: t('disk'),
            stale: staleOf(snapshot, 'disk', cfg, t),
            right: pct == null
              ? h('span', { className: 'huds-pill muted' }, t('valueDash'))
              : h('span', null,
                h('span', { className: 'huds-pill ' + severity(pct, cfg) }, fmtPct(pct)),
                h('span', { style: { marginLeft: 6 } }, t('diskLine', { free, total })))
          },
            h('div', { className: 'huds-bar' }, h('i', { style: { width: (pct == null ? 0 : pct) + '%', background: toneVar(severity(pct, cfg)) } })),
            visibleMetrics(cfg, ['io']).length ? h('div', { className: 'huds-kv' },
              h('span', null, t('read'), ' ', h('b', null, fmtRate(disk.readBytesPerSec, units))),
              h('span', null, t('write'), ' ', h('b', null, fmtRate(disk.writeBytesPerSec, units)))) : null))
          continue
        }
        if (key === 'network') {
          const network = snapshot.network || {}
          const hasRate = isNum(network.txBytesPerSec) || isNum(network.rxBytesPerSec)
          if (!hasRate) { if (cfg.unavailable === 'hide') continue }
          const history = state.history || []
          const span = Math.max(1, Math.round((history.length * (snapshot.intervalMs || cfg.fastMs || 1000)) / 1000))
          sections.push(h(PaneSection, {
            key,
            title: t('network'),
            stale: staleOf(snapshot, 'network', cfg, t),
            right: h('span', null, h('span', { className: 'huds-pill muted' }, t('lastSeconds', { n: span })))
          },
            h('div', { className: 'huds-kv', style: { marginTop: 0, marginBottom: 6 } },
              h('span', null, h('b', { style: { color: 'var(--dsw-alias-state-success-primary,#12b76a)', fontSize: 11 } }, '↑' + fmtRate(network.txBytesPerSec, units))),
              h('span', null, h('b', { style: { color: 'var(--dsw-alias-state-business-primary,#4176e6)', fontSize: 11 } }, '↓' + fmtRate(network.rxBytesPerSec, units))),
              cfg.showTotals ? h('span', { style: { marginLeft: 'auto' } }, t('netTotals', { up: fmtBytes(network.txTotalBytes), down: fmtBytes(network.rxTotalBytes) })) : null),
            h(NetworkChart, { history, t })))
          continue
        }
        if (key === 'temperature') {
          if (temp.kind === 'hidden') continue
          const tsec = snapshot.temperature || {}
          sections.push(h(PaneSection, {
            key,
            title: t('temperature'),
            stale: staleOf(snapshot, 'temperature', cfg, t),
            right: h('span', { className: 'huds-pill ' + (temp.tone === 'muted' ? 'muted' : temp.tone) }, temp.kind === 'ok' ? t(temp.tone === 'error' ? 'critical' : temp.tone === 'warn' ? 'elevated' : 'normal') : t('unavailable'))
          },
            temp.kind === 'ok'
              ? h('div', { className: 'huds-kv', style: { marginTop: 0 } },
                h('span', null, t('tempCpu'), ' ', h('b', null, fmtTemp(tsec.cpuC))),
                h('span', null, t('tempSsd'), ' ', h('b', null, fmtTemp(tsec.ssdC))),
                h('span', null, t('tempAmbient'), ' ', h('b', null, fmtTemp(tsec.ambientC))))
              : h('div', { className: 'huds-kv', style: { marginTop: 0 } }, h('span', null, temp.title || t('temperatureUnknown')))))
          continue
        }
        if (key === 'processes') {
          const processes = snapshot.processes
          if (!Array.isArray(processes) || !processes.length) continue
          sections.push(h(PaneSection, {
            key,
            title: t('topProc'),
            stale: staleOf(snapshot, 'processes', cfg, t),
            right: h('span', { style: { fontSize: 9 } }, t('topProcCol'))
          },
            processes.slice(0, 5).map((proc, index) => h('div', { className: 'huds-prow', key: index },
              h('span', { className: 'huds-pname' }, proc && proc.name ? String(proc.name) : '—'),
              h('span', { className: 'huds-pv' }, isNum(proc && proc.cpuPercent) ? proc.cpuPercent.toFixed(1) + '%' : '—'),
              h('span', { className: 'huds-pv' }, fmtBytes(proc && proc.memoryBytes))))))
        }
      }
      if (!sections.length) sections.push(h('div', { key: 'empty', className: 'huds-empty' }, t('noData')))
      return h('div', { className: 'huds-pane' },
        h('div', { className: 'huds-dev' },
          h('i', null),
          h('span', null, displayHostName(host, t) + (host.chip ? ' · ' + host.chip : '') + ' · ' + platformLabel(host.platform, t)),
          h('span', { className: 'huds-devrate' }, intervalLabel(cfg))),
        sections,
        h('div', { className: 'huds-pfoot' },
          h('span', null, t('samplingFooter', { v: intervalLabel(cfg) })),
          h('span', { className: 'huds-pflink' }, t('settingsHint'))))
    })

    // ---------------------------------------------------------------- big card / overlay
    function BigCard(props) {
      useLocaleTick()
      const { store, onClose } = props
      const t = trWith(props.t)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      if (!snapshot) return null
      const units = cfg.units || 'bytes'
      const rings = []
      for (const key of visibleMetrics(cfg, RING_KEYS)) {
        const pct = metricPercent(snapshot, key)
        if (pct != null) rings.push({ key, pct })
      }
      const network = snapshot.network || {}
      const disk = snapshot.disk || {}
      const temp = tempState(snapshot, cfg, t)
      const cells = []
      rings.forEach((item, index) => {
        if (index > 0) cells.push(h('span', { key: 'sep' + index, className: 'huds-bsep' }))
        cells.push(h('span', { key: item.key, className: 'huds-bcell' },
          h(Ring, { pct: item.pct, size: 34, stroke: 3.2, cfg, fs: 8.5 }),
          h('span', { className: 'huds-bstack' },
            h('span', { className: 'huds-bcv' }, fmtPct(item.pct)),
            h('span', { className: 'huds-bcl' }, t(item.key === 'cpu' ? 'cpuShort' : item.key === 'memory' ? 'memShort' : 'diskShort')))))
      })
      if (cellCount(cells)) cells.push(h('span', { key: 'sepnet', className: 'huds-bsep' }))
      cells.push(h('span', { key: 'net', className: 'huds-bcell' },
        h('span', { className: 'huds-bstack' },
          h('span', { className: 'huds-bcv' },
            h('span', { className: 'huds-tone-ok' }, '↑' + fmtShortRate(network.txBytesPerSec, units)),
            ' ',
            h('span', { className: 'huds-tone-ok' }, '↓' + fmtShortRate(network.rxBytesPerSec, units))),
          h('span', { className: 'huds-bcl' }, t('network')))))
      cells.push(h('span', { key: 'sepio', className: 'huds-bsep' }))
      cells.push(h('span', { key: 'io', className: 'huds-bcell' },
        h('span', { className: 'huds-bstack' },
          h('span', { className: 'huds-bcv' }, t('read') + fmtShortRate(disk.readBytesPerSec, units) + ' ' + t('write') + fmtShortRate(disk.writeBytesPerSec, units)),
          h('span', { className: 'huds-bcl' }, t('io')))))
      if (temp.kind !== 'hidden') {
        cells.push(h('span', { key: 'septemp', className: 'huds-bsep' }))
        cells.push(h('span', { key: 'temp', className: 'huds-bcell' },
          h('span', { className: 'huds-bstack' },
            h('span', { className: 'huds-bcv ' + toneClass(temp.tone) }, temp.short),
            h('span', { className: 'huds-bcl' }, t('temperature')))))
      }
      return h('div', { className: 'huds-bigcard', role: 'dialog', 'aria-label': t('title') },
        h('div', { className: 'huds-bchead' },
          h(IconServer, { size: 12 }),
          h('span', { className: 'huds-bctitle' }, t('device')),
          h('span', { className: 'huds-bcrate' }, intervalLabel(cfg)),
          h('button', { type: 'button', className: 'huds-bcclose', 'aria-label': t('close'), title: t('close'), onClick: onClose }, '×')),
        h('div', { className: 'huds-bcbody' }, cells))
    }
    function cellCount(cells) { return cells.length > 0 }

    const HudOverlay = React.memo(function HudOverlay(props) {
      const { store } = props
      const state = useStoreState(store)
      React.useEffect(() => {
        if (!state.cardOpen) return undefined
        const onKey = (event) => { if (event.key === 'Escape') store.setCardOpen(false) }
        if (typeof document !== 'undefined') document.addEventListener('keydown', onKey)
        return () => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey) }
      }, [state.cardOpen, store])
      if (!state.cardOpen) return null
      const card = h('div', { className: 'huds-cardwrap' }, h(BigCard, { store, t: props.t, onClose: () => store.setCardOpen(false) }))
      if (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body) {
        return ReactDOM.createPortal(card, document.body)
      }
      return card
    })

    // ---------------------------------------------------------------- settings
    function SettingsCard(props) {
      return h('section', { className: 'huds-setcard' },
        h('div', { className: 'huds-settitle' },
          h('h3', null, props.title),
          props.right ? h('span', { className: 'huds-setright' }, props.right) : null),
        props.desc ? h('p', { className: 'huds-setdesc' }, props.desc) : null,
        props.children)
    }

    function SettingsSection(props) {
      useLocaleTick()
      const { store, t: tProp, close } = props
      const t = trWith(tProp)
      const state = useStoreState(store)
      const cfg = state.config || DEFAULT_CONFIG
      const snapshot = state.snapshot
      const [notice, setNotice] = React.useState('')
      const [update, setUpdate] = React.useState(null)
      const [checking, setChecking] = React.useState(false)
      const [dialogOpen, setDialogOpen] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const GITHUB = 'https://github.com/PonyDevAI/dsh-system-hud'
      React.useEffect(() => {
        let alive = true
        Promise.resolve(store.updateCheck(false)).then((value) => { if (alive) setUpdate(value) }).catch(() => {})
        return () => { alive = false }
      }, [store])
      const openUrl = (url) => { try { window.open(url, '_blank', 'noopener,noreferrer') } catch (error) { /* noop */ } }
      const runCheck = async () => {
        setChecking(true)
        try {
          setUpdate(await store.updateCheck(true))
        } catch (error) {
          setUpdate({ current: '—', latest: null, updateAvailable: false, error: String((error && error.message) || error) })
        } finally {
          setChecking(false)
          setDialogOpen(true)
        }
      }
      const copyCommand = () => {
        const command = (update && update.command) || ''
        try {
          Promise.resolve(navigator.clipboard.writeText(command)).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        } catch (error) { /* noop */ }
      }
      const active = activeRegionCount(cfg)
      const hidden = new Set(cfg.metrics.hidden || [])
      const order = cfg.metrics.order || DEFAULT_CONFIG.metrics.order
      const save = (patch) => { setNotice(''); store.saveConfig(patch) }
      const toggleRegion = (key, next) => {
        if (!next && active <= 1) { setNotice(t('atLeastOne')); return }
        setNotice('')
        save({ regions: { [key]: next } })
      }
      const moveMetric = (key, direction) => {
        const list = order.slice()
        const index = list.indexOf(key)
        const target = index + direction
        if (index < 0 || target < 0 || target >= list.length) return
        const tmp = list[index]
        list[index] = list[target]
        list[target] = tmp
        save({ metrics: { order: list, hidden: Array.from(hidden) } })
      }
      const toggleMetric = (key, next) => {
        const nextHidden = new Set(hidden)
        if (next) nextHidden.delete(key)
        else nextHidden.add(key)
        save({ metrics: { order, hidden: Array.from(nextHidden) } })
      }
      const regionKey = (key, suffix) => 'region' + key.charAt(0).toUpperCase() + key.slice(1) + (suffix || '')
      const regionLabel = (key) => t(regionKey(key, ''))
      const regionDesc = (key) => t(regionKey(key, 'Desc'))
      const metricSubKey = (key) => 'metric' + key.charAt(0).toUpperCase() + key.slice(1) + 'Sub'
      const slotName = {
        header: 'conversation.session.header.utilities',
        dock: 'conversation.composer.dock',
        sidebar: 'sidebar.footer.action',
        rightPane: 'sidebar.right.pane.tab',
        bottomBar: 'shell.bottom'
      }
      const regionRows = REGION_KEYS.map((key) => h('div', { key, className: 'huds-region' + (cfg.regions[key] ? ' on' : '') },
        h('div', { className: 'huds-rinfo' },
          h('span', { className: 'huds-rname' }, regionLabel(key)),
          h('code', null, slotName[key]),
          h('span', { className: 'huds-rdesc' }, regionDesc(key))),
        h(Switch, { checked: Boolean(cfg.regions[key]), onChange: (next) => toggleRegion(key, next), label: regionLabel(key) })))
      const metricRows = order.map((key, index) => h('div', { key, className: 'huds-mrow' + (hidden.has(key) ? ' off' : '') },
        h('span', { className: 'huds-mname' }, t(key)),
        h('span', { className: 'huds-msub' }, t(metricSubKey(key))),
        h('button', { type: 'button', className: 'huds-mini', title: t('moveUp'), 'aria-label': t('moveUp'), disabled: index === 0, onClick: () => moveMetric(key, -1) }, '↑'),
        h('button', { type: 'button', className: 'huds-mini', title: t('moveDown'), 'aria-label': t('moveDown'), disabled: index === order.length - 1, onClick: () => moveMetric(key, 1) }, '↓'),
        h(Switch, { checked: !hidden.has(key), onChange: (next) => toggleMetric(key, next), label: hidden.has(key) ? t('showMetric') : t('hideMetric') })))
      const policyRows = [
        { value: 'hide', title: t('policyHide'), desc: t('policyHideDesc') },
        { value: 'dash', title: t('policyDash'), desc: t('policyDashDesc') },
        { value: 'proxy', title: t('policyProxy'), desc: t('policyProxyDesc') }
      ].map((item) => h('button', {
        key: item.value,
        type: 'button',
        role: 'radio',
        'aria-checked': cfg.unavailable === item.value ? 'true' : 'false',
        className: 'huds-policy' + (cfg.unavailable === item.value ? ' on' : ''),
        onClick: () => save({ unavailable: item.value })
      }, h('span', { className: 'huds-radio' }), h('span', { className: 'huds-pinfo' },
        h('span', { className: 'huds-ptitle' }, item.title),
        h('span', { className: 'huds-pdesc' }, item.desc))))

      const periodSeg = (value, options, onChange) => h(Seg, {
        value,
        onChange,
        label: t('groupSampling'),
        items: options.map((option) => ({ value: option.value, label: option.label }))
      })
      const fastItems = FAST_OPTIONS.map((ms) => ({ value: ms, label: ms === 1000 ? '1s' : ms === 2000 ? '2s' : '5s' }))
      const slowItems = SLOW_OPTIONS.map((ms) => ({ value: ms, label: ms === 5000 ? '5s' : ms === 10000 ? '10s' : '30s' }))
      const topItems = TOP_OPTIONS.map((ms) => ({ value: ms, label: ms === 0 ? t('off') : ms === 10000 ? '10s' : '30s' }))
      const unitItems = [{ value: 'bytes', label: t('unitsBytes') }, { value: 'bits', label: t('unitsBits') }]
      const clickItems = [{ value: 'pane', label: t('clickPane') }, { value: 'card', label: t('clickCard') }]
      const hoverItems = HOVER_OPTIONS.map((ms) => ({ value: ms, label: ms + 'ms' }))

      const preview = h('div', { className: 'huds-preview' },
        h('div', { className: 'huds-pvrow' },
          h('span', { className: 'huds-pvlabel' }, t('regionHeader')),
          h('div', { className: 'huds-pvbody' }, h(HudHeader, { store, t: tProp, onOpen: () => {} }))),
        h('div', { className: 'huds-pvrow' },
          h('span', { className: 'huds-pvlabel' }, t('regionDock')),
          h('div', { className: 'huds-pvbody' }, h(HudDock, { store, t: tProp, onOpen: () => {} }))),
        h('div', { className: 'huds-pvrow' },
          h('span', { className: 'huds-pvlabel' }, t('regionSidebar')),
          h('div', { className: 'huds-pvbody huds-pvleft' }, h('div', { className: 'huds-pvside' }, h(HudFootCard, { store, t: tProp, wide: true, onOpen: () => {} })))))

      const updateBody = h('div', { className: 'huds-updbody' },
        h('p', { className: 'huds-upddesc' }, t('updateDesc')),
        h('div', { className: 'huds-updrow' }, h('span', null, t('currentVersion')), h('b', null, update && update.current ? 'v' + update.current : '—')),
        h('div', { className: 'huds-updrow' }, h('span', null, t('latestVersion')), h('b', null, update && update.latest ? 'v' + update.latest : '—')),
        h('div', { className: 'huds-updstatus ' + (update && update.error ? 'err' : update && update.updateAvailable ? 'warn' : 'ok') },
          update && update.error === 'not-published'
            ? t('notPublished')
            : update && update.error
              ? t('updateFailed', { msg: update.error })
              : update && update.updateAvailable ? t('manualUpdateNote') : t('upToDate')),
        update && update.updateAvailable
          ? h('div', null,
            h('div', { className: 'huds-updtitle' }, t('manualUpdateTitle')),
            h('div', { className: 'huds-updcmdrow' },
              h('code', { className: 'huds-updcmd' }, update.command || ''),
              h(Btn, { variant: 'outline', onClick: copyCommand }, copied ? t('copied') : t('copyCommand'))))
          : null)
      const updateDialog = !dialogOpen || !update ? null : (P && typeof P.Modal === 'function'
        ? h(P.Modal, {
          open: true,
          onClose: () => setDialogOpen(false),
          title: t('updateDialogTitle'),
          closeLabel: t('close'),
          footer: h('div', { className: 'huds-dlgfoot' },
            h(Btn, { variant: 'outline', onClick: runCheck, disabled: checking }, checking ? t('checkingUpdate') : t('retryCheck')),
            h(Btn, { variant: 'primary', onClick: () => setDialogOpen(false) }, t('close')))
        }, updateBody)
        : h('div', { className: 'huds-updatepanel' },
          h('div', { className: 'huds-updhead' }, h('span', null, t('updateDialogTitle')),
            h('button', { type: 'button', className: 'huds-pclose', 'aria-label': t('close'), onClick: () => setDialogOpen(false) }, '×')),
          updateBody))

      return h('div', { className: 'huds-settings' },
        h('div', { className: 'huds-shead' },
          h('div', { className: 'huds-stitlewrap' },
            h(IconServer, { size: 18 }),
            h('h2', { className: 'huds-stitle' }, t('title')),
            h('span', { className: 'huds-sver' }, 'v' + ((update && update.current) || '—'))),
          h('span', { className: 'huds-spill' }, t('activeRegions', { n: active })),
          h('div', { className: 'huds-sactions' },
            h(Btn, { variant: 'outline', onClick: () => openUrl(GITHUB) }, h(IcoGitHub), ' GitHub'),
            h(Btn, { variant: 'outline', onClick: () => openUrl(GITHUB + '/issues') }, h(IcoLink), ' ' + t('feedback')),
            h(Btn, { variant: 'outline', onClick: runCheck, disabled: checking }, h(IcoRefresh), ' ' + (checking ? t('checkingUpdate') : t('checkUpdate'))),
            h(Btn, { variant: 'outline', onClick: () => { setNotice(''); store.saveConfig(DEFAULT_CONFIG) } }, t('reset')))),
        updateDialog,
        h('p', { className: 'huds-sdesc' }, t('desc')),
        notice ? h('div', { className: 'huds-notice' }, notice) : null,
        h(SettingsCard, { title: t('groupPreview'), desc: t('groupPreviewDesc') }, preview),
        h(SettingsCard, { title: t('groupRegions'), desc: t('groupRegionsDesc'), right: t('activeRegions', { n: active }) },
          h('div', { className: 'huds-regions' }, regionRows)),
        h(SettingsCard, { title: t('groupMetrics'), desc: t('groupMetricsDesc') },
          h('div', { className: 'huds-metrics' }, metricRows)),
        h(SettingsCard, { title: t('groupUnavailable'), desc: t('groupUnavailableDesc') },
          h('div', { className: 'huds-policies' }, policyRows),
          h('div', { className: 'huds-note' }, h(IconServer, { size: 13 }), h('span', null, t('thermalNote')))),
        h(SettingsCard, { title: t('groupSampling'), desc: t('groupSamplingDesc') },
          h('div', null,
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('fastPeriod')), h('span', { className: 'huds-kd' }, t('fastPeriodDesc')), periodSeg(cfg.fastMs, fastItems, (value) => save({ fastMs: value }))),
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('slowPeriod')), h('span', { className: 'huds-kd' }, t('slowPeriodDesc')), periodSeg(cfg.slowMs, slowItems, (value) => save({ slowMs: value }))),
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('topPeriod')), h('span', { className: 'huds-kd' }, t('topPeriodDesc')), periodSeg(cfg.topProcMs, topItems, (value) => save({ topProcMs: value }))),
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('units')), h('span', { className: 'huds-kd' }, t('unitsDesc')), periodSeg(cfg.units, unitItems, (value) => save({ units: value }))),
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('showTotals')), h('span', { className: 'huds-kd' }, t('showTotalsDesc')), h(Switch, { checked: Boolean(cfg.showTotals), onChange: (next) => save({ showTotals: next }), label: t('showTotals') })))),
        h(SettingsCard, { title: t('groupThresholds'), desc: t('groupThresholdsDesc') },
          h('div', { className: 'huds-thresholds' },
            h('span', { className: 'huds-th' }, h('i', { style: { background: 'var(--dsw-alias-state-success-primary,#12b76a)' } }), t('normalAt')),
            h(NumberField, { value: cfg.thresholds.warn, min: 1, max: 99, label: t('warnAt'), onCommit: (value) => save({ thresholds: { warn: value } }) }),
            h('span', { className: 'huds-th' }, h('i', { style: { background: 'var(--dsw-alias-state-warn-primary,#f79009)' } }), t('warnAt')),
            h(NumberField, { value: cfg.thresholds.crit, min: 2, max: 100, label: t('warnAt'), onCommit: (value) => save({ thresholds: { crit: value } }) }),
            h('span', { className: 'huds-th' }, h('i', { style: { background: 'var(--dsw-alias-state-error-primary,#f04438)' } }), t('critAt')),
            h(NumberField, { value: cfg.thresholds.tempC, min: 30, max: 120, label: t('critAt'), onCommit: (value) => save({ thresholds: { tempC: value } }) }),
            h('span', { className: 'huds-chipx', style: { marginLeft: 'auto' } }, t('thresholdNote')))),
        h(SettingsCard, { title: t('groupInteraction') },
          h('div', null,
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('clickAction')), h('span', { className: 'huds-kd' }), periodSeg(cfg.clickAction, clickItems, (value) => save({ clickAction: value }))),
            h('div', { className: 'huds-kvrow' }, h('span', { className: 'huds-kn' }, t('hoverDelay')), h('span', { className: 'huds-kd' }, t('hoverDelayDesc')), periodSeg(cfg.hoverDelayMs, hoverItems, (value) => save({ hoverDelayMs: value }))))),
        h('div', { className: 'huds-sfoot' },
          h('span', null, t('samplingFooter', { v: intervalLabel(cfg) })),
          h('span', null, t('activeRegions', { n: active })),
          h('span', { className: 'huds-sfsave' }, state.saving ? t('saving') : state.saveError ? t('saveFailed') : '')))
    }

    // ---------------------------------------------------------------- apply
    return {
      // sidebarRight* 是可选服务：不放进 inject，点击时用 ctx.get 宽松读取
      inject: ['slots', 'locale'],
      apply(ctx) {
        const api = createApi()
        const store = createStore(api)
        const styleTagId = 'dsh-system-hud-style'

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'system-hud: locale')
        ctx.effect(() => {
          let off = null
          try {
            if (ctx.locale && typeof ctx.locale.subscribe === 'function') {
              off = ctx.locale.subscribe(() => {
                for (const fn of Array.from(LOCALE_SUBS)) {
                  try { fn() } catch (error) { /* 单个组件失败不拖垮整个语言切换 */ }
                }
              })
            }
          } catch (error) { off = null }
          return () => { if (off) { try { off() } catch (error) { /* noop */ } } }
        }, 'system-hud: locale-change')
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.id = styleTagId
          tag.setAttribute('data-plugin', '@ponydev/dsh-system-hud')
          tag.setAttribute('data-plugin-css', '@ponydev/dsh-system-hud/hud.css')
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => { if (tag && typeof tag.remove === 'function') tag.remove() }
        }, 'system-hud: styles')
        ctx.effect(() => {
          void store.loadConfig()
          return () => store.dispose()
        }, 'system-hud: store')

        function openPane() {
          try {
            const sidebarRight = ctx.get ? ctx.get('sidebarRight') : ctx.sidebarRight
            if (sidebarRight && typeof sidebarRight.openTab === 'function') {
              sidebarRight.openTab('system-hud')
              return
            }
          } catch (error) { /* 无会话/无右栏时退化 */ }
          store.setCardOpen(true)
        }
        function onRegionClick() {
          const config = store.getState().config || DEFAULT_CONFIG
          if (config.clickAction === 'card') { store.setCardOpen(true); return }
          openPane()
        }

        // 位置开关 = 注册 / 注销（不是渲染 null），保证关掉即完全卸载
        function registerWhen(slot, options, Component, enabled) {
          ctx.slots.inject(slot, () => {
            let disposeEntry = null
            const sync = () => {
              const on = enabled(store.getState().config || DEFAULT_CONFIG)
              if (on && !disposeEntry) {
                disposeEntry = ctx.slots.register(options, Component)
                try {
                  const el = document.documentElement
                  const list = (el.getAttribute('data-huds-regions') || '').split(',').filter(Boolean)
                  if (!list.includes(options.name)) list.push(options.name)
                  el.setAttribute('data-huds-regions', list.join(','))
                } catch (ignored) { /* noop */ }
              } else if (!on && disposeEntry) {
                const dispose = disposeEntry
                disposeEntry = null
                if (typeof dispose === 'function') dispose()
              }
            }
            const off = store.subscribe(sync)
            sync()
            return () => {
              off()
              if (disposeEntry && typeof disposeEntry === 'function') disposeEntry()
              disposeEntry = null
            }
          })
        }

        registerWhen('conversation.session.header.utilities', {
          name: 'conversation.session.header.utilities',
          id: 'system-hud',
          order: 40,
          locale: NS,
          inject: () => ({ store, onOpen: onRegionClick })
        }, withBoundary(HudHeader), (config) => regionOn(config, 'header'))

        registerWhen('conversation.composer.dock', {
          name: 'conversation.composer.dock',
          id: 'system-hud',
          // 放在整行最左：原生 activity(0) / usage(1) 之后会夹在中间；
          // 最右侧的 ContextMeter 不在本插槽内，固定渲染在插槽之后，故取最左。
          order: -10,
          locale: NS,
          inject: () => ({ store, onOpen: onRegionClick })
        }, withBoundary(HudDock), (config) => regionOn(config, 'dock'))

        registerWhen('sidebar.footer.action', {
          name: 'sidebar.footer.action',
          id: 'system-hud',
          order: 0,
          locale: NS,
          inject: () => ({ store, onOpen: onRegionClick })
        }, withBoundary(HudFootCard), (config) => regionOn(config, 'sidebar'))

        // 右栏 tab 的 body 注册常驻（type 关闭时不会被使用），tab type 则随配置注册/注销
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: 'system-hud',
          locale: NS,
          inject: () => ({ store })
        }, withBoundary(SystemPane)))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'system-hud',
          order: 30,
          label: () => { try { return ctx.locale.bind(NS)('title') } catch (error) { return zh.title } },
          locale: NS,
          inject: () => ({ store })
        }, withBoundary(SettingsSection)))

        // 无会话/大卡模式：shell.overlay 可加性浮层
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'system-hud-card',
          order: 80,
          locale: NS,
          inject: () => ({ store })
        }, withBoundary(HudOverlay)))

        // 侧栏底部：展开态用浮层卡（footer 单行被模型额度占满），折叠态用 footer 图标
        registerWhen('shell.overlay', {
          name: 'shell.overlay',
          id: 'system-hud-sidebar',
          order: 81,
          locale: NS,
          inject: () => ({ store, onOpen: onRegionClick })
        }, withBoundary(HudSidebarFloat), (config) => regionOn(config, 'sidebar'))

        // 备选全宽底栏：single 槽，按配置严格注册/注销
        registerWhen('shell.bottom', {
          name: 'shell.bottom',
          locale: NS,
          inject: () => ({ store, onOpen: onRegionClick })
        }, withBoundary(HudBottomBar), (config) => regionOn(config, 'bottomBar'))

        // 右栏 tab type：等 service 可用后再跟随配置
        ctx.inject(['sidebarRightTabs'], (scope) => {
          scope.effect(() => {
            let disposeType = null
            const sync = () => {
              const config = store.getState().config || DEFAULT_CONFIG
              const tabs = scope.sidebarRightTabs
              if (!tabs || typeof tabs.register !== 'function') return
              const want = regionOn(config, 'rightPane')
              if (want && !disposeType) {
                const title = () => { try { return ctx.locale.bind(NS)('panelTitle') } catch (error) { return zh.panelTitle } }
                disposeType = tabs.register({
                  id: 'system-hud',
                  kind: 'system-hud',
                  multiple: false,
                  priority: 'builtin',
                  title,
                  guide: [{
                    id: 'open',
                    order: 35,
                    title,
                    description: () => { try { return ctx.locale.bind(NS)('guideDesc') } catch (error) { return zh.guideDesc } },
                    icon: function HudGuideIcon(iconProps) { return h(IconServer, { size: (iconProps && iconProps.size) || 16 }) }
                  }]
                })
              } else if (!want && disposeType) {
                const dispose = disposeType
                disposeType = null
                if (typeof dispose === 'function') dispose()
              }
            }
            const off = store.subscribe(sync)
            sync()
            return () => { off(); if (disposeType && typeof disposeType === 'function') disposeType() }
          }, 'system-hud: right tab type')
        })
      }
    }
  }
})
