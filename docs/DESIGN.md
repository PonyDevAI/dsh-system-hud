# dsh-system-hud · 设计定稿 v0.3

> DSH Web 插件：把本机 CPU / 内存 / 磁盘 / 网络 / I/O / 温度 放在**三个原生位置**——对话顶栏入口、输入框底部 dock、侧边栏底部卡片；点任意一个打开右侧「系统」详情。设置里可逐个开关。
> Mockup 在 `docs/mockups/hud/`；插槽证据见 [architecture-surfaces.md](architecture-surfaces.md)，取数实测见 [metrics-feasibility.md](metrics-feasibility.md)。

## 0. 名字与工程规范（对齐 `plugins/` 下已有三个插件）

**包名 `@ponydev/dsh-system-hud`**，仓库 `PonyDevAI/dsh-system-hud`，i18n NS `dsh-system-hud`，起步版本 `0.1.0`。

理由：现有三个插件都是 `@ponydev/dsh-<feature>`（`dsh-model-usage` / `dsh-phone` / `dsh-tailscale`），feature 用英文 kebab-case、能一眼看出「暴露什么能力」。这个插件暴露的是整机状态 HUD，`system-hud` 比 `hardware-monitor` 短、不和数据中心的 monitor 混淆，也不和 `dsh-phone` 的 device 语义打架。备选：`dsh-hardware-hud`（更具体但偏长）、`dsh-sysmon`（太缩写，和现有风格不符）。npm 上 `@ponydev/dsh-system-hud` 未占用（404）。

目录与脚本严格照 `dsh-phone` 的骨架（它是最新的完整范例）：

```
lib/index.js            Host：/system-hud/* 路由 + connection.admit 认证围栏 + 采样调度
lib/metrics/cpu.js      进程内 os.cpus() 差分（零子进程）
lib/metrics/mem.js      vm_stat + sysctl 解析
lib/metrics/disk.js     df -k（used+free 反算）+ ioreg IO 差分
lib/metrics/net.js      netstat -ibn 差分（必须 -n）
lib/metrics/temp.js     macOS 不可用 / Linux /sys/class/thermal / 可选 helper 探测
lib/sample.js           分级采样器、环形缓冲、单飞、失败退避
lib/client.js           ModuleLoader bundle：五区域注册、i18n、样式
cordis.patch.yml        insert: { id: system-hud, config: {...} }
scripts/smoke.mjs       离线冒烟：解析 vm_stat/netstat/df 样例、单位换算、差分
scripts/check-i18n.mjs  zh/en 键完全一致（CI 强制）
scripts/release-notes.mjs
scripts/render-test.mjs 离线渲染五区域（浅/深色 × 可用/不可用）
docs/DESIGN.md docs/mockups docs/screenshots
AGENTS.md 0.一句话 1.目录职责 2.修改前 3.提交前 4.安全不变量 5.UI规范 6.不要做 7.版本发布
.github/workflows/ci.yml + release.yml（v* tag 触发，npm Trusted Publishing）
README.md CHANGELOG.md CONTRIBUTING.md RELEASE.md LICENSE
```

必须遵守的项目硬约定（从另外两个插件抄）：

1. **不要用 `ctx.connection.rpc.handle()`**（web 组合下会失败）→ `ctx.webServer.register({kind:'prefix', path:'/system-hud'})` + `ctx.connection.admit(req)`，未认证 401。
2. 子进程用 `execFile`（与 `dsh-phone` 同一先例）：命令 id 写死白名单、数组参数、2s 超时、1MB 输出上限、`killSignal:SIGKILL`；禁止 shell 拼接、禁止前端传参。
3. 文案全走 i18n（zh/en 键一致，`check-i18n.mjs` 强制）；颜色只用 `--dsw-*` token。
4. 不引入构建工具/打包器/运行时依赖，手写 ModuleLoader bundle。
5. Host 与 Client 不互相 import；Client 不读文件/环境变量，数据只走 `/system-hud/*`。
6. 发布只由 `v*` tag 触发；CHANGELOG 与版本必须同步。

## 1. 显示位置：三个位置 + 一个详情（全部原生插槽）

| # | 位置 | 槽位（源码实测） | 默认 | 放什么 |
|---|---|---|---|---|
| ① | 对话顶栏入口 | `conversation.session.header.utilities`（list / session） | **开** | 两个 15px 小环 + 温度（~170px），和「会话日志 / 更多 / 账号」同一行；点击开右栏详情 |
| ② | 输入框底部 | `conversation.composer.dock`（list / session） | **开** | 追加一个原生风格 pill：`CPU 71% · 内存 77% · 磁盘 55% · ↑10.5M ↓5.6M · 62°C`，和「轮次 · tok/s」「token · 缓存命中」「上下文环」同一行 |
| ③ | 侧边栏底部 | `sidebar.footer.action`（list / root，wide 标记） | **开** | 240px 卡片：3 个 34px 环 + 一行网络/IO/温度；在「每月限额」下面、插件/更多上面 |
| ④ | 右侧详情 | `sidebar.right.pane.tab`（原生 tab） | **开** | 点 ①②③ 任一处打开；原生「系统」tab：每核 / 内存 / 磁盘 / 网络曲线 / 温度 / Top 进程 |
| ⑤ | 全宽底栏（备选） | `shell.bottom`（single / root） | 关 | 46px 全宽状态条；喜欢「一条底栏」时再开，默认不占高度 |

宽度与折叠规则：

* ① 顶栏 utilities 只剩 ~170px：只放两个小环 + 温度；完整数据在 ④。被其他插件按钮挤时优先缩成单个图标 + 温度。
* ② composer dock 是文本行：窄窗口按 CPU → 内存 → 磁盘 → 网络 依次折叠，剩余项进 tooltip；不与上下文环抢位置。
* ③ 240px 卡片固定 3 环 + 一行摘要；折叠侧栏时只剩图标入口。
* 关掉某个位置 = **完全卸载**：不注册、不渲染、不采样。至少保留一个，否则禁用「全部关闭」。
* ④ 右栏 tab 只在**有可见会话**时能开；无会话时点击退化为 hover 大卡（`shell.overlay`）内联详情，不报错。

## 2. 拿不到的数据：三态，而不是「有/没有」

每个指标带 `status: ok | stale | unavailable`：

| 策略（设置项） | 行为 | 默认 |
|---|---|---|
| **自动隐藏** | 该指标在三个位置与详情里都不出现，不留空位（布局是流式 flex，不是固定六格） | ✅ |
| 显示「—」 | 保留位置，悬停/点击说明原因 | |
| 用代理替代 | 温度不可用 → 显示热压力档位（`pmset -g therm`，部分机器无记录） | |

* `stale`（采样失败）：保留上次值 + 灰点 + `stale 12s`，不整条报错。
* **温度**：macOS 26 无免特权来源 → `unavailable, reason: needs-helper`；装了可选 helper 后自动切换为 `ok`；Linux 直接读 `/sys/class/thermal`。**绝不填 0 或假值**。

## 3. 右侧「系统」详情

* 注册方式：`ctx.sidebarRightTabs.register({ id:'system-hud', kind:'system-hud', title: ()=>t('title') })`，`ctx.sidebarRight.openTab('system-hud')`。
* 视觉上是 DSH 原生 tab 条里的一个「系统」tab（和 文件 / 浏览器 / 终端 并列），不自己造悬浮面板。
* 点 ①②③ 任一处 → 打开该 tab 并滚到/高亮对应 section；再点一次收起。
* 内容顺序：设备行（Mac Studio · Apple M1 Max · 1s 状态）→ CPU 每核条 + 负载 → 内存 → 磁盘 → 网络 60s 曲线 → 温度 → Top 进程 → 底部「采样 1s · 仅本机 | 设置 →」。

## 4. 设置项完整清单（设置 → 系统 HUD）

| 分组 | 项 | 类型 | 默认 |
|---|---|---|---|
| 显示位置 | 顶栏入口 / 输入框底部 / 侧边栏底部 / 右侧详情常驻 | 开关 ×4 | 全开 |
| | 全宽底栏（备选） | 开关 | 关 |
| 指标与顺序 | CPU / 内存 / 磁盘 / 网络 / I/O / 温度 / 负载 / 进程数 | 拖动排序 + 开关 | 前 5 开，温度/负载/进程数关 |
| 不可用数据 | 自动隐藏 / 显示 — / 代理替代 | 单选 | 自动隐藏 |
| 采样与开销 | 快层周期 | 1s / 2s / 5s | 1s |
| | 慢层周期 | 5s / 10s / 30s | 5s |
| | Top 进程 | 关 / 10s / 30s | 30s |
| | 单位 | B/s / bps | B/s |
| | 累计流量 | 开关 | 开 |
| 阈值与颜色 | 正常 ≤ / 偏高 ≤ / 温度告警 ≥ | 数字输入 | 60 / 85 / 90 |
| | 告警表现 | 数字变红（不弹窗） | 变红 |
| 交互 | 点击指标 | 右侧详情 / 展开大卡 | 右侧详情 |
| | 显示 / 隐藏快捷键 | 快捷键录制 | ⌘⇧H |
| | 悬停延时 | 200 / 300 / 500ms | 300ms |
| 其他 | 恢复默认 | 按钮 | — |

设置页同时显示插件自身开销（`宿主开销 0.6% 单核`）、实际生效的区域数量、以及「底栏被占用」之类的降级提示。

![设置页](../mockups/hud/05-settings.png)

## 5. 视觉规范

| 项 | 值 |
|---|---|
| 条高 / 单元高 | 46px / 26px，padding 0 14px |
| 环形 | 条内 20px stroke 2.4；大卡 62–64px stroke 5.2；中心百分比 |
| 字号 | 标签 8.5px（大写 +0.7 字距）；数值 11.5px 600；副值 9px；全部 `tabular-nums` |
| 阈值配色 | <60% 绿；60–85% 琥珀；≥85% 红；温度 ≥90° 红 |
| 单位 | 1024 进制、1 位小数、自动 K/M/G/T；速率加 `/s` |
| 大卡 | 760×188（可收窄成 440×130 五指标模式），分隔线 `.5px`，阴影用 elevation token |
| 动效 | 数字 250ms / 环形 400ms / 展开 180ms，尊重 `prefers-reduced-motion` |

## 6. 取数层（已实测）

| 指标 | 方式 | 周期 | 成本/次 |
|---|---|---|---|
| CPU% / 每核 / 负载 | `os.cpus()` 差分 + `os.loadavg()` | 1s | 9.3µs |
| 网络 up/down | `netstat -ibn` 累计差分（**必须 `-n`**，不带实测 5.2s 卡顿） | 1s | 9.7ms |
| 内存 | `vm_stat` + `sysctl hw.memsize vm.swapusage`（禁用 `os.freemem`） | 2s | 6.0ms |
| 磁盘容量 | `df -k`（APFS 首列不可用，used+free 反算） | 5s | 9.1ms |
| 磁盘 I/O | `ioreg -rc IOBlockStorageDriver -w0` 累计差分（禁用 `iostat`） | 5s | 22ms |
| 温度 | macOS：helper 可选；Linux：`/sys/class/thermal` | 5s | — |
| Top 进程 | `execFile(ps)`，仅详情可见时；取不到返回 null | 30s | ~30ms |

快层（CPU+网络）≈6ms/轮 ≈0.6% 单核；全量塞进 1s 是 40ms/轮（4% 单核），不做。只在前台可见且有订阅者时采样，后台 0 开销。

数据契约（单次快照，≤2KB）：

```json
{ "timestamp": 1761312000, "monotonicMs": 812341, "intervalMs": 1000,
  "cpu": { "usagePercent": 71.2, "perCore": [38,62], "cores": 10, "load": [2.31,2.10,1.98] },
  "memory": { "usedBytes": 26424115200, "totalBytes": 34359738368 },
  "disk": { "usedBytes": 1082331758592, "totalBytes": 2000398934016, "readBytesPerSec": 161480704 },
  "network": { "rxBytesPerSec": 5872025, "txBytesPerSec": 11010048, "rxTotalBytes": 10335409301094 },
  "temperature": { "available": false, "reason": "needs-helper" },
  "uptimeSec": 738000 }
```

## 7. 里程碑

| 里程碑 | 内容 | 验收 |
|---|---|---|
| **M1** | bundle 骨架 + 采样（CPU/内存/磁盘/网络/IO）+ 三个位置（顶栏 / 输入框 dock / 侧栏卡片）+ 设置页开关 | 重启后三处出现；1s 宿主开销 <0.5%；关掉某处不留空白 |
| **M2** | 三态渲染（stale / unavailable）+ hover 大卡（无会话时的详情兜底）+ 折叠阈值 | 不可用指标按策略隐藏；窄窗口 pill 正确折叠 |
| **M3** | 右栏「系统」tab + 每核/曲线/Top 进程 + ①②③ 点击深链 | 有会话可开 tab 并高亮 section；无会话退化为大卡 |
| **M4** | 温度 helper（可选安装）+ Linux 支持 + CSV 导出 | macOS 无 helper 显示策略生效；Linux 出真实温度 |

## 8. 风险与边界

- single 槽互斥（`shell.bottom` / `sidebar.settings`）→ 备选位被占时自动隐藏该项并提示。
- 侧栏折叠时 ③ 卡片消失（macOS 列宽 0）→ 入口只剩 ①②；设置页提示当前生效位置。
- `shell.overlay` 父层 click-through，子元素必须自己 `pointer-events:auto`；z-index 20 低于菜单/弹窗。
- 隐私：只在本机渲染，不采集主机名/路径/用户名；远端访问显示「本机」。
- 不做：进程 kill、磁盘清理、历史持久化（只留 60s 内存缓冲）、GPU（M4 后再评估）。

## 9. Mockup 索引

| 文件 | 内容 |
|---|---|
| [06-regions-light](../mockups/hud/06-regions-light.png) | **主效果图**：真实界面里三个位置（①顶栏 ②输入框底部 ③侧栏底部） |
| [07-regions-zoom](../mockups/hud/07-regions-zoom.png) | 三个位置特写 + ④右栏详情 + ⑤设置里的区域开关 |
| [05-settings](../mockups/hud/05-settings.png) | 设置页：三处预览、位置开关、指标排序、不可用策略、采样、阈值、交互 |
| [01](../mockups/hud/01-overview-dark.png) / [02](../mockups/hud/02-overview-light.png) / [03](../mockups/hud/03-bar-zoom.png) / [04](../mockups/hud/04-variants.png) | v0.1 备选形态（全宽底栏 / 悬停大卡 / 四方案对比），对应 ⑤ 那个可开关的备选位 |

## 10. 实现状态

| 项 | 状态 | 证据 |
|---|---|---|
| Host：采样 + `/system-hud` 路由 + 配置持久化 | ✅ M1 完成 | `lib/index.js` / `lib/sample.js` / `lib/metrics.js`；`node scripts/smoke.mjs` 38/38 |
| Client：三个位置 + 右栏「系统」tab + 设置页 | ✅ M1 完成 | `lib/client.js`；`node scripts/render-test.mjs` 5/5 断言 |
| 首帧 / stale / 不可用三态 | ✅ | harness `#firstframe`：32 处 `—`，无 NaN/0 |
| 位置开关 = 注册/注销（关掉即卸载） | ✅ | `registerWhen()`；设置页 onChange 发出 `save-config` |
| 悬停大卡（`shell.overlay`） | 🟡 基础实现，M2 打磨动效与折叠 | `HudOverlay` |
| 每核 / 60s 曲线 / Top 进程 | ✅ 已渲染，M2 补曲线平滑与空态文案 | 右栏 `SystemPane` |
| 温度 helper（macOS） | ⬜ M4 | 契约已留 `temperature.available/pressureLevel` |
| Linux 真机验证 | ⬜ M4 | `/proc/*` 解析已实现并在 smoke 覆盖，未上机验证 |
| 快捷键 ⌘⇧H | ⬜ M2 | CONTRACT 无该字段，先不做录制 |

已知环境限制：`npm pack --dry-run` 在本机被 npm 缓存权限挡住（`~/.npm/_cacache` 有 root 文件），与插件无关；`ps` 在 DSH 工具沙箱内 EPERM，宿主进程侧默认可用但未在真实宿主内验证。
